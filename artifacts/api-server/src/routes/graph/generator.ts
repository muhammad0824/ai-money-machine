import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../../lib/logger";

export type Sector =
  | "tech"
  | "media"
  | "ai_lab"
  | "infrastructure"
  | "publisher"
  | "studio"
  | "investor"
  | "government";

export type DealType =
  | "investment"
  | "acquisition"
  | "licensing"
  | "partnership"
  | "infrastructure"
  | "lawsuit"
  | "venture_capital"
  | "government_contract"
  | "government_subsidy"
  | "government_equity"
  // Undated structural ownership relationship (e.g. parent company owns a
  // news outlet). Exempt from the rolling coverage window, but still
  // requires a verified working source link like every other edge. Never
  // produced by the AI generator or RSS extractor — curated only.
  | "ownership";

export interface GeneratedNode {
  id: string;
  name: string;
  sector: Sector;
  marketValueUsd: number | null;
  marketValueLabel: string;
  description: string;
  country: string | null;
  isManual?: boolean;
}

export type Provenance = "seed" | "ai_extracted" | "manual";

export interface GeneratedEdge {
  id: string;
  source: string;
  target: string;
  dealType: DealType;
  amountUsd: number | null;
  amountLabel: string;
  announcedAt: string;
  headline: string;
  description: string;
  sourceUrl: string | null;
  sourceUrls?: string[] | null;
  isManual?: boolean;
  /** Set true only after verifyAndResolveUrl() has confirmed sourceUrl is live. */
  sourceUrlVerified?: boolean;
  sourceUrlCheckedAt?: string | null;
  originalSourceUrl?: string;
  linkState?: import("./linkVerification").LinkState;
  lastValidLinkState?: "live" | "gated";
  linkCheckReason?: string;
  deadCheckCount?: number;
  firstDeadAt?: string | null;
  lastDeadAt?: string | null;
  hiddenReason?: string | null;
  hiddenAt?: string | null;
  linkCheckHistory?: { at: string; state: string; reason: string }[];
  evidenceSnippet?: string;
  feedSource?: string;
  articleId?: string;
  acceptedArticleIds?: string[];
  restoredFromPurge?: boolean;
  provenance?: Provenance;
  outletName?: string | null;
  outletNames?: string[] | null;
}

export interface GeneratedMeta {
  generatedAt: string;
  nextRefreshAt: string;
  coveragePeriod: string;
  sources: string[];
}

export interface GeneratedGraph {
  nodes: GeneratedNode[];
  edges: GeneratedEdge[];
  meta: GeneratedMeta;
}

const SECTORS: Sector[] = [
  "tech",
  "media",
  "ai_lab",
  "infrastructure",
  "publisher",
  "studio",
  "investor",
];

const DEAL_TYPES: DealType[] = [
  "investment",
  "acquisition",
  "licensing",
  "partnership",
  "infrastructure",
  "lawsuit",
  "venture_capital",
];

function buildPrompt(now: Date): string {
  const isoNow = now.toISOString().slice(0, 10);
  const monthsBack = 6;
  const start = new Date(now);
  start.setMonth(start.getMonth() - monthsBack);
  const isoStart = start.toISOString().slice(0, 10);

  return `You are a financial-data analyst generating a current snapshot of disclosed AI-related funding flows between large technology companies and large media companies.

Today's date is ${isoNow}. Cover deals announced roughly between ${isoStart} and ${isoNow}.

Produce a graph data set as STRICT JSON describing notable, real, publicly reported deals. Include the most consequential deals you are aware of. Do NOT fabricate companies or specific dollar amounts. If you are unsure of an exact amount, set amountUsd to null and use a label like "Undisclosed", "Multi-year", or a rough range like "~$1B".

Required JSON shape (no extra keys):
{
  "nodes": [
    {
      "id": "kebab-case-id",
      "name": "Company Name",
      "sector": "tech | media | ai_lab | infrastructure | publisher | studio | investor",
      "marketValueUsd": number_or_null,
      "marketValueLabel": "$4.5T or ~$70B style label",
      "description": "one short sentence",
      "country": "US | UK | France | ..." or null
    }
  ],
  "edges": [
    {
      "id": "kebab-case-id",
      "source": "node id",
      "target": "node id",
      "dealType": "investment | acquisition | licensing | partnership | infrastructure | lawsuit | venture_capital",
      "amountUsd": number_or_null,
      "amountLabel": "$10B or 'Undisclosed' or 'Multi-year' style label",
      "announcedAt": "YYYY-MM-DD",
      "headline": "Short headline of the deal",
      "description": "1-2 sentence description",
      "sourceUrl": null
    }
  ]
}

Composition guidance (target ~22-32 nodes and ~30-50 edges):
- Tech / AI-lab / infrastructure side: include the dominant AI players (OpenAI, Anthropic, Google/DeepMind, Meta, Microsoft, Nvidia, Amazon/AWS, Apple, xAI, Mistral, Perplexity, CoreWeave, Oracle, Databricks, Stability AI, Cohere — pick the most relevant).
- Media / publisher / studio side: include large publishers and media companies that have signed AI-related deals (News Corp, The New York Times Company, Axel Springer, Conde Nast, Vox Media, The Atlantic, Dotdash Meredith, Reuters/Thomson Reuters, Associated Press, Financial Times, The Guardian, Le Monde, Disney, Warner Bros Discovery, Paramount, Universal Music Group, Sony Music — pick what is relevant).
- Edges must mostly cross the tech↔media boundary (content licensing, lawsuits like NYT v OpenAI/Microsoft, partnerships, investments). It's fine to also include a few significant tech↔tech AI deals (e.g. Microsoft–OpenAI, Nvidia–CoreWeave, Anthropic–Amazon) for context.
- Use the dealType "lawsuit" for known IP / copyright cases.
- amountLabel should be human-friendly. amountUsd should be in raw USD (e.g. 10000000000 for $10B) when known.
- announcedAt should be a real or approximate date within the coverage window.

Return ONLY the JSON. No prose, no markdown fences.`;
}

function isSector(value: unknown): value is Sector {
  return typeof value === "string" && (SECTORS as string[]).includes(value);
}

function isDealType(value: unknown): value is DealType {
  return typeof value === "string" && (DEAL_TYPES as string[]).includes(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function normalizeGraph(raw: unknown): {
  nodes: GeneratedNode[];
  edges: GeneratedEdge[];
} {
  if (!raw || typeof raw !== "object") {
    throw new Error("Generator returned non-object payload");
  }
  const obj = raw as Record<string, unknown>;
  const rawNodes = Array.isArray(obj["nodes"]) ? (obj["nodes"] as unknown[]) : [];
  const rawEdges = Array.isArray(obj["edges"]) ? (obj["edges"] as unknown[]) : [];

  const nodes: GeneratedNode[] = [];
  const seenNodeIds = new Set<string>();

  for (const item of rawNodes) {
    if (!item || typeof item !== "object") continue;
    const n = item as Record<string, unknown>;
    const id = asString(n["id"]).trim();
    const name = asString(n["name"]).trim();
    if (!id || !name) continue;
    if (seenNodeIds.has(id)) continue;
    const sector = isSector(n["sector"]) ? n["sector"] : "tech";
    nodes.push({
      id,
      name,
      sector,
      marketValueUsd: asNumberOrNull(n["marketValueUsd"]),
      marketValueLabel: asString(n["marketValueLabel"], "—"),
      description: asString(n["description"], ""),
      country:
        typeof n["country"] === "string" && n["country"].length > 0
          ? (n["country"] as string)
          : null,
    });
    seenNodeIds.add(id);
  }

  const edges: GeneratedEdge[] = [];
  const seenEdgeIds = new Set<string>();

  for (const item of rawEdges) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    const source = asString(e["source"]).trim();
    const target = asString(e["target"]).trim();
    if (!seenNodeIds.has(source) || !seenNodeIds.has(target)) continue;
    const dealType = isDealType(e["dealType"]) ? e["dealType"] : "partnership";
    const announcedAt = asString(e["announcedAt"], new Date().toISOString().slice(0, 10));
    const headline = asString(e["headline"], "Deal");
    let id = asString(e["id"]).trim();
    if (!id) {
      id = `${source}-${target}-${dealType}-${announcedAt}`;
    }
    if (seenEdgeIds.has(id)) {
      id = `${id}-${edges.length}`;
    }
    edges.push({
      id,
      source,
      target,
      dealType,
      amountUsd: asNumberOrNull(e["amountUsd"]),
      amountLabel: asString(e["amountLabel"], "Undisclosed"),
      announcedAt,
      headline,
      description: asString(e["description"], ""),
      sourceUrl:
        typeof e["sourceUrl"] === "string" && e["sourceUrl"].length > 0
          ? (e["sourceUrl"] as string)
          : null,
    });
    seenEdgeIds.add(id);
  }

  return { nodes, edges };
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // Strip markdown code fences if present
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1]!.trim() : trimmed;
  return JSON.parse(candidate);
}

function buildMeta(now: Date): GeneratedMeta {
  const next = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const start = new Date(now);
  start.setMonth(start.getMonth() - 6);
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });
  return {
    generatedAt: now.toISOString(),
    nextRefreshAt: next.toISOString(),
    coveragePeriod: `${fmt.format(start)} – ${fmt.format(now)}`,
    sources: [
      "Bloomberg",
      "Reuters",
      "Financial Times",
      "The Wall Street Journal",
      "Company press releases",
    ],
  };
}

export async function generateGraph(): Promise<GeneratedGraph> {
  const now = new Date();
  const prompt = buildPrompt(now);

  logger.info("Generating fresh AI funding graph via OpenAI");

  const response = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a precise financial-data analyst. You return only valid JSON matching the requested schema, with no commentary.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const text = response.choices[0]?.message?.content ?? "";
  if (!text) {
    throw new Error("OpenAI returned empty content");
  }

  const parsed = extractJson(text);
  const { nodes, edges } = normalizeGraph(parsed);

  if (nodes.length < 5 || edges.length < 5) {
    throw new Error(
      `Generator produced too little data: ${nodes.length} nodes, ${edges.length} edges`,
    );
  }

  return {
    nodes,
    edges,
    meta: buildMeta(now),
  };
}
