/*
 * Figures for the logging post. Each Kit.figure(id, setup) fills the `::figure <id>` block
 * with the same name in post.md.
 */
const { h, s: sv } = Kit;

/* colours come from template/figure.css (--fx-*), so the figures follow the site theme from one place.
   bg is the stage surface, bg2 the card the boxes sit on. */
const CSSV = getComputedStyle(document.querySelector("figure.fig") || document.documentElement);
const v = n => CSSV.getPropertyValue("--fx-" + n).trim();
const C = {
  bg: v("bg-2"), bg2: v("bg"), line: v("line"), line2: v("line-2"),
  ink: v("ink"), soft: v("soft"), muted: v("muted"), faint: v("faint"), accent: v("accent"),
  ok: v("ok"), bad: v("bad"), warn: v("warn"),
  /* diagram parts */
  a: v("prod"), b: v("cons"), db: v("pg"), api: v("kafka"), ui: v("dest"), os: v("retry"), net: v("cp"),
};
const OKT = C.ok, BADT = C.bad, WARNT = C.warn;

/* ---------- small SVG kit ---------- */

/* labelled box with a coloured accent bar; state() switches idle / on / dim / bad / ok */
function box(svg, o) {
  const g = sv("g");
  const rect = sv("rect", { x: o.x, y: o.y, width: o.w, height: o.h, rx: o.r ?? 0, "stroke-width": 1.2 });
  rect.style.cssText = `fill:${C.bg2};stroke:${C.line2};transition:fill .35s ease, stroke .35s ease`;
  const bar = sv("rect", { x: o.x, y: o.y + 9, width: 3, height: (o.barH || o.h) - 18, rx: 1.5, fill: o.color });
  const size = o.size || 13;
  const top = o.top ?? (o.sub != null ? o.h / 2 - 3 : o.h / 2 + 4.5);
  const label = sv("text", { x: o.x + 14, y: o.y + top, "font-size": size, "font-weight": 600, text: o.label });
  label.style.fill = C.ink;
  const sub = o.sub != null ? sv("text", { x: o.x + 14, y: o.y + top + 16, "font-size": 10.5, text: o.sub }) : null;
  if (sub) sub.style.fill = C.muted;
  g.append(rect, bar, label);
  if (sub) g.append(sub);
  g.style.transition = "opacity .35s ease";
  (o.parent || svg).appendChild(g);
  return {
    g, rect, label, sub, x: o.x, y: o.y, w: o.w, h: o.h, cx: o.x + o.w / 2, cy: o.y + o.h / 2, color: o.color,
    state(st) {
      rect.style.stroke = st === "on" ? o.color : st === "bad" ? C.bad : st === "ok" ? C.ok : C.line2;
      rect.style.fill = st === "on" ? o.color + "1f" : st === "bad" ? C.bad + "17" : st === "ok" ? C.ok + "14" : C.bg2;
      g.style.opacity = st === "dim" ? 0.42 : 1;
    },
    text(t, color) { if (sub) { sub.textContent = t; sub.style.fill = color || C.muted; } },
  };
}

function wire(parent, d, o = {}) {
  const p = sv("path", { d, fill: "none", "stroke-width": o.w || 1.4, "stroke-linecap": "round", "stroke-dasharray": o.dash || null });
  p.style.cssText = `stroke:${o.color || C.line2};transition:stroke .35s ease, opacity .35s ease`;
  parent.appendChild(p);
  return p;
}
const lit = (p, color) => { p.style.stroke = color || C.line2; p.classList.toggle("fx-flow", !!color); };

function txt(parent, x, y, text, o = {}) {
  const t = sv("text", { x, y, "font-size": o.size || 11, "text-anchor": o.anchor || "start", "font-weight": o.weight || null, text });
  t.style.fill = o.color || C.muted;
  parent.appendChild(t);
  return t;
}

/* a dot that travels along a path; o.reverse runs it backwards, o.to stops part way */
async function travel(s, layer, path, color, ms = 700, o = {}) {
  const c = sv("circle", { r: o.r || 5, cx: -99, cy: -99, fill: color, stroke: C.bg, "stroke-width": 2 });
  layer.appendChild(c);
  const to = o.to ?? 1;
  try {
    await s.tween(ms, t => {
      const u = t * to, p = Kit.pointAt(path, o.reverse ? 1 - u : u);
      c.setAttribute("cx", p.x); c.setAttribute("cy", p.y);
    }, o.ease || Kit.ease.inOut);
  } finally {
    c.remove();
  }
}

/* a block of data that moves from one place to another along a small arc */
async function slide(s, layer, o, ms = 800) {
  const r = sv("rect", { x: o.x0, y: o.y0, width: o.w, height: o.h, "stroke-width": 1.2 });
  r.style.cssText = `fill:${o.color}33;stroke:${o.color}`;
  const t = o.label ? txt(layer, 0, 0, o.label, { size: 10.5, anchor: "middle", color: C.ink, weight: 600 }) : null;
  layer.appendChild(r);
  if (t) layer.appendChild(t);
  try {
    await s.tween(ms, k => {
      const x = Kit.lerp(o.x0, o.x1, k), y = Kit.lerp(o.y0, o.y1, k) - (o.arc ?? 40) * Math.sin(Math.PI * k);
      r.setAttribute("x", x); r.setAttribute("y", y);
      if (t) { t.setAttribute("x", x + o.w / 2); t.setAttribute("y", y + o.h / 2 + 4); }
    });
  } finally {
    r.remove();
    if (t) t.remove();
  }
}

/* a short label that rises and fades; removed after it finishes */
function pop(layer, x, y, text, color = C.ink, o = {}) {
  const t = sv("text", { x, y, "font-size": o.size || 11.5, "font-weight": 600, "text-anchor": o.anchor || "middle", class: "fx-pop", text });
  t.style.fill = color;
  t.style.animationDuration = (o.ms || 1600) + "ms";
  layer.appendChild(t);
  setTimeout(() => t.remove(), (o.ms || 1600) + 50);
  return t;
}

/* a small cell (a page, a block, a buffer slot) with a label; fill() colours it, clear() empties it */
function cell(parent, x, y, w, ht, o = {}) {
  const r = sv("rect", { x, y, width: w, height: ht, "stroke-width": 1 });
  r.style.cssText = `fill:${C.bg};stroke:${C.line2};transition:fill .3s ease, stroke .3s ease`;
  parent.appendChild(r);
  const t = txt(parent, x + w / 2, y + (o.sub ? ht / 2 - 1 : ht / 2 + 4), o.text || "", { size: o.size || 10.5, anchor: "middle", color: C.ink, weight: 600 });
  const sub = o.sub ? txt(parent, x + w / 2, y + ht / 2 + 12, o.sub, { size: 9.5, anchor: "middle" }) : null;
  return {
    r, t, sub, x, y, w, h: ht,
    fill(color, text) {
      r.style.fill = color ? color + "26" : C.bg;
      r.style.stroke = color || C.line2;
      if (text != null) t.textContent = text;
    },
    clear() { this.fill(null, o.text || ""); if (sub) sub.textContent = o.sub; },
  };
}


/* the same ten events for both figures' log lines: [level, event] */
const LEVELS = ["info", "warning", "error", "fatal"];
const LEVEL_COLOR = { info: C.net, warning: C.warn, error: C.bad, fatal: C.bad };
const EVENTS = [
  ["info", "login_success user=11001"],
  ["info", "test_updated test_id=30023"],
  ["warning", "payment_slow duration_ms=4200"],
  ["info", "login_success user=11002"],
  ["error", "db_query_failed timeout=5s"],
  ["info", "file_uploaded file=report.pdf"],
  ["warning", "payment_slow duration_ms=3900"],
  ["info", "login_success user=11003"],
  ["fatal", "out_of_memory heap=4GB"],
  ["info", "profile_page_load duration_ms=120"],
];

/* a log line in the stream: a level chip and the event */
function logLine(parent, x, y, level, event) {
  const g = sv("g");
  parent.appendChild(g);
  const chip = sv("rect", { x, y, width: 64, height: 20, "stroke-width": 1 });
  chip.style.cssText = `fill:${LEVEL_COLOR[level]}1f;stroke:${LEVEL_COLOR[level]}`;
  g.appendChild(chip);
  txt(g, x + 32, y + 14, level.toUpperCase(), { size: 9.5, anchor: "middle", color: LEVEL_COLOR[level], weight: 600 });
  txt(g, x + 76, y + 14, event, { size: 11, color: C.ink });
  g.style.transition = "opacity .3s ease";
  return g;
}

/* ======================================================================
   Figure: log levels and verbosity
   ====================================================================== */
Kit.figure("levels", f => {
  f.chrome({ tag: "log levels", label: "what gets stored" });
  const svg = f.svg(880, 290, { label: "Ten log events of different levels, filtered by the verbosity level", minWidth: 660 });
  const nodes = sv("g"), fx = sv("g");
  svg.append(nodes, fx);

  box(nodes, { x: 10, y: 10, w: 860, h: 272, top: 22, label: "log stream", sub: "", color: C.api });
  const level = f.segmented(LEVELS.slice(0, 3).map(l => [l, l]), "info", () => steps.redo(), { label: "Level" });
  const rank = l => LEVELS.indexOf(l);
  let lines = [];

  function reset() {
    fx.replaceChildren();
    lines.forEach(g => g.remove());
    lines = [];
    f.big("0", "lines stored");
    f.status(`level = ${level.value}: store ${level.value} and above`);
  }

  const STEPS = [
    {
      title: "events",
      text: "Ten events happen in the backend: normal operations, potential issues, serious problems and one critical failure.",
      async play(s) {
        for (const [i, [lv, ev]] of EVENTS.entries()) {
          lines.push(logLine(nodes, 26 + (i >= 5 ? 430 : 0), 52 + (i % 5) * 44, lv, ev));
          f.big(String(i + 1), "events");
          await s.wait(140);
        }
        await s.wait(300);
      },
    },
    {
      title: "filter",
      text: () => level.value === "info"
        ? "With the level at info, every line is stored. That is useful while debugging, but it is a lot of logs."
        : `With the level at ${level.value}, only ${level.value} and above are stored. Lower the level only while you debug.`,
      async play(s) {
        await s.wait(300);
        let kept = 0;
        EVENTS.forEach(([lv], i) => {
          const keep = rank(lv) >= rank(level.value);
          lines[i].style.opacity = keep ? 1 : 0.15;
          if (keep) kept++;
        });
        f.big(String(kept), `of 10 lines stored at ${level.value}`, kept < 10 ? OKT : WARNT);
        await s.wait(600);
      },
    },
  ];
  const steps = f.steps(STEPS, { reset, enter: () => fx.replaceChildren() });
});

/* ======================================================================
   Figure: sampling login attempts
   ====================================================================== */
Kit.figure("sampling", f => {
  f.chrome({ tag: "log sampling", label: "2 out of 10" });
  const svg = f.svg(880, 230, { label: "Ten login attempts sent to a logger that logs all or a sample of them", minWidth: 660 });
  const wires = sv("g"), nodes = sv("g"), fx = sv("g");
  svg.append(wires, nodes, fx);

  const inW = wire(wires, "M160,110 H320");
  const outW = wire(wires, "M460,110 H560");
  const app = box(nodes, { x: 10, y: 78, w: 150, h: 64, label: "auth service", sub: "login attempts", color: C.a });
  const logger = box(nodes, { x: 320, y: 78, w: 140, h: 64, label: "logger", sub: "", color: C.api });
  const store = box(nodes, { x: 560, y: 10, w: 310, h: 210, top: 22, label: "log storage", sub: "", color: C.db });
  const slots = Array.from({ length: 10 }, (_, i) => cell(nodes, 576 + (i % 5) * 58, 60 + Math.floor(i / 5) * 70, 50, 54, { text: "", sub: " " }));

  const mode = f.segmented([["all", "log all"], ["sample", "sample 2 of 10"]], "sample", () => steps.redo(), { label: "Mode" });
  const sampled = () => mode.value === "sample";
  /* every 5th attempt is kept: 2 out of 10 */
  const keep = i => !sampled() || i % 5 === 0;
  let stored = 0;
  const count = () => { store.text(`${stored} ${stored === 1 ? "line" : "lines"}`, C.ink); f.big(String(stored), "of 10 attempts logged"); };

  function reset() {
    fx.replaceChildren();
    stored = 0;
    slots.forEach(c => c.clear());
    logger.text(sampled() ? "rate = 0.2" : "rate = 1");
    [app, logger, store].forEach(b => b.state("idle"));
    count();
    f.status(sampled() ? "non-critical events are sampled" : "every attempt is logged");
  }
  function enter() { fx.replaceChildren(); lit(inW); lit(outW); }

  const STEPS = [
    {
      title: "attempts",
      text: () => sampled()
        ? "Ten login attempts reach the logger. It writes only 2 out of 10 to storage, and skips the rest."
        : "Ten login attempts reach the logger, and it writes every one of them to storage.",
      async play(s) {
        app.state("on");
        for (let i = 0; i < 10; i++) {
          lit(inW, C.a);
          await travel(s, fx, inW, C.a, 260);
          if (keep(i)) {
            lit(outW, C.api);
            await travel(s, fx, outW, C.api, 220);
            slots[stored].fill(C.api, "login");
            slots[stored].sub.textContent = "#" + (i + 1);
            stored++; count();
          } else {
            pop(fx, 390, 70, "skip", C.muted, { size: 10.5, ms: 700 });
          }
        }
        [inW, outW].forEach(w => lit(w)); app.state("idle");
      },
    },
    {
      title: "result",
      text: () => sampled()
        ? "2 lines instead of 10. They still show how often users log in, at a fifth of the volume. Errors are not sampled."
        : "10 lines for 10 routine logins. At scale, this is a lot of storage for events that are not critical.",
      async play(s) {
        store.state(sampled() ? "ok" : "idle");
        f.big(String(stored), sampled() ? "lines · 80% less volume" : "lines for 10 attempts", sampled() ? OKT : WARNT);
        await s.wait(700);
      },
    },
  ];
  const steps = f.steps(STEPS, { reset, enter });
});
