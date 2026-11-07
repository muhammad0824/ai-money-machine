import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyResponse, verifyAndResolveUrl } from "./linkVerification";
import { applyLinkCheck, DEAD_CONFIRMATION_MS, visibilityReason } from "./linkPolicy";
import type { GeneratedEdge } from "./generator";
import { entityGrounded, evidenceIsExact, excludedArticle, hasTransactionLanguage, unsupportedTransactionContext, supportedDollarAmount } from "../rss/precision";
import { auditStoredEvidence } from "../rss/evidenceAudit";
import { resolveGoogleNewsUrl } from "./googleNews";

function edge(): GeneratedEdge {
  return { id: "test", source: "a", target: "b", dealType: "investment", amountUsd: null, amountLabel: "Undisclosed",
    announcedAt: new Date().toISOString().slice(0, 10), headline: "A invests in B", description: "",
    sourceUrl: "https://example.org/story", provenance: "ai_extracted" };
}
const check = (state: "live" | "gated" | "dead" | "inconclusive") =>
  ({ state, ok: state === "live" || state === "gated", finalUrl: "https://example.org/story", reason: state });

test("restricted statuses valid; 5xx inconclusive; 404/410 dead", () => {
  for (const s of [401, 402, 403, 429, 451]) assert.equal(classifyResponse(s).state, "gated");
  for (const s of [500, 502, 503, 504, 400]) assert.equal(classifyResponse(s).state, "inconclusive");
  for (const s of [404, 410]) assert.equal(classifyResponse(s).state, "dead");
});
test("not-found in scripts/nav/body is not a soft404", () => {
  assert.equal(classifyResponse(200, '<title>Funding news</title><nav>page not found</nav><script>"<h1>404 not found</h1>"</script>').state, "live");
  assert.equal(classifyResponse(200, "<title>Page not found | Publisher</title>").state, "dead");
  assert.equal(classifyResponse(200, "<title>News</title><h1>Article not found</h1>").state, "dead");
});
test("bot challenges and paywalls are gated", () => {
  assert.equal(classifyResponse(200, "<title>Just a moment...</title>").state, "gated");
  assert.equal(classifyResponse(200, '<title>Story</title><div id="paywall">Subscribe</div>').state, "gated");
});
test("at least two dead checks at least six hours apart; recovery retained", () => {
  const t = new Date();
  let e = applyLinkCheck(edge(), check("gated"), t);
  assert.equal(visibilityReason(e), null);
  e = applyLinkCheck(e, check("dead"), t);
  assert.equal(visibilityReason(e), null);
  e = applyLinkCheck(e, check("dead"), new Date(+t + DEAD_CONFIRMATION_MS - 1));
  assert.equal(e.deadCheckCount, 1);
  assert.equal(visibilityReason(e), null);
  e = applyLinkCheck(e, check("dead"), new Date(+t + DEAD_CONFIRMATION_MS));
  assert.equal(visibilityReason(e), "dead_link");
  assert.ok(e.hiddenAt);
  e = applyLinkCheck(e, check("gated"), new Date(+t + DEAD_CONFIRMATION_MS + 100));
  assert.equal(visibilityReason(e), null);
  assert.equal(e.deadCheckCount, 0);
  assert.equal(e.linkCheckHistory?.length, 5);
});
test("inconclusive preserves last valid state but cannot invent verification", () => {
  assert.equal(visibilityReason(applyLinkCheck(edge(), check("inconclusive"))), "unverified_link");
  let e = applyLinkCheck(edge(), check("live"));
  e = applyLinkCheck(e, check("inconclusive"));
  assert.equal(visibilityReason(e), null);
  assert.equal(visibilityReason({ ...edge(), sourceUrlVerified: true }), "unverified_link");
});
test("dated ownership is not exempt, undated ownership still needs valid source", () => {
  const old = { ...edge(), announcedAt: "2020-01-01", dealType: "ownership" as const };
  assert.equal(visibilityReason(applyLinkCheck(old, check("live"))), "out_of_window");
  assert.equal(visibilityReason(applyLinkCheck({ ...old, announcedAt: "" }, check("gated"))), null);
});
test("precision excludes the Pentagon podcast and requires verbatim evidence", () => {
  assert.ok(excludedArticle("Podcast: How a contractor's Claude agent got into the Pentagon", "https://wired.com/story/episode"));
  assert.ok(excludedArticle("Why Anthropic might sign a deal", "https://example.org/opinion/article"));
  assert.ok(!hasTransactionLanguage("A contractor's Claude agent got into the Pentagon"));
  assert.ok(evidenceIsExact("Anthropic signed a contract with the Pentagon.", "Today: Anthropic signed a contract with the Pentagon. Read more."));
  assert.ok(!evidenceIsExact("The Pentagon awarded a contract to Anthropic.", "A contractor used Claude in a podcast."));
});
test("rejects terminations, old-deal investigations and bond financing, grounds amounts", () => {
  assert.ok(unsupportedTransactionContext("Microsoft Ends 2023 Oracle AI Cloud Deal", "infrastructure"));
  assert.ok(unsupportedTransactionContext("SoftBank launches $11 billion bonds to fund OpenAI investment", "investment"));
  assert.ok(unsupportedTransactionContext("Nvidia faces DOJ probe over Groq licensing deal", "licensing"));
  assert.ok(unsupportedTransactionContext("Group of stars files brief in NYT-OpenAI lawsuit", "lawsuit"));
  assert.ok(!unsupportedTransactionContext("Nvidia and Meta sign investment agreement", "investment"));
  assert.equal(supportedDollarAmount(3e9, "Nvidia invests $3 billion in Meta."), 3e9);
  assert.equal(supportedDollarAmount(30e9, "Nvidia invests $3 billion in Meta."), null);
  assert.equal(supportedDollarAmount(3e9, "Nvidia invests at a $3 billion valuation."), null);
});
test("rejects backed companies, customers and CEO foundations as counterparties", () => {
  assert.equal(entityGrounded("nvidia", "Nvidia", "Anthropic seals $44 billion cloud deal with Nvidia-backed Lambda"), false);
  assert.equal(entityGrounded("openai", "OpenAI", "Anthropic has acquired the dev tools startup used by OpenAI, Google, and Cloudflare"), false);
  assert.equal(entityGrounded("nvidia", "Nvidia", "Nvidia CEO's foundation buys computing from CoreWeave"), false);
  assert.equal(entityGrounded("softbank", "SoftBank", "Nvidia invests in SoftBank data center developer"), false);
  assert.equal(entityGrounded("nvidia", "Nvidia", "Nvidia invests in Intel"), true);
  assert.ok(unsupportedTransactionContext("OpenAI proposes a 5% government stake", "government_equity"));
  const original = { ...edge(), source: "anthropic", target: "nvidia", evidenceSnippet: "Anthropic signs with Nvidia-backed Lambda" };
  const audited = auditStoredEvidence({ nodes: [], edges: [original], meta: { generatedAt: "", nextRefreshAt: "", sources: [], coveragePeriod: "" } });
  assert.equal(audited.edges.length, 1);
  assert.equal(audited.edges[0]?.hiddenReason, "unsupported_transaction");
  assert.equal(audited.edges[0]?.evidenceSnippet, original.evidenceSnippet);
});
test("modern Google News RPC stores publisher URL, never the wrapper", async () => {
  const original = globalThis.fetch;
  let call = 0;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    call++;
    if (call === 1) return new Response('<div data-n-a-sg="signature" data-n-a-ts="123"></div>');
    assert.ok(String(init?.body).includes("f.req="));
    return new Response(")]}'\n\n" + JSON.stringify([["wrb.fr", "Fbv4je", JSON.stringify(["garturlres", "https://publisher.example/story"]), null]]));
  }) as typeof fetch;
  try { assert.equal(await resolveGoogleNewsUrl("https://news.google.com/rss/articles/AU_yqL123"), "https://publisher.example/story"); }
  finally { globalThis.fetch = original; }
});
test("DNS ENOTFOUND is dead; temporary DNS and timeouts are inconclusive", async () => {
  const original = globalThis.fetch;
  try {
    for (const [code, expected] of [["ENOTFOUND", "dead"], ["EAI_AGAIN", "inconclusive"], ["ETIMEDOUT", "inconclusive"]]) {
      globalThis.fetch = (async () => { throw Object.assign(new Error("network"), { cause: { code } }); }) as typeof fetch;
      assert.equal((await verifyAndResolveUrl("https://example.org/story")).state, expected);
    }
  } finally { globalThis.fetch = original; }
});
