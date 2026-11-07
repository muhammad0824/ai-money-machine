import { useGetPipelineStatus, getGetPipelineStatusQueryKey } from "@workspace/api-client-react";
import type { PipelineStatus } from "@workspace/api-client-react";
import { AlertCircle, Gauge, Loader2, RefreshCw } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function fmtTime(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${format(d, "MMM d, HH:mm")} (${formatDistanceToNow(d, { addSuffix: true })})`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h3 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "warn" | "error" | "ok" }) {
  const color = tone === "error" ? "text-destructive" : tone === "warn" ? "text-amber-400" : tone === "ok" ? "text-emerald-400" : "text-foreground";
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 border-b border-border/30 last:border-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-xs font-mono text-right break-words min-w-0 ${color}`}>{value}</dd>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/60 px-2 py-1.5">
      <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-sm font-bold font-mono ${tone}`}>{value.toLocaleString()}</div>
    </div>
  );
}

function Body({ s }: { s: PipelineStatus }) {
  const r = s.recovery;
  const pct = r.totalArticles > 0 ? Math.min(100, (r.processedArticles / r.totalArticles) * 100) : 0;
  return (
    <>
      <Section title="Last run">
        <dl>
          <Row label="State" value={s.running ? "Running" : s.lastError ? "Error" : "Idle"} tone={s.running ? "ok" : s.lastError ? "error" : undefined} />
          <Row label="Started" value={fmtTime(s.lastStartedAt)} />
          <Row label="Completed" value={fmtTime(s.lastCompletedAt)} />
          <Row label="Interval" value={`every ${s.intervalMinutes} min`} />
          <Row label="Ingested last run" value={s.lastRunIngested} />
          <Row label="Awaiting extraction" value={s.awaitingExtraction} tone={s.awaitingExtraction > 0 ? "warn" : undefined} />
          <Row label="Displayed edges" value={s.displayedEdges} />
          {s.lastError && <Row label="Error" value={s.lastError} tone="error" />}
        </dl>
      </Section>

      <Section title="Source link checks">
        <p className="text-[10px] text-muted-foreground mb-1.5">Counts include retained hidden records; displayed edges are counted separately above.</p>
        <div className="grid grid-cols-4 gap-1.5">
          <Cell label="Live" value={s.live} tone="text-emerald-400" />
          <Cell label="Gated" value={s.gated} tone="text-amber-400" />
          <Cell label="Dead" value={s.dead} tone="text-destructive" />
          <Cell label="Unclear" value={s.inconclusive} tone="text-muted-foreground" />
        </div>
      </Section>

      <Section title={`Hidden edges (${s.hidden})`}>
        <dl>
          <Row label="Dead source link" value={s.hiddenDeadLink} />
          <Row label="Outside coverage window" value={s.hiddenOutOfWindow} />
          <Row label="Other reasons" value={s.hiddenOther} />
        </dl>
      </Section>

      <Section title="Recovery">
        <div
          className="h-1.5 rounded-full bg-muted overflow-hidden mb-1.5"
          role="progressbar"
          aria-label="Recovery progress"
          aria-valuemin={0}
          aria-valuemax={r.totalArticles}
          aria-valuenow={r.processedArticles}
        >
          <div className="h-full bg-primary origin-left transition-transform" style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
        <dl>
          <Row label="Started" value={fmtTime(r.startedAt)} />
          <Row label="Completed" value={r.startedAt && !r.completedAt ? "In progress" : fmtTime(r.completedAt)} />
          <Row label="Processed / total articles" value={`${r.processedArticles} / ${r.totalArticles}`} />
          <Row label="Orphaned fingerprints" value={r.orphanedFingerprints} />
          <Row label="Restored edges" value={r.restoredEdges} />
          {r.lastError && <Row label="Error" value={r.lastError} tone="error" />}
        </dl>
      </Section>

      <Section title={`Feeds (${s.feeds.length})`}>
        {s.feeds.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-3 text-center">No feeds have reported yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {s.feeds.map((f) => (
              <li key={f.feedSource} className="rounded-md border border-border/40 bg-background/60 p-2" data-testid={`row-feed-${f.feedSource}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-semibold truncate">{f.outletName}</span>
                  <span className={`text-[9px] font-mono uppercase ${f.lastError ? "text-destructive" : "text-emerald-400"}`}>
                    {f.lastError ? "Error" : "OK"}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 text-[10px] font-mono">
                  <div className="flex justify-between"><dt className="text-muted-foreground">Ingested (all time)</dt><dd>{f.ingested}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Accepted (all time)</dt><dd>{f.accepted}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Displayed now</dt><dd>{f.displayed}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Last run</dt><dd>{f.lastRunIngested}</dd></div>
                </dl>
                {f.lastError && <p className="mt-1 text-[10px] font-mono text-destructive break-words">{f.lastError}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

export default function PipelineStatusPanel() {
  const q = useGetPipelineStatus({ query: { refetchInterval: 15000, queryKey: getGetPipelineStatusQueryKey() } });
  const s = q.data;
  const dot = !s ? "bg-muted-foreground" : s.running ? "bg-emerald-400 animate-pulse" : s.lastError ? "bg-destructive" : "bg-primary";

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Open pipeline status"
          data-testid="button-pipeline-status"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-mono border backdrop-blur-md transition-all bg-background/70 border-border/40 text-muted-foreground hover:text-foreground"
        >
          <Gauge className="h-3 w-3" />
          <span>Status</span>
          <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden />
        </button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg max-h-[85dvh] overflow-y-auto p-4 sm:p-5 bg-background/95 backdrop-blur-xl border-border/60">
        <DialogHeader className="text-left">
          <DialogTitle className="font-mono uppercase tracking-tight text-base">Pipeline Status</DialogTitle>
          <DialogDescription className="text-xs">
            Ingestion, extraction, recovery and per-feed health. Refreshes every 15 seconds.
          </DialogDescription>
        </DialogHeader>
        <div aria-live="polite">
          {q.isLoading ? (
            <div className="flex flex-col gap-2" aria-busy="true">
              {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-10 rounded-md bg-muted/60 animate-pulse" />)}
            </div>
          ) : q.isError || !s ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <AlertCircle className="h-6 w-6 text-destructive" />
              <p className="text-xs text-muted-foreground">Could not load pipeline status.</p>
              <button
                type="button"
                onClick={() => q.refetch()}
                data-testid="button-retry-pipeline-status"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border/50 text-[11px] font-mono hover:text-primary"
              >
                {q.isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Retry
              </button>
            </div>
          ) : (
            <Body s={s} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
