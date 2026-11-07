import { Router } from "express";
import { db, graphCacheTable } from "@workspace/db";
import { sql, like } from "drizzle-orm";
import type { GeneratedEdge } from "../graph/generator";
import { GetPipelineStatusResponse } from "@workspace/api-zod";
import { readState } from "./state";
import { countUnprocessed } from "./scheduler";
import { getCachedGraph } from "../graph/cache";
import { composeGraphWithManual } from "../graph/compose";
import { visibilityReason } from "../graph/linkPolicy";
import { getRssFeeds } from "./feeds";

const router = Router();
router.get("/pipeline/status", async (_req, res) => {
  const [state, raw, awaitingExtraction, feeds, manualLinkRows] = await Promise.all([
    readState(), getCachedGraph(), countUnprocessed(),
    db.execute(sql`
      WITH edge_articles AS (
        SELECT DISTINCT article_id
        FROM graph_cache c, jsonb_array_elements(c.data->'edges') e,
          jsonb_array_elements_text(COALESCE(e->'acceptedArticleIds', '[]'::jsonb)) article_id
        WHERE c.id = 'current' AND e->>'lastValidLinkState' IN ('live', 'gated')
          AND COALESCE(e->>'hiddenReason', '') NOT IN ('needs_evidence_review', 'unsupported_transaction')
      )
      SELECT a.feed_source, count(*)::int AS ingested,
        count(*) FILTER (WHERE a.id IN (SELECT article_id FROM edge_articles))::int AS accepted
      FROM articles a GROUP BY a.feed_source`),
    db.select().from(graphCacheTable).where(like(graphCacheTable.id, "manual-link:%")),
  ]);
  const graph = await composeGraphWithManual(raw);
  const allEdges = [...raw.edges, ...manualLinkRows.map((r) => r.data as GeneratedEdge)];
  const reasons = allEdges.map(visibilityReason);
  const n = (reason: string) => reasons.filter((r) => r === reason).length;
  const linkN = (s: string) => allEdges.filter((e) => (e.linkState ?? "inconclusive") === s).length;
  const counts = new Map(feeds.rows.map((r) => [String(r.feed_source), r]));
  const configured = new Map(getRssFeeds().map((f) => [f.feedSource, f.outletName]));
  for (const source of counts.keys()) if (!configured.has(source)) configured.set(source, "Historical feed");
  res.setHeader("Cache-Control", "no-store");
  res.json(GetPipelineStatusResponse.parse({
    running: state.running, intervalMinutes: 30,
    lastStartedAt: state.lastStartedAt, lastCompletedAt: state.lastCompletedAt, lastError: state.lastError,
    lastRunIngested: state.lastRunIngested, awaitingExtraction,
    displayedEdges: graph.edges.length, hiddenDeadLink: n("dead_link"), hiddenOutOfWindow: n("out_of_window"),
    hiddenOther: reasons.filter((r) => r && r !== "dead_link" && r !== "out_of_window").length,
    live: linkN("live"), gated: linkN("gated"), dead: linkN("dead"), inconclusive: linkN("inconclusive"),
    hidden: reasons.filter(Boolean).length, recovery: state.recovery,
    feeds: [...configured].map(([feedSource, outletName]) => ({
      feedSource, outletName, ingested: Number(counts.get(feedSource)?.ingested ?? 0),
      accepted: Number(counts.get(feedSource)?.accepted ?? 0),
      displayed: graph.edges.filter((e) => e.feedSource === feedSource).length,
      lastRunIngested: state.feeds[feedSource]?.ingested ?? 0,
      lastError: state.feeds[feedSource]?.error ?? null,
    })),
  }));
});
export default router;
