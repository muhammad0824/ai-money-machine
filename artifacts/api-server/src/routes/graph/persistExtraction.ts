import { db, graphCacheTable, dealFingerprintsTable, articlesTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import type { GeneratedGraph } from "./generator";
import { seedGraph } from "./seed";

/** Checkpoint graph, dedup and article processing atomically: no stranded fingerprints. */
export async function commitExtraction(
  graph: GeneratedGraph,
  fingerprints: { fingerprint: string; edgeId: string; articleUrl: string }[],
  processedIds: string[],
): Promise<void> {
  const merged = { ...graph, nodes: [...new Map([...seedGraph.nodes, ...graph.nodes].map((n) => [n.id, n])).values()] };
  await db.transaction(async (tx) => {
    await tx.insert(graphCacheTable).values({ id: "current", data: merged, updatedAt: new Date() })
      .onConflictDoUpdate({ target: graphCacheTable.id, set: { data: merged, updatedAt: new Date() } });
    for (const row of fingerprints) {
      await tx.insert(dealFingerprintsTable).values(row)
        .onConflictDoUpdate({ target: dealFingerprintsTable.fingerprint, set: { edgeId: row.edgeId, articleUrl: row.articleUrl } });
    }
    if (processedIds.length) await tx.update(articlesTable).set({ processedAt: new Date() }).where(inArray(articlesTable.id, processedIds));
  });
}
