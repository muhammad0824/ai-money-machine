import { Router, type IRouter } from "express";
import { db, manualCompaniesTable, manualDealsTable } from "@workspace/db";
import {
  CreateManualCompanyBody,
  CreateManualDealBody,
  ListManualCompaniesResponse,
  ListManualDealsResponse,
  ListManualCompaniesResponseItem,
  ListManualDealsResponseItem,
} from "@workspace/api-zod";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function generateId(prefix: string, base: string): string {
  const slug = slugify(base) || "entry";
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${slug}-${suffix}`;
}

function serializeCompany(row: typeof manualCompaniesTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    sector: row.sector,
    description: row.description,
    marketValueUsd: row.marketValueUsd ?? null,
    marketValueLabel: row.marketValueLabel,
    country: row.country ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeDeal(row: typeof manualDealsTable.$inferSelect) {
  return {
    id: row.id,
    sourceId: row.sourceId,
    targetId: row.targetId,
    dealType: row.dealType,
    amountUsd: row.amountUsd ?? null,
    amountLabel: row.amountLabel,
    announcedAt: row.announcedAt,
    headline: row.headline,
    description: row.description,
    sourceUrl: row.sourceUrl ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/manual/companies", async (_req, res) => {
  const rows = await db.select().from(manualCompaniesTable);
  const data = ListManualCompaniesResponse.parse(rows.map(serializeCompany));
  res.json(data);
});

router.post("/manual/companies", async (req, res) => {
  const body = CreateManualCompanyBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({
      error: "Invalid company payload",
      details: body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
    return;
  }
  const id = generateId("m", body.data.name);
  const inserted = await db
    .insert(manualCompaniesTable)
    .values({
      id,
      name: body.data.name,
      sector: body.data.sector,
      description: body.data.description ?? "",
      marketValueUsd: body.data.marketValueUsd ?? null,
      marketValueLabel: body.data.marketValueLabel,
      country: body.data.country ?? null,
    })
    .returning();
  const row = inserted[0];
  if (!row) {
    res.status(500).json({ error: "Failed to insert company" });
    return;
  }
  const data = ListManualCompaniesResponseItem.parse(serializeCompany(row));
  res.status(201).json(data);
});

router.delete("/manual/companies/:id", async (req, res) => {
  const id = req.params.id;
  const deleted = await db
    .delete(manualCompaniesTable)
    .where(eq(manualCompaniesTable.id, id))
    .returning();
  if (deleted.length === 0) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  // Cascade-delete any manual deals that referenced this company.
  await db.delete(manualDealsTable).where(eq(manualDealsTable.sourceId, id));
  await db.delete(manualDealsTable).where(eq(manualDealsTable.targetId, id));
  res.status(204).end();
});

router.get("/manual/deals", async (_req, res) => {
  const rows = await db.select().from(manualDealsTable);
  const data = ListManualDealsResponse.parse(rows.map(serializeDeal));
  res.json(data);
});

router.post("/manual/deals", async (req, res) => {
  const body = CreateManualDealBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({
      error: "Invalid deal payload",
      details: body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
    return;
  }
  if (body.data.sourceId === body.data.targetId) {
    res.status(400).json({ error: "Source and target must differ" });
    return;
  }
  const id = generateId("d", body.data.headline);
  const inserted = await db
    .insert(manualDealsTable)
    .values({
      id,
      sourceId: body.data.sourceId,
      targetId: body.data.targetId,
      dealType: body.data.dealType,
      amountUsd: body.data.amountUsd ?? null,
      amountLabel: body.data.amountLabel,
      announcedAt: body.data.announcedAt,
      headline: body.data.headline,
      description: body.data.description ?? "",
      sourceUrl: body.data.sourceUrl ?? null,
    })
    .returning();
  const row = inserted[0];
  if (!row) {
    res.status(500).json({ error: "Failed to insert deal" });
    return;
  }
  const data = ListManualDealsResponseItem.parse(serializeDeal(row));
  res.status(201).json(data);
});

router.delete("/manual/deals/:id", async (req, res) => {
  const id = req.params.id;
  const deleted = await db
    .delete(manualDealsTable)
    .where(eq(manualDealsTable.id, id))
    .returning();
  if (deleted.length === 0) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }
  res.status(204).end();
});

export async function fetchManualEntries() {
  const [companies, deals] = await Promise.all([
    db.select().from(manualCompaniesTable),
    db.select().from(manualDealsTable),
  ]);
  return {
    companies: companies.map(serializeCompany),
    deals: deals.map(serializeDeal),
  };
}

export default router;
