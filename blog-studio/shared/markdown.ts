import { Marked, type Tokens } from "marked";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import sql from "highlight.js/lib/languages/sql";
import python from "highlight.js/lib/languages/python";
import go from "highlight.js/lib/languages/go";
import yaml from "highlight.js/lib/languages/yaml";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import java from "highlight.js/lib/languages/java";
import rust from "highlight.js/lib/languages/rust";
import type { TocItem } from "./types.ts";

const LANGS: Record<string, Parameters<typeof hljs.registerLanguage>[1]> = {
  javascript, typescript, json, bash, sql, python, go, yaml, xml, css, java, rust,
};
for (const [name, lang] of Object.entries(LANGS)) hljs.registerLanguage(name, lang);
const ALIAS: Record<string, string> = { js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript", sh: "bash", shell: "bash", zsh: "bash", py: "python", yml: "yaml", html: "xml", svg: "xml", rs: "rust", postgres: "sql", psql: "sql" };

export const SIM_MARKER = /^[ \t]*::[ \t]*simulation[ \t]*$/m;
/** `::figure <id> <caption>` places a figure registered in figures.js with Kit.figure("<id>", ...). */
export const FIG_MARKER = /^[ \t]*::[ \t]*figure[ \t]+([a-z0-9][a-z0-9-]*)[ \t]*(.*)$/gm;

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const stripTags = (s: string) => s.replace(/<[^>]*>/g, "");
const decodeEntities = (s: string) =>
  s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[e as string]!);

const ICONS: Record<string, string> = {
  note: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  tip: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/>',
  try: '<polygon points="6 3 20 12 6 21 6 3"/>',
  important: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v4M12 14h.01"/>',
  warning: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3z"/><path d="M12 9v4M12 17h.01"/>',
  caution: '<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><path d="M12 8v4M12 16h.01"/>',
};
const CALLOUT_LABEL: Record<string, string> = { note: "Note", tip: "Tip", try: "Try it", important: "Important", warning: "Warning", caution: "Caution" };

export const icon = (paths: string, cls = "") =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

/**
 * Renders markdown for one post. The same renderer instance is used for every chunk of a post
 * so heading ids stay unique across the simulation split.
 */
export function createRenderer() {
  const toc: TocItem[] = [];
  const used = new Map<string, number>();
  const slugify = (text: string) => {
    let base = decodeEntities(stripTags(text)).toLowerCase().trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "section";
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    if (n) base = `${base}-${n}`;
    return base;
  };

  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading(this: { parser: { parseInline(t: Tokens.Generic[]): string } }, { tokens, depth }: Tokens.Heading) {
        const inner = this.parser.parseInline(tokens);
        if (depth === 1) depth = 2; // the page title is the only h1
        const id = slugify(inner);
        if (depth <= 3) toc.push({ id, text: decodeEntities(stripTags(inner)), depth });
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-label="Link to this section">#</a>${inner}</h${depth}>\n`;
      },
      code({ text, lang }: Tokens.Code) {
        const raw = (lang || "").trim().split(/\s+/)[0].toLowerCase();
        const name = ALIAS[raw] || raw;
        let html: string;
        if (name && hljs.getLanguage(name)) html = hljs.highlight(text, { language: name, ignoreIllegals: true }).value;
        else html = escapeHtml(text);
        const label = raw || "text";
        return `<div class="code"><div class="code-head"><span>${escapeHtml(label)}</span><button class="copy" type="button">Copy</button></div><pre><code class="hljs language-${escapeHtml(name || "text")}">${html}</code></pre></div>\n`;
      },
      blockquote(this: { parser: { parse(t: Tokens.Generic[]): string } }, { tokens }: Tokens.Blockquote) {
        let inner = this.parser.parse(tokens);
        const m = /^<p>\[!(note|tip|try|important|warning|caution)\][ \t]*([^\n<]*)\n?/i.exec(inner);
        if (!m) return `<blockquote>\n${inner}</blockquote>\n`;
        const kind = m[1].toLowerCase();
        const title = m[2].trim() || CALLOUT_LABEL[kind];
        inner = "<p>" + inner.slice(m[0].length);
        inner = inner.replace(/^<p>\s*<\/p>\n?/, "");
        return `<aside class="callout ${kind}" role="note"><span class="callout-icon">${icon(ICONS[kind])}</span><div class="callout-title">${title}</div><div class="callout-body">${inner}</div></aside>\n`;
      },
      link(this: { parser: { parseInline(t: Tokens.Generic[]): string } }, { href, title, tokens }: Tokens.Link) {
        const inner = this.parser.parseInline(tokens);
        const external = /^https?:\/\//i.test(href);
        const t = title ? ` title="${escapeHtml(title)}"` : "";
        return `<a href="${escapeHtml(href)}"${t}${external ? ' target="_blank" rel="noopener"' : ""}>${inner}</a>`;
      },
    },
  });

  return {
    toc,
    render: (md: string) => marked.parse(md, { async: false }) as string,
    inline: (md: string) => marked.parseInline(md, { async: false }) as string,
  };
}

/** Splits the body at the `::simulation` line. With no marker, the lab goes before the first `## ` heading. */
export function splitAtSimulation(body: string): [string, string] {
  const m = SIM_MARKER.exec(body);
  if (m) return [body.slice(0, m.index), body.slice(m.index + m[0].length)];
  const h = /^##\s/m.exec(body);
  if (h) return [body.slice(0, h.index), body.slice(h.index)];
  return [body, ""];
}

export function readingMinutes(body: string): number {
  const words = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return Math.max(1, Math.round(words / 230));
}
