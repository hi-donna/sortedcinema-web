# Sorted Cinema — the website

The permanent home for [@sortedcinema](https://www.instagram.com/sortedcinema): world-cinema
on-ramps, Indian cinema beyond the obvious, every Instagram list ever posted, and **Sorted 2026**,
a growing record of everything worth watching from 2026 onwards. Every film carries its year and
**where it streams in India**.

**Stack:** Astro (static) · a folder of JSON · TMDB for metadata, posters and India watch-providers
(JustWatch data) · GitHub Actions builds and deploys to GitHub Pages. No database, no accounts,
no tracking, $0/month.

## How it works

```
content/                 ← the source of truth. Edit these. Commit. Done.
  site.json              site name, URLs, merch link, accent colour
  moods.json             the ten mood tags
  curators.json          who writes lists (add guest curators here)
  overrides.json         manual TMDB id fixes for films the resolver gets wrong
  collections/
    world/*.json         "Korean Cinema: Start Here" etc. — 10 films, blurbs, moods
    india/*.json         Malayalam, Tamil, Marathi, Bengali, Telugu/Kannada, Hindi indie
    archive/*.json       every carousel from the Stan ledger (generated, see below)
    year/sorted-2026.json  the 2026-onwards list with verdicts

data/tmdb/<key>.json     ← TMDB cache written by scripts/enrich.mjs (committed by the Action)
data/discover-2026.json  ← "new on streaming in India" / "coming to cinemas" rails (same)

scripts/
  build-data.mjs         content + data → src/data/site.json (runs on every build, offline)
  enrich.mjs             the ONLY network step: TMDB search/details/providers + discover
  import-ledger.py       Stan ledger → content/collections/archive (re-run after new posts)
  check-content.mjs      guardrails: duplicates, spoilers, 2026 rule, no secrets in dist
```

A film's identity is `slugify(title)-year` (e.g. `memories-of-murder-2003`). That key is the URL,
the cache filename, and how the same film is merged across lists. It never depends on TMDB, so a
film ships even before it is enriched (with a typographic card instead of a poster).

## Editing content

**Add or change a list:** edit or add a JSON file under `content/collections/`. Fields:

```json
{
  "slug": "korean-cinema-start-here",
  "title": "Korean Cinema: Start Here",
  "kicker": "World Cinema · South Korea",
  "kind": "world",                 // world | archive | year | list
  "category": "world",             // world | india | mood | genre | era | ...
  "country": "KR", "countryName": "South Korea", "language": "Korean",
  "curator": "sortedcinema",       // key in curators.json
  "intro": "…",
  "published": "2026-09-14",
  "films": [
    { "title": "Parasite", "year": 2019, "original_title": "기생충", "director": "Bong Joon-ho",
      "moods": ["tense", "funny", "dark"], "blurb": "Two or three spoiler-free sentences." }
  ]
}
```

**Sorted 2026:** `content/collections/year/sorted-2026.json`. Each entry has a `release` date and
an optional `"verdict": "sorted"`. Status on the page is *derived*: a release date in the future
is always **Coming**; otherwise it is **Sorted** if the verdict says so, else **On the radar**.
Flip a verdict when you have watched the film. Nothing older than 2026 is allowed (the check fails).

**Fix a mis-resolved film:** look at `data/unresolved.json` (written by enrich) or a wrong poster,
then add to `content/overrides.json`:

```json
{ "the-keepers-2017": { "tmdb_id": 72750, "media": "tv" } }
```

**Pull new Instagram posts in:** `python3 scripts/import-ledger.py ../stan/state/ledger.json`
(reads Stan's ledger, never writes to it), then commit `content/collections/archive/`.

**Add a guest curator:** add a key to `curators.json`, set `"curator": "<key>"` on their list.

## Running it

```bash
npm install
npm run dev              # local preview at http://localhost:4321 (uses whatever is in data/)
TMDB_API_KEY=… npm run enrich   # resolve films + India providers into data/ (needs network)
npm run build            # static site → dist/
npm run check            # content guardrails
```

Enrich is incremental: identity is cached forever (unless `--force`), providers are refreshed when
older than 7 days (`--max-age-days`). `--only <key>` does one film. Unmatched films are reported,
never guessed.

## Deploying (GitHub Pages)

`.github/workflows/site.yml` runs on every push to `main`, weekly (Monday), and on demand:
**enrich → commit data → build → deploy**. One-time setup in the GitHub repo:

1. **Settings → Secrets → Actions → `TMDB_API_KEY`** (the same key Stan uses).
2. **Settings → Pages → Source: GitHub Actions.**
3. Push. The site appears at `https://<owner>.github.io/sortedcinema-web/`.
4. When ready for the real domain: **Settings → Pages → Custom domain → `www.sortedcinema.com`**
   (GitHub commits a `CNAME` file; the workflow then builds for `/` on that domain), and at the
   DNS provider add `CNAME www → <owner>.github.io`. Move the Shopify store to
   `shop.sortedcinema.com` first and update `merch` in `content/site.json`.

## Rules (do not ship without)

- The TMDB key lives only in the Actions secret / your shell. It is never in the repo or the built
  site (`check-content.mjs` greps `dist/` for anything key-shaped and fails the build).
- Pages never call TMDB at request time. All data is baked at build.
- Every number and year shown comes from TMDB or from a verified batch; blurbs are mood, not facts.
- TMDB + JustWatch attribution stays in the footer (licence condition).
- `content/` is edited by people (or Claude in a session). `data/` is written by the script.
