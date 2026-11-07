# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (ESM server bundle), Vite (web)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Project: AI Money Machine

Interactive force-directed network of reported AI funding flows between technology, AI, media, infrastructure, investment and government entities. RSS polling runs on startup and every 30 minutes while the API process is active; this is periodic ingestion, not a real-time streaming feed.

### Architecture

- **Frontend** (`artifacts/ai-money-machine/`): React + Vite single-page app at `/`. Uses `react-force-graph-2d` for the visualization. Bloomberg-terminal dark theme.
- **Backend** (`artifacts/api-server/`): Express API mounted at `/api`. Routes:
  - `GET /api/graph` — returns display-eligible nodes + edges + metadata
  - `POST /api/graph/refresh` — starts an RSS ingestion/extraction cycle
  - `GET /api/graph/summary` — totals, by-type/sector aggregates, top flows
  - `GET /api/graph/timeline` — edges sorted by `announcedAt` desc
  - `POST /api/graph/backlog/process`, `GET /api/graph/backlog/status` — drain pending in-window articles and track progress
  - `GET /api/pipeline/status` — public persisted ingestion/recovery telemetry, link states, hidden reasons and per-feed counts; powers the Status panel
- **Graph data**: Seed supplies company nodes, not dated transactions. RSS extraction uses Replit's existing OpenAI integration (`gpt-4.1-mini`) and only supplied article titles/RSS snippets, not model-memory generation. Legacy generator code is not the scheduled ingestion path.
- **Cache** (`.../graph/cache.ts`): PostgreSQL persistence, not a 24-hour in-memory cache.
- **Contract**: defined in `lib/api-spec/openapi.yaml`; client hooks and Zod schemas are generated via `pnpm --filter @workspace/api-spec run codegen`.
- **Manual entries** (`artifacts/api-server/src/routes/manual/index.ts`): Postgres-backed CRUD via `lib/db` (`manual_companies`, `manual_deals`). Endpoints: `GET/POST /api/manual/companies`, `DELETE /api/manual/companies/:id`, `GET/POST /api/manual/deals`, `DELETE /api/manual/deals/:id`. Manual entries are merged into the AI/seed graph in `.../graph/compose.ts` and tagged `isManual: true`. They survive AI refreshes and persist into production.
- **RSS pipeline** (`artifacts/api-server/src/routes/rss/`): Real article ingestion running on a 30-min schedule.
  - `feeds.ts` — 104 configured feeds, including direct technology, finance, media, investigative and government coverage plus targeted Google News queries and site-scoped paywalled outlets. The status endpoint reports every configured feed, including zero results and errors.
  - `fetcher.ts` — fetches RSS with `rss-parser`, validates dates, deduplicates by original URL hash, stores source titles/snippets and feed IDs. Errors are recorded, not misreported as success.
  - `extractor.ts` — considers up to 800 in-window pending articles per checkpoint. Deterministic filters reject podcasts/opinion and texts lacking two named known parties or transaction language. Remaining articles are sent in groups of eight to OpenAI with bounded concurrency/backoff.
  - Acceptance requires announced/completed transactions (or actual filed lawsuits), named counterparties and a verbatim evidence quote from supplied text. Government procurement requires actual contract evidence; anecdotal product use is not a contract. Amounts must be supported by the quote, never company valuations or a whole round assigned to one investor.
  - Party grounding excludes affiliation-only mentions (“Nvidia-backed Lambda”), customer lists, CEO foundations and unrelated developers. An evidence audit also archives those mistakes in historical extracts. Proposals, old-deal windfalls, cancellation updates and third-party legal briefs cannot become new transactions.
  - `scheduler.ts` — startup/30-minute ingestion, resumable recovery checkpoints every 10 seconds while work is pending, and non-destructive link rechecks of up to 80 stale records per cycle. A PostgreSQL advisory lock coordinates graph writers across processes; extraction atomically checkpoints graph, fingerprints and article processing.
- **Graph persistence**: `graph_cache` row `id = "current"` stores all edges, including hidden records. Other rows store persisted pipeline telemetry, manual-link histories, and the pre-repair audit snapshot. Never assume the table has only one row.
- **Link policy**: `live` and `gated` (401/402/403/429/451, paywalls, bot challenges) are valid. 404/410, title/h1 soft-404s and NXDOMAIN are dead. Timeouts, temporary DNS errors, 5xx and unresolved wrappers are inconclusive. Inconclusive checks retain prior successful validation, but cannot validate a new source.
- **Hiding/recovery**: A previously valid edge is hidden as dead only after two dead checks at least six hours apart. Edges are never deleted by revalidation or age pruning; reason, timestamp and bounded check history are persisted. A later live/gated result restores dead-link-hidden records. All dated edges must stay in a rolling six-month window with no future dates; only undated structural ownership is date-exempt.
- **Google News**: Supports older embedded publisher URLs and current signed `garturlreq`/`Fbv4je` RPC resolution. Displayed edges store the publisher URL, not Google's wrapper. The original ingestion URL remains separately for provenance/retry; a wrapper 200 is never sufficient verification.
- **Repair rollout**: On first updated startup in each environment, a transaction snapshots the previous graph/orphaned fingerprints, removes fingerprints referring to missing edges, resets every stored in-window article for re-extraction, and hides existing AI edges pending evidence review. Checkpoints resume from the DB after restart. Unsupported old records remain archived. Production data is rebuilt by the published application's normal data-processing code, never by agent writes to production.
- **Status definitions**: Per-feed ingested = all stored articles; accepted = distinct source articles linked to evidence-grounded edges that have had a live/gated check; displayed = currently visible primary-source edges (not article counts). Counts are not interchangeable. Restored = rebuilt edges matching orphaned historical edge IDs; records permanently deleted before this repair have no recoverable check history, so their precise old removal reason cannot be proven.
- **Deal dedup** (`deal_fingerprints` table): Fingerprint = SHA-256 of `sort([sourceId,targetId])|dealType|YYYY-MM`. Prevents duplicate deals across refresh cycles.
- **Provenance** on edges: `seed` (curated), `ai_extracted` (from article), `manual` (user-added). Shown as color-coded badges in the UI.
- **Frontend extras**: `SearchBar.tsx` (cmdk autocomplete), `AddEntryDialog.tsx` (Company/Deal tabs), clickable article links (↗ icon) on AI-extracted deals in Activity Log and NodeDetailPanel.

### DB tables
- `manual_companies`, `manual_deals` — user-added entries
- `articles` — fetched RSS articles (url unique, processedAt tracks extraction)
- `deal_fingerprints` — dedup store for extracted deals
- `graph_cache` — persisted graph, recovery audit and pipeline status records

Schema lives in `lib/db/src/schema/`. Run `pnpm --filter @workspace/db run push` after schema changes.

### Notes

- Seed supplies entities only when the cache is empty. No fabricated seed transactions are used to inflate counts.
- Always distinguish development rebuild totals from production. Publishing updates code; it does not copy ongoing development data into an existing production database. Production runs its own repair.
- The current deployment uses Autoscale, which can scale to zero while idle. `setInterval` cannot guarantee unattended 24/7 scraping there. Continuous background execution requires an always-running Reserved VM or a separately scheduled worker; changing hosting is a user decision. Never claim a timer means the live app is continuously scraping.
