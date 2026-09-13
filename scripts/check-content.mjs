#!/usr/bin/env node
/**
 * Content guardrails. Runs after build in CI and locally via `npm run check`.
 * Fails the build (exit 1) on anything that would embarrass the page:
 *  - a collection with a duplicate slug, a film with no title/year, an empty list
 *  - a 2026 entry whose film is not from 2026+ (the whole point of that page)
 *  - a blurb that spoils (crude: contains "ending is" + "dies"/"killer is")
 *  - the reference account's red (#E50914-ish) leaking into the CSS
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadCollections, filmKey } from "./lib.mjs";

const problems = [];
const cols = loadCollections();
const slugs = new Set();
for (const c of cols) {
  if (slugs.has(c.slug)) problems.push(`${c._file}: duplicate slug ${c.slug}`);
  slugs.add(c.slug);
  if (!c.films.length) problems.push(`${c._file}: empty list`);
  const seen = new Set();
  for (const f of c.films) {
    if (!f.title) problems.push(`${c._file}: film without title`);
    const k = filmKey(f.title, f.year);
    if (seen.has(k)) problems.push(`${c._file}: ${f.title} listed twice`);
    seen.add(k);
    if (c.kind === "year" && (!f.year || f.year < c.year)) problems.push(`${c._file}: ${f.title} (${f.year}) is older than ${c.year}`);
    const text = (f.blurb || f.note || f.line || "").toLowerCase();
    if (/(the killer is|turns out to be the|ending is that)/.test(text)) problems.push(`${c._file}: ${f.title} blurb may spoil: "${text.slice(0, 60)}…"`);
    if (f.blurb && f.blurb.split(/\s+/).length > 110) problems.push(`${c._file}: ${f.title} blurb is long (${f.blurb.split(/\s+/).length} words)`);
  }
}
const css = fs.readFileSync(path.join(ROOT, "src", "styles", "global.css"), "utf8");
if (/#e50914|#ff0000|#e5091/i.test(css)) problems.push("global.css: reference-account red is not our colour");

// the built site must not contain any secret-looking string
const dist = path.join(ROOT, "dist");
if (fs.existsSync(dist)) {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(dist).filter((p) => /\.(html|js|json|xml|txt)$/.test(p))) {
    const s = fs.readFileSync(f, "utf8");
    if (/api_key=|eyJhbGciOi|sk-ant-|TMDB_API_KEY=/.test(s)) problems.push(`${path.relative(ROOT, f)}: looks like it contains a secret`);
  }
}

if (problems.length) {
  console.error(`content check: ${problems.length} problem(s)`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`content check: ${cols.length} collections OK`);
