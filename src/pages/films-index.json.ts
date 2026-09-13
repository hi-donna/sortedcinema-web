import { data, leadText } from "../lib/data";
/** Compact film records for client-side features (Sort me, Passport, Tonight). ~400 rows. */
export function GET() {
  const rows = Object.values(data.films).map((f) => ({
    k: f.key, t: f.title, y: f.year, d: f.director, m: f.moods,
    r: f.tmdb?.runtime ?? null, l: f.tmdb?.language ?? null, c: f.tmdb?.countries ?? [],
    p: f.tmdb?.poster ?? null, on: (f.tmdb?.providers?.flatrate ?? []).map((x) => x.slug),
    b: leadText(f)?.text ?? null, ls: f.collections, tv: f.media === "tv",
  }));
  return new Response(JSON.stringify(rows), { headers: { "Content-Type": "application/json; charset=utf-8" } });
}
