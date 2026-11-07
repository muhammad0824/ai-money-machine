import { pgTable, text, doublePrecision, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const manualCompaniesTable = pgTable("manual_companies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sector: text("sector").notNull(),
  description: text("description").notNull().default(""),
  marketValueUsd: doublePrecision("market_value_usd"),
  marketValueLabel: text("market_value_label").notNull(),
  country: text("country"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const manualDealsTable = pgTable(
  "manual_deals",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull(),
    targetId: text("target_id").notNull(),
    dealType: text("deal_type").notNull(),
    amountUsd: doublePrecision("amount_usd"),
    amountLabel: text("amount_label").notNull(),
    announcedAt: text("announced_at").notNull(),
    headline: text("headline").notNull(),
    description: text("description").notNull().default(""),
    sourceUrl: text("source_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("manual_deals_source_idx").on(t.sourceId), index("manual_deals_target_idx").on(t.targetId)],
);

export const insertManualCompanySchema = createInsertSchema(manualCompaniesTable).omit({
  createdAt: true,
});
export const insertManualDealSchema = createInsertSchema(manualDealsTable).omit({
  createdAt: true,
});

export type ManualCompany = typeof manualCompaniesTable.$inferSelect;
export type InsertManualCompany = z.infer<typeof insertManualCompanySchema>;
export type ManualDeal = typeof manualDealsTable.$inferSelect;
export type InsertManualDeal = z.infer<typeof insertManualDealSchema>;
