import { fetchAndStoreArticles, lastFeedReport } from "./fetcher";
import { processUnextractedArticles } from "./extractor";
import { initCacheFromSeedIfEmpty, getCachedGraph, saveGraphToCache } from "../graph/cache";
import { verifyUrlsBatch } from "../graph/linkVerification";
import { applyLinkCheck, applyCoverage } from "../graph/linkPolicy";
import { logger } from "../../lib/logger";
import { db, articlesTable } from "@workspace/db";
import { and, gte, lte, isNull, count } from "drizzle-orm";
import { getCoverageStart } from "../graph/coverage";
import { readState, writeState, withPipelineLock } from "./state";
import { prepareRecovery, updateRecoveryProgress } from "./recovery";

const INTERVAL_MS = 30 * 60 * 1000;
let running = false;
let lastCompletedAt: string | null = null;
let queueBusy = false;
export function getSchedulerStatus(): { running: boolean; lastCompletedAt: string | null } {
  return { running: running || queueBusy, lastCompletedAt };
}

export async function countUnprocessed(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(articlesTable).where(and(
    isNull(articlesTable.processedAt), gte(articlesTable.publishedAt, getCoverageStart().toISOString()),
    lte(articlesTable.publishedAt, new Date().toISOString()),
  ));
  return Number(row?.n ?? 0);
}

/** No filter/delete: dead, expired and unsupported edges remain auditable. */
export async function runLinkRevalidationCycle(): Promise<void> {
  const graph = await getCachedGraph();
  const candidates = graph.edges.filter((e) =>
    !e.sourceUrlCheckedAt || Date.now() - Date.parse(e.sourceUrlCheckedAt) >= 6 * 3600000)
    .sort((a, b) => (a.sourceUrlCheckedAt ?? "").localeCompare(b.sourceUrlCheckedAt ?? "")).slice(0, 80);
  const source = (e: typeof graph.edges[number]) => e.sourceUrl ?? e.originalSourceUrl;
  const checks = await verifyUrlsBatch([...new Set(candidates.map(source).filter((s): s is string => !!s))]);
  const ids = new Set(candidates.map((e) => e.id));
  const next = graph.edges.map((e) => {
    const check = ids.has(e.id) ? checks.get(source(e) ?? "") : undefined;
    return check ? applyLinkCheck(e, check) : applyCoverage(e);
  });
  await saveGraphToCache({ ...graph, edges: next });
  logger.info({ checked: candidates.length, retained: next.length }, "Non-destructive link revalidation complete");
}

async function runPipelineCycle(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await withPipelineLock(async () => {
      await prepareRecovery();
      const state = await readState();
      state.running = true; state.lastStartedAt = new Date().toISOString(); state.lastError = null;
      await writeState(state);
      try {
        state.lastRunIngested = await fetchAndStoreArticles();
        state.feeds = { ...lastFeedReport };
        await writeState(state); // visible even during extraction
        await processUnextractedArticles();
        await runLinkRevalidationCycle();
        state.lastCompletedAt = new Date().toISOString();
        lastCompletedAt = state.lastCompletedAt;
      } catch (err) {
        state.lastError = err instanceof Error ? err.message : String(err);
        logger.error({ err }, "RSS pipeline failed");
      } finally {
        state.running = false;
        await writeState(state);
        await updateRecoveryProgress();
      }
    });
  } finally { running = false; }
}

const backlogState = { running: false, totalUnprocessed: 0, processed: 0, dealsFound: 0,
  startedAt: null as string | null, completedAt: null as string | null, lastError: null as string | null };
export const getBacklogStatus = () => ({ ...backlogState });

async function drainCheckpoint(): Promise<void> {
  if (queueBusy) return;
  queueBusy = true;
  try {
    await withPipelineLock(async () => {
      const state = await readState();
      const pending = await countUnprocessed();
      if (!pending) {
        if (backlogState.running) { backlogState.running = false; backlogState.completedAt = new Date().toISOString(); }
        await updateRecoveryProgress();
        return;
      }
      if (!backlogState.running && state.recovery.completedAt) return;
      // Persist the extraction heartbeat separately from feed-ingestion timing.
      state.running = true;
      await writeState(state);
      try {
        const result = await processUnextractedArticles();
        backlogState.processed += result.processed; backlogState.dealsFound += result.newDeals;
        state.lastError = null; state.recovery.lastError = null;
      } catch (err) {
        state.lastError = err instanceof Error ? err.message : String(err);
        state.recovery.lastError = state.lastError;
        backlogState.lastError = state.lastError;
        logger.error({ err }, "Extraction checkpoint failed; articles left pending for retry");
      } finally {
        state.running = false;
        await writeState(state);
        await updateRecoveryProgress();
      }
    });
  } finally { queueBusy = false; }
}

export async function initScheduler(): Promise<void> {
  await initCacheFromSeedIfEmpty();
  void runPipelineCycle().catch((err) => logger.error({ err }, "Initial RSS pipeline failed"));
  setInterval(() => { void runPipelineCycle().catch((err) => logger.error({ err }, "Scheduled RSS pipeline failed")); }, INTERVAL_MS);
  setInterval(() => { void drainCheckpoint().catch((err) => logger.error({ err }, "Recovery checkpoint failed")); }, 10000);
  logger.info({ intervalMinutes: 30 }, "RSS scheduler started; resumable recovery enabled");
}
export function startBackgroundSync(): void {
  void runPipelineCycle().catch((err) => logger.error({ err }, "Manual sync failed"));
}
export function startBacklogProcessing(): "accepted" | "already_running" {
  if (backlogState.running) return "already_running";
  backlogState.running = true; backlogState.startedAt = new Date().toISOString();
  backlogState.completedAt = null; backlogState.lastError = null;
  backlogState.processed = 0; backlogState.dealsFound = 0;
  void countUnprocessed().then((n) => { backlogState.totalUnprocessed = n; return drainCheckpoint(); })
    .catch((err) => { backlogState.lastError = String(err); backlogState.running = false; });
  return "accepted";
}
