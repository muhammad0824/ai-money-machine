import { Router, type IRouter } from "express";
import {
  GetGraphResponse,
  GetGraphSummaryResponse,
  GetGraphTimelineResponse,
  GetRefreshStatusResponse,
  GetBacklogStatusResponse,
} from "@workspace/api-zod";

import { getCachedGraph } from "./cache";
import { composeGraphWithManual } from "./compose";
import {
  startBackgroundSync,
  getSchedulerStatus,
  startBacklogProcessing,
  getBacklogStatus,
} from "../rss/scheduler";
import type { GeneratedGraph } from "./generator";
import type { NodeSector as Sector, DealType } from "@workspace/api-zod";
import { abbreviate } from "../../lib/format";

type RefreshAccepted = { status: "accepted" | "already_running"; message: string };

const router: IRouter = Router();

function summarize(graph: GeneratedGraph) {
  // composeGraphWithManual() already enforces the coverage-window + verified-link
  // gate on every edge, so graph.edges is already exactly what's displayable.
  const recentEdges = graph.edges;
  const totalDisclosedUsd = recentEdges.reduce(
    (acc, edge) => acc + (edge.amountUsd ?? 0),
    0,
  );

  const techMediaSectors: Record<Sector, "tech" | "media" | "other"> = {
    tech: "tech",
    ai_lab: "tech",
    infrastructure: "tech",
    investor: "other",
    media: "media",
    publisher: "media",
    studio: "media",
    government: "other",
  };

  const sectorById = new Map<string, Sector>();
  for (const node of graph.nodes) {
    sectorById.set(node.id, node.sector);
  }

  let techMediaDeals = 0;
  for (const edge of recentEdges) {
    const a = sectorById.get(edge.source);
    const b = sectorById.get(edge.target);
    if (!a || !b) continue;
    const sa = techMediaSectors[a];
    const sb = techMediaSectors[b];
    if ((sa === "tech" && sb === "media") || (sa === "media" && sb === "tech")) {
      techMediaDeals += 1;
    }
  }

  const dealsByTypeMap = new Map<DealType, { count: number; totalAmountUsd: number }>();
  for (const edge of recentEdges) {
    const current = dealsByTypeMap.get(edge.dealType) ?? {
      count: 0,
      totalAmountUsd: 0,
    };
    current.count += 1;
    current.totalAmountUsd += edge.amountUsd ?? 0;
    dealsByTypeMap.set(edge.dealType, current);
  }
  const dealsByType = Array.from(dealsByTypeMap.entries())
    .map(([dealType, v]) => ({
      dealType,
      count: v.count,
      totalAmountUsd: v.totalAmountUsd,
    }))
    .sort((a, b) => b.totalAmountUsd - a.totalAmountUsd);

  const nodesBySectorMap = new Map<Sector, number>();
  for (const node of graph.nodes) {
    nodesBySectorMap.set(node.sector, (nodesBySectorMap.get(node.sector) ?? 0) + 1);
  }
  const nodesBySector = Array.from(nodesBySectorMap.entries())
    .map(([sector, count]) => ({ sector, count }))
    .sort((a, b) => b.count - a.count);

  const nameById = new Map<string, string>();
  for (const node of graph.nodes) {
    nameById.set(node.id, node.name);
  }

  const topFlows = [...graph.edges]
    .filter((edge) => edge.amountUsd !== null && edge.amountUsd > 0)
    .sort((a, b) => (b.amountUsd ?? 0) - (a.amountUsd ?? 0))
    .slice(0, 8)
    .map((edge) => ({
      sourceName: nameById.get(edge.source) ?? edge.source,
      targetName: nameById.get(edge.target) ?? edge.target,
      dealType: edge.dealType,
      amountUsd: edge.amountUsd ?? 0,
      amountLabel: edge.amountLabel,
      headline: edge.headline,
      announcedAt: edge.announcedAt,
    }));

  return {
    totalDeals: recentEdges.length,
    totalDisclosedUsd,
    totalDisclosedLabel: abbreviate(totalDisclosedUsd),
    uniqueCompanies: graph.nodes.length,
    techMediaDeals,
    dealsByType,
    nodesBySector,
    topFlows,
    meta: graph.meta,
  };
}

function timelineFrom(graph: GeneratedGraph) {
  const nameById = new Map<string, string>();
  for (const node of graph.nodes) {
    nameById.set(node.id, node.name);
  }
  const items = [...graph.edges]
    // graph.edges is already gated to in-window + verified-link items by composeGraphWithManual()
    .sort((a, b) => (a.announcedAt < b.announcedAt ? 1 : -1))
    .map((edge) => ({
      id: edge.id,
      sourceName: nameById.get(edge.source) ?? edge.source,
      targetName: nameById.get(edge.target) ?? edge.target,
      dealType: edge.dealType,
      amountLabel: edge.amountLabel,
      headline: edge.headline,
      description: edge.description,
      announcedAt: edge.announcedAt,
      sourceUrl: edge.sourceUrl ?? null,
    }));
  return { items, meta: graph.meta };
}

router.get("/graph", async (req, res) => {
  try {
    const base = await getCachedGraph();
    const graph = await composeGraphWithManual(base);
    const data = GetGraphResponse.parse(graph);
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to serve graph");
    res.status(503).json({ error: "Graph data temporarily unavailable. Please try again shortly." });
  }
});

router.post("/graph/refresh", (req, res) => {
  const { running } = getSchedulerStatus();
  if (running) {
    const body: RefreshAccepted = {
      status: "already_running",
      message: "Pipeline already in progress — check /graph/refresh/status for updates.",
    };
    res.status(202).json(body);
    return;
  }
  startBackgroundSync();
  const body: RefreshAccepted = {
    status: "accepted",
    message: "Pipeline started in background. Poll /graph/refresh/status for progress.",
  };
  res.status(202).json(body);
});

router.get("/graph/refresh/status", (_req, res) => {
  const status = getSchedulerStatus();
  const data = GetRefreshStatusResponse.parse(status);
  res.json(data);
});

router.post("/graph/backlog/process", (req, res) => {
  const status = startBacklogProcessing();
  const body: RefreshAccepted = {
    status,
    message:
      status === "accepted"
        ? "Backlog processing started in background. Poll /graph/backlog/status for progress."
        : "Backlog processing already in progress — check /graph/backlog/status for updates.",
  };
  res.status(202).json(body);
});

router.get("/graph/backlog/status", (_req, res) => {
  const status = getBacklogStatus();
  const data = GetBacklogStatusResponse.parse(status);
  res.json(data);
});

router.get("/graph/summary", async (req, res) => {
  try {
    const base = await getCachedGraph();
    const graph = await composeGraphWithManual(base);
    const data = GetGraphSummaryResponse.parse(summarize(graph));
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to serve graph summary");
    res.status(503).json({ error: "Summary data temporarily unavailable." });
  }
});

router.get("/graph/timeline", async (req, res) => {
  try {
    const base = await getCachedGraph();
    const graph = await composeGraphWithManual(base);
    const data = GetGraphTimelineResponse.parse(timelineFrom(graph));
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to serve graph timeline");
    res.status(503).json({ error: "Timeline data temporarily unavailable." });
  }
});

export default router;
