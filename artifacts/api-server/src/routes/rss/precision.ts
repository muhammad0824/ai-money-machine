import { ENTITY_ALIASES } from "../graph/entity-resolution";

export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
}
export function entityGrounded(id: string, name: string, text: string): boolean {
  // Mentions in customer lists or "hacked by" clauses are not counterparties.
  const normalized = normalizeText(text).replace(/\b(?:used|hacked|adopted|utilized)\s+by\b[\s\S]*$/, "");
  const aliases = [name, ...(ENTITY_ALIASES[id] ?? [])].filter((s) => s.length > 2);
  return aliases.some((a) => {
    const escaped = normalizeText(a).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // "Nvidia-backed Lambda", "Nvidia CEO's foundation" and "SoftBank
    // data-center developer" do not make Nvidia/SoftBank the counterparty.
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?![a-z0-9]|\\s*[-‑–]\\s*(?:backed|owned|funded|powered|affiliated)|\\s+(?:ceo\\b|data[ -]cent(?:er|re) developer\\b))`, "i").test(normalized);
  });
}
export function excludedArticle(title: string, url: string): boolean {
  return /\b(podcast|opinion|commentary|editorial|op-ed|roundup|rumou?r)\b/i.test(title)
    || /\/(podcasts?|opinion|commentary|editorials?)\//i.test(url);
}
export function hasTransactionLanguage(text: string): boolean {
  return /\b(invest(?:s|ed|ment|ments|ing)?|fund(?:ing|ed|s)?|rais(?:e[sd]?|ing)|acqui(?:re[sd]?|sition)|buy(?:s|ing)?|bought|stake|licens(?:e[sd]?|ing)|sign(?:s|ed)?|deal|contract|award(?:s|ed)?|grant(?:s|ed)?|partner(?:s|ed|ship)?|sue[sd]?|lawsuit|files?|filed|settle[sd]?)\b/i.test(text);
}
export function evidenceIsExact(snippet: string, text: string): boolean {
  return snippet.length >= 25 && snippet.length <= 650 && normalizeText(text).includes(normalizeText(snippet));
}

/** Fail closed on mentions of old transactions or financing intentions. */
export function unsupportedTransactionContext(text: string, dealType: string): boolean {
  if (dealType === "lawsuit") {
    // A third party's amicus filing does not announce a new case between the
    // original plaintiff and defendant.
    return /\b(amicus|files? (?:a )?brief|filed (?:a )?brief|weighs? in|backs? .*lawsuit|supports? .*lawsuit)\b/i.test(text);
  }
  return /\b(ends?|ended|terminat(?:e[sd]?|ion)|winds? down|wound down|cancel(?:s|led|ed)?|walk(?:s|ed)? away|probe over|investigat(?:ion|es?|ed) (?:over|into)|bonds? to fund|plans? to (?:invest|buy|acquire)|could (?:invest|buy|acquire)|in talks|consider(?:s|ing) (?:a |an )?(?:investment|acquisition|deal)|reportedly considering|propos(?:es?|ed|al)|windfall|(?:win|benefit|profit)s? from (?:its |the )?|amid .*contract|preliminary agreement)\b/i.test(text);
}

export function supportedDollarAmount(amount: unknown, evidence: string): number | null {
  if (typeof amount !== "number" || amount <= 0 || amount > 250e9) return null;
  if (/\b(valuation|valued at|market cap|bonds?|targets?|plans? to spend|seeking)\b/i.test(evidence)) return null;
  const matches = [...evidence.matchAll(/(?:\$|USD\s*)([\d,.]+)\s*(trillion|billion|million|bn|mn|[bmt])?\b/gi)];
  for (const m of matches) {
    const unit = (m[2] ?? "").toLowerCase();
    const multiplier = unit.startsWith("t") ? 1e12 : unit.startsWith("b") ? 1e9 : unit.startsWith("m") ? 1e6 : 1;
    const parsed = Number(m[1]!.replace(/,/g, "")) * multiplier;
    if (Math.abs(amount - parsed) / amount < 0.001) return amount;
  }
  return null;
}
