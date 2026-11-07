import { resolveGoogleNewsUrl, isGoogleNewsUrl, publisherUrl } from "./googleNews";

export type LinkState = "live" | "gated" | "dead" | "inconclusive";
export interface LinkVerificationResult {
  state: LinkState;
  ok: boolean;
  finalUrl: string | null;
  reason: string;
  statusCode?: number;
}

function plain(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** Only the title and first h1 may prove a soft 404, never scripts/nav/body. */
export function classifyResponse(status: number, html = ""): { state: LinkState; reason: string } {
  if ([401, 402, 403, 429, 451].includes(status)) return { state: "gated", reason: `HTTP ${status}: access restricted` };
  if ([404, 410].includes(status)) return { state: "dead", reason: `HTTP ${status}` };
  if (status < 200 || status >= 300) return { state: "inconclusive", reason: `HTTP ${status}: retry later` };
  const clean = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  const headings = [clean.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1], clean.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]]
    .filter((s): s is string => !!s).map(plain);
  if (headings.some((s) => /just a moment|verify (you are|you're|that you are)|access denied|robot|captcha|security check|subscribe to (read|continue)|sign in to (read|continue)|enable javascript and cookies/i.test(s))) {
    return { state: "gated", reason: "Access challenge or subscription required" };
  }
  if (headings.some((s) => /^(?:error\s*[:\-]?\s*)?(?:404|410)(?:\b|$)|\b(?:page|article|content) (?:not found|does not exist|doesn't exist|cannot be found)|the page you requested could not be found/i.test(s))) {
    return { state: "dead", reason: "Article title or main heading reports not found" };
  }
  // Challenge markers are access restrictions, never evidence of a dead page.
  if (/cf-chl-|challenge-platform|px-captcha|g-recaptcha|id=["']paywall|class=["'][^"']*\bpaywall\b/i.test(html)) {
    return { state: "gated", reason: "Bot challenge or paywall" };
  }
  return { state: "live", reason: "Successful HTTP response" };
}

export async function verifyAndResolveUrl(url: string | null | undefined): Promise<LinkVerificationResult> {
  const result = (state: LinkState, finalUrl: string | null, reason: string, statusCode?: number): LinkVerificationResult =>
    ({ state, finalUrl, reason, statusCode, ok: state === "live" || state === "gated" });
  if (!url) return result("inconclusive", null, "Missing source URL");
  const finalUrl = await resolveGoogleNewsUrl(url);
  if (!finalUrl) return result("inconclusive", null, isGoogleNewsUrl(url) ? "Unresolved Google News wrapper" : "Invalid source URL");
  try {
    const res = await fetch(finalUrl, {
      redirect: "follow", signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AIMoneyMachineLinkChecker/2.0)", Accept: "text/html,application/xhtml+xml" },
    });
    const resolved = publisherUrl(res.url);
    if (!resolved) { await res.body?.cancel(); return result("inconclusive", finalUrl, "Redirect did not reach a publisher"); }
    let html = "";
    if (res.ok && (res.headers.get("content-type") ?? "").includes("text/html")) {
      // Bound reads; do not buffer arbitrary files or depend on successful body completion.
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      try {
        while (reader && html.length < 200000) {
          const chunk = await reader.read();
          if (chunk.done) break;
          html += decoder.decode(chunk.value, { stream: true });
        }
      } catch { /* HTTP status remains usable if the body stalls */ }
      finally { await reader?.cancel().catch(() => undefined); }
    } else { await res.body?.cancel(); }
    const c = classifyResponse(res.status, html);
    return result(c.state, resolved, c.reason, res.status);
  } catch (err) {
    const code = (err as { cause?: { code?: string } }).cause?.code;
    return code === "ENOTFOUND" ? result("dead", finalUrl, "DNS name does not exist")
      : result("inconclusive", finalUrl, `Network check inconclusive${code ? `: ${code}` : ""}`);
  }
}

export async function verifyUrlsBatch(urls: string[], concurrency = 4): Promise<Map<string, LinkVerificationResult>> {
  const results = new Map<string, LinkVerificationResult>();
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    for (;;) {
      const url = urls[index++];
      if (!url) return;
      results.set(url, await verifyAndResolveUrl(url));
    }
  }));
  return results;
}
