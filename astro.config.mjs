import { defineConfig } from "astro/config";
import site from "./content/site.json" with { type: "json" };

// SITE_URL / SITE_BASE let the GitHub Pages workflow build a preview under
// https://<owner>.github.io/<repo>/ before the custom domain is switched on.
const SITE_URL = process.env.SITE_URL || site.url;
const SITE_BASE = process.env.SITE_BASE || "/";

export default defineConfig({
  site: SITE_URL,
  base: SITE_BASE,
  output: "static",
  trailingSlash: "always",
  build: { format: "directory", inlineStylesheets: "auto" },
  compressHTML: true,
});
