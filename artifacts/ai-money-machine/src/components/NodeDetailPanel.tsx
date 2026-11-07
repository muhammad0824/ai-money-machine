import { useMemo } from 'react';
import { Graph, GraphNode, GraphEdge } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, ArrowDownLeft, ArrowUpRight, Building2, ExternalLink, Lock, Newspaper } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { DEAL_COLORS, SECTOR_COLORS } from './GraphViewer';

// ─── Paywall detection ────────────────────────────────────────────────────────

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

// ─── Reflexivity detection ────────────────────────────────────────────────────

/** Outlet display name → canonical graph node ID */
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
  "New York Post": "news-corp",
  "The Washington Post": "washington-post",
  "NPR": "npr",
  "Semafor": "semafor",
};

function getReflexiveNodeId(outletName: string, graphNodeIds: Set<string>): string | null {
  const nodeId = OUTLET_TO_NODE_ID[outletName];
  return nodeId && graphNodeIds.has(nodeId) ? nodeId : null;
}

function edgeOutletNames(edge: GraphEdge): string[] {
  if (edge.outletNames && edge.outletNames.length > 0) return edge.outletNames;
  if (edge.outletName) return [edge.outletName];
  return [];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function abbreviate(amount: number): string {
  if (amount >= 1_000_000_000_000) return `$${(amount / 1_000_000_000_000).toFixed(1)}T`;
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(0)}M`;
  return `$${amount.toLocaleString('en-US')}`;
}

interface DealRow {
  edge: GraphEdge;
  direction: 'out' | 'in';
  counterpart: GraphNode;
}

type Provenance = 'seed' | 'ai_extracted' | 'manual' | undefined | null;

function ProvenanceBadge({
  provenance,
  outletNames: names,
  graphNodeIds,
}: {
  provenance: Provenance;
  outletNames: string[];
  graphNodeIds: Set<string>;
}) {
  if (provenance === 'manual') {
    return (
      <span className="inline-flex items-center text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded-sm bg-amber-500/15 text-amber-400 border border-amber-500/25">
        Manual
      </span>
    );
  }
  if (provenance === 'ai_extracted') {
    const display = names.length > 0 ? names : ['AI'];
    return (
      <span className="inline-flex items-center gap-0.5 flex-wrap">
        {display.map((name) => {
          const reflexNodeId = name !== 'AI' ? getReflexiveNodeId(name, graphNodeIds) : null;
          return (
            <span
              key={name}
              className={`inline-flex items-center gap-0.5 text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded-sm border ${
                reflexNodeId
                  ? "bg-rose-500/10 text-rose-400 border-rose-500/25"
                  : "bg-sky-500/10 text-sky-400 border-sky-500/25"
              }`}
              title={
                reflexNodeId
                  ? `${name} is reporting on a deal it has financial ties to (reflexivity)`
                  : name
              }
            >
              {reflexNodeId && <Newspaper className="h-2 w-2" />}
              {name.slice(0, 16)}
            </span>
          );
        })}
      </span>
    );
  }
  return null;
}

function ArticleLink({
  url,
  children,
  className = "",
  linkState,
}: {
  url: string;
  children: React.ReactNode;
  className?: string;
  linkState?: string | null;
}) {
  const paywalled = isPaywalledUrl(url, linkState);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`group ${className}`}
      title={paywalled ? "Paywalled article (link still works)" : undefined}
    >
      {children}
      {paywalled ? (
        <Lock className="h-2.5 w-2.5 shrink-0 mt-0.5 opacity-60 text-amber-400 group-hover:opacity-100" />
      ) : (
        <ExternalLink className="h-2.5 w-2.5 shrink-0 mt-0.5 opacity-50 group-hover:opacity-100" />
      )}
    </a>
  );
}

function PanelStat({
  icon, label, value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border/40 bg-background/60 px-2 py-2">
      <div className="flex items-center gap-1 mb-0.5">
        {icon}
        <span className="text-[9px] uppercase tracking-wider font-mono text-muted-foreground">{label}</span>
      </div>
      <div className="text-sm font-bold font-mono">{value}</div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface NodeDetailPanelProps {
  graph: Graph;
  activeNodeId: string | null;
  onClose: () => void;
  onSelectNode: (node: GraphNode) => void;
  /** When true, renders content only (no AnimatePresence wrapper). Used for Sheet/Drawer embedding. */
  inlineMode?: boolean;
}

function NodeDetailContent({
  graph,
  activeNodeId,
  onClose,
  onSelectNode,
  inlineMode = false,
}: NodeDetailPanelProps) {
  const detail = useMemo(() => {
    if (!activeNodeId) return null;
    const node = graph.nodes.find((n) => n.id === activeNodeId);
    if (!node) return null;
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

    const deals: DealRow[] = [];
    let totalOut = 0;
    let totalIn = 0;

    for (const edge of graph.edges) {
      if (edge.source === node.id) {
        const counterpart = nodeById.get(edge.target);
        if (counterpart) {
          deals.push({ edge, direction: 'out', counterpart });
          if (edge.amountUsd) totalOut += edge.amountUsd;
        }
      } else if (edge.target === node.id) {
        const counterpart = nodeById.get(edge.source);
        if (counterpart) {
          deals.push({ edge, direction: 'in', counterpart });
          if (edge.amountUsd) totalIn += edge.amountUsd;
        }
      }
    }

    deals.sort((a, b) => {
      const av = a.edge.amountUsd ?? 0;
      const bv = b.edge.amountUsd ?? 0;
      if (bv !== av) return bv - av;
      return a.edge.announcedAt < b.edge.announcedAt ? 1 : -1;
    });

    return { node, deals, totalOut, totalIn };
  }, [activeNodeId, graph]);

  const graphNodeIds = useMemo(
    () => new Set(graph.nodes.map((n) => n.id)),
    [graph.nodes],
  );

  if (!detail) return null;

  const isMediaNode = Object.values(OUTLET_TO_NODE_ID).includes(detail.node.id) ||
    ["nyt", "ft", "guardian", "reuters", "bbc", "ap", "vox-media", "conde-nast",
     "time-magazine", "warner-bros-discovery", "comcast", "paramount-global",
     "disney", "fox-corp", "axel-springer", "news-corp", "washington-post",
     "npr", "semafor"].includes(detail.node.id);

  const content = (
    <>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 p-4 border-b border-border/50">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: SECTOR_COLORS[detail.node.sector] || '#888' }}
            />
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              {detail.node.sector.replace('_', ' ')}
            </span>
            {detail.node.country && (
              <span className="text-[10px] font-mono text-muted-foreground/60">
                · {detail.node.country}
              </span>
            )}
            {detail.node.isManual && (
              <span className="text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded-sm bg-amber-500/15 text-amber-400 border border-amber-500/25">
                Manual
              </span>
            )}
            {isMediaNode && (
              <span
                className="inline-flex items-center gap-0.5 text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded-sm bg-rose-500/10 text-rose-400 border border-rose-500/25"
                title="This entity is also a news/media outlet in the funding graph"
              >
                <Newspaper className="h-2 w-2" />
                Media
              </span>
            )}
          </div>
          <h2 className="text-base font-bold leading-tight truncate">{detail.node.name}</h2>
          {detail.node.marketValueLabel && (
            <div className="text-[11px] font-mono text-primary mt-1">
              Market value · {detail.node.marketValueLabel}
            </div>
          )}
        </div>
        {!inlineMode && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-7 w-7 shrink-0"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {detail.node.description && (
        <p className="px-4 pt-3 text-xs text-muted-foreground leading-relaxed">
          {detail.node.description}
        </p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 p-4">
        <PanelStat
          icon={<ArrowUpRight className="h-3 w-3 text-emerald-400" />}
          label="Money Out"
          value={detail.totalOut > 0 ? abbreviate(detail.totalOut) : '—'}
        />
        <PanelStat
          icon={<ArrowDownLeft className="h-3 w-3 text-sky-400" />}
          label="Money In"
          value={detail.totalIn > 0 ? abbreviate(detail.totalIn) : '—'}
        />
        <PanelStat
          icon={<Building2 className="h-3 w-3 text-primary" />}
          label="Deals"
          value={String(detail.deals.length)}
        />
      </div>

      <div className="px-4 pb-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        Connected Deals
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="px-4 pb-4 flex flex-col gap-2">
          {detail.deals.length === 0 && (
            <div className="text-xs text-muted-foreground italic py-4 text-center">
              No deals on record for this entity yet.
            </div>
          )}
          {detail.deals.map(({ edge, direction, counterpart }) => {
            const outlets = edgeOutletNames(edge);
            const primaryUrl = edge.sourceUrl;
            const allUrls = edge.sourceUrls && edge.sourceUrls.length > 0
              ? edge.sourceUrls
              : primaryUrl ? [primaryUrl] : [];

            return (
              <div
                key={edge.id}
                className="p-2.5 rounded-md border border-border/40 bg-background/60 hover:bg-accent/10 hover:border-border/60 transition-colors"
              >
                {/* Counterpart + amount */}
                <div className="flex items-center justify-between gap-2 mb-1">
                  <button
                    type="button"
                    onClick={() => onSelectNode(counterpart)}
                    className="flex items-center gap-1.5 text-[11px] font-mono min-w-0 group"
                  >
                    {direction === 'out' ? (
                      <ArrowUpRight className="h-3 w-3 text-emerald-400 shrink-0" />
                    ) : (
                      <ArrowDownLeft className="h-3 w-3 text-sky-400 shrink-0" />
                    )}
                    <span className="text-muted-foreground shrink-0">
                      {direction === 'out' ? 'to' : 'from'}
                    </span>
                    <span className="font-semibold truncate text-foreground group-hover:text-primary transition-colors">
                      {counterpart.name}
                    </span>
                  </button>
                  {edge.amountLabel && edge.amountLabel !== 'Undisclosed' && (
                    <span className="text-[10px] font-mono text-primary shrink-0">
                      {edge.amountLabel}
                    </span>
                  )}
                </div>

                {/* Deal type + date + provenance */}
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <Badge
                    variant="outline"
                    className="text-[9px] uppercase tracking-wider h-4 px-1 rounded-sm border-border/40"
                    style={{
                      color: DEAL_COLORS[edge.dealType] || undefined,
                      borderColor: `${DEAL_COLORS[edge.dealType] || '#444'}55`,
                    }}
                  >
                    {edge.dealType.replace('_', ' ')}
                  </Badge>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {format(new Date(edge.announcedAt), 'MMM d, yyyy')}
                  </span>
                  <ProvenanceBadge
                    provenance={edge.provenance as Provenance}
                    outletNames={outlets}
                    graphNodeIds={graphNodeIds}
                  />
                </div>

                {/* Primary headline link */}
                {primaryUrl ? (
                  <ArticleLink
                    url={primaryUrl}
                    linkState={edge.linkState}
                    className="flex items-start gap-1 text-xs text-foreground/85 leading-snug hover:text-primary transition-colors"
                  >
                    <span className="line-clamp-2">{edge.headline}</span>
                  </ArticleLink>
                ) : (
                  <p className="text-xs text-foreground/85 leading-snug line-clamp-2">
                    {edge.headline}
                  </p>
                )}

                {edge.evidenceSnippet && (
                  <blockquote
                    className="mt-1.5 border-l-2 border-primary/40 pl-2 text-[10px] italic text-foreground/70 leading-snug"
                    data-testid={`text-evidence-${edge.id}`}
                  >
                    <span className="not-italic font-mono text-[8px] uppercase tracking-wider text-muted-foreground mr-1">Evidence</span>
                    "{edge.evidenceSnippet}"
                  </blockquote>
                )}

                {/* Additional cross-referenced source links */}
                {allUrls.length > 1 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {allUrls.slice(1).map((url, i) => {
                      const outletLabel = outlets[i + 1] ?? 'Source';
                      const paywalled = isPaywalledUrl(url, edge.linkState);
                      return (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-0.5 text-[9px] font-mono text-muted-foreground/60 hover:text-primary transition-colors"
                          title={paywalled ? `${outletLabel} (paywalled)` : outletLabel}
                        >
                          {paywalled ? (
                            <Lock className="h-2 w-2 text-amber-400/70" />
                          ) : (
                            <ExternalLink className="h-2 w-2" />
                          )}
                          {outletLabel.slice(0, 20)}
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </>
  );

  if (inlineMode) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {content}
      </div>
    );
  }

  return content;
}

export default function NodeDetailPanel(props: NodeDetailPanelProps) {
  if (props.inlineMode) {
    return <NodeDetailContent {...props} />;
  }

  return (
    <AnimatePresence>
      {props.activeNodeId && (
        <motion.aside
          key={props.activeNodeId}
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.2 }}
          className="absolute top-64 lg:top-40 left-6 z-30 w-80 max-h-[calc(100dvh-18rem)] lg:max-h-[calc(100dvh-12rem)] flex flex-col rounded-xl border border-border/60 bg-background/95 backdrop-blur-xl shadow-2xl pointer-events-auto"
        >
          <NodeDetailContent {...props} />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
