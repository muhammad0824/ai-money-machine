import Parser from "rss-parser";
import { createHash } from "crypto";
import { db, articlesTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { RSS_FEEDS, OUTLET_DOMAIN_MAP, type FeedConfig } from "./feeds";
import { logger } from "../../lib/logger";
import { getCoverageStart } from "../graph/coverage";

export const lastFeedReport: Record<string, { ingested: number; error: string | null }> = {};

const parser = new Parser({
  timeout: 12_000,
  headers: { "User-Agent": "AIMoneyMachineBot/2.0 (news aggregator; research)" },
  customFields: {
    item: [["media:content", "mediaContent"]],
  },
});

function urlId(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 32);
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}

/**
 * Map an article URL to a known outlet name using the OUTLET_DOMAIN_MAP.
 * Longest matching domain wins (more specific beats generic).
 */
function outletFromUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    // Longest matching domain wins
    let best: { domain: string; name: string } | null = null;
    for (const entry of OUTLET_DOMAIN_MAP) {
      if (hostname === entry.domain || hostname.endsWith("." + entry.domain)) {
        if (!best || entry.domain.length > best.domain.length) {
          best = entry;
        }
      }
    }
    return best?.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve the outlet name for an article.
 *
 * - For direct (non-Google-News) feeds: trust the feed config name.
 * - For Google News feeds: resolve from the actual destination URL.
 * - If we can't resolve the outlet, we still accept the article as "Google News"
 *   (it comes from a targeted query so it's presumably relevant).
 */
function resolveOutletName(feedConfig: FeedConfig, articleUrl: string): string {
  if (feedConfig.outletName !== "Google News") {
    // Direct feed — trust the config name
    return feedConfig.outletName;
  }
  // Google News feed — resolve from URL
  const resolved = outletFromUrl(articleUrl);
  return resolved ?? "Google News";
}

interface ParsedArticle {
  id: string;
  url: string;
  title: string;
  description: string;
  publishedAt: string;
  feedSource: string;
  outletName: string;
}

async function fetchFeed(feed: FeedConfig): Promise<ParsedArticle[]> {
  lastFeedReport[feed.feedSource] = { ingested: 0, error: null };
  try {
    const parsed = await parser.parseURL(feed.url);
    const articles: ParsedArticle[] = [];
    for (const item of parsed.items ?? []) {
      const url = item.link ?? item.guid;
      if (!url) continue;
      const title = (item.title ?? "").trim();
      if (!title) continue;

      const publishedAt =
        item.isoDate ??
        (item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString());
      const date = new Date(publishedAt);
      if (!Number.isFinite(date.getTime()) || date < getCoverageStart() || date > new Date()) continue;

      const outletName = resolveOutletName(feed, url);

      const rawDesc = item.contentSnippet ?? item.content ?? item.summary ?? "";
      const description = stripHtml(rawDesc);

      articles.push({
        id: urlId(url),
        url,
        title,
        description,
        publishedAt,
        feedSource: feed.feedSource,
        outletName,
      });
    }
    return articles;
  } catch (err) {
    lastFeedReport[feed.feedSource] = { ingested: 0, error: err instanceof Error ? err.message : String(err) };
    logger.warn({ err, feed: feed.feedSource }, "Failed to fetch RSS feed");
    return [];
  }
}

export async function fetchAndStoreArticles(): Promise<number> {
  const results = await Promise.allSettled(RSS_FEEDS.map(fetchFeed));
  const all: ParsedArticle[] = results.flatMap((r) =>
    r.status === "fulfilled" ? r.value : [],
  );

  if (all.length === 0) return 0;

  // Deduplicate by URL hash
  const seen = new Map<string, ParsedArticle>();
  for (const a of all) {
    if (!seen.has(a.id)) seen.set(a.id, a);
  }
  const unique = Array.from(seen.values());

  const ids = unique.map((a) => a.id);
  const existing = await db
    .select({ id: articlesTable.id })
    .from(articlesTable)
    .where(inArray(articlesTable.id, ids));
  const existingIds = new Set(existing.map((r) => r.id));

  const newArticles = unique.filter((a) => !existingIds.has(a.id));
  if (newArticles.length === 0) return 0;

  const inserted = await db.insert(articlesTable).values(newArticles).onConflictDoNothing().returning({ feedSource: articlesTable.feedSource });
  for (const row of inserted) lastFeedReport[row.feedSource]!.ingested++;

  logger.info(
    { count: newArticles.length, total: unique.length, feeds: RSS_FEEDS.length },
    "Stored new articles",
  );
  return inserted.length;
}
