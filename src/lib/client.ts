/* Browser-side state: the Passport. No accounts, no server — localStorage, guarded. */
export type FilmRow = { k: string; t: string; y: number | null; d: string | null; m: string[]; r: number | null; l: string | null; c: string[]; p: string | null; on: string[]; b: string | null; ls: string[]; tv: boolean };

const KEY = "sc:passport:v1";
export type Passport = { seen: string[]; want: string[]; platforms: string[]; visits: number; first: string; last: string };

function empty(): Passport { const d = today(); return { seen: [], want: [], platforms: [], visits: 0, first: d, last: d }; }
export function load(): Passport {
  try { const raw = localStorage.getItem(KEY); if (raw) return { ...empty(), ...JSON.parse(raw) }; } catch {}
  return empty();
}
export function save(p: Passport) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} }
export function touch() { const p = load(); const d = today(); if (p.last !== d) { p.visits += 1; p.last = d; save(p); } else if (!p.visits) { p.visits = 1; save(p); } return p; }
export function toggle(list: "seen" | "want", key: string): Passport {
  const p = load(); const i = p[list].indexOf(key);
  if (i >= 0) p[list].splice(i, 1); else { p[list].push(key); if (list === "seen") p.want = p.want.filter((k) => k !== key); }
  save(p); document.dispatchEvent(new CustomEvent("sc:passport", { detail: p })); return p;
}
export function setPlatforms(slugs: string[]) { const p = load(); p.platforms = slugs; save(p); document.dispatchEvent(new CustomEvent("sc:passport", { detail: p })); return p; }

/** Today's date in India, YYYY-MM-DD. The site's clock is IST — a "tonight" is an Indian night. */
export function today(): string {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string) { return Math.round((Date.parse(b) - Date.parse(a)) / 864e5); }

export const PLATFORMS: { slug: string; name: string }[] = [
  { slug: "netflix", name: "Netflix" }, { slug: "prime-video", name: "Prime Video" }, { slug: "jiohotstar", name: "JioHotstar" },
  { slug: "sonyliv", name: "SonyLIV" }, { slug: "zee5", name: "ZEE5" }, { slug: "apple-tv", name: "Apple TV" },
  { slug: "mubi", name: "MUBI" }, { slug: "lionsgate-play", name: "Lionsgate Play" }, { slug: "youtube", name: "YouTube" },
];

let cache: FilmRow[] | null = null;
export const base = () => document.body.dataset.base || "/";
export async function films(b: string = base()): Promise<FilmRow[]> {
  if (!cache) cache = await (await fetch(b + "films-index.json")).json();
  return cache!;
}

/** Wire every [data-seen]/[data-want] button on the page to the passport. Idempotent. */
export function wireButtons() {
  const p = load();
  const paint = (pp: Passport) => {
    document.querySelectorAll<HTMLElement>("[data-seen],[data-want]").forEach((el) => {
      const list = el.hasAttribute("data-seen") ? "seen" : "want";
      const key = el.getAttribute(list === "seen" ? "data-seen" : "data-want")!;
      const on = pp[list].includes(key);
      el.classList.toggle("on", on);
      el.setAttribute("aria-pressed", String(on));
      const lbl = el.querySelector("[data-label]") || el;
      lbl.textContent = list === "seen" ? (on ? "✓ Seen" : "Seen it") : (on ? "★ Saved" : "Save for later");
    });
  };
  document.querySelectorAll<HTMLElement>("[data-seen],[data-want]").forEach((el) => {
    if (el.dataset.wired) return; el.dataset.wired = "1";
    el.addEventListener("click", (e) => { e.preventDefault(); const list = el.hasAttribute("data-seen") ? "seen" : "want"; paint(toggle(list, el.getAttribute(list === "seen" ? "data-seen" : "data-want")!)); });
  });
  paint(p);
  document.addEventListener("sc:passport", (e: any) => paint(e.detail));
}

/** Progress for a list: how many of its keys are stamped seen. */
export function progress(keys: string[], p: Passport) { const n = keys.filter((k) => p.seen.includes(k)).length; return { n, total: keys.length, pct: keys.length ? Math.round((100 * n) / keys.length) : 0 }; }
