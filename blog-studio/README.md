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
   - **Figures / Figure styles**: small animated figures placed through the article (`figures.js`, `figures.css`).
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
posts/<slug>/figures.js  the figures, one Kit.figure(id, setup) per `::figure` line
posts/<slug>/figures.css figure-specific styles
site.config.json         author, links, blog title, output folder
template/page.css        the post page design (shared with the blog index)
template/kit.css         UI building blocks for simulations
template/page.js         page runtime + the Kit API
template/figure.css      the figure panel, its chrome and colours
starters/                what "New post" copies from
```

Editing anything in `template/` changes every post on the next export. The preview hot-reloads those edits.

## Markdown extras

- `::simulation` places the lab. Without it, the lab goes before the first `##` heading.
- `::figure <id> <caption>` places a figure. Figures are numbered in order and the caption takes inline markdown.
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

## Writing figures

A post can have one big simulation and any number of small figures, one per idea, the way long-form engineering posts break a system down. Each `::figure <id>` line becomes a panel in the site style (card, zinc frame, hatched divider) that breaks out of the text column a little, with a caption underneath. `figures.js` fills it:

```js
Kit.figure("acks", f => {
  f.chrome({ tag: "kafka · replication", label: "what an ack is worth" }); // pill + label header, big readout, actions, stage, foot
  f.status("waiting");                       // right side of the header
  f.big("0", "acked logs lost");             // the big number and its unit
  f.button("▶ replay", run, { primary: true });
  const mode = f.segmented([["1", "acks=1"], ["all", "acks=all"]], "1", run);
  const svg = f.svg(880, 260, { minWidth: 660 }); // scales with the panel, scrolls sideways on phones
  function run() {
    f.run(async s => {                       // starting a new run cancels the old one
      await s.tween(600, t => { /* t goes 0 → 1, eased */ });
      await s.wait(400);
    });
  }
  f.onEnter(run);                            // first time the figure is mostly on screen
});
```

| | |
| --- | --- |
| `f.chrome(o)` | builds the header (`o.tag`, `o.label`), big readout, `f.actions`, `f.stage` and `f.foot` |
| `f.run(fn)` / `f.stop()` | async sequence with `s.wait(ms)` and `s.tween(ms, fn, ease)`; replays cancel cleanly |
| `f.steps(list, o)` | step-by-step playback with `← prev`, `▶ play` / `❚❚ pause` and `next →` buttons, step dots and a narration line (see below) |
| `f.loop(fn)` | per-frame `fn(dt, timeMs)` |
| `f.onEnter(fn)` | autoplay hook |
| `Kit.h` / `Kit.s` | build HTML / SVG elements: `Kit.s("rect", { x: 0, width: 10, onclick: fn }, [children])` |
| `Kit.pointAt(path, t)` | point along an SVG path, for dots that travel along wires |
| `Kit.ease` | `linear`, `out`, `inOut` |

Each figure has its own clock that only runs while it is on screen, so a figure you scrolled past picks up where it left off. With reduced motion, tweens jump straight to their end state; waits still happen, so sequences step instead of glide. `template/figure.css` also has `.fx-flow` (moving dashes on a wire), `.fx-pop` (a label that rises and fades), `.fx-say`, `.fx-steps`, `.fx-tip`, `.fx-range` and `.fig-key` for figure UIs.

### Steps

All figures in the WAL post use `f.steps`. Split the animation into steps. Each step has a title, a narration text and a `play(s)` function:

```js
const steps = f.steps([
  { title: "write", text: "The producer sends offset 42.", play: async s => { /* animate */ } },
  { title: "crash", text: () => `The text can be a function.`, play: s => crash(s) },
], {
  reset() { /* put the figure back to the state before step 1 */ },
  enter(i) { /* optional: runs when step i starts, e.g. highlight boxes, clear old labels */ },
  gap: 1500,         // ms between steps while autoplay is on
  autoplay: true,    // start when the figure comes into view
});
// steps.go(i), steps.redo(), steps.seek(i), steps.index
```

- Autoplay starts when the figure comes into view. It plays every step in order and stops after the last step. The button then shows `↻ replay`.
- `prev`, `next`, a step dot and the arrow keys (when focus is in the figure) pause autoplay and play only that step.
- `▶ play` continues from the next step. `❚❚ pause` lets the current step finish, then stops.
- To go to step `i`, the player calls `reset()` and runs steps `0 … i-1` with `s.fast` set. With `s.fast`, waits end at once and tweens jump to their end. Thus each `play(s)` must get to the same end state at any speed. Do not let `setTimeout` change state. Use `s.wait(ms).then(fn, () => {})` instead.
- When a scenario control changes (a route, a drop count), call `steps.redo()` or `steps.go(i, true)` to play a step again with the new value. The `true` keeps autoplay on or off as it was.
- When the figure moves itself (a scrub, a slider), call `steps.seek(i)`. This stops the animation, pauses autoplay and marks step `i` as the current step.

## Theme

The studio itself (`src/styles.css`) uses the same tokens as the portfolio and the posts, and the code editor uses the same syntax colours as code blocks in posts (`template/hljs.css`). Figures are light panels in the same style; their colours live in `template/figure.css` and `figures.js` reads them from there.


The portfolio and the blog are light only (cream background, JetBrains Mono, blue links, hatched dividers). The studio preview can still force dark mode, and `Kit.onTheme` fires when it does, so simulations can keep their dark tokens.
