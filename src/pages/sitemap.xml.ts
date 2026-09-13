import { data, href } from "../lib/data";
const site = { url: (import.meta.env.SITE || "").replace(/\/$/, "") };
export function GET() {
  const urls = [
    "/", "/lists/", "/world/", "/2026/", "/watch/", "/about/",
    ...data.collections.filter((c) => c.kind !== "year").map((c) => `/lists/${c.slug}/`),
    ...Object.keys(data.films).map((k) => `/film/${k}/`),
    ...Object.keys(data.moods).map((m) => `/mood/${m}/`),
    ...Object.keys(data.platforms).map((p) => `/watch/${p}/`),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${site.url}${href(u)}</loc></url>`).join("\n")}\n</urlset>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
