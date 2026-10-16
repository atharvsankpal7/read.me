# Blog Studio

A local React app for writing blog posts that come with an interactive simulation. Every post exports to **one self-contained HTML file** in `../build/blogs/`, styled to match the portfolio, with no runtime dependencies besides Google Fonts.

```bash
cd blog-studio
npm install
npm run dev          # opens the studio at http://localhost:5178
```

## Writing a post

1. **New post** → choose *Article + simulation* (starts with a working queue simulation) or *Article only*.
2. Edit the tabs:
   - **Article**: markdown. Put a line with just `::simulation` where the interactive block should go.
   - **Details**: title, subtitle, date, tags, simulation heading/hint, draft flag.
   - **Markup / Script / Styles**: the simulation (`sim.html`, `sim.js`, `sim.css`).
3. The preview rebuilds as you type. Switch device width and light/dark at the top. Errors and `console.log` from the simulation appear in the **Console** drawer.
4. **Ctrl+S** saves. **Export to blogs/** (Ctrl+Shift+S) writes `build/blogs/<slug>.html` and rebuilds `build/blogs/index.html`.

You can also export without the UI:

```bash
npm run export -- wal-delivery-system   # one post
npm run export -- --all                 # every non-draft post
npm run export -- --index               # just build/blogs/index.html
```

## Files

```
posts/<slug>/post.md     frontmatter + markdown
posts/<slug>/sim.html    simulation markup (inserted into the lab block)
posts/<slug>/sim.js      simulation script
posts/<slug>/sim.css     simulation-specific styles / colour tokens
site.config.json         author, links, blog title, output folder
template/page.css        the post page design (shared with the blog index)
template/kit.css         UI building blocks for simulations
template/page.js         page runtime + the Kit API
starters/                what "New post" copies from
```

Editing anything in `template/` changes every post on the next export. The preview hot-reloads those edits.

## Markdown extras

- `::simulation` places the lab. Without it, the lab goes before the first `##` heading.
- Callouts: `> [!NOTE]`, `[!TIP]`, `[!TRY]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`. Text after the tag becomes the title (`> [!TRY] Break it`).
- Fenced code is syntax-highlighted at export time (js, ts, json, bash, sql, python, go, yaml, html, css, java, rust) and gets a copy button.
- `##` and `###` headings get anchor links and go into the "Table of Contents" block under the title.

## Writing a simulation

`sim.js` runs after the page loads, wrapped in a strict-mode function with two values in scope:

| | |
| --- | --- |
| `root` | the lab element that contains `sim.html`. Query through it: `root.querySelector("#x")` |
| `Kit.loop(fn)` | animation loop, `fn(dtSeconds, nowMs)`. Pauses while the lab is off screen or the tab is hidden |
| `Kit.fitCanvas(canvas, w, h, { min, max, container })` | sizes a canvas for a `w`×`h` logical scene; returns `{ ctx, scale, dpr }` with the transform applied |
| `Kit.colors(["accent", "ok", "my-token"])` | reads CSS custom properties, so canvas colours follow the theme |
| `Kit.onTheme(fn)` | called when the reader switches light/dark; re-read your colours here |
| `Kit.font.sans` / `Kit.font.mono` | font stacks for canvas text |
| `Kit.ready` | promise that resolves once fonts are loaded (start drawing after it) |
| `Kit.esc(s)` | HTML-escape a string |
| `Kit.fail(err)` | show an error box inside the lab |

Page tokens you can use in `sim.css` and `Kit.colors`: `--fg --fg-soft --muted --faint --bg --bg-2 --card --border --border-strong --accent --accent-2 --ok --warn --bad --info`. Define your own colours for both themes:

```css
:root { --q-in: #0d9488; }
:root[data-theme="dark"] { --q-in: #2dd4bf; }
```

Kit CSS classes for the simulation UI (all scoped to the lab): `.toolbar`, `.btn` (`.primary`, `.danger`, `.ghost`, `.sm`), `.sep`, `.push`, `.stats > .stat(.ok|.warn|.bad) > b + span`, `.workspace` (stage + 360px side panel), `.stage`, `.legend`, `.hint`, `.panel` (with `h2`, `.role`, `h3`, `label`, `label.check`, inputs), `dl.kv`, `table.t`, `ul.pods`, `.row`, `.statusgrid`, `.callout`, `.chip`, `.log`. The starter simulation in `starters/simulation/` uses most of them.

## Theme

The portfolio and the blog are light only (cream background, JetBrains Mono, blue links, hatched dividers). The studio preview can still force dark mode, and `Kit.onTheme` fires when it does, so simulations can keep their dark tokens.
