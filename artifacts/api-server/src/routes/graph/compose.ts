import type { GeneratedGraph, GeneratedNode, GeneratedEdge } from "./generator";
import { fetchManualEntries } from "../manual";
import { logger } from "../../lib/logger";
import { coveragePeriodLabel } from "./coverage";
import { seedGraph } from "./seed";
import { verifyAndResolveUrl } from "./linkVerification";
import { applyLinkCheck, visibilityReason } from "./linkPolicy";
import { db, graphCacheTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Hard display gate — applies to EVERY edge, regardless of provenance
 * (seed, ai_extracted, manual). Rules:
 *   1. Must have a sourceUrl.
 *   2. A checked live/gated publisher URL is required. Inconclusive checks
 *      preserve prior validity; confirmed dead links require spaced failures.
 *   3. Must fall inside the rolling coverage window (isWithinCoverage), UNLESS
 *      it's an undated structural ownership edge (dealType === "ownership"),
 *      which is exempt from the date check but still requires a verified link.
 */
function shouldKeepEdge(e: GeneratedEdge): boolean {
  return visibilityReason(e) === null;
}

function seedWithProvenance(): { nodes: GeneratedNode[]; edges: GeneratedEdge[] } {
  return {
    nodes: seedGraph.nodes.map((n) => ({ ...n, isManual: false })),
    edges: seedGraph.edges.map((e) => ({ ...e, provenance: "seed" as const, isManual: false })),
  };
}

/**
 * Composes the final served graph by merging:
 *   1. Seed (always-present curated baseline)
 *   2. AI-generated/cached graph (overwrites seed nodes on conflict, deduped by edge id)
 *   3. Manual entries (user-added, overwrites on conflict)
 *
 * Edges are filtered per pruning rules above.
 */
export async function composeGraphWithManual(cached: GeneratedGraph): Promise<GeneratedGraph> {
  let manual;
  try {
    manual = await fetchManualEntries();
  } catch (err) {
    logger.error({ err }, "Failed to load manual entries; serving base graph only");
    manual = { companies: [], deals: [] };
  }

  // ── Layer 1: seed ─────────────────────────────────────────────────────────
  const seed = seedWithProvenance();
  const nodeIndex = new Map<string, GeneratedNode>();
  const edgeIndex = new Map<string, GeneratedEdge>();

  for (const n of seed.nodes) nodeIndex.set(n.id, n);
  for (const e of seed.edges.filter(shouldKeepEdge)) edgeIndex.set(e.id, e);

  // ── Layer 2: cached AI graph (overwrites seed on id conflict) ─────────────
  for (const n of cached.nodes) nodeIndex.set(n.id, { ...n, isManual: false });
  for (const e of cached.edges.filter(shouldKeepEdge)) {
    edgeIndex.set(e.id, { ...e, isManual: false });
  }

  const baseNodes = Array.from(nodeIndex.values());
  const baseEdges = Array.from(edgeIndex.values());

  // ── Layer 3: manual entries ───────────────────────────────────────────────
  if (manual.companies.length === 0 && manual.deals.length === 0) {
    return {
      nodes: baseNodes,
      edges: baseEdges,
      meta: { ...cached.meta, coveragePeriod: coveragePeriodLabel() },
    };
  }

  const nodeIds = new Set(baseNodes.map((n) => n.id));
  const edgeIds = new Set(baseEdges.map((e) => e.id));

  for (const c of manual.companies) {
    const node: GeneratedNode = {
      id: c.id,
      name: c.name,
      sector: c.sector as GeneratedNode["sector"],
      marketValueUsd: c.marketValueUsd ?? null,
      marketValueLabel: c.marketValueLabel,
      description: c.description,
      country: c.country ?? null,
      isManual: true,
    };
    nodeIds.add(c.id);
    const existing = baseNodes.findIndex((n) => n.id === c.id);
    if (existing >= 0) {
      baseNodes[existing] = node;
    } else {
      baseNodes.push(node);
    }
  }

  const manualEdgeCandidates: GeneratedEdge[] = [];
  for (const d of manual.deals) {
    if (!nodeIds.has(d.sourceId) || !nodeIds.has(d.targetId)) continue;
    let id = d.id;
    if (edgeIds.has(id)) id = `${id}-m`;
    manualEdgeCandidates.push({
      id,
      source: d.sourceId,
      target: d.targetId,
      dealType: d.dealType as GeneratedEdge["dealType"],
      amountUsd: d.amountUsd ?? null,
      amountLabel: d.amountLabel,
      announcedAt: d.announcedAt,
      headline: d.headline,
      description: d.description,
      sourceUrl: d.sourceUrl ?? null,
      isManual: true,
      provenance: "manual" as const,
      outletName: null,
    });
    edgeIds.add(id);
  }

  // Manual entries aren't pre-verified at write time (no background job
  // covers them), so verify live on read, same "no exceptions" gate as
  // everything else. Result isn't persisted here — the periodic
  // revalidation job is the source of truth for long-lived caching.
  const verifiedManualEdges = (
    await Promise.all(
      manualEdgeCandidates.map(async (e) => {
        if (!e.sourceUrl) return null;
        const key = `manual-link:${e.id}`;
        const [saved] = await db.select().from(graphCacheTable).where(eq(graphCacheTable.id, key));
        const previous = saved?.data as GeneratedEdge | undefined;
        const sameSource = (previous?.originalSourceUrl ?? previous?.sourceUrl) === e.sourceUrl;
        let verified = sameSource && previous
          ? { ...previous, ...e, sourceUrl: previous.sourceUrl }
          : { ...e, originalSourceUrl: e.sourceUrl };
        if (!verified.sourceUrlCheckedAt || Date.now() - Date.parse(verified.sourceUrlCheckedAt) >= 6 * 60 * 60 * 1000) {
          verified = applyLinkCheck(verified, await verifyAndResolveUrl(e.sourceUrl));
          await db.insert(graphCacheTable).values({ id: key, data: verified })
            .onConflictDoUpdate({ target: graphCacheTable.id, set: { data: verified, updatedAt: new Date() } });
        }
        return shouldKeepEdge(verified) ? verified : null;
      }),
    )
  ).filter((e): e is GeneratedEdge => e !== null);

  baseEdges.push(...verifiedManualEdges);

  return {
    nodes: baseNodes,
    edges: baseEdges,
    meta: { ...cached.meta, coveragePeriod: coveragePeriodLabel() },
  };
}
