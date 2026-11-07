import { db, graphCacheTable, pool } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface Recovery {
  policyVersion?: number;
  startedAt: string | null;
  completedAt: string | null;
  totalArticles: number;
  processedArticles: number;
  orphanedFingerprints: number;
  restoredEdges: number;
  lastError: string | null;
  orphanedEdgeIds: string[];
}
export interface PipelineState {
  running: boolean;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  lastError: string | null;
  lastRunIngested: number;
  feeds: Record<string, { ingested: number; error: string | null }>;
  recovery: Recovery;
}
const KEY = "pipeline-status-v2";
export const emptyState = (): PipelineState => ({
  running: false, lastStartedAt: null, lastCompletedAt: null, lastError: null, lastRunIngested: 0, feeds: {},
  recovery: { startedAt: null, completedAt: null, totalArticles: 0, processedArticles: 0, orphanedFingerprints: 0, restoredEdges: 0, lastError: null, orphanedEdgeIds: [] },
});
export async function readState(): Promise<PipelineState> {
  const [row] = await db.select().from(graphCacheTable).where(eq(graphCacheTable.id, KEY));
  return row ? row.data as PipelineState : emptyState();
}
export async function writeState(state: PipelineState): Promise<void> {
  await db.insert(graphCacheTable).values({ id: KEY, data: state, updatedAt: new Date() })
    .onConflictDoUpdate({ target: graphCacheTable.id, set: { data: state, updatedAt: new Date() } });
}

/** Session lock spans asynchronous work and protects ALL graph writers across replicas. */
export async function withPipelineLock<T>(work: () => Promise<T>): Promise<T | null> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query("SELECT pg_try_advisory_lock(73810291) AS locked");
    if (!rows[0].locked) return null;
    try { return await work(); }
    finally { await client.query("SELECT pg_advisory_unlock(73810291)"); }
  } finally { client.release(); }
}
