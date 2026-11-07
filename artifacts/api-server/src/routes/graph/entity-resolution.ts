/**
 * Entity resolution: canonical company IDs → known aliases.
 * Used to build richer AI prompts and post-process extraction results.
 */

export const ENTITY_ALIASES: Record<string, string[]> = {
  google: [
    "Alphabet", "Alphabet Inc", "Google LLC", "Google AI", "Google DeepMind",
    "DeepMind", "DeepMind Technologies", "YouTube", "Waymo", "Google Cloud",
    "Google Brain", "Gemini",
  ],
  amazon: [
    "Amazon Web Services", "AWS", "Amazon.com", "Amazon Inc",
    "Amazon Prime", "Amazon Alexa", "Amazon Bedrock",
  ],
  meta: [
    "Facebook", "Meta Platforms", "Meta Platforms Inc", "Instagram",
    "WhatsApp", "Meta AI", "Llama", "React", "Oculus",
  ],
  microsoft: [
    "Azure", "Microsoft Azure", "Bing", "LinkedIn", "GitHub",
    "Xbox", "Microsoft Corp", "Microsoft Corporation", "Copilot",
  ],
  apple: [
    "Apple Inc", "Apple Intelligence", "Siri", "iCloud", "Apple Corp",
  ],
  nvidia: [
    "NVDA", "Nvidia Corp", "Nvidia Corporation", "CUDA", "H100", "Blackwell",
  ],
  openai: [
    "ChatGPT", "GPT-4", "GPT-4o", "GPT-5", "Sam Altman", "OpenAI Inc",
    "OpenAI LP", "OpenAI Technologies", "Sora", "DALL-E", "Whisper",
  ],
  anthropic: [
    "Claude", "Claude AI", "Dario Amodei", "Claude 3", "Claude Sonnet",
    "Claude Opus",
  ],
  xai: [
    "Grok", "Elon Musk AI", "x.AI", "X AI",
  ],
  mistral: [
    "Mistral", "Mistral AI", "Le Chat", "Mistral Large",
  ],
  coreweave: [
    "CoreWeave Inc", "Core Weave",
  ],
  oracle: [
    "Oracle Cloud", "Oracle Corp", "Oracle Corporation", "OCI",
    "Oracle Cloud Infrastructure",
  ],
  nyt: [
    "The New York Times", "New York Times", "NYTimes", "NYT",
    "NYT Co", "New York Times Co", "New York Times Company",
    "The Times (New York)",
  ],
  "news-corp": [
    "News Corporation", "NewsCorp", "The Wall Street Journal", "WSJ",
    "Dow Jones", "Dow Jones & Co", "NY Post", "New York Post",
    "HarperCollins", "The Sun", "The Times (UK)", "The Sunday Times",
    "News UK", "Fox (old)", "News Limited",
  ],
  "axel-springer": [
    "Axel Springer SE", "Politico", "Business Insider", "Bild", "Insider",
    "Die Welt", "Politico Europe",
  ],
  "conde-nast": [
    "Condé Nast", "Conde Nast", "Vogue", "The New Yorker", "Wired",
    "GQ", "Pitchfork", "Vanity Fair", "Architectural Digest",
    "Bon Appétit", "Allure", "The New Yorker",
  ],
  "vox-media": [
    "Vox", "The Verge", "New York Magazine", "Eater", "Curbed",
    "SB Nation", "Recode", "Polygon", "Vox Media Inc",
  ],
  "the-atlantic": [
    "The Atlantic", "Atlantic Media", "The Atlantic Magazine",
  ],
  "dotdash-meredith": [
    "Dotdash Meredith", "People", "People Magazine",
    "Better Homes & Gardens", "Investopedia", "Allrecipes",
    "IAC Media", "Dotdash", "Meredith Corp",
  ],
  ft: [
    "Financial Times", "FT", "FT Group", "FT Weekend",
    "Financial Times Limited",
  ],
  "le-monde": [
    "Le Monde", "Le Monde Diplomatique",
  ],
  ap: [
    "Associated Press", "AP", "AP News", "The Associated Press",
    "AP Wire",
  ],
  reddit: [
    "Reddit", "Reddit Inc", "Reddit Inc.",
  ],
  shutterstock: [
    "Shutterstock Inc", "Shutterstock Images",
  ],
  umg: [
    "Universal Music Group", "Universal Music", "UMG",
    "Island Records", "Interscope", "Republic Records", "Def Jam",
    "Capitol Records", "Virgin Music",
  ],
  disney: [
    "The Walt Disney Company", "Walt Disney", "ABC", "ABC News",
    "Pixar", "Marvel", "Marvel Studios", "Lucasfilm", "ESPN",
    "Hulu", "FX", "National Geographic", "Disney+",
  ],
  "warner-bros-discovery": [
    "Warner Bros Discovery", "WBD", "HBO", "CNN", "Warner Bros",
    "Warner Brothers", "Discovery", "Discovery Channel",
    "Max", "HBO Max", "TBS", "TNT", "Warner Media",
  ],
  perplexity: [
    "Perplexity AI", "Perplexity.ai",
  ],
  comcast: [
    "NBCUniversal", "NBC", "NBC News", "MSNBC", "Universal Pictures",
    "Bravo", "E!", "Comcast Corp", "Comcast Corporation", "Sky",
    "Peacock", "USA Network", "Syfy", "Oxygen",
  ],
  "fox-corp": [
    "Fox News", "Fox Business", "Fox Broadcasting", "Fox",
    "Fox Corporation", "Fox Sports", "Tubi", "Fox News Channel",
    "Fox News Network",
  ],
  "paramount-global": [
    "Paramount", "CBS", "CBS News", "Showtime", "MTV", "BET",
    "Comedy Central", "Nickelodeon", "Paramount+", "Pluto TV",
    "ViacomCBS", "Viacom", "Paramount Pictures", "CBS Corp",
    "CBS Corporation",
  ],
  "washington-post": [
    "The Washington Post", "Washington Post", "WaPo",
    "Washington Post Media",
  ],
  guardian: [
    "The Guardian", "Guardian Media Group", "Guardian News & Media",
    "The Observer",
  ],
  reuters: [
    "Reuters", "Thomson Reuters", "Reuters News Agency", "Reuters News",
  ],
  bbc: [
    "BBC", "BBC News", "British Broadcasting Corporation",
    "BBC World Service", "BBC Studios", "iPlayer",
  ],
  "time-magazine": [
    "Time", "Time Magazine", "TIME", "Time Inc", "Time USA",
    "Marc Benioff", "TIME Magazine",
  ],
  hearst: [
    "Hearst Communications", "Hearst Corp", "Hearst Corporation",
    "Cosmopolitan", "Good Housekeeping", "Esquire", "Harper's Bazaar",
    "Popular Mechanics", "Elle", "Hearst Newspapers",
  ],
  semafor: [
    "Semafor Media",
  ],
  "gannett": [
    "Gannett Co", "USA Today", "USA Today Network",
  ],
  // ── New nodes ──────────────────────────────────────────────────────────────
  "us-federal-gov": [
    "US Government", "U.S. Government", "Federal Government", "United States Government",
    "Department of Defense", "DoD", "Pentagon", "Department of Energy", "DoE",
    "GSA", "General Services Administration", "White House", "Biden Administration",
    "Trump Administration", "CHIPS Act", "DARPA", "NSF", "NIH", "Commerce Department",
    "US Department of Commerce",
  ],
  intel: [
    "Intel Corporation", "Intel Corp", "Intel", "Intel Capital",
    "Mobileye", "Intel Foundry Services", "IFS",
  ],
  tsmc: [
    "Taiwan Semiconductor Manufacturing", "Taiwan Semiconductor",
    "TSMC", "Taiwan Semiconductor Manufacturing Company",
  ],
  samsung: [
    "Samsung Electronics", "Samsung Semiconductor", "Samsung Foundry",
    "Samsung", "Samsung Group",
  ],
  micron: [
    "Micron Technology", "Micron", "Micron Technology Inc",
  ],
  "global-foundries": [
    "GlobalFoundries", "Global Foundries", "GF", "GlobalFoundries Inc",
  ],
  softbank: [
    "SoftBank", "SoftBank Group", "SoftBank Corp", "SoftBank Vision Fund",
    "Vision Fund", "Masayoshi Son",
  ],
  a24: [
    "A24", "A24 Films", "A24 Entertainment",
  ],
  lionsgate: [
    "Lionsgate", "Lions Gate", "Lionsgate Films", "Lions Gate Entertainment",
    "Starz", "Lionsgate Entertainment",
  ],
  runway: [
    "Runway", "Runway AI", "Runway ML", "RunwayML",
  ],
  midjourney: [
    "Midjourney", "Midjourney Inc", "MJ",
  ],
  minimax: [
    "MiniMax", "Mini Max", "MiniMax AI", "Hailuo AI",
  ],
  luma: [
    "Luma AI", "Luma", "Luma Labs", "LumaLabs", "Dream Machine",
  ],
  elevenlabs: [
    "ElevenLabs", "Eleven Labs", "ElevenLabs Inc",
  ],
  "stability-ai": [
    "Stability AI", "Stable Diffusion", "StabilityAI",
  ],
  "character-ai": [
    "Character.AI", "Character AI", "Character Technologies",
  ],
  "cohere": [
    "Cohere", "Cohere Inc", "Cohere AI",
  ],
  "scale-ai": [
    "Scale AI", "Scale", "Scale AI Inc",
  ],
  groq: [
    "Groq Inc", "Groq LPU", "GroqCloud",
  ],
  databricks: [
    "Databricks Inc", "MosaicML", "Databricks Mosaic",
  ],
};

// Reverse alias → canonical ID lookup (lowercase)
const reverseAliasMap = new Map<string, string>();
for (const [id, aliases] of Object.entries(ENTITY_ALIASES)) {
  reverseAliasMap.set(id.toLowerCase(), id);
  for (const alias of aliases) {
    reverseAliasMap.set(alias.toLowerCase(), id);
  }
}

/**
 * Try to resolve a mention string to a canonical entity ID.
 * Only returns matches that exist in `knownIds`.
 */
export function resolveEntityAlias(mention: string, knownIds: Set<string>): string | null {
  if (!mention) return null;
  const lower = mention.toLowerCase().trim();
  if (knownIds.has(mention)) return mention;
  const exact = reverseAliasMap.get(lower);
  if (exact && knownIds.has(exact)) return exact;
  return null;
}

/**
 * Build a company context string that includes aliases for the AI prompt.
 * The AI uses these to map article mentions to canonical IDs.
 */
export function buildCompanyContextWithAliases(
  nodes: Array<{ id: string; name: string; sector: string }>,
): string {
  return nodes.map((n) => {
    const aliases = ENTITY_ALIASES[n.id];
    const aliasSuffix = aliases && aliases.length > 0
      ? ` | aliases: ${aliases.slice(0, 6).join(", ")}`
      : "";
    return `${n.id}: ${n.name}${aliasSuffix} [${n.sector}]`;
  }).join("\n");
}

/**
 * Node IDs that represent news outlets — used for reflexivity detection.
 * A deal edge is "reflexive" when the reporting outlet is itself a graph node
 * that has financial relationships with the deal participants.
 */
export const NEWS_OUTLET_NODE_IDS = new Set([
  "nyt", "news-corp", "axel-springer", "conde-nast", "vox-media",
  "the-atlantic", "ft", "le-monde", "ap", "reddit",
  "washington-post", "guardian", "reuters", "bbc",
  "comcast", "fox-corp", "paramount-global",
  "dotdash-meredith", "time-magazine", "hearst", "semafor",
  "gannett",
]);

/**
 * Domains that sit behind a hard paywall (only RSS headline + snippet available).
 */
export const PAYWALLED_DOMAINS = new Set([
  "bloomberg.com", "ft.com", "wsj.com", "economist.com",
  "theinformation.com", "puck.news", "foreignaffairs.com",
  "theathletic.com",
]);

export function isPaywalledUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return [...PAYWALLED_DOMAINS].some((d) => url.includes(d));
}
