import { getCoverageStart } from "../graph/coverage";

export interface FeedConfig {
  url: string;
  feedSource: string;
  outletName: string;
}

/**
 * Outlets behind a hard paywall — only headline + RSS snippet available.
 * The extractor uses this to be conservative about hallucinating deal details.
 */
export const PAYWALLED_OUTLETS = new Set([
  "Bloomberg",
  "Financial Times",
  "The Wall Street Journal",
  "The Economist",
  "The Information",
  "Puck",
  "Foreign Affairs",
]);

/**
 * Domain → outlet name for resolving the true source of Google News articles.
 * Add new outlets here; no other change needed in the fetcher.
 */
export const OUTLET_DOMAIN_MAP: Array<{ domain: string; name: string }> = [
  // Tier-1 finance / business (paywalled)
  { domain: "bloomberg.com", name: "Bloomberg" },
  { domain: "ft.com", name: "Financial Times" },
  { domain: "wsj.com", name: "The Wall Street Journal" },
  { domain: "economist.com", name: "The Economist" },
  { domain: "theinformation.com", name: "The Information" },
  { domain: "puck.news", name: "Puck" },
  { domain: "foreignaffairs.com", name: "Foreign Affairs" },
  // Wire services
  { domain: "reuters.com", name: "Reuters" },
  { domain: "apnews.com", name: "Associated Press" },
  { domain: "ap.org", name: "Associated Press" },
  // Tech / AI
  { domain: "techcrunch.com", name: "TechCrunch" },
  { domain: "theverge.com", name: "The Verge" },
  { domain: "wired.com", name: "Wired" },
  { domain: "arstechnica.com", name: "Ars Technica" },
  { domain: "cnbc.com", name: "CNBC" },
  { domain: "axios.com", name: "Axios" },
  { domain: "semafor.com", name: "Semafor" },
  { domain: "404media.co", name: "404 Media" },
  { domain: "restofworld.org", name: "Rest of World" },
  { domain: "fastcompany.com", name: "Fast Company" },
  { domain: "fortune.com", name: "Fortune" },
  { domain: "theatlantic.com", name: "The Atlantic" },
  // General news
  { domain: "nytimes.com", name: "The New York Times" },
  { domain: "washingtonpost.com", name: "The Washington Post" },
  { domain: "theguardian.com", name: "The Guardian" },
  { domain: "bbc.com", name: "BBC" },
  { domain: "bbc.co.uk", name: "BBC" },
  { domain: "npr.org", name: "NPR" },
  { domain: "usatoday.com", name: "USA Today" },
  { domain: "nbcnews.com", name: "NBC News" },
  { domain: "cbsnews.com", name: "CBS News" },
  { domain: "abcnews.go.com", name: "ABC News" },
  { domain: "abcnews.com", name: "ABC News" },
  { domain: "cnn.com", name: "CNN" },
  { domain: "msnbc.com", name: "MSNBC" },
  { domain: "foxnews.com", name: "Fox News" },
  { domain: "foxbusiness.com", name: "Fox Business" },
  { domain: "politico.com", name: "Politico" },
  { domain: "thehill.com", name: "The Hill" },
  { domain: "axios.com", name: "Axios" },
  { domain: "vox.com", name: "Vox" },
  { domain: "slate.com", name: "Slate" },
  { domain: "huffpost.com", name: "HuffPost" },
  { domain: "thedailybeast.com", name: "The Daily Beast" },
  { domain: "newsweek.com", name: "Newsweek" },
  { domain: "businessinsider.com", name: "Business Insider" },
  { domain: "propublica.org", name: "ProPublica" },
  { domain: "intercept.com", name: "The Intercept" },
  { domain: "motherjones.com", name: "Mother Jones" },
  { domain: "jacobin.com", name: "Jacobin" },
  { domain: "thenation.com", name: "The Nation" },
  { domain: "newrepublic.com", name: "The New Republic" },
  { domain: "theatlantic.com", name: "The Atlantic" },
  { domain: "time.com", name: "TIME" },
  // Media / entertainment trade
  { domain: "variety.com", name: "Variety" },
  { domain: "hollywoodreporter.com", name: "The Hollywood Reporter" },
  { domain: "deadline.com", name: "Deadline" },
  { domain: "niemanlab.org", name: "Nieman Lab" },
  { domain: "cjr.org", name: "Columbia Journalism Review" },
  // Finance / markets
  { domain: "forbes.com", name: "Forbes" },
  { domain: "marketwatch.com", name: "MarketWatch" },
  // Press releases
  { domain: "newsroom.microsoft.com", name: "Press Release" },
  { domain: "blog.google", name: "Press Release" },
  { domain: "about.google", name: "Press Release" },
  { domain: "openai.com", name: "Press Release" },
  { domain: "anthropic.com", name: "Press Release" },
  { domain: "newsroom.tiktok.com", name: "Press Release" },
  { domain: "investor.apple.com", name: "Press Release" },
  { domain: "ir.aboutamazon.com", name: "Press Release" },
  { domain: "press.aboutamazon.com", name: "Press Release" },
  { domain: "newsroom.meta.com", name: "Press Release" },
  { domain: "news.microsoft.com", name: "Press Release" },
  { domain: "nvidianews.nvidia.com", name: "Press Release" },
  { domain: "investor.nvidia.com", name: "Press Release" },
  { domain: "newsroom.snap.com", name: "Press Release" },
];

// ─── RSS Feed List ────────────────────────────────────────────────────────────
// Format: direct RSS feeds + Google News scoped/topic queries.
// Run in parallel; per-feed failures are silent and don't block others.

export const RSS_FEEDS: FeedConfig[] = [

  // ══ DIRECT RSS FEEDS (free, open access) ════════════════════════════════════

  // Tech / AI trade press
  {
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    feedSource: "techcrunch-ai",
    outletName: "TechCrunch",
  },
  {
    url: "https://techcrunch.com/category/venture/feed/",
    feedSource: "techcrunch-venture",
    outletName: "TechCrunch",
  },
  {
    url: "https://www.theverge.com/rss/index.xml",
    feedSource: "the-verge",
    outletName: "The Verge",
  },
  {
    url: "https://www.wired.com/feed/category/business/latest/rss",
    feedSource: "wired-business",
    outletName: "Wired",
  },
  {
    url: "https://news.google.com/rss/search?q=site:wired.com+artificial+intelligence+investment&hl=en-US&gl=US&ceid=US:en",
    feedSource: "wired-ai",
    outletName: "Wired",
  },
  {
    url: "https://feeds.arstechnica.com/arstechnica/technology-lab",
    feedSource: "ars-tech",
    outletName: "Ars Technica",
  },
  {
    url: "https://www.cnbc.com/id/19854910/device/rss/rss.html",
    feedSource: "cnbc-tech",
    outletName: "CNBC",
  },
  {
    url: "https://www.cnbc.com/id/10001147/device/rss/rss.html",
    feedSource: "cnbc-media",
    outletName: "CNBC",
  },
  {
    url: "https://api.axios.com/feed/",
    feedSource: "axios",
    outletName: "Axios",
  },
  {
    url: "https://www.fastcompany.com/technology/rss",
    feedSource: "fast-company-tech",
    outletName: "Fast Company",
  },
  {
    url: "https://fortune.com/feed/fortune-feeds/?id=3230629",
    feedSource: "fortune-tech",
    outletName: "Fortune",
  },
  {
    url: "https://news.google.com/rss/search?q=site:semafor.com+AI+media+deal&hl=en-US&gl=US&ceid=US:en",
    feedSource: "semafor",
    outletName: "Semafor",
  },
  {
    url: "https://www.404media.co/feed/",
    feedSource: "404media",
    outletName: "404 Media",
  },
  {
    url: "https://restofworld.org/feed/latest/",
    feedSource: "rest-of-world",
    outletName: "Rest of World",
  },
  {
    url: "https://www.niemanlab.org/feed/",
    feedSource: "nieman-lab",
    outletName: "Nieman Lab",
  },
  {
    url: "https://www.cjr.org/feed/",
    feedSource: "cjr",
    outletName: "Columbia Journalism Review",
  },
  // Media / entertainment trade press
  {
    url: "https://variety.com/feed/",
    feedSource: "variety",
    outletName: "Variety",
  },
  {
    url: "https://www.hollywoodreporter.com/feed/",
    feedSource: "hollywood-reporter",
    outletName: "The Hollywood Reporter",
  },
  {
    url: "https://deadline.com/feed/",
    feedSource: "deadline",
    outletName: "Deadline",
  },
  // General news (open RSS)
  {
    url: "https://feeds.npr.org/1019/rss.xml",
    feedSource: "npr-media",
    outletName: "NPR",
  },
  {
    url: "https://feeds.npr.org/1001/rss.xml",
    feedSource: "npr-tech",
    outletName: "NPR",
  },
  {
    url: "https://www.theguardian.com/technology/rss",
    feedSource: "guardian-tech",
    outletName: "The Guardian",
  },
  {
    url: "https://www.theguardian.com/media/rss",
    feedSource: "guardian-media",
    outletName: "The Guardian",
  },
  {
    url: "https://feeds.bbci.co.uk/news/technology/rss.xml",
    feedSource: "bbc-tech",
    outletName: "BBC",
  },
  {
    url: "https://feeds.propublica.org/propublica/main",
    feedSource: "propublica",
    outletName: "ProPublica",
  },
  {
    url: "https://theintercept.com/feed/?rss",
    feedSource: "the-intercept",
    outletName: "The Intercept",
  },
  {
    url: "https://www.motherjones.com/feed/",
    feedSource: "mother-jones",
    outletName: "Mother Jones",
  },
  {
    url: "https://news.google.com/rss/search?q=site:politico.com+AI+media+tech+deal&hl=en-US&gl=US&ceid=US:en",
    feedSource: "politico",
    outletName: "Politico",
  },
  {
    url: "https://thehill.com/feed/",
    feedSource: "the-hill",
    outletName: "The Hill",
  },
  {
    url: "https://www.vox.com/rss/index.xml",
    feedSource: "vox",
    outletName: "Vox",
  },
  {
    url: "https://slate.com/feeds/all.rss",
    feedSource: "slate",
    outletName: "Slate",
  },
  {
    url: "https://www.theatlantic.com/feed/all/",
    feedSource: "the-atlantic",
    outletName: "The Atlantic",
  },
  {
    url: "https://time.com/feed/",
    feedSource: "time-magazine",
    outletName: "TIME",
  },
  {
    url: "https://www.forbes.com/innovation/feed/",
    feedSource: "forbes-tech",
    outletName: "Forbes",
  },
  {
    url: "https://www.marketwatch.com/rss/topstories",
    feedSource: "marketwatch",
    outletName: "MarketWatch",
  },

  // ══ GOOGLE NEWS — TOPIC QUERIES ═════════════════════════════════════════════

  // Core AI funding + deal topics
  {
    url: "https://news.google.com/rss/search?q=AI+funding+investment+deal+billion&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-ai-funding",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=OpenAI+OR+Anthropic+funding+investment+OR+acquisition+OR+licensing&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-ai-labs",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=media+company+AI+licensing+deal+OR+partnership+billion&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-media-ai",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=tech+company+media+acquisition+OR+investment+AI+content+deal&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-tech-media",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=AI+content+licensing+copyright+publisher+deal&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-ai-copyright",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=AI+startup+raises+funding+round+venture+capital&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-ai-vc",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=generative+AI+media+partnership+OR+acquisition+OR+investment&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-genai-media",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=AI+infrastructure+compute+deal+cloud+GPU&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-ai-infra",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=AI+lawsuit+copyright+training+data+publisher&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-ai-lawsuit",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=Nvidia+investment+OR+stake+OR+deal+AI+company&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-nvidia-deals",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=Microsoft+AI+deal+OR+investment+OR+acquisition+2024+2025&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-msft-ai",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=Google+Alphabet+AI+deal+OR+investment+OR+acquisition&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-google-ai",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=Meta+AI+deal+OR+investment+OR+partnership+media&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-meta-ai",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=streaming+media+AI+deal+OR+partnership+OR+acquisition+content&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-streaming-ai",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=news+publisher+AI+training+data+deal+OR+agreement&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-news-ai-data",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=music+rights+AI+licensing+OR+lawsuit+OR+deal&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-music-ai",
    outletName: "Google News",
  },

  // ══ GOOGLE NEWS — PAYWALLED SITE-SCOPED QUERIES ══════════════════════════════

  // Bloomberg
  {
    url: "https://news.google.com/rss/search?q=site:bloomberg.com+AI+funding+OR+investment+OR+acquisition+OR+deal&hl=en-US&gl=US&ceid=US:en",
    feedSource: "bloomberg-ai",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=site:bloomberg.com+tech+media+AI+licensing+OR+partnership+OR+content&hl=en-US&gl=US&ceid=US:en",
    feedSource: "bloomberg-media",
    outletName: "Google News",
  },
  // Financial Times
  {
    url: "https://news.google.com/rss/search?q=site:ft.com+AI+funding+OR+investment+OR+acquisition+billion&hl=en-US&gl=US&ceid=US:en",
    feedSource: "ft-ai",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=site:ft.com+tech+media+AI+licensing+OR+deal+OR+partnership&hl=en-US&gl=US&ceid=US:en",
    feedSource: "ft-media",
    outletName: "Google News",
  },
  // Wall Street Journal
  {
    url: "https://news.google.com/rss/search?q=site:wsj.com+AI+funding+OR+investment+OR+acquisition+deal&hl=en-US&gl=US&ceid=US:en",
    feedSource: "wsj-ai",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=site:wsj.com+tech+media+AI+OR+licensing+OR+partnership+deal&hl=en-US&gl=US&ceid=US:en",
    feedSource: "wsj-media",
    outletName: "Google News",
  },
  // The Economist
  {
    url: "https://news.google.com/rss/search?q=site:economist.com+AI+funding+OR+investment+OR+deal+technology&hl=en-US&gl=US&ceid=US:en",
    feedSource: "economist-ai",
    outletName: "Google News",
  },
  // The Information
  {
    url: "https://news.google.com/rss/search?q=site:theinformation.com+AI+funding+OR+investment+OR+deal+OR+acquisition&hl=en-US&gl=US&ceid=US:en",
    feedSource: "the-information-ai",
    outletName: "Google News",
  },
  // New York Times
  {
    url: "https://news.google.com/rss/search?q=site:nytimes.com+AI+deal+OR+investment+OR+partnership+media+technology&hl=en-US&gl=US&ceid=US:en",
    feedSource: "nyt-ai",
    outletName: "Google News",
  },
  // Washington Post
  {
    url: "https://news.google.com/rss/search?q=site:washingtonpost.com+AI+deal+OR+investment+OR+licensing+technology+media&hl=en-US&gl=US&ceid=US:en",
    feedSource: "wapo-ai",
    outletName: "Google News",
  },
  // Puck
  {
    url: "https://news.google.com/rss/search?q=site:puck.news+AI+deal+OR+media+OR+technology&hl=en-US&gl=US&ceid=US:en",
    feedSource: "puck-ai",
    outletName: "Google News",
  },

  // ══ UNDATED BROAD DEAL QUERY ═════════════════════════════════════════
  // Month-scoped backfill queries are generated by monthlyBackfillFeeds()
  // below so they always track the rolling coverage window.

  {
    url: "https://news.google.com/rss/search?q=AI+investment+acquisition+2025+OR+2026+billion+deal&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-2025-2026-deals",
    outletName: "Google News",
  },

  // ══ PER-ENTITY TARGETED QUERIES ══════════════════════════════════════════

  // OpenAI
  {
    url: "https://news.google.com/rss/search?q=OpenAI+deal+OR+contract+OR+licensing+OR+acquisition+2025+2026&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-openai-deals",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=OpenAI+government+OR+Pentagon+OR+DoD+OR+military+contract&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-openai-gov",
    outletName: "Google News",
  },
  // Anthropic
  {
    url: "https://news.google.com/rss/search?q=Anthropic+Claude+deal+OR+licensing+OR+investment+OR+partnership+2025+2026&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-anthropic-deals",
    outletName: "Google News",
  },
  // Nvidia
  {
    url: "https://news.google.com/rss/search?q=Nvidia+investment+OR+acquisition+OR+stake+AI+startup+2025+2026&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-nvidia-invest",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=Nvidia+Blackwell+OR+GPU+deal+OR+contract+cloud+2025+2026&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-nvidia-blackwell",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=Nvidia+CHIPS+Act+OR+semiconductor+OR+foundry+OR+Intel+deal&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-nvidia-chips",
    outletName: "Google News",
  },
  // SoftBank
  {
    url: "https://news.google.com/rss/search?q=SoftBank+AI+investment+OR+OpenAI+OR+Stargate+OR+Vision+Fund+2025+2026&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-softbank-ai",
    outletName: "Google News",
  },
  // xAI
  {
    url: "https://news.google.com/rss/search?q=xAI+Grok+OR+Elon+Musk+AI+investment+OR+deal+OR+contract+2025+2026&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-xai-deals",
    outletName: "Google News",
  },
  // Mistral
  {
    url: "https://news.google.com/rss/search?q=Mistral+AI+investment+OR+funding+OR+deal+OR+partnership+2025+2026&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-mistral-deals",
    outletName: "Google News",
  },

  // ══ US GOVERNMENT / CHIPS ACT / DOD AI ═══════════════════════════════════

  {
    url: "https://news.google.com/rss/search?q=CHIPS+Act+semiconductor+funding+grant+award+2024+2025&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-chips-act",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=Pentagon+DoD+AI+contract+OR+artificial+intelligence+military+2025+2026&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-dod-ai",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=Stargate+AI+infrastructure+OpenAI+government+OR+White+House+2025&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-stargate-gov",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=US+government+AI+contract+OR+procurement+OR+federal+technology+2025+2026&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-gov-ai-contract",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=Intel+TSMC+Samsung+Micron+CHIPS+Act+semiconductor+funding&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-chips-recipients",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=DoE+OR+DARPA+OR+NSF+AI+research+contract+OR+grant+2025+2026&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-darpa-ai",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=GSA+government+AI+software+contract+OpenAI+OR+Anthropic+OR+Google&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-gsa-ai",
    outletName: "Google News",
  },

  // ══ HOLLYWOOD / AI VIDEO GENERATION ══════════════════════════════════════

  {
    url: "https://news.google.com/rss/search?q=Runway+AI+video+deal+OR+partnership+OR+investment+Hollywood+studio+2025+2026&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-runway-hollywood",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=Midjourney+lawsuit+OR+copyright+OR+AI+image+studio+deal+2025+2026&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-midjourney",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=A24+OR+Lionsgate+AI+deal+OR+partnership+OR+investment+2025+2026&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-indie-studio-ai",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=ElevenLabs+AI+voice+deal+OR+partnership+OR+licensing+2025+2026&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-elevenlabs",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=Luma+AI+OR+MiniMax+OR+Sora+video+generation+deal+OR+investment+2025+2026&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-ai-video-labs",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=Hollywood+studio+AI+partnership+OR+investment+OR+generative+tools+2025+2026&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-hollywood-genai",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=Netflix+OR+Disney+OR+HBO+AI+deal+OR+partnership+OR+investment+2025+2026&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-streaming-ai-deals",
    outletName: "Google News",
  },

  // ══ SEMICONDUCTOR + AI SUPPLY CHAIN ══════════════════════════════════════

  {
    url: "https://news.google.com/rss/search?q=TSMC+AI+chip+OR+GPU+OR+Nvidia+OR+Apple+manufacturing+deal+2025+2026&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-tsmc-ai",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=Intel+foundry+AI+chip+OR+investment+OR+restructuring+2025+2026&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-intel-ai",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=Micron+HBM+OR+memory+AI+Nvidia+OR+supply+deal+2025+2026&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-micron-ai",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=CoreWeave+IPO+OR+cloud+deal+OR+OpenAI+OR+Microsoft+2025+2026&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-coreweave",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=AI+compute+infrastructure+deal+OR+contract+GPU+cloud+2025+2026&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-ai-compute-2025",
    outletName: "Google News",
  },

  // ══ MUSIC + IMAGE RIGHTS ══════════════════════════════════════════════════

  {
    url: "https://news.google.com/rss/search?q=music+rights+AI+deal+OR+licensing+OR+lawsuit+UMG+OR+Sony+OR+Warner+Music+2025+2026&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-music-rights-2025",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=Shutterstock+OR+Getty+Images+AI+licensing+OR+training+deal+2025+2026&hl=en-US&gl=US&ceid=US:en",
    feedSource: "gn-image-rights-ai",
    outletName: "Google News",
  },

  // ══ ADDITIONAL PAYWALLED SOURCES ══════════════════════════════════════════

  {
    url: "https://news.google.com/rss/search?q=site:axios.com+AI+deal+OR+investment+OR+acquisition+funding&hl=en-US&gl=US&ceid=US:en",
    feedSource: "axios-ai-scoped",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=site:techcrunch.com+AI+funding+OR+acquisition+OR+investment+2025+2026&hl=en-US&gl=US&ceid=US:en",
    feedSource: "tc-scoped",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=site:variety.com+AI+deal+OR+partnership+OR+investment+OR+acquisition&hl=en-US&gl=US&ceid=US:en",
    feedSource: "variety-ai",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=site:deadline.com+AI+deal+OR+partnership+OR+acquisition+studio&hl=en-US&gl=US&ceid=US:en",
    feedSource: "deadline-ai",
    outletName: "Google News",
  },
  {
    url: "https://news.google.com/rss/search?q=site:hollywoodreporter.com+AI+deal+OR+partnership+OR+technology&hl=en-US&gl=US&ceid=US:en",
    feedSource: "thr-ai",
    outletName: "Google News",
  },
];

// ─── Rolling month-scoped backfill ────────────────────────────────────────────
// Google News search returns at most ~100 items per query, ranked by
// relevance, so one undated query cannot reach back a full year. One query
// per calendar month per topic covers the whole rolling window, including the
// older months that ordinary RSS feeds no longer carry.

const BACKFILL_TOPICS: Array<{ key: string; query: string }> = [
  { key: "deals", query: 'AI (investment OR acquisition OR acquires OR stake OR "funding round" OR contract)' },
  { key: "media", query: "AI (licensing OR partnership OR lawsuit OR acquisition) (publisher OR studio OR music OR media OR news)" },
];

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function monthlyBackfillFeeds(now: Date = new Date()): FeedConfig[] {
  const start = getCoverageStart(now);
  const feeds: FeedConfig[] = [];
  for (let m = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    m <= now; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) {
    const next = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1));
    const month = ymd(m).slice(0, 7);
    for (const topic of BACKFILL_TOPICS) {
      const q = `${topic.query} after:${ymd(m)} before:${ymd(next)}`;
      feeds.push({
        url: `https://news.google.com/rss/search?${new URLSearchParams({ q, hl: "en-US", gl: "US", ceid: "US:en" })}`,
        feedSource: `gn-backfill-${topic.key}-${month}`,
        outletName: "Google News",
      });
    }
  }
  return feeds;
}

/** Every feed polled this cycle: the static list plus the current month-scoped backfill. */
export function getRssFeeds(now: Date = new Date()): FeedConfig[] {
  return [...RSS_FEEDS, ...monthlyBackfillFeeds(now)];
}
