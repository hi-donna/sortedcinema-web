// Shared helpers for the data scripts. No network here.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CONTENT = path.join(ROOT, "content");
export const DATA = path.join(ROOT, "data");
export const TMDB_CACHE = path.join(DATA, "tmdb");

export function readJson(p, fallback = undefined) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Cannot read ${p}: ${e.message}`);
  }
}

export function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
}

export function walk(dir, ext = ".json") {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p, ext));
    else if (entry.name.endsWith(ext)) out.push(p);
  }
  return out.sort();
}

export function slugify(s) {
  return String(s)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Stable identity for a film across collections: normalised title + year. */
export function filmKey(title, year) {
  const t = slugify(title) || "untitled";
  return year ? `${t}-${year}` : t;
}

export function loadCollections() {
  return walk(path.join(CONTENT, "collections")).map((p) => {
    const c = readJson(p);
    c._file = path.relative(ROOT, p);
    if (!c.slug || !c.title || !Array.isArray(c.films)) {
      throw new Error(`${c._file}: needs slug, title, films[]`);
    }
    return c;
  });
}

/**
 * Fold TMDB/JustWatch provider names to what Indian viewers call them.
 * Same spirit as Stan's tmdb.watch_providers. Returns null to drop a provider.
 */
export function foldProvider(name) {
  const n = name.trim();
  const rules = [
    [/^amazon prime video( with ads)?$/i, "Prime Video"],
    [/^amazon video$/i, "Prime Video"],
    [/^(jio ?cinema|jiohotstar|disney\+? ?hotstar|hotstar)$/i, "JioHotstar"],
    [/^netflix( basic with ads| standard with ads)?$/i, "Netflix"],
    [/^zee5$/i, "ZEE5"],
    [/^sony ?liv$/i, "SonyLIV"],
    [/^apple tv( plus|\+)?$/i, "Apple TV"],
    [/^google play movies$/i, "Google Play"],
    [/^youtube( premium)?$/i, "YouTube"],
    [/^mubi$/i, "MUBI"],
    [/^lionsgate play$/i, "Lionsgate Play"],
    [/^bookmyshow$/i, "BookMyShow"],
    [/^sun ?nxt$/i, "Sun NXT"],
    [/^aha$/i, "aha"],
    [/^manorama ?max$/i, "ManoramaMAX"],
    [/^hoichoi$/i, "hoichoi"],
    [/^eros ?now$/i, "Eros Now"],
    [/^discovery\+?$/i, "discovery+"],
    [/^crunchyroll$/i, "Crunchyroll"],
    [/^tata play$/i, "Tata Play"],
    [/^(.+?) amazon channel$/i, (m) => `${m[1]} on Prime`],
    [/^(.+?) apple tv channel$/i, (m) => `${m[1]} on Apple TV`],
  ];
  for (const [re, to] of rules) {
    const m = n.match(re);
    if (m) return typeof to === "function" ? to(m) : to;
  }
  return n;
}
