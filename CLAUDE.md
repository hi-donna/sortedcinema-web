# sortedcinema-web — notes for Claude Code

Read `README.md` first; it is the whole map. The short version:

- **Static Astro site generated from `content/*.json`.** No database, no auth, no server. Every
  page reads `src/data/site.json`, which `scripts/build-data.mjs` regenerates on every build from
  `content/` + the TMDB cache in `data/tmdb/`. Do not hand-edit `src/data/site.json` or `data/`.
- **The only network call is `scripts/enrich.mjs`** (TMDB). It runs in the GitHub Action with the
  `TMDB_API_KEY` secret, and can run locally. Pages never fetch at request time.
- **A film's key is `slugify(title)-year`.** It is the URL and the cache filename. Changing a title
  in content changes the URL — prefer `content/overrides.json` for TMDB mismatches.
- **Sorted 2026 status is derived** (future release → Coming; `verdict: "sorted"` → Sorted; else
  Radar). Only edit the verdict, never the derived status.
- **Voice:** warm, cinephile, mood-first, spoiler-free, few commas, no question marks in
  engagement lines, no em dashes in blurbs. Two to three sentences per film. Same voice as the
  Instagram captions in the Stan repo (`agent/content.py::build_caption`).
- **Brand:** yellow `#F0C74E` on near-black, Playfair Display for anything that speaks. Never the
  reference account's red (a check fails the build if it appears).
- **Guardrails:** `npm run check` after any content change. It catches duplicate slugs, a film
  listed twice, pre-2026 films on the 2026 page, crude spoilers, over-long blurbs, and secrets in
  `dist/`.
- **Base path:** links go through `href()` / `filmUrl()` etc. from `src/lib/data.ts`, never a bare
  `"/x/"`, so the GitHub Pages preview under `/sortedcinema-web/` and the real domain at `/` both
  work.
- The Stan repo (`../stan`) is read-only from here. `scripts/import-ledger.py` reads its ledger.
