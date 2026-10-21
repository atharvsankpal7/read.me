/*
 * Figures for the HTTP empty list post. Each Kit.figure(id, setup) fills the `::figure <id>` block
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


/* ======================================================================
   Figure: a filtered list with no results, 404 vs 200
   ====================================================================== */
Kit.figure("emptylist", f => {
  f.chrome({ tag: "http · status codes", label: "an empty list" });
  const svg = f.svg(880, 270, { label: "A component, the API layer, the backend and the database answering a filtered list request", minWidth: 660 });
  const wires = sv("g"), nodes = sv("g"), fx = sv("g");
  svg.append(wires, nodes, fx);

  const W = {
    uiApi: wire(wires, "M220,90 H290"),
    apiBe: wire(wires, "M430,90 H520"),
    beDb: wire(wires, "M660,90 H730"),
  };
  const ui = box(nodes, { x: 10, y: 20, w: 210, h: 236, top: 22, label: "component", sub: "item list", color: C.ui });
  const api = box(nodes, { x: 290, y: 20, w: 140, h: 140, top: 22, label: "api layer", sub: "fetch + errors", color: C.api });
  const be = box(nodes, { x: 520, y: 20, w: 140, h: 140, top: 22, label: "backend", sub: "GET /items", color: C.a });
  const db = box(nodes, { x: 730, y: 20, w: 140, h: 140, top: 22, label: "database", sub: "items", color: C.db });
  /* the rendered UI, and the glue code the 404 version needs */
  const screen = sv("rect", { x: 24, y: 70, width: 182, height: 64, "stroke-width": 1 });
  screen.style.cssText = `fill:${C.bg};stroke:${C.line2};transition:stroke .3s ease, fill .3s ease`;
  nodes.appendChild(screen);
  const screenT = txt(nodes, 115, 98, "", { size: 11, anchor: "middle", color: C.ink, weight: 600 });
  const screenS = txt(nodes, 115, 116, "", { size: 10, anchor: "middle" });
  const glue = [0, 1, 2].map(i => txt(nodes, 24, 170 + i * 18, "", { size: 10.5, color: C.bad }));
  const status = txt(nodes, 360, 196, "", { size: 22, weight: 600, anchor: "middle" });
  const statusS = txt(nodes, 360, 216, "", { size: 10.5, anchor: "middle" });

  const mode = f.segmented([["404", "404 (legacy)"], ["200", "200 + []"]], "404", () => steps.redo(), { label: "Response" });
  const legacy = () => mode.value === "404";
  const setScreen = (t, sub, color) => {
    screenT.textContent = t; screenS.textContent = sub || "";
    screenT.style.fill = color || C.ink;
    screen.style.stroke = color || C.line2;
  };
  const setGlue = on => {
    const lines = on ? ["// glue code in the component", "if (err.status === 404)", "  showEmptyList()"] : ["", "", ""];
    glue.forEach((t, i) => { t.textContent = lines[i]; t.style.fill = i ? C.bad : C.muted; });
  };
  const setStatus = (code, sub, color) => { status.textContent = code; status.style.fill = color || C.ink; statusS.textContent = sub || ""; };

  /* before step 1: nothing requested */
  function reset() {
    fx.replaceChildren();
    [ui, api, be, db].forEach(b => b.state("idle"));
    setScreen("", ""); setGlue(false); setStatus("", "");
    db.text("items");
    f.big("GET", "/items?color=purple&size=xs");
    f.status(legacy() ? "the legacy backend" : "the fixed backend");
  }
  function enter() { fx.replaceChildren(); Object.values(W).forEach(w => lit(w)); }
  async function hop(s, w, color, back) {
    lit(w, color);
    await travel(s, fx, w, color, 420, { reverse: back });
    lit(w);
  }

  const STEPS = [
    {
      title: "request",
      text: "The frontend asks for a list of items with filters. The headers are correct, it is authenticated, and it accesses the correct set of entities.",
      async play(s) {
        ui.state("on"); setScreen("loading…", "", C.muted);
        await hop(s, W.uiApi, C.ui);
        api.state("on");
        await hop(s, W.apiBe, C.api);
        be.state("on");
        await hop(s, W.beDb, C.a);
        db.state("on");
      },
    },
    {
      title: "no rows",
      text: "The database has no items that match the filters. That is still an answer to a valid request.",
      async play(s) {
        db.text("0 rows", C.ink);
        pop(fx, 800, 14, "0 rows", C.ink);
        await hop(s, W.beDb, C.db, true);
        db.state("idle");
      },
    },
    {
      get title() { return legacy() ? "404" : "200 []"; },
      text: () => legacy()
        ? "The backend sends 404 Not Found. The API layer sees an error, so the component needs glue code that turns this status code into the empty list message."
        : "The backend sends 200 OK with an empty list. The API layer passes the data on, and the component renders the empty list message from the data.",
      async play(s) {
        const color = legacy() ? C.bad : C.ok;
        setStatus(legacy() ? "404" : "200", legacy() ? "Not Found" : "OK · []", color);
        await hop(s, W.apiBe, color, true);
        be.state("idle");
        api.state(legacy() ? "bad" : "ok");
        await hop(s, W.uiApi, color, true);
        if (legacy()) { setGlue(true); await s.wait(500); }
        setScreen("No items match", "your filters", C.ink);
        ui.state("ok");
        f.big(legacy() ? "404" : "200", legacy() ? "for a valid request" : "a valid request, a valid response", legacy() ? BADT : OKT);
        await s.wait(500);
      },
    },
    {
      title: "a real 404",
      text: () => legacy()
        ? "Later, a real error comes back: the route was renamed, and that is also a 404. The glue code shows \"No items match\", so the real error is hidden."
        : "A real error, like GET /items/<uuid> for a deleted item, is a 404. The API layer handles it in one place, with a generalized error message.",
      async play(s) {
        [ui, api].forEach(b => b.state("idle"));
        setStatus("404", legacy() ? "route not found" : "item not found", C.bad);
        f.big("404", legacy() ? "a real error" : "a specific entity is missing", C.bad);
        await hop(s, W.uiApi, C.ui);
        api.state("on");
        await s.wait(300);
        api.state("bad");
        await hop(s, W.uiApi, C.bad, true);
        if (legacy()) {
          setScreen("No items match", "your filters", C.warn);
          ui.state("bad");
          f.status("the real error is hidden by the glue code", BADT);
        } else {
          setScreen("Something went wrong", "generalized message", C.bad);
          ui.state("ok");
          f.status("errors handled in the API layer", OKT);
        }
        await s.wait(600);
      },
    },
  ];
  const steps = f.steps(STEPS, { reset, enter });
});
