/*
 * Figures for the secondary storage post. Each Kit.figure(id, setup) fills the `::figure <id>` block
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
  /* diagram parts: the server, main memory, the disk and the read/write head */
  app: v("prod"), mem: v("pg"), disk: v("kafka"), head: v("retry"),
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

/* a dot that travels along a path */
async function travel(s, layer, path, color, ms = 700, o = {}) {
  const c = sv("circle", { r: o.r || 5, cx: -99, cy: -99, fill: color, stroke: C.bg, "stroke-width": 2 });
  layer.appendChild(c);
  try {
    await s.tween(ms, t => {
      const p = Kit.pointAt(path, o.reverse ? 1 - t : t);
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

/* the read/write head: an arm with a tip, moved with place(x) */
function makeHead(parent, y0, y1) {
  const g = sv("g");
  const arm = sv("path", { d: `M0,${y0} V${y1} M-6,${y1 - 9} L0,${y1} L6,${y1 - 9}`, fill: "none", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" });
  arm.style.stroke = C.head;
  const label = txt(g, -6, y0 - 8, "read/write head", { size: 10.5, color: C.head, weight: 600 });
  label.classList.add("fx-halo");
  g.appendChild(arm);
  parent.appendChild(g);
  let x = 0;
  return {
    get x() { return x; },
    /* the label hangs to the right of the arm on the left half of the scene and to the left on the right half */
    place(nx) {
      x = nx; g.setAttribute("transform", `translate(${nx},0)`);
      const right = nx > 440;
      label.setAttribute("text-anchor", right ? "end" : "start"); label.setAttribute("x", right ? 6 : -6);
    },
  };
}

/* ======================================================================
   Figure: you ask for 1 bit, you get the whole page
   ====================================================================== */
Kit.figure("pages", f => {
  f.chrome({ tag: "hdd · 4 KB pages", label: "you ask for 1 bit, you get a page" });
  const svg = f.svg(880, 262, { label: "A disk with eight pages, a read/write head and main memory with three page frames", minWidth: 660 });
  const wires = sv("g"), nodes = sv("g"), fx = sv("g");
  svg.append(wires, nodes, fx);

  const PX = i => 34 + i * 52, PY = 168, PW = 44, PH = 42;
  const bus = wire(wires, "M460,189 H540");
  const disk = box(nodes, { x: 10, y: 12, w: 450, h: 236, top: 24, label: "hdd", sub: "rotating disk", color: C.disk });
  const mem = box(nodes, { x: 540, y: 12, w: 330, h: 236, top: 24, label: "main memory", sub: "page frames", color: C.mem });
  const pages = Array.from({ length: 8 }, (_, i) => cell(nodes, PX(i), PY, PW, PH, { text: "p" + i, sub: "4 KB" }));
  const frames = [0, 1, 2].map(i => cell(nodes, 560 + i * 102, PY, 92, PH, { text: "free", sub: "4 KB frame" }));
  /* the bit we asked for, a small mark inside p3 */
  const bit = sv("rect", { x: PX(3) + PW - 10, y: PY + 5, width: 5, height: 5, fill: C.accent });
  nodes.appendChild(bit);
  const head = makeHead(nodes, 104, 160);
  const hx = i => PX(i) + PW / 2;

  let reads = 0;
  const count = () => f.big(String(reads), reads === 1 ? "disk read" : "disk reads");

  /* before step 1: memory is empty and the head sits over p0 */
  function reset() {
    fx.replaceChildren();
    reads = 0; count();
    head.place(hx(0));
    pages.forEach(p => p.clear());
    frames.forEach(fr => fr.clear());
    bit.style.opacity = 0;
    [disk, mem].forEach(n => n.state("idle"));
    f.status("data is divided into fixed-size pages");
  }
  function enter() { fx.replaceChildren(); lit(bus); }

  const STEPS = [
    {
      title: "request",
      text: "The program needs 1 bit. That bit is in page p3, and main memory doesn't have p3 yet.",
      async play(s) {
        mem.state("on");
        bit.style.opacity = 1;
        pages[3].fill(C.accent);
        pop(fx, 705, 120, "need 1 bit of p3", C.ink, { ms: 2000 });
        f.status("main memory: p3 not found");
        await s.wait(800);
      },
    },
    {
      title: "seek",
      text: "The read/write head has to move to the location where p3 is stored. This is physical movement.",
      async play(s) {
        mem.state("idle"); disk.state("on");
        f.status("the head moves to p3", WARNT);
        const from = head.x;
        await s.tween(1000, t => head.place(Kit.lerp(from, hx(3), t)));
        f.status("the head is over p3");
      },
    },
    {
      title: "load page",
      text: "The disk doesn't send only 1 bit. The system loads the entire page, all 4 KB, into main memory.",
      async play(s) {
        lit(bus, C.disk);
        await slide(s, fx, { x0: PX(3), y0: PY, x1: 560, y1: PY, w: PW, h: PH, color: C.disk, label: "p3", arc: 70 }, 1100);
        lit(bus);
        frames[0].fill(C.mem, "p3");
        frames[0].sub.textContent = "4 KB loaded";
        reads = 1; count();
        disk.state("idle"); mem.state("on");
        f.status("p3 is in main memory", OKT);
        await s.wait(500);
      },
    },
    {
      title: "next read",
      text: "Now the program needs the next byte. It is in the same page, so main memory already has it. The disk does no work.",
      async play(s) {
        pop(fx, 705, 120, "need next byte of p3", C.ink, { ms: 1800 });
        await s.wait(700);
        frames[0].fill(C.ok, "p3");
        pop(fx, 606, 158, "✓ cache hit", OKT);
        f.status("2 answers from 1 disk read", OKT);
        f.big("1", "disk read · 2 answers");
        await s.wait(700);
      },
    },
  ];
  f.steps(STEPS, { reset, enter });
});

/* ======================================================================
   Figure: sequential vs random access, counted in head movement
   ====================================================================== */
Kit.figure("access", f => {
  f.chrome({ tag: "hdd · one track", label: "sequential vs random access" });
  const svg = f.svg(880, 200, { label: "A track of 24 blocks with a read/write head that moves over the blocks of one file", minWidth: 660 });
  const nodes = sv("g"), fx = sv("g");
  svg.append(nodes, fx);

  const BX = i => 16 + i * 36, BY = 104, BW = 32, BH = 46;
  const blocks = Array.from({ length: 24 }, (_, i) => cell(nodes, BX(i), BY, BW, BH));
  Array.from({ length: 24 }, (_, i) => txt(nodes, BX(i) + BW / 2, BY + BH + 16, String(i), { size: 9.5, anchor: "middle", color: C.faint }));
  txt(nodes, 16, 186, "block number on the track", { size: 10, color: C.faint });
  const head = makeHead(nodes, 40, 98);
  const hx = i => BX(i) + BW / 2;

  /* the file, block by block in file order */
  const FILES = { seq: [8, 9, 10, 11, 12, 13, 14, 15], rand: [2, 19, 6, 22, 11, 0, 16, 9] };
  const layout = f.segmented([["seq", "sequential"], ["rand", "random"]], "seq", () => steps.redo(), { label: "Layout" });
  const file = () => FILES[layout.value];
  const seqMode = () => layout.value === "seq";

  let moved = 0, seeks = 0;
  const count = () => f.big(String(Math.round(moved)), `blocks of head movement · ${seeks} ${seeks === 1 ? "seek" : "seeks"}`);
  f.foot.append(
    h("span", { class: "fig-key" }, [h("i", { style: `background:${C.mem}` }), "block of the file"]),
    h("span", { class: "fig-key" }, [h("i", { style: `background:${C.ok}` }), "read"]),
    h("span", { class: "fig-key" }, [h("i", { style: `background:${C.head}` }), "read/write head"]),
  );

  /* before step 1: the head is over block 0 and nothing is marked */
  function reset() {
    fx.replaceChildren();
    moved = 0; seeks = 0; count();
    head.place(hx(0));
    blocks.forEach(b => b.clear());
    f.status(seqMode() ? "the file is stored continuously" : "the file is scattered");
  }

  const STEPS = [
    {
      title: "the file",
      text: () => seqMode()
        ? "The file is stored continuously: 8 blocks next to each other on the track."
        : "The same amount of data, scattered across 8 different locations on the track.",
      async play(s) {
        for (const [k, b] of file().entries()) {
          blocks[b].fill(C.mem, String(k + 1));
          await s.wait(110);
        }
        await s.wait(400);
      },
    },
    {
      title: "read",
      text: () => seqMode()
        ? "The head moves to the first block once. Then the data passes under the head in order."
        : "The head has to keep moving between those locations. Every jump is physical movement.",
      async play(s) {
        let pos = 0;
        for (const [k, b] of file().entries()) {
          const dist = Math.abs(b - pos), from = head.x, base = moved;
          if (dist > 1) { seeks++; f.status(`seek ${seeks} → block ${b}`, WARNT); }
          await s.tween(160 + dist * 38, t => { head.place(Kit.lerp(from, hx(b), t)); moved = base + dist * t; count(); });
          blocks[b].fill(C.ok, String(k + 1));
          pos = b;
        }
        f.status("all 8 blocks read", OKT);
      },
    },
    {
      title: "result",
      text: () => seqMode()
        ? `${Math.round(moved)} blocks of head movement and ${seeks} seek. Fewer movements, better performance.`
        : `${Math.round(moved)} blocks of head movement and ${seeks} seeks for the same data. More movements, worse performance.`,
      async play(s) {
        f.status(seqMode() ? "sequential access → fewer movements" : "random access → more movements", seqMode() ? OKT : BADT);
        f.big(String(Math.round(moved)), `blocks of head movement · ${seeks} ${seeks === 1 ? "seek" : "seeks"}`, seqMode() ? OKT : BADT);
        await s.wait(600);
      },
    },
  ];
  const steps = f.steps(STEPS, { reset, enter: () => fx.replaceChildren() });
});

/* ======================================================================
   Figure: 10 writes one by one vs 1 batched write
   ====================================================================== */
Kit.figure("batch", f => {
  f.chrome({ tag: "batch processing", label: "10 small writes or 1 larger write" });
  const svg = f.svg(880, 290, { label: "Two servers write the same 10 logs, one to disk right away and one through a memory buffer", minWidth: 660 });
  const wires = sv("g"), nodes = sv("g"), fx = sv("g");
  svg.append(wires, nodes, fx);

  const N = 10, SX = i => 244 + i * 30, SW = 24;
  const lanes = [
    { y: 14, name: "one by one", sub: "write each log now" },
    { y: 160, name: "batched", sub: "collect, then write" },
  ].map(L => {
    const my = L.y + 48;
    const w1 = wire(wires, `M150,${my} H230`), w2 = wire(wires, `M560,${my} H680`);
    const app = box(nodes, { x: 10, y: L.y + 20, w: 140, h: 56, label: "server", sub: L.sub, color: C.app });
    const mem = box(nodes, { x: 230, y: L.y, w: 330, h: 96, top: 22, label: "memory", sub: L.name, color: C.mem });
    const disk = box(nodes, { x: 680, y: L.y + 20, w: 190, h: 56, label: "disk", sub: "0 writes", color: C.disk });
    const slots = Array.from({ length: N }, (_, i) => cell(nodes, SX(i), L.y + 56, SW, 26));
    return { ...L, my, w1, w2, app, mem, disk, slots, writes: 0 };
  });
  const [A, B] = lanes;
  const setWrites = (L, n) => { L.writes = n; L.disk.text(`${n} ${n === 1 ? "write" : "writes"}`, n ? C.ink : C.muted); };
  const count = color => f.big(`${A.writes} vs ${B.writes}`, "disk writes · one by one vs batched", color);

  /* before step 1: no logs, no writes */
  function reset() {
    fx.replaceChildren();
    lanes.forEach(L => { setWrites(L, 0); L.slots.forEach(c => c.clear()); [L.app, L.mem, L.disk].forEach(n => n.state("idle")); });
    count();
    f.status("the server generates logs continuously");
  }
  function enter() { fx.replaceChildren(); lanes.forEach(L => { lit(L.w1); lit(L.w2); }); }

  const STEPS = [
    {
      title: "logs arrive",
      text: "The server generates 10 logs. Top: every log is written to disk immediately. Bottom: the logs stay in memory.",
      async play(s) {
        lanes.forEach(L => { lit(L.w1, C.app); L.app.state("on"); });
        lit(A.w2, C.disk);
        for (let i = 0; i < N; i++) {
          await Promise.all([
            (async () => {
              await travel(s, fx, A.w1, C.app, 260);
              A.slots[0].fill(C.mem, String(i + 1));
              await travel(s, fx, A.w2, C.mem, 260);
              A.slots[0].clear();
              setWrites(A, A.writes + 1); count();
              pop(fx, 775, A.y + 12, "write", C.soft, { size: 10.5, ms: 900 });
            })(),
            (async () => {
              await travel(s, fx, B.w1, C.app, 260);
              B.slots[i].fill(C.mem, String(i + 1));
            })(),
          ]);
          f.status(`log ${i + 1} of ${N}`);
          await s.wait(120);
        }
        lanes.forEach(L => { lit(L.w1); lit(L.w2); L.app.state("idle"); });
        f.status("top: memory → disk, 10 times · bottom: 10 logs in memory");
      },
    },
    {
      title: "write together",
      text: "The bottom server writes the 10 logs together: 1 larger write. The amount of data is the same.",
      async play(s) {
        B.mem.state("on");
        lit(B.w2, C.disk);
        const x0 = SX(0), w = SX(N - 1) + SW - x0;
        B.slots.forEach(c => c.clear());
        await slide(s, fx, { x0, y0: B.y + 56, x1: 690, y1: B.y + 34, w: Math.min(w, 170), h: 26, color: C.mem, label: "10 logs", arc: 30 }, 1000);
        lit(B.w2);
        setWrites(B, 1); count();
        B.mem.state("idle"); B.disk.state("ok");
        pop(fx, 775, B.y + 12, "✓ 1 write", OKT);
        await s.wait(500);
      },
    },
    {
      title: "compare",
      text: "Same 10 logs, 10 writes against 1. With 100 logs, 100 small writes become 1 larger write.",
      async play(s) {
        A.disk.state("bad"); B.disk.state("ok");
        count(C.ink);
        f.status("the number of expensive operations is much smaller", OKT);
        await s.wait(800);
      },
    },
  ];
  f.steps(STEPS, { reset, enter });
});

/* ======================================================================
   Figure: the cost of waiting, data loss and latency
   ====================================================================== */
Kit.figure("tradeoff", f => {
  f.chrome({ tag: "trade-off", label: "what waiting costs" });
  const svg = f.svg(880, 190, { label: "A server, a memory buffer that writes to disk at 10 logs, and a disk", minWidth: 660 });
  const wires = sv("g"), nodes = sv("g"), fx = sv("g");
  svg.append(wires, nodes, fx);

  const N = 10, SX = i => 244 + i * 30, SW = 24, SY = 104;
  const w1 = wire(wires, "M150,98 H230"), w2 = wire(wires, "M560,98 H680");
  const app = box(nodes, { x: 10, y: 70, w: 140, h: 56, label: "server", sub: "logs arrive", color: C.app });
  const mem = box(nodes, { x: 230, y: 30, w: 330, h: 120, top: 26, label: "memory", sub: "write to disk at 10 logs", color: C.mem });
  const disk = box(nodes, { x: 680, y: 70, w: 190, h: 56, label: "disk", sub: "0 logs stored", color: C.disk });
  const slots = Array.from({ length: N }, (_, i) => cell(nodes, SX(i), SY, SW, 26));
  const waitT = txt(nodes, SX(0), SY + 42, "", { size: 10.5 });

  const power = f.segmented([["cut", "power loss at 8"], ["on", "power stays on"]], "cut", () => steps.redo(), { label: "Power" });
  const cut = () => power.value === "cut";
  f.status("the buffer waits for 10 logs");

  let waited = 0;
  const showWait = () => {
    f.big(`${waited} s`, "log 1 has waited");
    waitT.textContent = `log 1 waited ${waited} s`;
  };
  async function arrive(s, i) {
    lit(w1, C.app);
    await travel(s, fx, w1, C.app, 320);
    slots[i].fill(C.mem, String(i + 1));
    lit(w1);
  }

  /* before step 1: an empty buffer and an empty disk */
  function reset() {
    fx.replaceChildren();
    waited = 0;
    slots.forEach(c => c.clear());
    [app, mem, disk].forEach(n => n.state("idle"));
    disk.text("0 logs stored");
    waitT.textContent = "";
    f.big("0", "logs in memory");
    f.status("the buffer waits for 10 logs");
  }

  const STEPS = [
    {
      title: "first log",
      text: "Log 1 arrives. The rule is to write when there are 10 logs, so log 1 waits in memory.",
      async play(s) {
        await arrive(s, 0);
        showWait();
        f.status("log 1 waits for 9 more");
      },
    },
    {
      title: "waiting",
      text: "Logs 2 to 8 arrive, one every second (sped up here). Log 1 is still in memory, not on the disk.",
      async play(s) {
        for (let i = 1; i < 8; i++) {
          await s.wait(260);
          await arrive(s, i);
          waited = i; showWait();
        }
        f.status("8 logs in memory · 0 on disk", WARNT);
      },
    },
    {
      get title() { return cut() ? "power loss" : "write"; },
      text: () => cut()
        ? "The machine suddenly loses power with 8 logs in the buffer. They were only in memory, so they are lost."
        : "Logs 9 and 10 arrive. The buffer has 10 logs and goes to disk in 1 write.",
      async play(s) {
        if (cut()) {
          mem.state("bad"); app.state("dim");
          slots.slice(0, 8).forEach(c => c.fill(C.bad));
          f.status("power loss", BADT);
          await s.wait(700);
          slots.forEach(c => c.clear());
          waitT.textContent = "";
          pop(fx, 395, 92, "✕ 8 logs lost", BADT, { ms: 2200 });
          f.big("8", "logs lost", BADT);
          disk.text("0 logs stored", BADT);
          await s.wait(600);
          return;
        }
        for (let i = 8; i < N; i++) {
          await s.wait(260);
          await arrive(s, i);
          waited = i; showWait();
        }
        lit(w2, C.disk); mem.state("on");
        slots.forEach(c => c.clear());
        await slide(s, fx, { x0: SX(0), y0: SY, x1: 690, y1: 85, w: 170, h: 26, color: C.mem, label: "10 logs", arc: 30 }, 900);
        lit(w2); mem.state("idle"); disk.state("ok");
        disk.text("10 logs stored · 1 write", OKT);
        f.big(`${waited} s`, "log 1 waited before it reached the disk", WARNT);
        await s.wait(500);
      },
    },
    {
      title: "trade-off",
      text: () => cut()
        ? "Fewer writes, but every log that waits in memory can be lost. This is the data loss risk."
        : "Fewer writes, but log 1 had to wait 9 s for the others. Higher throughput, but higher latency.",
      async play(s) {
        f.status(cut() ? "data loss risk" : "latency", cut() ? BADT : WARNT);
        await s.wait(800);
      },
    },
  ];
  const steps = f.steps(STEPS, { reset, enter: () => { fx.replaceChildren(); lit(w1); lit(w2); } });
});
