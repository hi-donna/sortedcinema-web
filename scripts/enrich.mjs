#!/usr/bin/env node
/**
 * Resolve every film in content/collections on TMDB and cache what the site
 * needs: poster/backdrop paths, overview, runtime, rating, trailer key, and
 * WHERE IT STREAMS IN INDIA (JustWatch data licensed through TMDB).
 * With OMDB_API_KEY set it also caches IMDb / Rotten Tomatoes / Metacritic scores
 * (OMDb, free tier: 1,000 calls a day, refreshed on the same weekly cadence as providers).
 *
 *   TMDB_API_KEY=... node scripts/enrich.mjs [--force] [--max-age-days 7] [--only <key>] [--no-discover]
 *
 * Contract:
 *  - Identity (which TMDB record a film is) is cached forever in data/tmdb/<key>.json
 *    unless --force. Providers are refreshed when older than --max-age-days.
 *  - A film that cannot be matched confidently is written to data/unresolved.json
 *    with the candidates TMDB offered, and is NOT guessed. Fix it in
 *    content/overrides.json ({ "<key>": { "tmdb_id": 123, "media": "movie" } }).
 *  - The site never calls TMDB at request time; this script is the only network.
 *  - Never writes into content/ (the curated source of truth).
 */
import fs from "node:fs";
import path from "node:path";
import {
  CONTENT, DATA, TMDB_CACHE, readJson, writeJson, loadCollections, filmKey, slugify, foldProvider,
} from "./lib.mjs";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };

const KEY = process.env.TMDB_API_KEY;
if (!KEY) { console.error("TMDB_API_KEY is not set"); process.exit(2); }
const OMDB = process.env.OMDB_API_KEY || null;
const FORCE = flag("--force");
const MAX_AGE_DAYS = Number(opt("--max-age-days", 7));
const ONLY = opt("--only", null);
const DISCOVER = !flag("--no-discover");
const REGION = process.env.SC_REGION || "IN";
const BASE = "https://api.themoviedb.org/3";

const overrides = readJson(path.join(CONTENT, "overrides.json"), {});

// ---------------------------------------------------------------- HTTP
const isBearer = KEY.startsWith("eyJ");
async function tmdb(p, params = {}, attempt = 0) {
  const url = new URL(BASE + p);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, v);
  if (!isBearer) url.searchParams.set("api_key", KEY);
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(url, { headers: isBearer ? { Authorization: `Bearer ${KEY}` } : {}, signal: ctl.signal });
    if (res.status === 429 || res.status >= 500) {
      if (attempt < 4) { await sleep(1000 * 2 ** attempt); return tmdb(p, params, attempt + 1); }
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`TMDB ${res.status} for ${p}`);
    return await res.json();
  } finally { clearTimeout(t); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** IMDb / Rotten Tomatoes / Metacritic via OMDb. Returns null when the key is missing or the call fails. */
async function omdbRatings(imdbId) {
  if (!OMDB || !imdbId) return null;
  try {
    const res = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB}`);
    if (!res.ok) return null;
    const j = await res.json();
    if (j.Response === "False") return null;
    const num = (s) => { const n = parseFloat(String(s || "").replace(/,/g, "")); return Number.isFinite(n) ? n : null; };
    const src = (name) => (j.Ratings || []).find((r) => r.Source === name)?.Value || null;
    return {
      imdb: num(j.imdbRating), imdb_votes: num(j.imdbVotes),
      rt: num(src("Rotten Tomatoes")), metacritic: num(src("Metacritic")),
      refreshed_at: new Date().toISOString(),
    };
  } catch { return null; }
}

// ---------------------------------------------------------------- matching
const norm = (s) => slugify(s || "").replace(/-/g, "");
function yearOf(r) { return Number(String(r.release_date || r.first_air_date || "").slice(0, 4)) || null; }
function nameOf(r) { return r.title || r.name || ""; }
function origNameOf(r) { return r.original_title || r.original_name || ""; }

function score(cand, film) {
  const y = yearOf(cand);
  const dy = film.year && y ? Math.abs(y - film.year) : (film.year ? 3 : 0);
  const t = norm(film.title);
  const titleHit = norm(nameOf(cand)) === t || norm(origNameOf(cand)) === t
    || (film.original_title && norm(origNameOf(cand)) === norm(film.original_title));
  let s = 0;
  if (titleHit) s += 10;
  else if (norm(nameOf(cand)).startsWith(t) || t.startsWith(norm(nameOf(cand)))) s += 4;
  if (dy === 0) s += 6; else if (dy === 1) s += 3; else if (dy >= 3) s -= 4;
  s += Math.min(cand.vote_count || 0, 5000) / 5000; // tie-break
  return s;
}

async function search(film, media) {
  const q = film.title;
  const yearParam = media === "movie" ? { primary_release_year: film.year } : { first_air_date_year: film.year };
  let r = await tmdb(`/search/${media}`, { query: q, ...yearParam, include_adult: false });
  let results = r?.results || [];
  if (!results.length) { r = await tmdb(`/search/${media}`, { query: q, include_adult: false }); results = r?.results || []; }
  return results.map((c) => ({ c, s: score(c, film), media }));
}

async function resolve(film, mediaPref) {
  const ov = overrides[film.key];
  if (ov?.tmdb_id) return { id: ov.tmdb_id, media: ov.media || mediaPref, via: "override" };
  const order = mediaPref === "tv" ? ["tv", "movie"] : ["movie", "tv"];
  let all = [];
  for (const m of order) {
    const found = await search(film, m);
    all.push(...found);
    const best = found.sort((a, b) => b.s - a.s)[0];
    if (best && best.s >= 12) return { id: best.c.id, media: m, via: "search", score: best.s }; // title + year agree
  }
  all.sort((a, b) => b.s - a.s);
  const best = all[0];
  // Title matched but year disagrees by a year or two (regional release years differ): accept with a note.
  if (best && best.s >= 10) return { id: best.c.id, media: best.media, via: "search-titleonly", score: best.s };
  return { unresolved: true, candidates: all.slice(0, 5).map(({ c, s, media }) => ({ tmdb_id: c.id, media, title: nameOf(c), original_title: origNameOf(c), year: yearOf(c), score: Number(s.toFixed(1)) })) };
}

// ---------------------------------------------------------------- details
function providersFrom(details) {
  const inr = details?.["watch/providers"]?.results?.[REGION];
  const out = { flatrate: [], rent: [], buy: [], free: [] };
  if (!inr) return out;
  const seen = new Set();
  for (const kind of ["flatrate", "ads", "free", "rent", "buy"]) {
    for (const p of inr[kind] || []) {
      const name = foldProvider(p.provider_name);
      if (!name) continue;
      const bucket = kind === "ads" ? "flatrate" : kind;
      const id = `${bucket}:${name}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out[bucket].push({ name, slug: slugify(name), logo: p.logo_path || null });
    }
  }
  return out;
}

function trailerFrom(details) {
  const vids = details?.videos?.results || [];
  const yt = vids.filter((v) => v.site === "YouTube");
  const pick = yt.find((v) => v.type === "Trailer" && v.official) || yt.find((v) => v.type === "Trailer") || yt.find((v) => v.type === "Teaser");
  return pick?.key || null;
}

async function fetchDetails(id, media) {
  const d = await tmdb(`/${media}/${id}`, { append_to_response: "videos,watch/providers,external_ids" });
  if (!d) return null;
  const isTv = media === "tv";
  const imdb_id = d.imdb_id || d.external_ids?.imdb_id || null;
  const ratings = await omdbRatings(imdb_id);
  return {
    tmdb_id: d.id,
    media,
    title: nameOf(d),
    original_title: origNameOf(d),
    year: yearOf(d),
    release_date: d.release_date || d.first_air_date || null,
    runtime: isTv ? (Array.isArray(d.episode_run_time) ? d.episode_run_time[0] || null : null) : (d.runtime || null),
    seasons: isTv ? d.number_of_seasons || null : undefined,
    overview: d.overview || "",
    tagline: d.tagline || "",
    genres: (d.genres || []).map((g) => g.name),
    original_language: d.original_language || null,
    origin_country: d.origin_country || (d.production_countries || []).map((c) => c.iso_3166_1),
    vote_average: d.vote_average ? Number(d.vote_average.toFixed(1)) : null,
    vote_count: d.vote_count || 0,
    popularity: d.popularity || 0,
    poster_path: d.poster_path || null,
    backdrop_path: d.backdrop_path || null,
    trailer_key: trailerFrom(d),
    imdb_id,
    ratings,
    providers: providersFrom(d),
    providers_refreshed_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------- main
async function main() {
  fs.mkdirSync(TMDB_CACHE, { recursive: true });
  const collections = loadCollections();
  const films = new Map(); // key -> {key,title,year,original_title,media}
  for (const c of collections) {
    for (const f of c.films) {
      const key = filmKey(f.title, f.year);
      if (!films.has(key)) films.set(key, { key, title: f.title, year: f.year || null, original_title: f.original_title || null, media: f.media || c.media || "movie" });
    }
  }
  const list = [...films.values()].filter((f) => !ONLY || f.key === ONLY);
  console.log(`enrich: ${list.length} films, region ${REGION}, force=${FORCE}, maxAge=${MAX_AGE_DAYS}d, omdb=${OMDB ? "on" : "off"}`);

  const unresolved = [];
  let resolvedNow = 0, refreshed = 0, cached = 0, failed = 0;
  const now = Date.now();
  const stale = (rec) => !rec?.providers_refreshed_at || (now - Date.parse(rec.providers_refreshed_at)) > MAX_AGE_DAYS * 864e5
    || rec.imdb_id === undefined                       // cached before IMDb ids were kept
    || (OMDB && rec.imdb_id && !rec.ratings);           // key newly available: fill ratings in

  // modest concurrency: TMDB is generous, but this runs unattended
  const queue = [...list];
  const worker = async () => {
    while (queue.length) {
      const f = queue.shift();
      const cachePath = path.join(TMDB_CACHE, f.key + ".json");
      let rec = readJson(cachePath, null);
      try {
        if (rec && !FORCE && !stale(rec)) { cached++; continue; }
        let id = rec?.tmdb_id, media = rec?.media;
        if (!id || FORCE || overrides[f.key]) {
          const r = await resolve(f, f.media);
          if (r.unresolved) {
            unresolved.push({ key: f.key, title: f.title, year: f.year, candidates: r.candidates });
            failed++;
            continue;
          }
          id = r.id; media = r.media;
          rec = { ...(rec || {}), resolved_via: r.via, resolved_score: r.score };
          resolvedNow++;
        } else { refreshed++; }
        const d = await fetchDetails(id, media);
        if (!d) { unresolved.push({ key: f.key, title: f.title, year: f.year, error: "details 404" }); failed++; continue; }
        writeJson(cachePath, { key: f.key, query: { title: f.title, year: f.year }, resolved_via: rec.resolved_via || "cache", resolved_at: rec.resolved_at || new Date().toISOString(), ...d });
        await sleep(60);
      } catch (e) {
        failed++;
        unresolved.push({ key: f.key, title: f.title, year: f.year, error: e.message });
        console.error(`  ! ${f.key}: ${e.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));

  writeJson(path.join(DATA, "unresolved.json"), { generated_at: new Date().toISOString(), count: unresolved.length, items: unresolved });
  console.log(`resolved ${resolvedNow}, providers refreshed ${refreshed}, fresh-from-cache ${cached}, unresolved/failed ${failed}`);
  if (unresolved.length) {
    console.log("unresolved (fix in content/overrides.json):");
    for (const u of unresolved) console.log(`  - ${u.key}${u.error ? "  [" + u.error + "]" : ""}`);
  }

  if (DISCOVER) await discover();
}

/** Data-driven rails for the 2026 page: what's new on streaming in India, and what's coming to Indian cinemas. */
async function discover() {
  const year = Number(process.env.SC_CANON_YEAR || 2026);
  const shape = (r) => ({
    key: filmKey(nameOf(r), yearOf(r)), tmdb_id: r.id, media: "movie", title: nameOf(r), original_title: origNameOf(r),
    year: yearOf(r), release_date: r.release_date || null, overview: r.overview || "", poster_path: r.poster_path || null,
    backdrop_path: r.backdrop_path || null, vote_average: r.vote_average ? Number(r.vote_average.toFixed(1)) : null,
    vote_count: r.vote_count || 0, original_language: r.original_language || null, genre_ids: r.genre_ids || [],
  });
  const streaming = [];
  for (let page = 1; page <= 3; page++) {
    const r = await tmdb("/discover/movie", {
      region: REGION, watch_region: REGION, with_watch_monetization_types: "flatrate|ads|free",
      primary_release_year: year, sort_by: "popularity.desc", include_adult: false, "vote_count.gte": 20, page,
    });
    streaming.push(...(r?.results || []).map(shape));
    if (!r || page >= (r.total_pages || 1)) break;
  }
  // providers for the top slice only (one call each)
  for (const f of streaming.slice(0, 40)) {
    const d = await tmdb(`/movie/${f.tmdb_id}/watch/providers`);
    f.providers = providersFrom({ "watch/providers": d });
    await sleep(60);
  }
  const upcoming = [];
  for (let page = 1; page <= 2; page++) {
    const r = await tmdb("/movie/upcoming", { region: REGION, page });
    upcoming.push(...(r?.results || []).map(shape));
    if (!r || page >= (r.total_pages || 1)) break;
  }
  const today = new Date().toISOString().slice(0, 10);
  writeJson(path.join(DATA, `discover-${year}.json`), {
    generated_at: new Date().toISOString(), region: REGION, year,
    streaming: streaming.filter((f) => f.poster_path),
    upcoming: upcoming.filter((f) => f.release_date && f.release_date >= today && f.poster_path).sort((a, b) => a.release_date.localeCompare(b.release_date)),
  });
  console.log(`discover: ${streaming.length} streaming in ${REGION} (${year}), ${upcoming.length} upcoming`);
}

main().catch((e) => { console.error(e); process.exit(1); });
