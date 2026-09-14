import raw from "../data/site.json";

export type Provider = { name: string; slug: string; logo: string | null };
export type Providers = { flatrate: Provider[]; rent: Provider[]; buy: Provider[]; free: Provider[] };
export type Tmdb = {
  id: number; media: "movie" | "tv"; poster: string | null; backdrop: string | null; overview: string; tagline: string;
  runtime: number | null; seasons: number | null; rating: number | null; votes: number; release_date: string | null;
  genres: string[]; language: string | null; countries: string[]; trailer: string | null; providers: Providers; providers_refreshed_at: string;
  imdb_id: string | null; ratings: Ratings | null;
};
export type Ratings = { imdb: number | null; imdb_votes: number | null; rt: number | null; metacritic: number | null; refreshed_at: string };
export type Film = {
  key: string; title: string; year: number | null; original_title: string | null; director: string | null; media: string;
  tmdb: Tmdb | null; ott_seen: string | null; moods: string[]; blurbs: { collection: string; kind: string; text: string }[]; collections: string[];
};
export type Entry = { key: string; position: number; text: string | null; tier: string | null; status?: "sorted" | "radar" | "coming"; release?: string | null };
export type Collection = {
  slug: string; title: string; kicker: string | null; kind: string; category: string | null; media: string; layout: string;
  country: string | null; countryName: string | null; region: string | null; language: string | null; year: number | null;
  legend: Record<string, string> | null; curator: string; intro: string; published: string | null;
  source: { type: string; permalink: string | null; posted?: string[] } | null; cover: string | null; count: number; films: Entry[];
};

export const data = raw as unknown as {
  site: Record<string, string>; moods: Record<string, { label: string; line: string }>;
  curators: Record<string, { name: string; handle: string; url: string; bio: string }>;
  collections: Collection[]; films: Record<string, Film>; byMood: Record<string, string[]>;
  platforms: Record<string, { slug: string; name: string; logo: string | null; films: string[] }>;
  countries: { slug: string; country: string; name: string; language: string; category: string; count: number; cover: string | null }[];
  discover: null | { generated_at: string; region: string; year: number; streaming: any[]; upcoming: any[] };
  search: { t: string; s: string; n: string; k: string }[];
  stats: Record<string, any>;
  tonight: { start: string; order: string[] };
};

export const site = data.site;
export const film = (key: string): Film => data.films[key];
export const collection = (slug: string) => data.collections.find((c) => c.slug === slug);
export const collectionsOf = (kind: string) => data.collections.filter((c) => c.kind === kind);

export const IMG = "https://image.tmdb.org/t/p/";
export const poster = (f: Film | null | undefined, size = "w342") => f?.tmdb?.poster ? `${IMG}${size}${f.tmdb.poster}` : null;
export const backdrop = (f: Film | null | undefined, size = "w1280") => f?.tmdb?.backdrop ? `${IMG}${size}${f.tmdb.backdrop}` : null;
export const coverOf = (c: Collection, size = "w1280") => c.cover ? backdrop(film(c.cover), size) : null;

/** deterministic hue so poster fallbacks are varied but stable */
export function hue(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
  return h;
}

/** Base path (GitHub Pages project preview lives under /<repo>/; the real domain is /). Always ends with "/". */
export const BASE = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
/** Prefix a site-absolute path ("/lists/x/") with the base path. */
export const href = (p: string) => BASE + p.replace(/^\//, "");
export const filmUrl = (key: string) => href(`/film/${key}/`);
export const listUrl = (slug: string) => {
  const c = data.collections.find((x) => x.slug === slug);
  return c?.kind === "year" ? href(`/${c.year}/`) : href(`/lists/${slug}/`);
};
export const moodUrl = (m: string) => href(`/mood/${m}/`);
export const platformUrl = (slug: string) => href(`/watch/${slug}/`);

/**
 * Deep link into a streaming platform for one film. Platforms do not publish stable per-title
 * URLs through TMDB/JustWatch, so this opens the platform's own search for the title, which lands
 * one tap from the film. Unknown platforms fall back to JustWatch India, which does have the exact link.
 */
export function providerLink(p: Provider, f: Film): string {
  const q = encodeURIComponent(f.title);
  const qy = encodeURIComponent(f.year ? `${f.title} ${f.year}` : f.title);
  const map: Record<string, string> = {
    "netflix": `https://www.netflix.com/search?q=${q}`,
    "prime-video": `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${q}`,
    "jiohotstar": `https://www.hotstar.com/in/search?q=${q}`,
    "zee5": `https://www.zee5.com/search?q=${q}`,
    "sonyliv": `https://www.sonyliv.com/search?q=${q}`,
    "apple-tv": `https://tv.apple.com/in/search?term=${q}`,
    "mubi": `https://mubi.com/en/in/search/films?query=${q}`,
    "lionsgate-play": `https://www.lionsgateplay.com/search?q=${q}`,
    "google-play": `https://play.google.com/store/search?q=${q}&c=movies`,
    "youtube": `https://www.youtube.com/results?search_query=${qy}`,
    "sun-nxt": `https://www.sunnxt.com/search?q=${q}`,
    "aha": `https://www.aha.video/search?q=${q}`,
    "hoichoi": `https://www.hoichoi.tv/search?q=${q}`,
    "manoramamax": `https://www.manoramamax.com/search?q=${q}`,
    "eros-now": `https://erosnow.com/search?q=${q}`,
    "crunchyroll": `https://www.crunchyroll.com/search?q=${q}`,
    "bookmyshow": `https://in.bookmyshow.com/stream/search?q=${q}`,
  };
  return map[p.slug] || `https://www.justwatch.com/in/search?q=${q}`;
}
export const imdbUrl = (f: Film) => (f.tmdb?.imdb_id ? `https://www.imdb.com/title/${f.tmdb.imdb_id}/` : null);

export function runtimeLabel(f: Film) {
  const t = f.tmdb;
  if (!t) return null;
  if (t.media === "tv") return t.seasons ? `${t.seasons} season${t.seasons > 1 ? "s" : ""}` : "Series";
  if (!t.runtime) return null;
  const h = Math.floor(t.runtime / 60), m = t.runtime % 60;
  return h ? `${h}h ${m ? m + "m" : ""}`.trim() : `${m}m`;
}

export function watchSummary(f: Film): { kind: "on" | "rent" | "unknown" | "none"; items: Provider[] } {
  const p = f.tmdb?.providers;
  if (!p) return { kind: "unknown", items: [] };
  if (p.flatrate.length || p.free.length) return { kind: "on", items: [...p.flatrate, ...p.free] };
  if (p.rent.length || p.buy.length) return { kind: "rent", items: dedupe([...p.rent, ...p.buy]) };
  return { kind: "none", items: [] };
}
function dedupe(items: Provider[]) { const s = new Set<string>(); return items.filter((i) => (s.has(i.slug) ? false : (s.add(i.slug), true))); }

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function dateLabel(iso: string | null | undefined) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return { day: d, month: MONTHS[(m || 1) - 1], year: y };
}

/** The text a film page leads with: prefer the longest editorial paragraph we wrote. */
export function leadText(f: Film) {
  const b = [...f.blurbs].sort((a, b) => b.text.length - a.text.length)[0];
  return b || null;
}

/** Collections that make good home rails, in the order we want them. */
export function homeRails() {
  const world = data.collections.filter((c) => c.kind === "world" && c.category === "world");
  const india = data.collections.filter((c) => c.kind === "world" && c.category === "india");
  const archive = data.collections.filter((c) => c.kind === "archive").sort((a, b) => (b.published || "").localeCompare(a.published || ""));
  return { world, india, archive };
}

/** Day index → film key for the Tonight pick. */
export function tonightKey(dayIndex: number) { const o = data.tonight.order; return o[((dayIndex % o.length) + o.length) % o.length]; }
export function addDays(iso: string, n: number) { const d = new Date(Date.parse(iso) + n * 864e5); return d.toISOString().slice(0, 10); }
export const TONIGHT_DAYS = 420;
