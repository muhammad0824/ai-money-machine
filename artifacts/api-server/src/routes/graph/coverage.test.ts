import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COVERAGE_WINDOW_MONTHS, getCoverageStart, isWithinCoverage, windowExtensionRange,
} from "./coverage";
import { monthlyBackfillFeeds, getRssFeeds, RSS_FEEDS } from "../rss/feeds";

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

test("coverage window is twelve months", () => {
  assert.equal(COVERAGE_WINDOW_MONTHS, 12);
  const now = new Date("2026-11-07T12:00:00Z");
  assert.equal(getCoverageStart(now).toISOString(), "2025-11-07T12:00:00.000Z");
});

test("deals 7-11 months old are now in window; 13 months and future dates are not", () => {
  assert.ok(isWithinCoverage(daysAgo(30 * 7)));
  assert.ok(isWithinCoverage(daysAgo(30 * 11)));
  assert.ok(!isWithinCoverage(daysAgo(30 * 13)));
  assert.ok(!isWithinCoverage(new Date(Date.now() + 86400000).toISOString()));
  assert.ok(!isWithinCoverage(""));
});

test("window extension covers exactly the newly added months", () => {
  const now = new Date("2026-11-07T12:00:00Z");
  assert.deepEqual(windowExtensionRange(6, 12, now), {
    start: "2025-11-07T12:00:00.000Z", end: "2026-05-07T12:00:00.000Z",
  });
  assert.equal(windowExtensionRange(12, 12, now), null);
  assert.equal(windowExtensionRange(12, 6, now), null);
});

test("monthly backfill spans every calendar month of the rolling window", () => {
  const now = new Date("2026-11-07T12:00:00Z");
  const feeds = monthlyBackfillFeeds(now);
  const months = [...new Set(feeds.map((f) => f.feedSource.slice(-7)))];
  assert.equal(months[0], "2025-11");
  assert.equal(months.at(-1), "2026-11");
  assert.equal(months.length, 13); // partial start month through current month
  assert.equal(feeds.length, months.length * 2);
  for (const f of feeds) {
    const q = new URL(f.url).searchParams.get("q")!;
    const month = f.feedSource.slice(-7);
    assert.match(q, new RegExp(`after:${month}-01 before:\\d{4}-\\d{2}-01$`));
    assert.equal(new URL(f.url).hostname, "news.google.com");
  }
});

test("backfill tracks the clock and feed ids never collide with static feeds", () => {
  const later = monthlyBackfillFeeds(new Date("2027-03-15T00:00:00Z")).map((f) => f.feedSource);
  assert.ok(later.includes("gn-backfill-deals-2027-03"));
  assert.ok(!later.includes("gn-backfill-deals-2026-02"));
  const all = getRssFeeds().map((f) => f.feedSource);
  assert.equal(new Set(all).size, all.length);
  assert.ok(!RSS_FEEDS.some((f) => /after:20\d\d/.test(f.url)), "no fixed-date queries left in the static list");
});
