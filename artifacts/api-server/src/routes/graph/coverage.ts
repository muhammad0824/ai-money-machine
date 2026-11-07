/**
 * Coverage window for the AI Money Machine graph.
 *
 * STRICT ROLLING WINDOW: always exactly the last COVERAGE_WINDOW_MONTHS months
 * from "now" — recomputed on every check, never a fixed calendar date. Nothing
 * is exempt from this except explicitly-flagged undated structural ownership
 * edges (dealType === "ownership"), which represent permanent corporate
 * relationships (e.g. a parent company owning a news outlet) rather than
 * dated deals — that exception is applied by callers, not here.
 */
export const COVERAGE_WINDOW_MONTHS = 6;

export function getCoverageStart(referenceDate: Date = new Date()): Date {
  const d = new Date(referenceDate.getTime());
  d.setMonth(d.getMonth() - COVERAGE_WINDOW_MONTHS);
  return d;
}

export function isWithinCoverage(announcedAt: string | null | undefined): boolean {
  if (!announcedAt) return false;
  const t = new Date(announcedAt);
  if (Number.isNaN(t.getTime())) return false;
  return t >= getCoverageStart() && t <= new Date();
}

export function coveragePeriodLabel(): string {
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });
  return `${fmt.format(getCoverageStart())} – ${fmt.format(new Date())}`;
}
