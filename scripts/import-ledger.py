#!/usr/bin/env python3
"""Import the Stan agent's ledger (what @sortedcinema actually posted) into
content/collections/archive/*.json.

    python3 scripts/import-ledger.py /path/to/stan/state/ledger.json [/path/to/stan/state/batches]

Idempotent: a collection is keyed on the normalised theme title (the same key
Stan's themes.py uses), so the same theme posted three times with slightly
different film sets becomes ONE collection whose films are the union, ordered
by the most recent post. Re-running rewrites the archive files and nothing
else. Sponsored `campaign:` records are skipped on purpose.

The ledger is READ. It is never written.
"""
import json, os, re, sys, glob, collections, unicodedata

LEDGER = sys.argv[1] if len(sys.argv) > 1 else "../stan/state/ledger.json"
BATCHES = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(LEDGER), "batches")
OUT = os.path.join(os.path.dirname(__file__), "..", "content", "collections", "archive")

STOP = {"the", "a", "an", "to", "of", "that", "for", "on", "in", "and", "movies", "films",
        "movie", "film", "watch", "these", "you", "if", "right", "now"}
TV_THEMES = {"bingeworthy shows right now"}

def norm(t):
    t = re.sub(r"[^a-z0-9 ]", " ", t.lower())
    return " ".join(sorted(x for x in t.split() if x not in STOP))

def slugify(t):
    t = re.sub(r"[’']", "", t.lower())
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return t

def intro_from_caption(cap):
    if not cap:
        return ""
    paras = [p.strip() for p in cap.split("\n\n") if p.strip()]
    if len(paras) >= 2:
        return paras[1]
    return ""

def film_key(f):
    t = unicodedata.normalize("NFKD", str(f.get("title", ""))).encode("ascii", "ignore").decode().lower()
    return (re.sub(r"[^a-z0-9]", "", t), str(f.get("year") or "")[:4])

def load_batch_blurbs():
    """sept-1 style batches carry the full 60-90 word paragraph per film;
    the ledger only kept the first 160 chars of it."""
    blurbs = {}
    for path in glob.glob(os.path.join(BATCHES, "*.json")):
        try:
            spec = json.load(open(path))
        except Exception:
            continue
        for post in spec.get("posts", []):
            for f in post.get("films", []):
                if f.get("blurb"):
                    blurbs[film_key(f)] = f["blurb"].strip()
    return blurbs

def main():
    recs = json.load(open(LEDGER))
    blurbs = load_batch_blurbs()
    groups = collections.defaultdict(list)
    for r in recs:
        if not r.get("films") or r.get("campaign"):
            continue
        groups[norm(r["theme"])].append(r)

    os.makedirs(OUT, exist_ok=True)
    written = 0
    for key, rs in groups.items():
        rs.sort(key=lambda r: r.get("date", ""))
        latest = rs[-1]
        seen, films = set(), []
        # most recent post first, then older posts' extra films
        for r in reversed(rs):
            for f in r["films"]:
                k = film_key(f)
                if k in seen or not f.get("title"):
                    continue
                seen.add(k)
                year = f.get("year")
                try:
                    year = int(str(year)[:4]) if year else None
                except ValueError:
                    year = None
                line = (f.get("one_liner") or "").strip()
                entry = {"title": f["title"].strip(), "year": year}
                if k in blurbs:
                    entry["blurb"] = blurbs[k]
                elif line:
                    entry["line"] = line
                if f.get("ott"):
                    entry["ott_seen"] = f["ott"]   # what the post said at the time; TMDB refresh supersedes
                if latest.get("format") == "tier_list" and line:
                    entry["tier"] = line
                    entry.pop("line", None)
                films.append(entry)

        theme = latest["theme"]
        coll = {
            "slug": slugify(theme),
            "title": theme,
            "kind": "archive",
            "category": latest.get("category") or "mood",
            "media": "tv" if norm(theme) in TV_THEMES else "movie",
            "curator": "sortedcinema",
            "intro": intro_from_caption(latest.get("caption")),
            "published": latest.get("date"),
            "source": {
                "type": "instagram",
                "permalink": latest.get("permalink"),
                "posted": [r.get("date") for r in rs],
                "buffer_id": latest.get("buffer_id"),
            },
            "films": films,
        }
        if latest.get("format") == "tier_list":
            coll["layout"] = "tiers"
        path = os.path.join(OUT, coll["slug"] + ".json")
        json.dump(coll, open(path, "w"), indent=2, ensure_ascii=False)
        written += 1
    print(f"wrote {written} archive collections to {os.path.relpath(OUT)}")

if __name__ == "__main__":
    main()
