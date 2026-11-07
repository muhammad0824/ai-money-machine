/**
 * Google News switched from HTTP redirects to signed garturlreq RPCs.
 * Resolve the publisher URL; never classify a wrapper's 200 as an article.
 */
export function isGoogleNewsUrl(url: string): boolean {
  try { return new URL(url).hostname === "news.google.com"; } catch { return false; }
}

export function publisherUrl(value: string): string | null {
  try {
    const u = new URL(value);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) return null;
    if (/(^|\.)google\.com$/.test(u.hostname)) return null;
    if (/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/.test(u.hostname)) return null;
    return u.href;
  } catch { return null; }
}

export async function resolveGoogleNewsUrl(url: string): Promise<string | null> {
  if (!isGoogleNewsUrl(url)) return publisherUrl(url);
  const id = new URL(url).pathname.split("/").pop() ?? "";
  // Older protobuf envelopes contain the publisher URL as a length-delimited field.
  const decoded = Buffer.from(id, "base64url").toString("latin1");
  const embedded = decoded.match(/https?:\/\/[^\s\x00-\x20\x7f-\xff]+/);
  if (embedded) {
    const found = publisherUrl(embedded[0]);
    if (found) return found;
  }
  try {
    const res = await fetch(`https://news.google.com/rss/articles/${encodeURIComponent(id)}?hl=en-US&gl=US&ceid=US:en`, {
      signal: AbortSignal.timeout(12000),
    });
    const redirected = publisherUrl(res.url);
    if (redirected) { await res.body?.cancel(); return redirected; }
    if (!res.ok) { await res.body?.cancel(); return null; }
    const html = await res.text();
    const sig = html.match(/data-n-a-sg=["']([^"']+)/)?.[1];
    const ts = html.match(/data-n-a-ts=["'](\d+)/)?.[1];
    if (!sig || !ts) return null;
    const context = [
      ["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1],
      "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0,
    ];
    const request = [[["Fbv4je", JSON.stringify(["garturlreq", context, id, Number(ts), sig]), null, "0"]]];
    const rpc = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({ "f.req": JSON.stringify(request) }),
      signal: AbortSignal.timeout(12000),
    });
    if (!rpc.ok) { await rpc.body?.cancel(); return null; }
    const body = await rpc.text();
    // batchexecute is length-prefixed JSON; parse JSON lines, then RPC payloads.
    for (const line of body.split("\n")) {
      if (!line.startsWith("[")) continue;
      try {
        for (const row of JSON.parse(line)) {
          if (row?.[1] !== "Fbv4je" || typeof row[2] !== "string") continue;
          const payload = JSON.parse(row[2]);
          if (payload[0] === "garturlres") return publisherUrl(payload[1]);
        }
      } catch { /* another envelope, not the URL response */ }
    }
    return null;
  } catch { return null; } // unresolved, not dead; retry later
}
