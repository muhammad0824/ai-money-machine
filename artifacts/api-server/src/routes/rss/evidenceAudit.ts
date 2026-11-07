import type { GeneratedGraph } from "../graph/generator";
import { entityGrounded, unsupportedTransactionContext } from "./precision";

/** Archive incorrect historical extracts without removing source or evidence. */
export function auditStoredEvidence(graph: GeneratedGraph): GeneratedGraph {
  const names = new Map(graph.nodes.map((n) => [n.id, n.name]));
  return {
    ...graph,
    edges: graph.edges.map((edge) => {
      if (edge.provenance !== "ai_extracted" || !edge.evidenceSnippet) return edge;
      const quote = edge.evidenceSnippet;
      if (unsupportedTransactionContext(`${edge.headline} ${quote}`, edge.dealType)
        || !entityGrounded(edge.source, names.get(edge.source) ?? edge.source, quote)
        || !entityGrounded(edge.target, names.get(edge.target) ?? edge.target, quote)) {
        return { ...edge, hiddenReason: "unsupported_transaction", hiddenAt: edge.hiddenAt ?? new Date().toISOString() };
      }
      return edge;
    }),
  };
}
