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
export const COVERAGE_WINDOW_MONTHS = 12;

/** The window the deployed pipeline used before COVERAGE_WINDOW_MONTHS was raised to 12. */
export const PREVIOUS_COVERAGE_WINDOW_MONTHS = 6;

export function getCoverageStart(referenceDate: Date = new Date(), months = COVERAGE_WINDOW_MONTHS): Date {
  const d = new Date(referenceDate.getTime());
  d.setMonth(d.getMonth() - months);
  return d;
}

/** Pure: the published_at range a window change newly brings into coverage, or null if it shrinks or stays. */
export function windowExtensionRange(fromMonths: number, toMonths: number, now: Date): { start: string; end: string } | null {
  if (toMonths <= fromMonths) return null;
  return { start: getCoverageStart(now, toMonths).toISOString(), end: getCoverageStart(now, fromMonths).toISOString() };
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
