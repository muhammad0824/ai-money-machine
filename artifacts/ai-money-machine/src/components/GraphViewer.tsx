import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Graph, GraphNode, GraphEdge, DealType, NodeSector } from '@workspace/api-client-react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface GraphViewerProps {
  graphData: Graph;
  activeNodeId: string | null;
  onNodeClick: (node: GraphNode | null) => void;
  activeDealTypes?: Set<string>;
  showCycles?: boolean;
}

const DEAL_COLORS: Record<string, string> = {
  [DealType.investment]: '#10b981',
  [DealType.acquisition]: '#3b82f6',
  [DealType.licensing]: '#f59e0b',
  [DealType.partnership]: '#8b5cf6',
  [DealType.infrastructure]: '#ec4899',
  [DealType.lawsuit]: '#ef4444',
  [DealType.venture_capital]: '#14b8a6',
  [DealType.government_contract]: '#f97316',
  [DealType.government_subsidy]: '#84cc16',
  [DealType.government_equity]: '#06b6d4',
};

const SECTOR_COLORS: Record<string, string> = {
  [NodeSector.tech]: '#38bdf8',
  [NodeSector.media]: '#fbbf24',
  [NodeSector.ai_lab]: '#a78bfa',
  [NodeSector.infrastructure]: '#94a3b8',
  [NodeSector.publisher]: '#fb923c',
  [NodeSector.studio]: '#f472b6',
  [NodeSector.investor]: '#2dd4bf',
  [NodeSector.government]: '#facc15',
};

const ALWAYS_LABEL_TOP_N = 12;
const ZOOM_LABEL_THRESHOLD = 1.4;
const CYCLE_GLOW_COLOR = '#f97316';

/** Detect cycles via DFS over directed edges. Returns sets of cyclic node IDs and edge IDs. */
function detectCycles(
  nodes: GraphNode[],
  edges: GraphEdge[],
): { cycleNodeIds: Set<string>; cycleEdgeIds: Set<string> } {
  const adj = new Map<string, Array<{ to: string; edgeId: string }>>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    const src = typeof e.source === 'string' ? e.source : (e.source as any).id;
    const tgt = typeof e.target === 'string' ? e.target : (e.target as any).id;
    if (adj.has(src)) adj.get(src)!.push({ to: tgt, edgeId: e.id });
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, { from: string; edgeId: string } | null>();
  const cycleNodeIds = new Set<string>();
  const cycleEdgeIds = new Set<string>();

  function dfs(node: string, stack: string[]) {
    color.set(node, GRAY);
    stack.push(node);
    for (const { to, edgeId } of adj.get(node) ?? []) {
      if (color.get(to) === GRAY) {
        // Back edge → cycle found; mark from `to` through `node`
        let inCycle = false;
        for (let i = 0; i < stack.length; i++) {
          if (stack[i] === to) inCycle = true;
          if (inCycle) cycleNodeIds.add(stack[i]);
        }
        cycleEdgeIds.add(edgeId);
      } else if ((color.get(to) ?? WHITE) === WHITE) {
        parent.set(to, { from: node, edgeId });
        dfs(to, stack);
      }
    }
    stack.pop();
    color.set(node, BLACK);
  }

  for (const n of nodes) {
    if ((color.get(n.id) ?? WHITE) === WHITE) dfs(n.id, []);
  }

  return { cycleNodeIds, cycleEdgeIds };
}

export default function GraphViewer({
  graphData,
  activeNodeId,
  onNodeClick,
  activeDealTypes,
  showCycles = false,
}: GraphViewerProps) {
  const fgRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 720,
  });
  const [hoverNode, setHoverNode] = useState<GraphNode | null>(null);
  const [hoverEdge, setHoverEdge] = useState<GraphEdge | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const handleResize = () => {
      const parent = document.getElementById('graph-container');
      if (parent) setDimensions({ width: parent.clientWidth, height: parent.clientHeight });
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force('charge')?.strength(-280).distanceMax(500);
    fg.d3Force('link')?.distance(120);
  }, [graphData]);

  // Filter edges by active deal types
  const filteredEdges = useMemo(() => {
    let edges = graphData.edges;
    if (activeDealTypes && activeDealTypes.size > 0) {
      edges = edges.filter((e) => activeDealTypes.has(e.dealType));
    }
    return edges;
  }, [graphData.edges, activeDealTypes]);

  // Detect cycles on filtered graph
  const { cycleNodeIds, cycleEdgeIds } = useMemo(() => {
    if (!showCycles) return { cycleNodeIds: new Set<string>(), cycleEdgeIds: new Set<string>() };
    return detectCycles(graphData.nodes, filteredEdges);
  }, [showCycles, graphData.nodes, filteredEdges]);

  const alwaysLabel = useMemo(() => {
    const sorted = [...graphData.nodes]
      .sort((a, b) => (b.marketValueUsd ?? 0) - (a.marketValueUsd ?? 0))
      .slice(0, ALWAYS_LABEL_TOP_N)
      .map((n) => n.id);
    return new Set(sorted);
  }, [graphData]);

  const graphPayload = useMemo(
    () => ({
      nodes: graphData.nodes.map((n) => ({
        ...n,
        val: Math.log10(Math.max(n.marketValueUsd || 1_000_000_000, 1_000_000_000)) * 2,
      })),
      links: filteredEdges.map((e) => ({ ...e, source: e.source, target: e.target })),
    }),
    [graphData.nodes, filteredEdges],
  );

  const activeConnections = useMemo(() => {
    const set = new Set<string>();
    if (!activeNodeId) return set;
    set.add(activeNodeId);
    filteredEdges.forEach((e) => {
      const src = typeof e.source === 'string' ? e.source : (e.source as any).id;
      const tgt = typeof e.target === 'string' ? e.target : (e.target as any).id;
      if (src === activeNodeId) set.add(tgt);
      if (tgt === activeNodeId) set.add(src);
    });
    return set;
  }, [activeNodeId, filteredEdges]);

  useEffect(() => {
    if (!activeNodeId || !fgRef.current) return;
    const node = (graphPayload.nodes as any[]).find((n) => n.id === activeNodeId);
    if (node && typeof node.x === 'number' && typeof node.y === 'number') {
      fgRef.current.centerAt(node.x, node.y, 700);
      fgRef.current.zoom(2.5, 700);
    }
  }, [activeNodeId, graphPayload]);

  const handleNodeClick = useCallback(
    (node: any) => {
      if (activeNodeId === node.id) onNodeClick(null);
      else onNodeClick(node as GraphNode);
    },
    [activeNodeId, onNodeClick],
  );

  const handleBackgroundClick = useCallback(() => onNodeClick(null), [onNodeClick]);

  const handleZoomIn = useCallback(() => fgRef.current?.zoom(zoom * 1.4, 300), [zoom]);
  const handleZoomOut = useCallback(() => fgRef.current?.zoom(zoom * 0.7, 300), [zoom]);
  const handleFitAll = useCallback(() => {
    fgRef.current?.zoomToFit(400, 60);
    onNodeClick(null);
  }, [onNodeClick]);

  return (
    <div id="graph-container" className="w-full h-full bg-[#09090b] relative">
      <ForceGraph2D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphPayload}
        backgroundColor="#09090b"
        nodeLabel=""
        nodeColor={(node: any) => {
          if (showCycles && cycleNodeIds.has(node.id)) return CYCLE_GLOW_COLOR;
          return SECTOR_COLORS[node.sector] || '#666';
        }}
        nodeRelSize={2}
        nodeVal={(node: any) => {
          if (showCycles && cycleNodeIds.size > 0 && !cycleNodeIds.has(node.id)) return node.val * 0.25;
          const isDim = activeNodeId && !activeConnections.has(node.id);
          return isDim ? node.val * 0.3 : node.val;
        }}
        linkColor={(edge: any) => {
          const sourceId = typeof edge.source === 'object' ? edge.source.id : edge.source;
          const targetId = typeof edge.target === 'object' ? edge.target.id : edge.target;
          if (showCycles && cycleEdgeIds.has(edge.id)) return `${CYCLE_GLOW_COLOR}dd`;
          if (showCycles && cycleNodeIds.size > 0) return '#33333355';
          const isDim = activeNodeId && sourceId !== activeNodeId && targetId !== activeNodeId;
          const baseColor = DEAL_COLORS[edge.dealType as string] || '#444';
          return isDim ? `${baseColor}11` : `${baseColor}99`;
        }}
        linkWidth={(edge: any) => {
          const sourceId = typeof edge.source === 'object' ? edge.source.id : edge.source;
          const targetId = typeof edge.target === 'object' ? edge.target.id : edge.target;
          if (showCycles && cycleEdgeIds.has(edge.id)) return 3;
          const isActive = activeNodeId && (sourceId === activeNodeId || targetId === activeNodeId);
          return isActive ? 2.5 : 0.8;
        }}
        linkDirectionalParticles={(edge: any) => {
          const sourceId = typeof edge.source === 'object' ? edge.source.id : edge.source;
          const targetId = typeof edge.target === 'object' ? edge.target.id : edge.target;
          if (showCycles && cycleEdgeIds.has(edge.id)) return 4;
          const isActive = activeNodeId && (sourceId === activeNodeId || targetId === activeNodeId);
          return isActive ? 3 : hoverEdge?.id === edge.id ? 3 : 0;
        }}
        linkDirectionalParticleColor={(edge: any) => {
          if (showCycles && cycleEdgeIds.has(edge.id)) return CYCLE_GLOW_COLOR;
          return '#ffffff';
        }}
        linkDirectionalParticleSpeed={0.005}
        linkDirectionalParticleWidth={2}
        onNodeHover={(node: any) => {
          setHoverNode(node || null);
          if (document.body) document.body.style.cursor = node ? 'pointer' : 'default';
        }}
        onLinkHover={(link: any) => {
          setHoverEdge(link || null);
          if (document.body) document.body.style.cursor = link ? 'pointer' : 'default';
        }}
        onNodeClick={handleNodeClick}
        onBackgroundClick={handleBackgroundClick}
        onZoom={({ k }: { k: number }) => requestAnimationFrame(() => setZoom(k))}
        d3VelocityDecay={0.18}
        cooldownTicks={150}
        enablePanInteraction
        enableZoomInteraction
        nodeCanvasObjectMode={() => 'after'}
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          const isActive = activeNodeId === node.id;
          const isConnected = activeConnections.has(node.id);
          const isDim = activeNodeId && !isConnected;
          const isHovered = hoverNode?.id === node.id;
          const isCycle = showCycles && cycleNodeIds.has(node.id);
          const isNonCycleDimmed = showCycles && cycleNodeIds.size > 0 && !isCycle;

          // Cycle glow ring
          if (isCycle) {
            const radius = Math.sqrt(node.val) * 2;
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius + 3 / globalScale, 0, 2 * Math.PI);
            ctx.fillStyle = `${CYCLE_GLOW_COLOR}33`;
            ctx.fill();
          }

          const showName =
            isActive || isHovered || isCycle ||
            (activeNodeId ? isConnected : alwaysLabel.has(node.id) || globalScale >= ZOOM_LABEL_THRESHOLD);
          if (!showName && !isNonCycleDimmed && !isCycle) {
            if (!alwaysLabel.has(node.id) && globalScale < ZOOM_LABEL_THRESHOLD) return;
          }
          if (!showName) return;

          const fontSize = Math.max(11 / globalScale, 2.5);
          ctx.font = `${isActive || isCycle ? 600 : 500} ${fontSize}px Inter, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = isNonCycleDimmed
            ? 'rgba(255,255,255,0.15)'
            : isDim
              ? 'rgba(255,255,255,0.18)'
              : isCycle
                ? CYCLE_GLOW_COLOR
                : isActive
                  ? '#ffffff'
                  : 'rgba(255,255,255,0.82)';

          const yOffset = Math.sqrt(node.val) * 2 + fontSize * 0.7;
          ctx.fillText(node.name, node.x, node.y + yOffset);

          const showValue =
            node.marketValueLabel && !isDim && !isNonCycleDimmed &&
            (isActive || isCycle || isConnected || globalScale >= ZOOM_LABEL_THRESHOLD + 0.6);
          if (showValue) {
            ctx.font = `${fontSize * 0.78}px ui-monospace, SFMono-Regular, Menlo, monospace`;
            ctx.fillStyle = isCycle ? CYCLE_GLOW_COLOR : SECTOR_COLORS[node.sector] || '#888';
            ctx.fillText(node.marketValueLabel, node.x, node.y + yOffset + fontSize * 0.95);
          }
        }}
      />

      {/* Zoom controls */}
      <div className="absolute bottom-20 right-4 z-20 flex flex-col gap-1">
        <button onClick={handleZoomIn} className="w-8 h-8 rounded bg-black/70 border border-white/10 text-white/70 hover:text-white hover:bg-black/90 flex items-center justify-center transition-colors" title="Zoom in">
          <ZoomIn className="w-4 h-4" />
        </button>
        <button onClick={handleZoomOut} className="w-8 h-8 rounded bg-black/70 border border-white/10 text-white/70 hover:text-white hover:bg-black/90 flex items-center justify-center transition-colors" title="Zoom out">
          <ZoomOut className="w-4 h-4" />
        </button>
        <button onClick={handleFitAll} className="w-8 h-8 rounded bg-black/70 border border-white/10 text-white/70 hover:text-white hover:bg-black/90 flex items-center justify-center transition-colors" title="Fit entire network">
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Hover tooltips */}
      {!activeNodeId && hoverNode && !hoverEdge && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none bg-black/90 backdrop-blur border border-white/10 p-3 rounded-lg shadow-xl max-w-sm w-full z-50">
          <div className="flex justify-between items-start mb-1 gap-3">
            <h3 className="font-bold text-white text-base leading-tight">{hoverNode.name}</h3>
            {hoverNode.marketValueLabel && (
              <span className="font-mono text-xs text-primary bg-primary/10 px-2 py-0.5 rounded shrink-0">{hoverNode.marketValueLabel}</span>
            )}
          </div>
          <div className="text-[10px] text-white/50 uppercase font-mono tracking-wider mb-2">
            {hoverNode.sector.replace('_', ' ')}
            {showCycles && cycleNodeIds.has(hoverNode.id) && (
              <span className="ml-2 text-orange-400">● Circular relationship</span>
            )}
          </div>
          <p className="text-xs text-white/80 leading-relaxed">{hoverNode.description}</p>
          <p className="text-[10px] text-white/40 mt-2 font-mono">Click to see capital flows</p>
        </div>
      )}

      {!activeNodeId && hoverEdge && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none bg-black/90 backdrop-blur border border-white/10 p-3 rounded-lg shadow-xl max-w-sm w-full z-50">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: DEAL_COLORS[hoverEdge.dealType] || '#fff' }} />
            <span className="text-[10px] uppercase font-mono text-white/60 tracking-wider">
              {hoverEdge.dealType.replace('_', ' ')}
            </span>
            {showCycles && cycleEdgeIds.has(hoverEdge.id) && (
              <span className="text-[10px] font-mono text-orange-400 ml-1">● In cycle</span>
            )}
          </div>
          <h3 className="font-semibold text-white text-sm mb-1 leading-snug">{hoverEdge.headline}</h3>
          {hoverEdge.amountLabel && hoverEdge.amountLabel !== 'Undisclosed' && (
            <div className="font-mono text-primary text-xs mb-1">{hoverEdge.amountLabel}</div>
          )}
          <p className="text-xs text-white/70 leading-relaxed">{hoverEdge.description}</p>
        </div>
      )}

      {!activeNodeId && zoom < ZOOM_LABEL_THRESHOLD && (
        <div className="absolute bottom-4 right-14 text-[10px] font-mono text-white/30 pointer-events-none select-none">
          Scroll/pinch to zoom · Click node to explore
        </div>
      )}

      {showCycles && cycleNodeIds.size > 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none z-20">
          <div className="bg-orange-500/15 border border-orange-500/30 rounded-lg px-3 py-1.5 text-[11px] font-mono text-orange-400">
            ↻ {cycleNodeIds.size} entities in circular relationships
          </div>
        </div>
      )}
    </div>
  );
}

export { DEAL_COLORS, SECTOR_COLORS };
