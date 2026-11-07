import type { GeneratedEdge } from "./generator";
import type { LinkVerificationResult } from "./linkVerification";
import { isWithinCoverage } from "./coverage";
import { isGoogleNewsUrl } from "./googleNews";

export const DEAD_CONFIRMATION_MS = 6 * 60 * 60 * 1000;

/** Every attempt is auditable. Inconclusive checks neither confirm nor erase failures. */
export function applyLinkCheck(edge: GeneratedEdge, check: LinkVerificationResult, now = new Date()): GeneratedEdge {
  const next: GeneratedEdge = {
    ...edge, sourceUrl: check.finalUrl ?? edge.sourceUrl,
    linkState: check.state, linkCheckReason: check.reason, sourceUrlCheckedAt: now.toISOString(),
    linkCheckHistory: [...(edge.linkCheckHistory ?? []), { at: now.toISOString(), state: check.state, reason: check.reason }].slice(-30),
  };
  if (check.ok) {
    next.lastValidLinkState = check.state as "live" | "gated";
    next.sourceUrlVerified = true;
    next.firstDeadAt = null;
    next.lastDeadAt = null;
    next.deadCheckCount = 0;
    if (next.hiddenReason === "dead_link" || next.hiddenReason === "unverified_link") {
      next.hiddenReason = null; next.hiddenAt = null;
    }
  } else if (check.state === "dead") {
    const lastDead = edge.lastDeadAt ? Date.parse(edge.lastDeadAt) : 0;
    if (!edge.firstDeadAt) {
      next.firstDeadAt = now.toISOString(); next.lastDeadAt = now.toISOString(); next.deadCheckCount = 1;
    } else if (now.getTime() - lastDead >= DEAD_CONFIRMATION_MS) {
      next.deadCheckCount = (edge.deadCheckCount ?? 1) + 1;
      next.lastDeadAt = now.toISOString();
    }
    if ((next.deadCheckCount ?? 0) >= 2 && now.getTime() - Date.parse(next.firstDeadAt!) >= DEAD_CONFIRMATION_MS) {
      next.hiddenReason = "dead_link"; next.hiddenAt ??= now.toISOString();
    }
  }
  return applyCoverage(next, now);
}

export function applyCoverage(edge: GeneratedEdge, now = new Date()): GeneratedEdge {
  const exempt = edge.dealType === "ownership" && !edge.announcedAt;
  if (!exempt && !isWithinCoverage(edge.announcedAt)) {
    // Retain the record, including its source/evidence and link history.
    return { ...edge, hiddenReason: "out_of_window", hiddenAt: edge.hiddenAt ?? now.toISOString() };
  }
  if (edge.hiddenReason === "out_of_window") return { ...edge, hiddenReason: null, hiddenAt: null };
  return edge;
}

export function visibilityReason(edge: GeneratedEdge): string | null {
  const covered = applyCoverage(edge);
  if (covered.hiddenReason) return covered.hiddenReason;
  if (!edge.sourceUrl || isGoogleNewsUrl(edge.sourceUrl)) return "unverified_link";
  if (edge.linkState === "live" || edge.linkState === "gated" || edge.lastValidLinkState) return null;
  // Legacy booleans must be rechecked, never implicitly trust AI provenance.
  return "unverified_link";
}
