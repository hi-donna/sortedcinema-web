#!/usr/bin/env node
/**
 * Merge the curated content (content/) with the TMDB cache (data/tmdb) into the
 * single JSON the site is built from: src/data/site.json.
 *
 * Runs on every build, offline, in under a second. If a film has no TMDB record
 * yet, it still ships — with the curated text and a typographic card instead of
 * a poster. Enrichment only ever ADDS.
 */
import path from "node:path";
import fs from "node:fs";
import { ROOT, CONTENT, DATA, TMDB_CACHE, readJson, writeJson, loadCollections, filmKey, slugify } from "./lib.mjs";

const site = readJson(path.join(CONTENT, "site.json"));
const moods = readJson(path.join(CONTENT, "moods.json"));
const curators = readJson(path.join(CONTENT, "curators.json"));
const collections = loadCollections();
const today = (process.env.SC_BUILD_DATE || new Date().toISOString()).slice(0, 10);

const CATEGORY_MOODS = {
  mood: [], genre: [], era: [], platform: [], authority: [], fandom: [], format: [], regional: [],
};

// ---------------------------------------------------------------- films
const films = new Map();
function getFilm(entry, coll) {
  const key = filmKey(entry.title, entry.year);
  if (!films.has(key)) {
    const tmdb = readJson(path.join(TMDB_CACHE, key + ".json"), null);
    films.set(key, {
      key,
      title: entry.title,
      year: entry.year || tmdb?.year || null,
      original_title: entry.original_title || (tmdb && tmdb.original_title !== tmdb.title ? tmdb.original_title : null),
      director: entry.director || null,
      media: entry.media || coll.media || tmdb?.media || "movie",
      tmdb: tmdb ? {
        id: tmdb.tmdb_id, media: tmdb.media, poster: tmdb.poster_path, backdrop: tmdb.backdrop_path,
        overview: tmdb.overview, tagline: tmdb.tagline, runtime: tmdb.runtime, seasons: tmdb.seasons ?? null,
        rating: tmdb.vote_average, votes: tmdb.vote_count, release_date: tmdb.release_date,
        genres: tmdb.genres, language: tmdb.original_language, countries: tmdb.origin_country,
        trailer: tmdb.trailer_key, providers: tmdb.providers, providers_refreshed_at: tmdb.providers_refreshed_at,
        imdb_id: tmdb.imdb_id ?? null, ratings: tmdb.ratings ?? null,
      } : null,
      ott_seen: entry.ott_seen || null,
      moods: new Set(),
      blurbs: [],
      collections: [],
    });
  }
  const f = films.get(key);
  if (!f.director && entry.director) f.director = entry.director;
  if (!f.original_title && entry.original_title) f.original_title = entry.original_title;
  for (const m of entry.moods || []) if (moods[m]) f.moods.add(m);
  const text = entry.blurb || entry.note || entry.line || null;
  if (text) f.blurbs.push({ collection: coll.slug, kind: entry.blurb ? "blurb" : entry.note ? "note" : "line", text });
  if (!f.collections.includes(coll.slug)) f.collections.push(coll.slug);
  return f;
}

// ---------------------------------------------------------------- collections
const out = [];
for (const c of collections) {
  const entries = c.films.map((e, i) => {
    const f = getFilm(e, c);
    const item = {
      key: f.key, position: i + 1,
      text: e.blurb || e.note || e.line || null,
      tier: e.tier || null,
    };
    if (c.kind === "year") {
      // status is derived, never trusted blindly: a date in the future is "coming" whatever the editor wrote
      const rel = f.tmdb?.release_date || e.release || null;
      let status = e.verdict === "sorted" ? "sorted" : "radar";
      if (rel && rel > today) status = "coming";
      item.status = status;
      item.release = rel;
    }
    return item;
  });
  const cover = c.cover || (entries.find((e) => films.get(e.key).tmdb?.backdrop) || entries[0])?.key || null;
  out.push({
    slug: c.slug, title: c.title, kicker: c.kicker || null, kind: c.kind || "list", category: c.category || null,
    media: c.media || "movie", layout: c.layout || "list", country: c.country || null, countryName: c.countryName || null,
    region: c.region || null, language: c.language || null, year: c.year || null, legend: c.legend || null,
    curator: c.curator || "sortedcinema", intro: c.intro || "", published: c.published || null,
    source: c.source || null, cover, count: entries.length, films: entries,
  });
}

// ---------------------------------------------------------------- derived indexes
const filmsObj = {};
for (const [k, f] of films) filmsObj[k] = { ...f, moods: [...f.moods] };

const byMood = {};
for (const m of Object.keys(moods)) byMood[m] = [];
for (const f of films.values()) for (const m of f.moods) byMood[m].push(f.key);

const platforms = {};
for (const f of films.values()) {
  for (const p of f.tmdb?.providers?.flatrate || []) {
    platforms[p.slug] ??= { slug: p.slug, name: p.name, logo: p.logo, films: [] };
    platforms[p.slug].films.push(f.key);
  }
}

const countries = out.filter((c) => c.kind === "world").map((c) => ({
  slug: c.slug, country: c.country, name: c.countryName, language: c.language, category: c.category, count: c.count, cover: c.cover,
}));

const discover = readJson(path.join(DATA, `discover-${site.canonYear || 2026}.json`), null);

// ---------------------------------------------------------------- Tonight: one film a day, deterministic
// Pool = every film we wrote a real paragraph for (world/india on-ramps, editorial batches, 2026 verdicts).
// Order is a seeded shuffle so the sequence is stable across builds; day N shows order[N % len].
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pool = [...films.values()].filter((f) => f.blurbs.some((b) => b.kind === "blurb")).map((f) => f.key).sort();
const rnd = mulberry32(20260914);
for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
const tonight = { start: site.tonightStart || "2026-09-14", order: pool };

const search = [
  ...out.map((c) => ({ t: "list", s: c.slug, n: c.title, k: c.kicker || c.category || "" })),
  ...[...films.values()].map((f) => ({ t: "film", s: f.key, n: f.title, k: [f.year, f.original_title, f.director].filter(Boolean).join(" · ") })),
];

const stats = {
  collections: out.length, films: films.size,
  enriched: [...films.values()].filter((f) => f.tmdb).length,
  streamingIndia: [...films.values()].filter((f) => f.tmdb?.providers?.flatrate?.length).length,
  built: new Date().toISOString(), today,
};

writeJson(path.join(ROOT, "src", "data", "site.json"), { site, moods, curators, collections: out, films: filmsObj, byMood, platforms, countries, discover, search, stats, tonight });
console.log(`data: ${stats.collections} collections, ${stats.films} films (${stats.enriched} enriched, ${stats.streamingIndia} streaming in India)`);
