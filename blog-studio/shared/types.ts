/** Frontmatter of post.md. Everything except title is optional. */
export interface PostMeta {
  title: string;
  /** One or two sentences shown under the title and used as the meta description. */
  subtitle?: string;
  /** ISO date, e.g. 2026-10-15 */
  date?: string;
  tags?: string[];
  /** Heading of the simulation block. */
  simTitle?: string;
  /** One line under the simulation heading telling readers what they can do. */
  simHint?: string;
  /** Show the "On this page" sidebar on wide screens (default true). */
  toc?: boolean;
  /** Drafts are skipped by `npm run export -- --all` and hidden from the blog index. */
  draft?: boolean;
}

/** A post as the studio edits it. On disk: posts/<slug>/post.md (+ sim.html, sim.js, sim.css, figures.js, figures.css). */
export interface PostSource {
  slug: string;
  meta: PostMeta;
  /** Markdown body (no frontmatter). Put a line with just `::simulation` where the lab should go,
   *  and `::figure <id> <caption>` lines where figures go. */
  body: string;
  simHtml: string;
  simJs: string;
  simCss: string;
  /** figures.js: registers the small animated figures placed with `::figure <id>` lines. */
  figJs: string;
  /** figures.css: styles for those figures. */
  figCss: string;
}

export interface PostSummary {
  slug: string;
  meta: PostMeta;
  hasSim: boolean;
  /** Estimated reading time, used by the blog index previews. */
  minutes?: number;
  /** Path of the exported file relative to the repo, when it exists. */
  exported: string | null;
  updatedAt: number;
}

export interface SiteConfig {
  author: string;
  authorRole?: string;
  authorBio?: string;
  /** Link back to the portfolio, relative to the exported post. */
  homeUrl: string;
  homeLabel?: string;
  blogTitle: string;
  blogDescription?: string;
  /** Where exported HTML goes, relative to the blog-studio folder. */
  outputDir: string;
  /** Absolute site URL (optional), used for canonical and og:url tags. */
  siteUrl?: string;
  /** Path of the blog folder on the site, e.g. "blogs/". Used with siteUrl. */
  blogPath?: string;
}

/** Raw template files that get inlined into every exported page. */
export interface Assets {
  pageCss: string;
  kitCss: string;
  hljsCss: string;
  pageJs: string;
  figureCss: string;
}

export interface BuildOptions {
  /** Studio preview: adds the console bridge and keeps links from navigating the iframe. */
  preview?: boolean;
  /** Force a theme instead of following the reader's setting (preview only). */
  forceTheme?: "light" | "dark";
  /** Restore this scroll position after load (preview only). */
  scrollY?: number;
  /** Older and newer published posts, for the Previous / Next links under the article. */
  neighbors?: { prev?: { slug: string; title: string }; next?: { slug: string; title: string } };
}

export interface TocItem {
  id: string;
  text: string;
  depth: number;
}
