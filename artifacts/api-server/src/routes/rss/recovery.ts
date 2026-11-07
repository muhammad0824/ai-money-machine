import { db, graphCacheTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getCachedGraph, saveGraphToCache } from "../graph/cache";
import { getCoverageStart } from "../graph/coverage";
import { readState, writeState } from "./state";

/** One-time, transactional DATA repair per environment, not a schema migration.
 * Called under the shared pipeline lock. The exact pre-repair graph/fingerprints
 * remain in the DB as an audit snapshot. Can resume after any restart.
 */
export async function prepareRecovery(): Promise<void> {
  const state = await readState();
  if (state.recovery.policyVersion === 3 && state.recovery.startedAt) return;
  const start = getCoverageStart().toISOString();
  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    const graph = await getCachedGraph();
    const missing = await tx.execute(sql`
      SELECT fingerprint, edge_id, article_url FROM deal_fingerprints
      WHERE NOT EXISTS (
        SELECT 1 FROM graph_cache, jsonb_array_elements(data->'edges') e
        WHERE graph_cache.id = 'current' AND e->>'id' = deal_fingerprints.edge_id
      )`);
    const snapshot = { graph, orphanedFingerprints: missing.rows, at: now };
    await tx.insert(graphCacheTable).values({ id: "link-repair-before-v2", data: snapshot }).onConflictDoNothing();
    await tx.execute(sql`
      UPDATE articles SET processed_at = NULL
      WHERE url IN (
        SELECT article_url FROM deal_fingerprints f
        WHERE NOT EXISTS (
          SELECT 1 FROM graph_cache c, jsonb_array_elements(c.data->'edges') e
          WHERE c.id = 'current' AND e->>'id' = f.edge_id
        )
      )`);
    // Reset ALL stored in-window articles, including sources that never made it
    // through the faulty gate. Old article dates remain untouched and auditable.
    const reset = await tx.execute(sql`
      UPDATE articles SET processed_at = NULL
      WHERE published_at >= ${start} AND published_at <= ${now} RETURNING id`);
    await tx.execute(sql`
      DELETE FROM deal_fingerprints WHERE NOT EXISTS (
        SELECT 1 FROM graph_cache, jsonb_array_elements(data->'edges') e
        WHERE graph_cache.id = 'current' AND e->>'id' = deal_fingerprints.edge_id
      )`);
    // Retained historical extracts must also pass the new evidence standard.
    const edges = graph.edges.map((e) => e.provenance === "ai_extracted"
      ? { ...e, hiddenReason: "needs_evidence_review", hiddenAt: now } : e);
    await tx.update(graphCacheTable).set({ data: { ...graph, edges }, updatedAt: new Date() }).where(eq(graphCacheTable.id, "current"));
    state.recovery = {
      startedAt: now, completedAt: null, totalArticles: reset.rowCount ?? 0, processedArticles: 0,
      policyVersion: 3,
      orphanedFingerprints: state.recovery.orphanedFingerprints || missing.rows.length,
      orphanedEdgeIds: [...new Set([...state.recovery.orphanedEdgeIds, ...missing.rows.map((r) => String(r.edge_id))])],
      restoredEdges: 0, lastError: null,
    };
    await tx.insert(graphCacheTable).values({ id: "pipeline-status-v2", data: state })
      .onConflictDoUpdate({ target: graphCacheTable.id, set: { data: state, updatedAt: new Date() } });
  });
}

export async function updateRecoveryProgress(): Promise<void> {
  const state = await readState();
  if (!state.recovery.startedAt) return;
  if (state.recovery.completedAt) {
    const graph = await getCachedGraph();
    state.recovery.restoredEdges = graph.edges.filter((e) => e.restoredFromPurge && !!e.lastValidLinkState && !e.hiddenReason).length;
    await writeState(state);
    return;
  }
  const rows = await db.execute(sql`
    SELECT count(*) FILTER (WHERE processed_at IS NULL)::int AS pending
    FROM articles WHERE published_at >= ${getCoverageStart().toISOString()}
      AND published_at <= ${state.recovery.startedAt}`);
  const pending = Number(rows.rows[0]?.pending ?? 0);
  state.recovery.processedArticles = Math.max(0, state.recovery.totalArticles - pending);
  const graph = await getCachedGraph();
  state.recovery.restoredEdges = graph.edges.filter((e) => e.restoredFromPurge && !!e.lastValidLinkState && !e.hiddenReason).length;
  if (pending === 0) {
    state.recovery.completedAt = new Date().toISOString();
    // Items rejected by the stricter extractor stay archived, not visible.
    await saveGraphToCache({ ...graph, edges: graph.edges.map((e) =>
      e.hiddenReason === "needs_evidence_review"
        ? { ...e, hiddenReason: "unsupported_transaction" } : e) });
  }
  await writeState(state);
}
