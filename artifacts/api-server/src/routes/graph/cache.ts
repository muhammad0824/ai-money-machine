import { db, graphCacheTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { seedGraph } from "./seed";
import type { GeneratedGraph } from "./generator";
import { logger } from "../../lib/logger";

const CACHE_KEY = "current";

function seedWithProvenance(): GeneratedGraph {
  return {
    ...seedGraph,
    edges: seedGraph.edges.map((e) => ({ ...e, provenance: "seed" as const })),
  };
}

export async function getCachedGraph(): Promise<GeneratedGraph> {
  try {
    const rows = await db
      .select()
      .from(graphCacheTable)
      .where(eq(graphCacheTable.id, CACHE_KEY))
      .limit(1);
    if (rows.length > 0 && rows[0]) {
      return rows[0].data as GeneratedGraph;
    }
  } catch (err) {
    logger.error({ err }, "Failed to read graph from DB cache, falling back to seed");
  }
  return seedWithProvenance();
}

/**
 * Guarantees the curated seed nodes/edges are always part of what gets persisted.
 * This is the single choke point all writers go through, so no caller (full AI
 * regen, incremental RSS extraction, etc.) can accidentally drop the seed layer
 * from the DB-backed cache. The request-time re-injection in compose.ts remains
 * as a defensive fallback, but with this fix it should never need to do real work.
 */
function mergeSeedIntoGraph(graph: GeneratedGraph): GeneratedGraph {
  const seed = seedWithProvenance();

  const nodeIndex = new Map(seed.nodes.map((n) => [n.id, n]));
  for (const n of graph.nodes) {
    if (!nodeIndex.has(n.id)) nodeIndex.set(n.id, n);
  }

  const edgeIndex = new Map(seed.edges.map((e) => [e.id, e]));
  for (const e of graph.edges) {
    // Never let a non-seed write clobber the canonical seed edge definition.
    if (e.provenance === "seed") continue;
    edgeIndex.set(e.id, e);
  }

  return {
    nodes: Array.from(nodeIndex.values()),
    edges: Array.from(edgeIndex.values()),
    meta: graph.meta,
  };
}

export async function saveGraphToCache(graph: GeneratedGraph): Promise<void> {
  const merged = mergeSeedIntoGraph(graph);
  const now = new Date();
  await db
    .insert(graphCacheTable)
    .values({ id: CACHE_KEY, data: merged as object, updatedAt: now })
    .onConflictDoUpdate({
      target: graphCacheTable.id,
      set: { data: merged as object, updatedAt: now },
    });
}

export async function initCacheFromSeedIfEmpty(): Promise<void> {
  const rows = await db
    .select({ id: graphCacheTable.id })
    .from(graphCacheTable)
    .where(eq(graphCacheTable.id, CACHE_KEY))
    .limit(1);
  if (rows.length === 0) {
    await saveGraphToCache(seedWithProvenance());
    logger.info("Initialised graph cache from seed dataset");
  }
}
