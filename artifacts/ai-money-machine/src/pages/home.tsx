import {
  useGetGraph,
  useGetGraphSummary,
  useGetGraphTimeline,
  useRefreshGraph,
  useGetRefreshStatus,
  useStartBacklogProcessing,
  useGetBacklogStatus,
  getGetGraphQueryKey,
  getGetGraphSummaryQueryKey,
  getGetGraphTimelineQueryKey,
  getGetRefreshStatusQueryKey,
  getGetBacklogStatusQueryKey,
  GraphNode,
  GraphEdge,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  RefreshCw,
  Activity,
  DollarSign,
  Database,
  FileText,
  AlertCircle,
  Info,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Lock,
  RotateCcw,
  Filter,
  Eye,
  EyeOff,
  Newspaper,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow, format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import GraphViewer from "@/components/GraphViewer";
import NodeDetailPanel from "@/components/NodeDetailPanel";
import SearchBar from "@/components/SearchBar";
import AddEntryDialog from "@/components/AddEntryDialog";
import PipelineStatusPanel from "@/components/PipelineStatusPanel";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

// ─── Constants ───────────────────────────────────────────────────────────────

const DEAL_TYPES: Array<{ key: string; label: string; color: string }> = [
  { key: "investment", label: "Investment", color: "#10b981" },
  { key: "acquisition", label: "Acquisition", color: "#3b82f6" },
  { key: "licensing", label: "Licensing", color: "#f59e0b" },
  { key: "partnership", label: "Partnership", color: "#8b5cf6" },
  { key: "infrastructure", label: "Compute/Cloud", color: "#ec4899" },
  { key: "lawsuit", label: "Lawsuit", color: "#ef4444" },
  { key: "venture_capital", label: "Venture Capital", color: "#14b8a6" },
  { key: "government_contract", label: "Gov Contract", color: "#f97316" },
  { key: "government_subsidy", label: "Gov Subsidy", color: "#84cc16" },
  { key: "government_equity", label: "Gov Equity", color: "#06b6d4" },
];

const SECTOR_LEGEND: Array<{ key: string; label: string; color: string }> = [
  { key: "tech", label: "Big Tech", color: "#38bdf8" },
  { key: "ai_lab", label: "AI Lab", color: "#a78bfa" },
  { key: "infrastructure", label: "Infra / GPU Cloud", color: "#94a3b8" },
  { key: "publisher", label: "Publisher", color: "#fb923c" },
  { key: "media", label: "Media / Rights", color: "#fbbf24" },
  { key: "studio", label: "Studio / Broadcast", color: "#f472b6" },
  { key: "investor", label: "Investor", color: "#2dd4bf" },
  { key: "government", label: "Government", color: "#facc15" },
];

/** Paywalled domains — links show a lock icon but remain clickable */
const PAYWALLED_DOMAINS = [
  "bloomberg.com", "ft.com", "wsj.com", "economist.com",
  "theinformation.com", "puck.news", "foreignaffairs.com",
  "nytimes.com", "washingtonpost.com", "theathletic.com",
];

function isPaywalledUrl(url: string | null | undefined, linkState?: string | null): boolean {
  if (linkState === "gated") return true;
  if (!url) return false;
  return PAYWALLED_DOMAINS.some((d) => url.includes(d));
}

/**
 * Outlet name → canonical graph node ID.
 * Used for reflexivity detection: when an outlet reporting on a deal
 * is itself a participant in the funding graph.
 */
const OUTLET_TO_NODE_ID: Record<string, string> = {
  "The New York Times": "nyt",
  "Financial Times": "ft",
  "The Guardian": "guardian",
  "Reuters": "reuters",
  "BBC": "bbc",
  "Associated Press": "ap",
  "Vox": "vox-media",
  "The Verge": "vox-media",
  "Wired": "conde-nast",
  "The New Yorker": "conde-nast",
  "TIME": "time-magazine",
  "CNN": "warner-bros-discovery",
  "NBC News": "comcast",
  "MSNBC": "comcast",
  "CBS News": "paramount-global",
  "ABC News": "disney",
  "Fox News": "fox-corp",
  "Fox Business": "fox-corp",
  "Politico": "axel-springer",
  "Business Insider": "axel-springer",
  "The Wall Street Journal": "news-corp",
  "NY Post": "news-corp",
  "New York Post": "news-corp",
  "The Washington Post": "washington-post",
  "Deadline": "warner-bros-discovery",
  "Variety": "variety",
  "The Hollywood Reporter": "iac",
  "Reddit": "reddit",
  "NPR": "npr",
  "Semafor": "semafor",
};

/** Node IDs that represent news/media outlets (for reflexivity node badges) */
const NEWS_OUTLET_NODE_IDS = new Set([
  "nyt", "news-corp", "axel-springer", "conde-nast", "vox-media",
  "the-atlantic", "ft", "le-monde", "ap", "reddit",
  "washington-post", "guardian", "reuters", "bbc",
  "comcast", "fox-corp", "paramount-global",
  "dotdash-meredith", "time-magazine", "hearst", "semafor",
]);

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

function readPanelPref(isMobile: boolean): boolean {
  try {
    const stored = localStorage.getItem("panelOpen");
    if (stored !== null) return stored === "true";
  } catch {}
  return !isMobile;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs font-mono text-muted-foreground uppercase">{label}</span>
      <span className={`text-xl font-bold ${accent ? "text-primary" : ""}`}>{value}</span>
    </div>
  );
}

function SourceLink({
  url,
  name,
  className = "",
  linkState,
}: {
  url: string;
  name?: string;
  className?: string;
  linkState?: string | null;
}) {
  const paywalled = isPaywalledUrl(url, linkState);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-0.5 hover:text-primary transition-colors ${className}`}
      title={paywalled ? `${name ?? "Article"} (paywalled)` : name}
    >
      {paywalled ? (
        <Lock className="h-2.5 w-2.5 shrink-0 opacity-60" />
      ) : (
        <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-50" />
      )}
      {name && <span>{name.slice(0, 20)}</span>}
    </a>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Home() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const graphQuery = useGetGraph({
    query: { staleTime: 60_000, queryKey: getGetGraphQueryKey(), retry: 3, retryDelay: 2000 },
  });
  const summaryQuery = useGetGraphSummary({
    query: { staleTime: 60_000, queryKey: getGetGraphSummaryQueryKey(), retry: 3, retryDelay: 2000 },
  });
  const timelineQuery = useGetGraphTimeline({
    query: { staleTime: 60_000, queryKey: getGetGraphTimelineQueryKey(), retry: 3, retryDelay: 2000 },
  });
  const refreshMutation = useRefreshGraph();
  const backlogMutation = useStartBacklogProcessing();

  // ── Backlog processing polling ──────────────────────────────────────────
  const [backlogPolling, setBacklogPolling] = useState(false);
  const backlogStatusQuery = useGetBacklogStatus({
    query: {
      enabled: backlogPolling,
      refetchInterval: backlogPolling ? 2000 : false,
      queryKey: getGetBacklogStatusQueryKey(),
      throwOnError: false,
    },
  });

  useEffect(() => {
    if (!backlogPolling) return;
    if (!backlogStatusQuery.data) return;
    if (backlogStatusQuery.data.running) return;
    setBacklogPolling(false);
    queryClient.invalidateQueries({ queryKey: getGetGraphQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetGraphSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetGraphTimelineQueryKey() });
    if (backlogStatusQuery.data.lastError) {
      toast.error(`Backlog processing failed: ${backlogStatusQuery.data.lastError}`);
    } else {
      toast.success(`Backlog processing complete. ${backlogStatusQuery.data.dealsFound} deals found from ${backlogStatusQuery.data.processed} articles.`);
    }
  }, [backlogPolling, backlogStatusQuery.data, queryClient]);

  const handleProcessBacklog = useCallback(() => {
    backlogMutation.mutate(undefined, {
      onSuccess: (data) => {
        if (data.status === "already_running") {
          toast.info("Backlog processing already running — watching for progress…");
        } else {
          toast.info("Backlog processing started in background…");
        }
        setBacklogPolling(true);
      },
      onError: () => toast.error("Failed to start backlog processing."),
    });
  }, [backlogMutation]);

  // ── Sync polling ─────────────────────────────────────────────────────────
  // After clicking "Sync", we fire-and-forget the POST and then poll for
  // completion rather than blocking on the HTTP request.
  const [syncPolling, setSyncPolling] = useState(false);

  const statusQuery = useGetRefreshStatus({
    query: {
      enabled: syncPolling,
      refetchInterval: syncPolling ? 2000 : false,
      queryKey: getGetRefreshStatusQueryKey(),
      // Don't surface status-poll errors as global error state
      throwOnError: false,
    },
  });

  useEffect(() => {
    if (!syncPolling) return;
    if (!statusQuery.data) return;
    if (statusQuery.data.running) return;
    // Pipeline finished — refresh all graph data
    setSyncPolling(false);
    queryClient.invalidateQueries({ queryKey: getGetGraphQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetGraphSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetGraphTimelineQueryKey() });
    toast.success("Sync complete. Graph data updated.");
  }, [syncPolling, statusQuery.data, queryClient]);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(() => readPanelPref(false));
  const [showCycles, setShowCycles] = useState(false);
  const [activeDealTypes, setActiveDealTypes] = useState<Set<string>>(
    () => new Set(DEAL_TYPES.map((d) => d.key)),
  );
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  // On mobile: auto-collapse panel, open sheet for node details
  useEffect(() => {
    if (isMobile) setIsPanelOpen(false);
  }, [isMobile]);

  useEffect(() => {
    if (isMobile && activeNodeId) setMobileSheetOpen(true);
    if (!activeNodeId) setMobileSheetOpen(false);
  }, [isMobile, activeNodeId]);

  const togglePanel = useCallback(() => {
    setIsPanelOpen((v) => {
      const next = !v;
      try { localStorage.setItem("panelOpen", String(next)); } catch {}
      return next;
    });
  }, []);

  const toggleDealType = useCallback((key: string) => {
    setActiveDealTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size === 1) return next; // keep at least one active
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleRefresh = useCallback(() => {
    refreshMutation.mutate(undefined, {
      onSuccess: (data) => {
        if (data.status === "already_running") {
          toast.info("Sync already in progress — watching for completion…");
        } else {
          toast.info("Sync started. Updating graph data…");
        }
        setSyncPolling(true);
      },
      onError: () => toast.error("Failed to trigger sync. Please try again."),
    });
  }, [refreshMutation]);

  const handleNodeClick = useCallback((node: GraphNode | null) => {
    setActiveNodeId(node ? node.id : null);
  }, []);

  // ── Loading / error states ───────────────────────────────────────────────
  const isLoading = graphQuery.isLoading || summaryQuery.isLoading || timelineQuery.isLoading;
  const isError = graphQuery.isError || summaryQuery.isError || timelineQuery.isError;

  const handleRetry = useCallback(() => {
    queryClient.resetQueries({ queryKey: getGetGraphQueryKey() });
    queryClient.resetQueries({ queryKey: getGetGraphSummaryQueryKey() });
    queryClient.resetQueries({ queryKey: getGetGraphTimelineQueryKey() });
  }, [queryClient]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background text-foreground flex-col gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="font-mono text-sm text-muted-foreground animate-pulse">
          Establishing connection...
        </p>
      </div>
    );
  }

  if (isError) {
    const errorMsg =
      graphQuery.error instanceof Error ? graphQuery.error.message :
      summaryQuery.error instanceof Error ? summaryQuery.error.message :
      timelineQuery.error instanceof Error ? timelineQuery.error.message :
      "Could not connect to data server.";
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background text-foreground flex-col gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h2 className="text-xl font-bold">Signal Lost</h2>
        <p className="text-muted-foreground max-w-xs text-center text-sm">{errorMsg}</p>
        <div className="flex gap-2">
          <Button onClick={handleRetry} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
          <Button onClick={() => window.location.reload()} variant="ghost" size="sm">
            Hard reload
          </Button>
        </div>
      </div>
    );
  }

  if (!graphQuery.data || !summaryQuery.data || !timelineQuery.data) return null;

  const graph = graphQuery.data;
  const { meta } = graph;
  const summary = summaryQuery.data;
  const timeline = timelineQuery.data;

  // ── Reflexivity: outlets that are also nodes in the graph ────────────────
  const graphNodeIds = new Set(graph.nodes.map((n) => n.id));
  const reflexiveNodeIds = new Set(
    graph.nodes.filter((n) => NEWS_OUTLET_NODE_IDS.has(n.id)).map((n) => n.id),
  );

  function getReflexiveOutletNodeId(outletName: string): string | null {
    const nodeId = OUTLET_TO_NODE_ID[outletName];
    return nodeId && graphNodeIds.has(nodeId) ? nodeId : null;
  }

  function edgeOutletNames(edge: GraphEdge): string[] {
    if (edge.outletNames && edge.outletNames.length > 0) return edge.outletNames;
    if (edge.outletName) return [edge.outletName];
    return [];
  }

  const panelWidth = 384; // w-96 = 24rem = 384px

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground selection:bg-primary/30">
      {/* ── Main Graph Area ─────────────────────────────────────────────── */}
      <main className="relative flex-1 h-full overflow-hidden min-w-0">
        {/* Graph canvas */}
        <div className="absolute inset-0 z-0">
          <GraphViewer
            graphData={graph}
            activeNodeId={activeNodeId}
            onNodeClick={handleNodeClick}
            activeDealTypes={activeDealTypes}
            showCycles={showCycles}
          />
        </div>

        {/* Node detail overlay — desktop only; mobile uses Sheet */}
        {!isMobile && (
          <NodeDetailPanel
            graph={graph}
            activeNodeId={activeNodeId}
            onClose={() => setActiveNodeId(null)}
            onSelectNode={(node) => setActiveNodeId(node.id)}
          />
        )}

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="absolute top-0 left-0 right-0 z-10 p-3 md:p-6 pointer-events-none flex flex-col lg:flex-row lg:justify-between items-start gap-2 lg:gap-4">
          <div className="pointer-events-auto shrink-0 max-w-full">
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 mb-0.5"
            >
              <Activity className="text-primary h-5 w-5 shrink-0" />
              <h1 className="text-lg md:text-2xl font-bold tracking-tight uppercase whitespace-nowrap">
                AI Money Machine
              </h1>
            </motion.div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.05 }}
              className="text-[11px] font-semibold tracking-wide text-foreground/75 pl-7 mb-2 whitespace-nowrap"
            >
              Lead Developer &amp; Creator: Mo Muzammal
            </motion.p>
            {/* ── Cycles + Filters ── */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.08 }}
              className="flex flex-wrap gap-2 pl-7 mb-2"
            >
              {/* Cycle detection toggle */}
              <button
                onClick={() => setShowCycles((v) => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-mono border backdrop-blur-md transition-all ${
                  showCycles
                    ? "bg-orange-500/20 border-orange-500/50 text-orange-400 shadow-lg shadow-orange-500/10"
                    : "bg-background/70 border-border/40 text-muted-foreground hover:text-foreground"
                }`}
                title="Toggle circular relationship detection"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Cycles</span>
                {showCycles && <span className="text-orange-400">●</span>}
              </button>

              {/* Edge-type filter popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-mono border backdrop-blur-md transition-all ${
                      activeDealTypes.size < DEAL_TYPES.length
                        ? "bg-primary/20 border-primary/50 text-primary"
                        : "bg-background/70 border-border/40 text-muted-foreground hover:text-foreground"
                    }`}
                    title="Filter relationship types"
                  >
                    <Filter className="h-3 w-3" />
                    <span>Filters</span>
                    {activeDealTypes.size < DEAL_TYPES.length && (
                      <span className="font-bold">{activeDealTypes.size}/{DEAL_TYPES.length}</span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  side="bottom"
                  className="w-56 p-3 bg-background/95 backdrop-blur-xl border-border/60"
                >
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                    Relationship Types
                  </div>
                  <div className="flex flex-col gap-1">
                    {DEAL_TYPES.map((d) => (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => toggleDealType(d.key)}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
                          activeDealTypes.has(d.key)
                            ? "bg-accent/20 text-foreground"
                            : "text-muted-foreground/50"
                        }`}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: activeDealTypes.has(d.key) ? d.color : "#444" }}
                        />
                        <span className="flex-1 text-left">{d.label}</span>
                        {activeDealTypes.has(d.key) ? (
                          <Eye className="h-3 w-3 text-muted-foreground" />
                        ) : (
                          <EyeOff className="h-3 w-3 text-muted-foreground/40" />
                        )}
                      </button>
                    ))}
                  </div>
                  <Separator className="my-2 bg-border/40" />
                  <button
                    type="button"
                    onClick={() => setActiveDealTypes(new Set(DEAL_TYPES.map((d) => d.key)))}
                    className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Show all
                  </button>
                </PopoverContent>
              </Popover>
              <PipelineStatusPanel />
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="flex gap-x-2 gap-y-0.5 pl-7 text-[10px] font-mono text-muted-foreground flex-wrap [&>span]:whitespace-nowrap"
            >
              <span>{meta.coveragePeriod}</span>
              <span>•</span>
              <span>
                Synced {formatDistanceToNow(new Date(meta.generatedAt), { addSuffix: true })}
              </span>
              {meta.nextRefreshAt && (
                <>
                  <span>·</span>
                  <span>
                    Next {formatDistanceToNow(new Date(meta.nextRefreshAt), { addSuffix: true })}
                  </span>
                </>
              )}
            </motion.div>
          </div>

          <div className="pointer-events-auto flex flex-col items-start lg:items-end gap-2 min-w-0 w-full lg:w-auto">
            <div className="flex items-center gap-1.5 flex-wrap justify-start lg:justify-end max-w-full">
              <SearchBar
                nodes={graph.nodes}
                onSelect={(node) => setActiveNodeId(node.id)}
              />
              <AddEntryDialog nodes={graph.nodes} />
              <Button
                variant="default"
                size="sm"
                className="font-mono text-xs h-8 px-3 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 border border-primary/30"
                onClick={handleRefresh}
                disabled={refreshMutation.isPending || syncPolling}
              >
                {(refreshMutation.isPending || syncPolling) ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                ) : (
                  <RefreshCw className="h-3 w-3 mr-1.5" />
                )}
                {syncPolling ? "Syncing…" : refreshMutation.isPending ? "Starting…" : "Sync"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="font-mono text-xs h-8 px-3 bg-background/70 backdrop-blur-md border-border/50"
                onClick={handleProcessBacklog}
                disabled={backlogMutation.isPending || backlogPolling}
                title="Process the full backlog of unprocessed RSS articles"
              >
                {(backlogMutation.isPending || backlogPolling) ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                ) : (
                  <Database className="h-3 w-3 mr-1.5" />
                )}
                {backlogPolling && backlogStatusQuery.data
                  ? `Backlog ${backlogStatusQuery.data.processed}/${backlogStatusQuery.data.totalUnprocessed}`
                  : "Process Backlog"}
              </Button>
              {/* Panel toggle (desktop) */}
              {!isMobile && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={togglePanel}
                  className="h-8 px-2 font-mono text-[11px] bg-background/70 backdrop-blur-md border-border/50"
                  title={isPanelOpen ? "Collapse panel" : "Expand panel"}
                >
                  {isPanelOpen ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <ChevronLeft className="h-4 w-4" />
                  )}
                </Button>
              )}
              {/* Panel toggle (mobile) */}
              {isMobile && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={togglePanel}
                  className="h-8 px-2 font-mono text-[11px] bg-background/70 backdrop-blur-md border-border/50"
                >
                  <Database className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </header>

        {/* ── Floating Stats ──────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="absolute bottom-6 left-4 z-10 pointer-events-auto"
        >
          <div className="flex bg-background/80 backdrop-blur-xl border border-border/50 rounded-lg p-3 gap-4 shadow-2xl">
            <Stat label="Total Flow" value={summary.totalDisclosedLabel} accent />
            <Separator orientation="vertical" className="h-8 bg-border/50" />
            <Stat label="Deals" value={summary.totalDeals.toString()} />
            <Separator orientation="vertical" className="h-8 bg-border/50" />
            <Stat label="Entities" value={summary.uniqueCompanies.toString()} />
          </div>
        </motion.div>

        {/* ── Legend popover ──────────────────────────────────────────────── */}
        <div className="absolute bottom-6 right-4 z-10 pointer-events-auto">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="font-mono text-[11px] bg-background/70 backdrop-blur-md border-border/50 hover:bg-accent/50 h-8"
              >
                <Info className="h-3 w-3 mr-1.5" /> Legend
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              side="top"
              className="w-64 p-3 bg-background/95 backdrop-blur-xl border-border/60"
            >
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                Deal Types
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs mb-3">
                {DEAL_TYPES.map((d) => (
                  <div key={d.key} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                    {d.label}
                  </div>
                ))}
              </div>
              <Separator className="bg-border/40 mb-3" />
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                Sectors
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                {SECTOR_LEGEND.map((s) => (
                  <div key={s.key} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.label}
                  </div>
                ))}
              </div>
              <Separator className="bg-border/40 my-3" />
              <div className="flex flex-col gap-1.5 text-[10px] font-mono text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="px-1 py-0.5 bg-orange-500/15 text-orange-400 border border-orange-500/30 rounded text-[8px]">● Cycle</span>
                  Circular relationship detected
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-1 py-0.5 bg-rose-500/15 text-rose-400 border border-rose-500/30 rounded text-[8px] flex items-center gap-0.5"><Newspaper className="h-2 w-2" /> Media</span>
                  Outlet reporting on own deals
                </div>
                <div className="flex items-center gap-2">
                  <Lock className="h-2.5 w-2.5" /> Paywalled source (link still works)
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* ── Mobile bottom sheet for node detail ────────────────────────── */}
        {isMobile && (
          <Sheet
            open={mobileSheetOpen}
            onOpenChange={(open) => {
              setMobileSheetOpen(open);
              if (!open) setActiveNodeId(null);
            }}
          >
            <SheetContent side="bottom" className="h-[75vh] p-0 flex flex-col bg-background">
              <SheetHeader className="px-4 pt-4 pb-2 border-b border-border/50 shrink-0">
                <SheetTitle className="text-sm font-mono font-semibold uppercase tracking-wider text-left">
                  {graph.nodes.find((n) => n.id === activeNodeId)?.name ?? "Entity Detail"}
                </SheetTitle>
              </SheetHeader>
              <div className="flex-1 min-h-0 overflow-hidden">
                <NodeDetailPanel
                  graph={graph}
                  activeNodeId={activeNodeId}
                  onClose={() => { setActiveNodeId(null); setMobileSheetOpen(false); }}
                  onSelectNode={(node) => setActiveNodeId(node.id)}
                  inlineMode
                />
              </div>
            </SheetContent>
          </Sheet>
        )}
      </main>

      {/* ── Side Panel (collapsible) ────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {isPanelOpen && (
          <motion.aside
            key="side-panel"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: panelWidth, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            className="flex-shrink-0 bg-card border-l border-border/50 flex flex-col z-20 shadow-2xl overflow-hidden"
            style={{ minWidth: 0 }}
          >
            {/* Panel header */}
            <div className="p-4 border-b border-border/50 flex items-center justify-between gap-2 shrink-0">
              <h2 className="font-mono text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                Top Flows
              </h2>
              <button
                onClick={togglePanel}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Collapse panel"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Top Flows */}
            <div className="h-[30%] border-b border-border/50 overflow-hidden bg-background/30 shrink-0">
              <ScrollArea className="h-full">
                <div className="p-4 flex flex-col gap-3">
                  {summary.topFlows.map((flow, i) => {
                    const targetNode = graph.nodes.find((n) => n.name === flow.targetName);
                    const isMediaNode = targetNode && reflexiveNodeIds.has(targetNode.id);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => { if (targetNode) setActiveNodeId(targetNode.id); }}
                        className="text-left group relative p-3 rounded-md border border-border/30 bg-background/50 hover:bg-accent/10 hover:border-border/60 transition-colors"
                      >
                        <div className="flex justify-between items-start mb-1 gap-2">
                          <div className="flex items-center gap-1.5 text-xs font-mono min-w-0">
                            <span className="font-semibold text-foreground truncate">{flow.sourceName}</span>
                            <span className="text-muted-foreground shrink-0">→</span>
                            <span className="font-semibold text-foreground truncate flex items-center gap-1">
                              {flow.targetName}
                              {isMediaNode && (
                                <Newspaper className="h-2.5 w-2.5 text-rose-400 shrink-0" aria-label="This entity is also a news outlet in the funding graph" />
                              )}
                            </span>
                          </div>
                          <span className="text-primary font-mono text-xs font-bold shrink-0">
                            {flow.amountLabel}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1 group-hover:text-foreground transition-colors">
                          {flow.headline}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* Activity Log header */}
            <div className="p-4 border-b border-border/50 flex justify-between items-center bg-card shrink-0">
              <h2 className="font-mono text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Activity Log
              </h2>
              <span className="text-[10px] font-mono text-muted-foreground/50">
                {timeline.items.length} deals
              </span>
            </div>

            {/* Activity Log entries */}
            <div className="flex-1 overflow-hidden min-h-0">
              <ScrollArea className="h-full">
                <div className="p-4 flex flex-col gap-5">
                  {timeline.items.map((item) => {
                    const edge = graph.edges.find((e) => e.id === item.id);
                    const provenance = edge?.provenance;
                    const sourceUrl = edge?.sourceUrl;
                    const sourceUrls = edge?.sourceUrls;
                    const outlets = edge ? edgeOutletNames(edge) : [];

                    // Reflexivity: check if any reporting outlet is itself a graph node
                    const reflexiveOutlets = outlets
                      .map((name) => ({ name, nodeId: getReflexiveOutletNodeId(name) }))
                      .filter((r) => r.nodeId !== null);
                    const isReflexive = reflexiveOutlets.length > 0;

                    return (
                      <div
                        key={item.id}
                        className="relative pl-4 border-l border-border/50"
                      >
                        <div className="absolute w-2 h-2 rounded-full bg-primary/50 -left-[4.5px] top-1.5" />

                        {/* Meta row: date + deal type + outlet badges */}
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {format(new Date(item.announcedAt), "MMM d, yyyy")}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[9px] uppercase tracking-wider h-4 px-1 rounded-sm border-primary/30 text-primary/80"
                          >
                            {item.dealType.replace("_", " ")}
                          </Badge>

                          {provenance === "ai_extracted" && outlets.length > 0 && outlets.map((name) => {
                            const isReflexiveOutlet = getReflexiveOutletNodeId(name) !== null;
                            return (
                              <span
                                key={name}
                                className={`text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded-sm border flex items-center gap-0.5 ${
                                  isReflexiveOutlet
                                    ? "bg-rose-500/10 text-rose-400 border-rose-500/25"
                                    : "bg-sky-500/10 text-sky-400 border-sky-500/25"
                                }`}
                                title={isReflexiveOutlet ? `${name} is also a participant in the funding graph (reflexivity)` : name}
                              >
                                {isReflexiveOutlet && <Newspaper className="h-2 w-2" />}
                                {name.slice(0, 16)}
                              </span>
                            );
                          })}
                          {provenance === "ai_extracted" && outlets.length === 0 && (
                            <span className="text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded-sm bg-sky-500/10 text-sky-400 border border-sky-500/25">
                              AI
                            </span>
                          )}
                          {provenance === "manual" && (
                            <span className="text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded-sm bg-amber-500/15 text-amber-400 border border-amber-500/25">
                              Manual
                            </span>
                          )}

                          {/* Reflexivity badge */}
                          {isReflexive && (
                            <span
                              className="text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded-sm bg-rose-500/10 text-rose-400 border border-rose-500/25"
                              title={`Reflexivity: ${reflexiveOutlets.map((r) => r.name).join(", ")} reported on a deal they have financial ties to`}
                            >
                              ⟲ Reflexive
                            </span>
                          )}
                        </div>

                        {/* Headline + primary source link */}
                        {sourceUrl ? (
                          <a
                            href={sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-start gap-1 text-sm font-medium leading-snug mb-1 hover:text-primary transition-colors group"
                          >
                            <span>{item.headline}</span>
                            {isPaywalledUrl(sourceUrl, edge?.linkState) ? (
                              <Lock className="h-3 w-3 shrink-0 mt-0.5 opacity-50 text-amber-400 group-hover:opacity-80" />
                            ) : (
                              <ExternalLink className="h-3 w-3 shrink-0 mt-0.5 opacity-40 group-hover:opacity-100" />
                            )}
                          </a>
                        ) : (
                          <h3 className="text-sm font-medium leading-snug mb-1">{item.headline}</h3>
                        )}

                        <p className="text-xs text-muted-foreground/80 leading-relaxed">
                          {item.description}
                        </p>

                        {edge?.evidenceSnippet && (
                          <blockquote
                            className="mt-1.5 border-l-2 border-primary/40 pl-2 text-[11px] italic text-foreground/70 leading-snug"
                            data-testid={`text-evidence-${item.id}`}
                          >
                            <span className="not-italic font-mono text-[9px] uppercase tracking-wider text-muted-foreground mr-1">Evidence</span>
                            "{edge.evidenceSnippet}"
                          </blockquote>
                        )}

                        {item.amountLabel && item.amountLabel !== "Undisclosed" && (
                          <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded-sm">
                            <DollarSign className="w-3 h-3" />
                            {item.amountLabel}
                          </div>
                        )}

                        {/* Additional source links (cross-referenced deals) */}
                        {sourceUrls && sourceUrls.length > 1 && (
                          <div className="flex flex-wrap gap-2 mt-1.5">
                            {sourceUrls.slice(1).map((url, i) => {
                              const name = outlets[i + 1] ?? "Source";
                              return (
                                <SourceLink
                                  key={url}
                                  url={url}
                                  name={name}
                                  linkState={edge?.linkState}
                                  className="text-[9px] font-mono text-muted-foreground/60"
                                />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* Panel footer */}
            <div className="p-3 border-t border-border/50 bg-card text-[10px] text-muted-foreground/50 font-mono text-center shrink-0">
              <p className="truncate">Sources: {meta.sources.slice(0, 8).join(", ")}{meta.sources.length > 8 ? ` +${meta.sources.length - 8} more` : ""}</p>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Panel open button when collapsed (desktop) */}
      {!isPanelOpen && !isMobile && (
        <button
          onClick={togglePanel}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-30 bg-card border border-border/50 border-r-0 rounded-l-lg px-1.5 py-4 text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors shadow-xl flex flex-col items-center gap-1"
          title="Open funding panel"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="text-[9px] font-mono uppercase tracking-widest" style={{ writingMode: "vertical-rl" }}>
            Flows
          </span>
        </button>
      )}

      {/* Mobile panel as a bottom sheet */}
      {isMobile && (
        <Sheet open={isPanelOpen} onOpenChange={(open) => { setIsPanelOpen(open); try { localStorage.setItem("panelOpen", String(open)); } catch {} }}>
          <SheetContent side="bottom" className="h-[80vh] p-0 flex flex-col bg-background">
            <SheetHeader className="px-4 pt-4 pb-2 border-b border-border/50 shrink-0">
              <SheetTitle className="text-sm font-mono font-semibold uppercase tracking-wider text-left flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                Funding Flows
              </SheetTitle>
            </SheetHeader>

            {/* Mobile: Top Flows */}
            <div className="border-b border-border/50 shrink-0 bg-background/30" style={{ maxHeight: "35%" }}>
              <ScrollArea className="h-full">
                <div className="p-4 flex flex-col gap-3">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Top Flows</div>
                  {summary.topFlows.map((flow, i) => {
                    const targetNode = graph.nodes.find((n) => n.name === flow.targetName);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          if (targetNode) { setActiveNodeId(targetNode.id); setIsPanelOpen(false); }
                        }}
                        className="text-left p-3 rounded-md border border-border/30 bg-background/50 active:bg-accent/10"
                      >
                        <div className="flex justify-between items-center gap-2 mb-0.5">
                          <span className="text-xs font-mono font-semibold truncate">
                            {flow.sourceName} → {flow.targetName}
                          </span>
                          <span className="text-primary font-mono text-xs font-bold shrink-0">{flow.amountLabel}</span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1">{flow.headline}</p>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* Mobile: Activity Log */}
            <div className="flex-1 overflow-hidden min-h-0">
              <ScrollArea className="h-full">
                <div className="p-4 flex flex-col gap-4">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Activity Log</div>
                  {timeline.items.map((item) => {
                    const edge = graph.edges.find((e) => e.id === item.id);
                    const outlets = edge ? edgeOutletNames(edge) : [];
                    const sourceUrl = edge?.sourceUrl;
                    const isReflexive = outlets.some((n) => getReflexiveOutletNodeId(n) !== null);
                    return (
                      <div key={item.id} className="pl-3 border-l border-border/50">
                        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {format(new Date(item.announcedAt), "MMM d, yyyy")}
                          </span>
                          <Badge variant="outline" className="text-[9px] h-4 px-1 rounded-sm border-primary/30 text-primary/80">
                            {item.dealType.replace("_", " ")}
                          </Badge>
                          {isReflexive && (
                            <span className="text-[8px] font-mono px-1 py-0.5 rounded-sm bg-rose-500/10 text-rose-400 border border-rose-500/25">
                              ⟲
                            </span>
                          )}
                        </div>
                        {sourceUrl ? (
                          <a href={sourceUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-start gap-1 text-sm font-medium leading-snug mb-0.5 text-foreground"
                          >
                            <span className="line-clamp-2">{item.headline}</span>
                            {isPaywalledUrl(sourceUrl, edge?.linkState) ? (
                              <Lock className="h-3 w-3 shrink-0 mt-0.5 opacity-50 text-amber-400" />
                            ) : (
                              <ExternalLink className="h-3 w-3 shrink-0 mt-0.5 opacity-40" />
                            )}
                          </a>
                        ) : (
                          <p className="text-sm font-medium leading-snug mb-0.5 line-clamp-2">{item.headline}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
