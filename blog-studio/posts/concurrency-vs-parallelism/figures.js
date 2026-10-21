/*
 * Figures for the concurrency and parallelism post. Each Kit.figure(id, setup) fills the `::figure <id>` block
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
   Figure: one CPU, process A waits for the database
   ====================================================================== */
Kit.figure("concurrency", f => {
  f.chrome({ tag: "1 cpu · i/o bound", label: "who uses the cpu" });
  const svg = f.svg(880, 230, { label: "A timeline of one CPU and two processes, run one at a time or concurrently", minWidth: 660 });
  const grid = sv("g"), bars = sv("g"), fx = sv("g");
  svg.append(grid, bars, fx);

  const X0 = 130, U = 55, ROWS = { cpu: 26, A: 86, B: 136 }, RH = 34;
  const tx = t => X0 + t * U;
  txt(grid, 16, ROWS.cpu + 22, "CPU", { size: 12, weight: 600, color: C.ink });
  txt(grid, 16, ROWS.A + 22, "process A", { size: 12, weight: 600, color: C.ink });
  txt(grid, 16, ROWS.B + 22, "process B", { size: 12, weight: 600, color: C.ink });
  for (let t = 0; t <= 13; t++) {
    const l = sv("path", { d: `M${tx(t)},18 V178`, "stroke-width": 1 });
    l.style.stroke = C.line;
    grid.appendChild(l);
    txt(grid, tx(t), 196, String(t), { size: 10, anchor: "middle", color: C.faint });
  }
  txt(grid, X0, 218, "time units", { size: 10, color: C.faint });

  /* what each row does, per mode: [row, from, to, kind, label] */
  const PLANS = {
    seq: [
      ["cpu", 0, 2, "A", "A"], ["cpu", 2, 6, "idle", "idle"], ["cpu", 6, 8, "A", "A"], ["cpu", 8, 13, "B", "B"],
      ["A", 0, 2, "A", "run"], ["A", 2, 6, "io", "waits for db"], ["A", 6, 8, "A", "run"],
      ["B", 0, 8, "wait", "not started"], ["B", 8, 13, "B", "run"],
    ],
    conc: [
      ["cpu", 0, 2, "A", "A"], ["cpu", 2, 7, "B", "B"], ["cpu", 7, 9, "A", "A"],
      ["A", 0, 2, "A", "run"], ["A", 2, 6, "io", "waits for db"], ["A", 6, 7, "ready", "ready"], ["A", 7, 9, "A", "run"],
      ["B", 0, 2, "ready", "ready"], ["B", 2, 7, "B", "run"],
    ],
  };
  const STOPS = { seq: [0, 2, 6, 8, 13], conc: [0, 2, 6, 7, 9] };
  const COLOR = { A: C.a, B: C.b, io: C.db, idle: C.bad, ready: C.warn, wait: C.faint };

  const mode = f.segmented([["seq", "one at a time"], ["conc", "concurrent"]], "seq", () => steps.redo(), { label: "Mode" });
  const plan = () => PLANS[mode.value], stops = () => STOPS[mode.value];
  const head = sv("path", { d: "M0,14 V182", "stroke-width": 2 });
  head.style.stroke = C.accent;
  fx.appendChild(head);
  let T = 0;

  /* the bars for the current mode are drawn once, whole; a clip that follows the playhead reveals them,
     so labels slide in with their bar instead of popping in */
  const clip = sv("clipPath", { id: "cc-reveal" }, [sv("rect", { x: 0, y: 0, width: 0, height: 200 })]);
  svg.prepend(sv("defs", {}, [clip]));
  bars.setAttribute("clip-path", "url(#cc-reveal)");
  /* the readout keeps its width while the numbers change */
  f.bigEl.style.display = "inline-block";
  f.bigEl.style.minWidth = "4ch";
  function draw() {
    bars.replaceChildren();
    for (const [row, a, b, kind, label] of plan()) {
      const y = ROWS[row], color = COLOR[kind], solid = kind === "A" || kind === "B";
      const r = sv("rect", { x: tx(a) + 1, y, width: (b - a) * U - 2, height: RH, "stroke-width": 1.2 });
      r.style.cssText = `fill:${color}${solid ? "33" : "14"};stroke:${color}`;
      if (!solid) r.setAttribute("stroke-dasharray", "4 3");
      bars.appendChild(r);
      if ((b - a) * U > label.length * 7 + 10) txt(bars, tx(a) + 8, y + 22, label, { size: 11, color: solid ? C.ink : color, weight: solid ? 600 : null });
    }
  }
  let shown = -1;
  function render(t) {
    T = t;
    clip.firstChild.setAttribute("width", tx(t));
    head.setAttribute("transform", `translate(${tx(t)},0)`);
    /* whole units only, so the text doesn't change width on every frame */
    const k = Math.floor(t + 1e-6);
    if (k === shown) return;
    shown = k;
    const busy = plan().filter(p => p[0] === "cpu" && p[3] !== "idle").reduce((n, [, a, b]) => n + Math.max(0, Math.min(k, b) - a), 0);
    f.big(k ? `${Math.round(100 * busy / k)}%` : "—", `cpu busy · ${busy} of ${k} units`);
  }
  async function to(s, b) {
    const a = T;
    await s.tween((b - a) * 320, k => render(Kit.lerp(a, b, k)), Kit.ease.linear);
  }

  function reset() { draw(); shown = -1; render(0); f.status(mode.value === "seq" ? "B starts only after A is done" : "B runs while A waits"); }

  const seq = () => mode.value === "seq";
  const STEPS = [
    {
      title: "A runs",
      text: "Process A runs on the CPU, then sends a query to the database.",
      play: s => to(s, stops()[1]),
    },
    {
      title: "A waits",
      text: () => seq()
        ? "Process A waits for the database to respond. Nothing else is allowed to run, so our CPU sits idle."
        : "While process A is waiting for the database, the CPU executes process B in the meantime.",
      play: async s => { await to(s, stops()[2]); f.status(seq() ? "4 units of idle CPU" : "no idle CPU", seq() ? BADT : OKT); },
    },
    {
      title: "I/O done",
      text: () => seq()
        ? "The database responds and process A runs again. Process B still hasn't started."
        : "The I/O for process A is complete, but it doesn't run at once. It is in the ready queue until the scheduler picks it.",
      play: s => to(s, stops()[3]),
    },
    {
      title: "done",
      text: () => seq()
        ? "Both processes are done after 13 units, and the CPU was busy for 9 of them."
        : "Both processes are done after 9 units. The CPU was busy all the time: it did more in less time.",
      play: async s => {
        await to(s, stops()[4]);
        f.status(seq() ? "done at 13" : "done at 9", seq() ? WARNT : OKT);
      },
    },
  ];
  const steps = f.steps(STEPS, { reset, enter: () => {} });
});

/* ======================================================================
   Figure: CSV subprocesses on a 4 vCPU machine
   ====================================================================== */
Kit.figure("parallelism", f => {
  f.chrome({ tag: "4 vcpu · cpu bound", label: "csv subprocesses" });
  const svg = f.svg(880, 270, { label: "Four vCPUs running CSV parsing subprocesses next to client requests", minWidth: 660 });
  const wires = sv("g"), nodes = sv("g"), fx = sv("g");
  svg.append(wires, nodes, fx);

  const srv = box(nodes, { x: 10, y: 96, w: 150, h: 70, label: "backend", sub: "spawns subprocesses", color: C.a });
  const req = box(nodes, { x: 10, y: 196, w: 150, h: 56, label: "clients", sub: "requests", color: C.net });
  const CX = i => 220 + i * 165;
  const cores = [0, 1, 2, 3].map(i => {
    const b = box(nodes, { x: CX(i), y: 14, w: 150, h: 238, top: 22, label: "vCPU " + (i + 1), sub: "", color: C.os });
    return { b, jobs: [] };
  });
  const spawn = [0, 1, 2, 3].map(i => wire(wires, `M160,131 C190,131 190,${70} ${CX(i)},70`));
  const reqW = wire(wires, `M160,224 H${CX(3)}`);

  const mode = f.segmented([["3", "3 CSVs"], ["6", "6 CSVs"]], "3", () => steps.redo(), { label: "Load" });
  const n = () => Number(mode.value);
  /* where each CSV runs: 3 CSVs get a core each; 6 CSVs spread over all 4, sharing with the requests */
  const place = () => n() === 3 ? [0, 1, 2] : [0, 1, 2, 3, 0, 1];
  let bars = [];
  let reqBar = null;

  function jobBar(core, slot, label) {
    const x = CX(core) + 14, y = 60 + slot * 52;
    const bg = sv("rect", { x, y, width: 122, height: 40, "stroke-width": 1 });
    bg.style.cssText = `fill:${C.bg};stroke:${C.line2}`;
    const fill = sv("rect", { x, y, width: 0, height: 40 });
    fill.style.fill = C.a + "33";
    nodes.append(bg, fill);
    const t = txt(nodes, x + 8, y + 25, label, { size: 11, color: C.ink, weight: 600 });
    return { bg, fill, t, set(p) { fill.setAttribute("width", 122 * Math.min(1, p)); } };
  }
  function clear() {
    bars.forEach(b => { b.bg.remove(); b.fill.remove(); b.t.remove(); });
    bars = [];
    if (reqBar) { reqBar.bg.remove(); reqBar.fill.remove(); reqBar.t.remove(); reqBar = null; }
  }

  /* before step 1: no subprocesses */
  function reset() {
    fx.replaceChildren();
    clear();
    cores.forEach((c, i) => { c.b.state("idle"); c.b.text(i === 3 ? "client requests" : "free"); });
    spawn.forEach(w => lit(w)); lit(reqW);
    f.big(String(n()), "CSVs to parse");
    f.status(n() === 3 ? "3 CSVs + 1 vCPU kept for requests" : "6 CSVs on 4 vCPUs");
  }

  const STEPS = [
    {
      title: "spawn",
      text: () => n() === 3
        ? "The backend spawns 3 subprocesses, one for each CSV. Each gets its own vCPU, and vCPU 4 is kept for the other client requests."
        : "The backend spawns 6 subprocesses on 4 vCPUs. Two vCPUs run 2 CSVs each, and vCPU 4 has to share with the client requests.",
      async play(s) {
        srv.state("on");
        const slots = [0, 0, 0, 0];
        for (const [k, core] of place().entries()) {
          lit(spawn[core], C.a);
          await travel(s, fx, spawn[core], C.a, 320);
          lit(spawn[core]);
          bars.push(jobBar(core, slots[core]++, "csv " + (k + 1)));
          cores[core].b.state("on");
          cores[core].b.text(slots[core] > 1 || (core === 3) ? "shared · time slices" : "1 subprocess", slots[core] > 1 || core === 3 ? WARNT : C.muted);
        }
        reqBar = jobBar(3, n() === 3 ? 0 : 1, "requests");
        reqBar.fill.style.fill = C.net + "33";
        reqBar.bg.setAttribute("y", 196); reqBar.fill.setAttribute("y", 196); reqBar.t.setAttribute("y", 221);
        srv.state("idle");
      },
    },
    {
      title: "parse",
      text: () => n() === 3
        ? "All 3 CSVs parse at the same time, at full speed. Requests on vCPU 4 are answered quickly."
        : "Shared vCPUs switch between subprocesses. The OS has to handle the context switches, so every CSV is slower and requests wait too.",
      async play(s) {
        lit(reqW, C.net);
        const share = place().map(core => place().filter(c => c === core).length + (core === 3 ? 1 : 0));
        /* time to finish for each CSV, in seconds: 4 s alone, slower when shared, plus switch overhead */
        const done = share.map(k => k === 1 ? 4 : 4 * k * 1.15);
        const end = Math.max(...done);
        await s.tween(end * 380, t => {
          const sec = t * end;
          bars.forEach((b, i) => b.set(sec / done[i]));
          reqBar.set((sec % 1.2) / 1.2);
          f.big(`${sec.toFixed(1)} s`, "parsing");
        }, Kit.ease.linear);
        bars.forEach(b => b.set(1)); reqBar.set(1);
        lit(reqW);
        f.big(`${end.toFixed(1)} s`, `to parse ${n()} CSVs`, n() === 3 ? OKT : WARNT);
      },
    },
    {
      title: "result",
      text: () => n() === 3
        ? "3 CSVs in 4 s, with requests still at about 10 ms. This is the throughput the machine can really give."
        : "Twice the CSVs take more than twice the time, and requests slow to about 150 ms. The overhead defeats the purpose of the optimization.",
      async play(s) {
        cores.forEach(c => c.b.state(n() === 3 ? "ok" : "idle"));
        if (n() === 6) [0, 1, 3].forEach(i => cores[i].b.state("bad"));
        f.status(n() === 3 ? "requests ≈ 10 ms" : "requests ≈ 150 ms", n() === 3 ? OKT : BADT);
        await s.wait(700);
      },
    },
  ];
  const steps = f.steps(STEPS, { reset, enter: () => fx.replaceChildren() });
});
