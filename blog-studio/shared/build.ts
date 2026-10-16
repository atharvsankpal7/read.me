import { createRenderer, escapeHtml as esc, icon, readingMinutes, splitAtSimulation, SIM_MARKER } from "./markdown.ts";
import type { Assets, BuildOptions, PostMeta, PostSource, PostSummary, SiteConfig, TocItem } from "./types.ts";

const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">';

/* The site is light only, like the portfolio. The studio preview can still force a theme. */
const THEME_INIT =
  "(function(){var r=document.documentElement;if(!r.hasAttribute('data-force-theme'))r.setAttribute('data-theme','light')})();";

const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#0000cd"/><circle cx="16" cy="16" r="5" fill="#f8f7f4"/></svg>');

const I = {
  expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  shrink: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
  arrowUpLeft: '<path d="M7 17V7h10"/><path d="M17 17 7 7"/>',
  arrowUpRight: '<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
};

const HATCH = '<div class="hatch" aria-hidden="true"></div>';

/** "</script" inside inlined code would end the script tag early. */
const safeScript = (js: string) => js.replace(/<\/(script)/gi, "<\\/$1");
const safeStyle = (css: string) => css.replace(/<\/(style)/gi, "<\\/$1");

export function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  if (isNaN(+d)) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

export const hasSimulation = (p: Pick<PostSource, "simHtml" | "simJs">) => !!(p.simHtml.trim() || p.simJs.trim());

function head(title: string, description: string, site: SiteConfig, css: string, extra: { url?: string; date?: string; type: string }) {
  const url = extra.url ? `<link rel="canonical" href="${esc(extra.url)}"><meta property="og:url" content="${esc(extra.url)}">` : "";
  const pub = extra.date ? `<meta property="article:published_time" content="${esc(extra.date)}">` : "";
  return `<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="author" content="${esc(site.author)}">
<meta property="og:type" content="${extra.type}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">${url}${pub}
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#f8f7f4">
<link rel="icon" href="${FAVICON}">
<script>${THEME_INIT}</script>
${FONTS}
<style>
${safeStyle(css)}
</style>
</head>`;
}

function backLink(href: string, label: string) {
  return `<div class="back"><a href="${esc(href)}">${icon(I.arrowUpLeft)} ${esc(label)}</a></div>`;
}

/** Preview-only helper: forwards console output and errors to the studio, keeps scroll between rebuilds. */
function previewBridge(scrollY: number) {
  return `<script>(function(){
var post=function(m){try{parent.postMessage(Object.assign({__studio:1},m),"*")}catch(e){}};
var fmt=function(a){try{if(a instanceof Error)return a.stack||a.message;if(typeof a==="object")return JSON.stringify(a);return String(a)}catch(e){return String(a)}};
["log","info","warn","error"].forEach(function(l){var o=console[l];console[l]=function(){post({type:"console",level:l,text:[].map.call(arguments,fmt).join(" ")});o.apply(console,arguments)}});
addEventListener("error",function(e){post({type:"console",level:"error",text:(e.error&&e.error.stack)||e.message})});
addEventListener("unhandledrejection",function(e){post({type:"console",level:"error",text:"Unhandled promise rejection: "+fmt(e.reason)})});
var y=${Math.max(0, Math.round(scrollY))};if(y){var go=function(){scrollTo(0,y)};addEventListener("DOMContentLoaded",go);addEventListener("load",go)}
var t=0;addEventListener("scroll",function(){clearTimeout(t);t=setTimeout(function(){post({type:"scroll",y:scrollY})},80)},{passive:true});
document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href]");if(a&&a.getAttribute("href").charAt(0)!=="#"){e.preventDefault();post({type:"console",level:"info",text:"Link clicks are disabled in preview: "+a.getAttribute("href")})}},true);
})();</script>`;
}

function tocHtml(items: TocItem[]) {
  if (items.length < 2) return "";
  return `<nav class="toc" aria-label="Table of contents"><h2>Table of Contents</h2><ol>${items
    .map((t) => `<li><a href="#${t.id}"${t.depth > 2 ? ' class="sub"' : ""}>${esc(t.text)}</a></li>`)
    .join("")}</ol></nav>`;
}

function pagerHtml(n: BuildOptions["neighbors"]) {
  const link = (p: { slug: string; title: string } | undefined, cls: "prev" | "next") => {
    if (!p) return "<span></span>";
    const dir = cls === "prev" ? `${icon(I.chevronLeft)}<span>Previous</span>` : `<span>Next</span>${icon(I.chevronRight)}`;
    return `<a class="${cls}" href="./${esc(p.slug)}.html"><div class="dir">${dir}</div><p class="title">${esc(p.title)}</p></a>`;
  };
  if (!n?.prev && !n?.next) {
    return `<nav class="pager" aria-label="More writing"><a class="prev" href="./"><div class="dir">${icon(I.chevronLeft)}<span>Back</span></div><p class="title">All writing</p></a></nav>`;
  }
  return `<nav class="pager" aria-label="More writing">${link(n.prev, "prev")}${link(n.next, "next")}</nav>`;
}

function labHtml(src: PostSource) {
  const title = src.meta.simTitle || "Try it yourself";
  const hint = src.meta.simHint ? `<p class="lab-hint">${esc(src.meta.simHint)}</p>` : "";
  return `<section class="lab-wrap" id="simulation" aria-label="Interactive simulation">
<div class="lab">
  <div class="lab-head">
    <div class="grow"><span class="lab-badge">Interactive</span><h2 class="lab-title">${esc(title)}</h2>${hint}</div>
    <div class="lab-actions"><button class="icon-btn" type="button" data-fullscreen aria-label="Toggle full screen">${icon(I.expand, "fs-enter")}${icon(I.shrink, "fs-exit")}</button></div>
  </div>
  <div class="lab-body">
${src.simHtml}
  </div>
</div>
</section>`;
}

export interface BuiltPost {
  html: string;
  toc: TocItem[];
  minutes: number;
  warnings: string[];
}

export function buildPostHtml(src: PostSource, site: SiteConfig, assets: Assets, opts: BuildOptions = {}): BuiltPost {
  const { meta } = src;
  const warnings: string[] = [];
  const sim = hasSimulation(src);
  const r = createRenderer();

  let article: string;
  const toc: TocItem[] = [];
  if (sim) {
    const [before, after] = splitAtSimulation(src.body);
    if (!SIM_MARKER.test(src.body)) warnings.push("No `::simulation` line in the article, so the simulation is placed before the first `##` heading.");
    const a = r.render(before);
    toc.push(...r.toc.splice(0));
    const b = after.trim() ? r.render(after) : "";
    article = (a.trim() ? `<div class="prose">\n${a}</div>\n` : "") + labHtml(src) + (b ? `\n<div class="prose">\n${b}</div>` : "");
    toc.push({ id: "simulation", text: meta.simTitle || "Simulation", depth: 2 }, ...r.toc);
  } else {
    if (SIM_MARKER.test(src.body)) warnings.push("The article has a `::simulation` line but the post has no simulation code.");
    article = `<div class="prose">\n${r.render(src.body.replace(SIM_MARKER, ""))}</div>`;
    toc.push(...r.toc);
  }

  const minutes = readingMinutes(src.body);
  const description = meta.subtitle || `${meta.title}, by ${site.author}`;
  const url = site.siteUrl ? `${site.siteUrl.replace(/\/$/, "")}/${site.blogPath ?? "blogs/"}${src.slug}.html` : undefined;
  const css = [assets.pageCss, assets.hljsCss, sim ? assets.kitCss : "", src.simCss].filter(Boolean).join("\n");
  const showToc = meta.toc !== false;

  const tags = (meta.tags ?? []).map((t) => `<li class="tag">${esc(t)}</li>`).join("");
  const liveTag = sim ? `<li class="tag live">Interactive</li>` : "";
  const date = meta.date ? `<time datetime="${esc(meta.date)}">${formatDate(meta.date)}</time> · ` : "";

  const htmlAttrs = opts.forceTheme ? ` data-theme="${opts.forceTheme}" data-force-theme` : "";
  const html = `<!doctype html>
<html lang="en"${htmlAttrs}>
${head(`${meta.title} | ${site.author}`, description, site, css, { url, date: meta.date, type: "article" })}
<body>
${opts.preview ? previewBridge(opts.scrollY ?? 0) : ""}
<a class="skip-link" href="#main-content">Skip to main content</a>
<div class="progress" aria-hidden="true"></div>
<article class="page">
${backLink(site.homeUrl, "Home")}
<div class="post">
${HATCH}
<header class="post-head">
  <h1>${esc(meta.title)}</h1>
  <p class="meta">${date}${minutes} min read · By ${esc(site.author)}</p>
  ${meta.subtitle ? `<p class="lede">${esc(meta.subtitle)}</p>` : ""}
  ${tags || liveTag ? `<ul class="tags">${liveTag}${tags}</ul>` : ""}
</header>
${HATCH}
${showToc ? tocHtml(toc) : ""}
<div class="article" id="main-content">
${article}
</div>
</div>
${pagerHtml(opts.neighbors)}
</article>
<button class="to-top" type="button" aria-label="Back to top">${icon(I.arrowUp)}</button>
<script>
${safeScript(assets.pageJs)}
</script>
${sim && src.simJs.trim() ? `<script>
/* simulation: ${esc(src.slug)} */
try {
(function (root, Kit) {
"use strict";
${safeScript(src.simJs)}
})(window.Kit.root, window.Kit);
} catch (err) { window.Kit.fail(err); }
</script>` : ""}
</body>
</html>
`;
  return { html, toc, minutes, warnings };
}

export function buildIndexHtml(posts: PostSummary[], site: SiteConfig, assets: Assets): string {
  const list = posts
    .filter((p) => !p.meta.draft && p.exported)
    .sort((a, b) => (b.meta.date || "").localeCompare(a.meta.date || ""));
  const items = list
    .map((p) => {
      const preview = [
        p.meta.date ? ` data-preview-date="${esc(formatDate(p.meta.date))}"` : "",
        p.minutes ? ` data-preview-minutes="${p.minutes}"` : "",
        p.meta.subtitle ? ` data-preview-body="${esc(p.meta.subtitle)}"` : "",
      ].join("");
      return `<li><a class="post-link" href="./${esc(p.slug)}.html"${preview}><span>${esc(p.meta.title)}</span><span class="arrow">${icon(I.arrowUpRight)}</span></a>${
        p.meta.date ? `<p class="date"><time datetime="${esc(p.meta.date)}">${esc(p.meta.date)}</time></p>` : ""
      }</li>`;
    })
    .join("\n");
  const url = site.siteUrl ? `${site.siteUrl.replace(/\/$/, "")}/${site.blogPath ?? "blogs/"}` : undefined;
  const desc = site.blogDescription || `Writing by ${site.author}`;
  return `<!doctype html>
<html lang="en">
${head(`${site.blogTitle} | ${site.author}`, desc, site, assets.pageCss, { url, type: "website" })}
<body>
<a class="skip-link" href="#main-content">Skip to main content</a>
<main class="page" id="main-content">
${backLink(site.homeUrl, "Home")}
<div class="post">
${HATCH}
<header class="post-head">
  <h1>${esc(site.blogTitle)}</h1>
  <p class="lede">${esc(desc)}</p>
</header>
${HATCH}
</div>
<ul class="index-list">
${items || `<li><p style="color:var(--muted)">Nothing published yet.</p></li>`}
</ul>
<div class="post">${HATCH}<div class="index-end"></div></div>
</main>
<script>
${safeScript(assets.pageJs)}
</script>
</body>
</html>
`;
}

export type { PostMeta };
