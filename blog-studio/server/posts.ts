/* Node-side post storage and export. Used by the Vite dev API and by the export CLI. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildIndexHtml, buildPostHtml, hasSimulation } from "../shared/build.ts";
import { parseFrontmatter, serializeFrontmatter } from "../shared/frontmatter.ts";
import { readingMinutes } from "../shared/markdown.ts";
import type { Assets, PostSource, PostSummary, SiteConfig } from "../shared/types.ts";

export const STUDIO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const POSTS_DIR = path.join(STUDIO_DIR, "posts");
const STARTERS_DIR = path.join(STUDIO_DIR, "starters");
const TEMPLATE_DIR = path.join(STUDIO_DIR, "template");

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

const read = (p: string) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");

export function loadSite(): SiteConfig {
  return JSON.parse(fs.readFileSync(path.join(STUDIO_DIR, "site.config.json"), "utf8"));
}

export function loadAssets(): Assets {
  return {
    pageCss: read(path.join(TEMPLATE_DIR, "page.css")),
    kitCss: read(path.join(TEMPLATE_DIR, "kit.css")),
    hljsCss: read(path.join(TEMPLATE_DIR, "hljs.css")),
    pageJs: read(path.join(TEMPLATE_DIR, "page.js")),
  };
}

export const outputDir = (site = loadSite()) => path.resolve(STUDIO_DIR, site.outputDir);
const outFile = (slug: string, site: SiteConfig) => path.join(outputDir(site), `${slug}.html`);

function assertSlug(slug: string) {
  if (!SLUG_RE.test(slug)) throw new HttpError(400, `Invalid slug "${slug}". Use lowercase letters, numbers and dashes.`);
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function listPosts(): PostSummary[] {
  if (!fs.existsSync(POSTS_DIR)) return [];
  const site = loadSite();
  return fs
    .readdirSync(POSTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && SLUG_RE.test(d.name))
    .map((d): PostSummary | null => {
      const dir = path.join(POSTS_DIR, d.name);
      const md = path.join(dir, "post.md");
      if (!fs.existsSync(md)) return null;
      const { meta, body } = parseFrontmatter(read(md));
      const files = ["post.md", "sim.html", "sim.js", "sim.css"].map((f) => path.join(dir, f)).filter(fs.existsSync);
      const out = outFile(d.name, site);
      return {
        slug: d.name,
        meta,
        hasSim: hasSimulation({ simHtml: read(path.join(dir, "sim.html")), simJs: read(path.join(dir, "sim.js")) }),
        minutes: readingMinutes(body),
        exported: fs.existsSync(out) ? path.relative(path.resolve(STUDIO_DIR, ".."), out).replace(/\\/g, "/") : null,
        updatedAt: Math.max(...files.map((f) => fs.statSync(f).mtimeMs)),
      };
    })
    .filter((p): p is PostSummary => !!p)
    .sort((a, b) => (b.meta.date || "").localeCompare(a.meta.date || "") || b.updatedAt - a.updatedAt);
}

export function readPost(slug: string): PostSource {
  assertSlug(slug);
  const dir = path.join(POSTS_DIR, slug);
  if (!fs.existsSync(path.join(dir, "post.md"))) throw new HttpError(404, `No post "${slug}"`);
  const { meta, body } = parseFrontmatter(read(path.join(dir, "post.md")));
  return { slug, meta, body, simHtml: read(path.join(dir, "sim.html")), simJs: read(path.join(dir, "sim.js")), simCss: read(path.join(dir, "sim.css")) };
}

export function writePost(src: PostSource) {
  assertSlug(src.slug);
  const dir = path.join(POSTS_DIR, src.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "post.md"), serializeFrontmatter(src.meta, src.body));
  for (const [file, text] of [["sim.html", src.simHtml], ["sim.js", src.simJs], ["sim.css", src.simCss]] as const) {
    const p = path.join(dir, file);
    if (text.trim()) fs.writeFileSync(p, text);
    else if (fs.existsSync(p)) fs.rmSync(p);
  }
}

export function createPost(slug: string, title: string, starter: "simulation" | "article"): PostSource {
  assertSlug(slug);
  if (fs.existsSync(path.join(POSTS_DIR, slug))) throw new HttpError(409, `A post called "${slug}" already exists`);
  const sdir = path.join(STARTERS_DIR, starter);
  if (!fs.existsSync(sdir)) throw new HttpError(400, `Unknown starter "${starter}"`);
  const { meta, body } = parseFrontmatter(read(path.join(sdir, "post.md")));
  const src: PostSource = {
    slug,
    meta: { ...meta, title: title || meta.title, date: new Date().toISOString().slice(0, 10) },
    body,
    simHtml: read(path.join(sdir, "sim.html")),
    simJs: read(path.join(sdir, "sim.js")),
    simCss: read(path.join(sdir, "sim.css")),
  };
  writePost(src);
  return src;
}

export function writeIndex(site = loadSite(), assets = loadAssets()) {
  const file = path.join(outputDir(site), "index.html");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buildIndexHtml(listPosts(), site, assets));
  return file;
}

/** Published posts are listed newest first, so "previous" is the next-older one. */
function neighborsOf(slug: string) {
  const list = listPosts().filter((p) => !p.meta.draft && (p.exported || p.slug === slug));
  const i = list.findIndex((p) => p.slug === slug);
  if (i < 0) return undefined;
  const pick = (p?: (typeof list)[number]) => (p ? { slug: p.slug, title: p.meta.title } : undefined);
  return { prev: pick(list[i + 1]), next: pick(list[i - 1]) };
}

export function exportPost(slug: string) {
  const site = loadSite(), assets = loadAssets();
  const src = readPost(slug);
  const built = buildPostHtml(src, site, assets, { neighbors: neighborsOf(slug) });
  const file = outFile(slug, site);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, built.html);
  writeIndex(site, assets);
  return { file, bytes: Buffer.byteLength(built.html), warnings: built.warnings };
}
