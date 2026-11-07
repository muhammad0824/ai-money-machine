import { pgTable, text, doublePrecision, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const articlesTable = pgTable(
  "articles",
  {
    id: text("id").primaryKey(),
    url: text("url").notNull().unique(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    publishedAt: text("published_at").notNull(),
    feedSource: text("feed_source").notNull(),
    outletName: text("outlet_name").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("articles_feed_source_idx").on(t.feedSource)],
);

export const dealFingerprintsTable = pgTable("deal_fingerprints", {
  fingerprint: text("fingerprint").primaryKey(),
  edgeId: text("edge_id").notNull(),
  articleUrl: text("article_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const graphCacheTable = pgTable("graph_cache", {
  id: text("id").primaryKey(),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Article = typeof articlesTable.$inferSelect;
export type DealFingerprint = typeof dealFingerprintsTable.$inferSelect;
export type GraphCacheRow = typeof graphCacheTable.$inferSelect;
