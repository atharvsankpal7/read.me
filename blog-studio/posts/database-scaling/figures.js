/*
 * Figures for the database scaling post. Each Kit.figure(id, setup) fills the `::figure <id>` block
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
  /* diagram parts: backend servers, the pooler, the database, the cache, replicas and the WAL */
  app: v("prod"), pool: v("cons"), db: v("pg"), cache: v("dest"), rep: v("kafka"), wal: v("retry"),
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
   Figure: a new connection per query vs a connection pooler
   ====================================================================== */
Kit.figure("pool", f => {
  f.chrome({ tag: "postgres · 1 process per connection", label: "connection pooling" });
  const svg = f.svg(880, 300, { label: "Four backend pods, a connection pooler and PostgreSQL on the same host machine", minWidth: 660 });
  const back = sv("g"), wires = sv("g"), nodes = sv("g"), fx = sv("g");
  svg.append(back, wires, nodes, fx);

  const PODS = 4, Q = 12, CONNS = 5;
  const py = i => 47 + i * 66;
  const direct = Array.from({ length: PODS }, (_, i) => wire(wires, `M140,${py(i)} C360,${py(i)} 520,${110 + i * 40} 640,${110 + i * 40}`));
  const toPool = Array.from({ length: PODS }, (_, i) => wire(wires, `M140,${py(i)} C280,${py(i)} 300,${110 + i * 40} 420,${110 + i * 40}`));
  const conns = Array.from({ length: CONNS }, (_, k) => wire(wires, `M570,${100 + k * 34} H640`, { w: 2 }));
  const pods = Array.from({ length: PODS }, (_, i) => box(nodes, { x: 10, y: py(i) - 23, w: 130, h: 46, label: "backend-" + (i + 1), sub: "pod", color: C.app }));
  box(back, { x: 400, y: 10, w: 470, h: 280, top: 22, label: "host machine", sub: "pooler and database on the same machine", color: C.muted });
  const pooler = box(nodes, { x: 420, y: 70, w: 150, h: 200, top: 24, label: "pooler", sub: ":6432", color: C.pool });
  const db = box(nodes, { x: 640, y: 70, w: 215, h: 200, top: 24, label: "postgres", sub: ":5432", color: C.db });
  txt(nodes, 656, 124, "processes", { size: 10, color: C.faint });
  const procs = Array.from({ length: Q }, (_, i) => cell(nodes, 656 + (i % 6) * 32, 132 + Math.floor(i / 6) * 28, 20, 20));
  const ramBg = sv("rect", { x: 656, y: 206, width: 184, height: 10 });
  ramBg.style.fill = C.line;
  const ram = sv("rect", { x: 656, y: 206, width: 0, height: 10 });
  ram.style.transition = "width .3s ease, fill .3s ease";
  nodes.append(ramBg, ram);
  const ramT = txt(nodes, 656, 236, "", { size: 10.5 });

  const mode = f.segmented([["none", "no pooler"], ["pool", "pooler"]], "none", () => steps.redo(), { label: "Setup" });
  const pooled = () => mode.value === "pool";
  let n = 0;
  const setProcs = (k, color) => {
    n = k;
    procs.forEach((p, i) => i < k ? p.fill(color || C.db) : p.clear());
    ram.setAttribute("width", 184 * k / Q);
    ram.style.fill = color || C.db;
    ramT.textContent = `RAM: ${k} × 2 MB = ${k * 2} MB`;
    f.big(String(k), k === 1 ? "process on the database" : "processes on the database");
  };

  /* before step 1: no queries yet; with a pooler the 5 persistent connections already exist */
  function reset() {
    fx.replaceChildren();
    [pooler, db].forEach(b => b.state("idle"));
    pods.forEach(p => p.state("idle"));
    pooler.state(pooled() ? "idle" : "dim");
    direct.forEach(w => { lit(w); w.style.opacity = pooled() ? 0 : 1; });
    toPool.forEach(w => { lit(w); w.style.opacity = pooled() ? 1 : 0; });
    conns.forEach(w => { lit(w, pooled() ? C.pool : null); w.style.opacity = pooled() ? 1 : 0; });
    setProcs(pooled() ? CONNS : 0);
    f.status(pooled() ? "the pooler holds 5 persistent connections" : "every query opens a new connection");
  }
  function enter() { fx.replaceChildren(); }

  const STEPS = [
    {
      title: "queries",
      text: () => pooled()
        ? "Every query goes to the pooler. The pooler sends it over one of its 5 persistent connections."
        : "Every pod opens a new connection for every query. PostgreSQL spawns a new process for each one.",
      async play(s) {
        for (let q = 0; q < Q; q++) {
          const i = q % PODS;
          pods[i].state("on");
          if (pooled()) {
            await travel(s, fx, toPool[i], C.app, 260);
            await travel(s, fx, conns[q % CONNS], C.pool, 160);
          } else {
            await travel(s, fx, direct[i], C.app, 360);
            setProcs(n + 1);
            pop(fx, 748, 112, "+1 process", C.soft, { size: 10.5, ms: 900 });
          }
          pods[i].state("idle");
        }
        f.status(`${Q} queries done`);
      },
    },
    {
      title: "overhead",
      text: () => pooled()
        ? "The database still has 5 processes. The constant new connection creation is absorbed by the pooler."
        : "12 processes now share the RAM and CPU that query planning and the joins need.",
      async play(s) {
        if (pooled()) { db.state("ok"); pooler.state("on"); f.status("5 connections, any number of queries", OKT); }
        else { db.state("bad"); setProcs(n, C.bad); f.status("a new process for every query", BADT); }
        await s.wait(700);
      },
    },
    {
      title: "at scale",
      text: () => pooled()
        ? "10 persistent connections cost about 20 MB of RAM, at any number of pods."
        : "At 2 MB per process, 64 GB of RAM is gone at about 32,000 connections. This is what Instagram hit.",
      async play(s) {
        if (pooled()) f.big("20 MB", "RAM for 10 pooled connections", OKT);
        else f.big("64 GB", "RAM for 32,768 connections", BADT);
        await s.wait(700);
      },
    },
  ];
  const steps = f.steps(STEPS, { reset, enter });
});

/* ======================================================================
   Figure: the hot part of the data in a cache
   ====================================================================== */
Kit.figure("cache", f => {
  f.chrome({ tag: "read-heavy", label: "a cache for the hot data" });
  const svg = f.svg(880, 210, { label: "Servers, a cache in front of the database, and a database with ten videos", minWidth: 660 });
  const wires = sv("g"), nodes = sv("g"), fx = sv("g");
  svg.append(wires, nodes, fx);

  const wCache = wire(wires, "M140,112 C220,112 220,58 300,58");
  const wDirect = wire(wires, "M140,138 C330,138 450,165 600,165");
  const wMiss = wire(wires, "M530,58 H600");
  const app = box(nodes, { x: 10, y: 92, w: 130, h: 66, label: "servers", sub: "read", color: C.app });
  const cache = box(nodes, { x: 300, y: 20, w: 230, h: 76, top: 22, label: "cache", sub: "redis · valkey", color: C.cache });
  const slots = [0, 1].map(k => cell(nodes, 432 + k * 48, 42, 42, 32, { text: "—" }));
  const db = box(nodes, { x: 600, y: 20, w: 270, h: 176, top: 22, label: "database", sub: "videos", color: C.db });
  const VIEWS = ["9.1M", "6.4M", "2K", "310", "4K", "80", "1K", "650", "12K", "90"];
  const vids = VIEWS.map((views, i) => cell(nodes, 616 + (i % 5) * 50, 76 + Math.floor(i / 5) * 56, 44, 44, { text: "v" + (i + 1), sub: views }));
  const HOT = [0, 1];
  /* video index of each read, 9 of the 12 for v1 and v2 */
  const READS = [0, 1, 0, 4, 0, 1, 7, 0, 1, 0, 2, 1];

  const mode = f.segmented([["none", "no cache"], ["cache", "cache"]], "cache", () => steps.redo(), { label: "Setup" });
  const cached = () => mode.value === "cache";
  let dbReads = 0, hits = 0, inCache = [];
  const count = color => f.big(String(dbReads), `database reads · ${hits} cache ${hits === 1 ? "hit" : "hits"}`, color);
  f.foot.append(
    h("span", { class: "fig-key" }, [h("i", { style: `background:${C.warn}` }), "hot data"]),
    h("span", { class: "fig-key" }, [h("i", { style: `background:${C.cache}` }), "in the cache"]),
  );

  /* before step 1: an empty cache, no reads */
  function reset() {
    fx.replaceChildren();
    dbReads = 0; hits = 0; inCache = [];
    vids.forEach(c => c.clear());
    slots.forEach(c => c.clear());
    [app, cache, db].forEach(b => b.state("idle"));
    cache.state(cached() ? "idle" : "dim");
    wCache.style.opacity = wMiss.style.opacity = cached() ? 1 : 0;
    wDirect.style.opacity = cached() ? 0 : 1;
    count();
    f.status("only a small amount of data is accessed a lot");
  }
  function enter() { fx.replaceChildren(); [wCache, wDirect, wMiss].forEach(w => lit(w)); }

  const STEPS = [
    {
      title: "hot data",
      text: "A few videos get most of the views. v1 and v2 are the hot part of the data. The rest of the data causes no bottleneck.",
      async play(s) {
        HOT.forEach(i => vids[i].fill(C.warn));
        f.status("v1 and v2 are hot", WARNT);
        await s.wait(900);
      },
    },
    {
      title: "reads",
      text: () => cached()
        ? "12 reads come in. A hot video comes from the database once, then from the cache."
        : "12 reads come in. Every one of them reaches the database.",
      async play(s) {
        app.state("on");
        for (const i of READS) {
          if (!cached()) {
            await travel(s, fx, wDirect, C.app, 380);
            dbReads++; count();
            vids[i].fill(HOT.includes(i) ? C.bad : C.db);
            continue;
          }
          await travel(s, fx, wCache, C.app, 260);
          const k = inCache.indexOf(i);
          if (k >= 0) {
            hits++; count();
            slots[k].fill(C.ok);
            pop(fx, 476, 14, "✓ hit", OKT, { size: 10.5, ms: 800 });
            continue;
          }
          pop(fx, 476, 14, "miss", C.soft, { size: 10.5, ms: 800 });
          await travel(s, fx, wMiss, C.cache, 200);
          dbReads++; count();
          if (HOT.includes(i)) { inCache.push(i); slots[inCache.length - 1].fill(C.cache, "v" + (i + 1)); vids[i].fill(C.cache); }
        }
        app.state("idle");
        slots.forEach((c, k) => { if (inCache[k] != null) c.fill(C.cache); });
        f.status("all 12 reads answered");
      },
    },
    {
      title: "result",
      text: () => cached()
        ? `${dbReads} of 12 reads reached the database. The hot data is served from a store optimized for reads.`
        : "12 of 12 reads reached the database, most of them for the same two videos.",
      async play(s) {
        db.state(cached() ? "ok" : "bad");
        count(cached() ? OKT : BADT);
        f.status(cached() ? "the database only sees the cold reads" : "the hot videos are the bottleneck", cached() ? OKT : BADT);
        await s.wait(700);
      },
    },
  ];
  const steps = f.steps(STEPS, { reset, enter });
});

/* ======================================================================
   Figure: dual write gets out of sync
   ====================================================================== */
Kit.figure("dualwrite", f => {
  f.chrome({ tag: "dual write", label: "two writes, two truths" });
  const svg = f.svg(880, 240, { label: "A backend server writing to an original database and a copy database on two hosts", minWidth: 660 });
  const wires = sv("g"), nodes = sv("g"), fx = sv("g");
  svg.append(wires, nodes, fx);

  const w1 = wire(wires, "M150,108 C350,108 400,55 560,55");
  const w2 = wire(wires, "M150,132 C350,132 400,185 560,185");
  const app = box(nodes, { x: 10, y: 90, w: 140, h: 60, label: "backend server", sub: "dual write", color: C.app, size: 12 });
  const orig = box(nodes, { x: 560, y: 20, w: 240, h: 70, label: "db original", sub: "", color: C.db });
  const copy = box(nodes, { x: 560, y: 150, w: 240, h: 70, label: "db copy", sub: "", color: C.rep });
  txt(nodes, 812, 59, "host 1", { size: 10.5, color: C.faint });
  txt(nodes, 812, 189, "host 2", { size: 10.5, color: C.faint });
  let ov = 0, cv = 0, trips = 0;
  const show = () => { orig.text(`x = ${ov}`, C.ink); copy.text(`x = ${cv}`, C.ink); };
  const count = () => f.big(String(trips), trips === 1 ? "network trip" : "network trips");

  async function write(s, path, node, value, set) {
    lit(path, C.app);
    await travel(s, fx, path, C.app, 650);
    set(value); show(); node.state("on");
    pop(fx, node.cx, node.y - 6, `x = ${value}`, C.ink);
    trips++; count();
    lit(path);
  }

  /* before step 1: both databases agree on x = 0 */
  function reset() {
    fx.replaceChildren();
    ov = 0; cv = 0; trips = 0;
    [app, orig, copy].forEach(b => b.state("idle"));
    show(); count();
    f.status("both databases say x = 0");
  }
  function enter() { fx.replaceChildren(); lit(w1); lit(w2); }

  const STEPS = [
    {
      title: "write x = 1",
      text: "The server writes x = 1 to the original, then writes it again to the copy. 1 write costs 2 network trips.",
      async play(s) {
        app.state("on");
        await write(s, w1, orig, 1, x => { ov = x; });
        await write(s, w2, copy, 1, x => { cv = x; });
        app.state("idle"); orig.state("idle"); copy.state("idle");
        f.status("in sync · but the server did twice the work");
      },
    },
    {
      title: "copy down",
      text: "Someone spills water on the copy machine. The server writes x = 2, but only the original gets it.",
      async play(s) {
        copy.state("bad"); copy.text("down ✕", BADT);
        f.status("db copy is down", BADT);
        await s.wait(500);
        app.state("on");
        await write(s, w1, orig, 2, x => { ov = x; });
        copy.text("down ✕", BADT);
        lit(w2, C.app);
        await travel(s, fx, w2, C.app, 600, { to: 0.6 });
        const p = Kit.pointAt(w2, 0.6);
        pop(fx, p.x, p.y - 10, "✕ no answer", BADT);
        lit(w2);
        app.state("idle"); orig.state("idle");
        await s.wait(400);
      },
    },
    {
      title: "swap",
      text: "Then the original goes down and the copy comes back on. The copy still says x = 1.",
      async play(s) {
        orig.state("bad"); orig.text("down ✕", BADT);
        await s.wait(400);
        copy.state("on"); copy.text(`x = ${cv}`, WARNT);
        lit(w2, C.rep);
        await travel(s, fx, w2, C.rep, 600, { reverse: true });
        pop(fx, 80, 80, "read x → 1", WARNT);
        lit(w2);
        f.status("the copy answers with x = 1", WARNT);
        await s.wait(400);
      },
    },
    {
      title: "who to trust",
      text: "The original comes back with x = 2. Now we are out of sync, and we don't know which database to trust.",
      async play(s) {
        orig.state("on"); orig.text(`x = ${ov}`, WARNT);
        copy.text(`x = ${cv}`, WARNT);
        f.big("2 ≠ 1", "out of sync", BADT);
        f.status("we need a single point of truth", BADT);
        await s.wait(700);
      },
    },
  ];
  f.steps(STEPS, { reset, enter });
});

/* ======================================================================
   Figure: WAL shipped to read replicas
   ====================================================================== */
Kit.figure("wal", f => {
  f.chrome({ tag: "write-ahead log · cdc", label: "read replicas from the WAL" });
  const svg = f.svg(880, 300, { label: "Servers, a primary database with its WAL, and two read replicas", minWidth: 660 });
  const wires = sv("g"), nodes = sv("g"), fx = sv("g");
  svg.append(wires, nodes, fx);

  const wWrite = wire(wires, "M140,150 H230");
  const wShip = [wire(wires, "M460,130 C530,130 530,74 600,74", { dash: "4 5" }), wire(wires, "M460,170 C530,170 530,226 600,226", { dash: "4 5" })];
  const wRead = [wire(wires, "M75,122 V40 H600"), wire(wires, "M75,178 V266 H600")];
  const app = box(nodes, { x: 10, y: 122, w: 130, h: 56, label: "servers", sub: "writes · reads", color: C.app });
  const prim = box(nodes, { x: 230, y: 90, w: 230, h: 120, top: 24, label: "primary", sub: "", color: C.db });
  const reps = [14, 166].map((y, i) => box(nodes, { x: 600, y, w: 270, h: 120, top: 24, label: "replica " + (i + 1), sub: "", color: C.rep }));
  const walLine = (x, y) => {
    txt(nodes, x, y, "WAL", { size: 10, color: C.faint });
    return [txt(nodes, x, y + 18, "", { size: 11 }), txt(nodes, x, y + 36, "", { size: 11 })];
  };
  const pWal = walLine(244, 150), rWal = reps.map(r => walLine(r.x + 14, r.y + 60));
  const OLD = "#41 INSERT user 7", NEW = "#42 UPDATE balance = 80";
  let reads = [0, 0];

  const setWal = (lines, withNew, color) => {
    lines[0].textContent = OLD; lines[0].style.fill = C.muted;
    lines[1].textContent = withNew ? NEW : ""; lines[1].style.fill = color || C.wal;
  };
  const value = (b, val, color, extra) => b.text(`balance = ${val}${extra || ""}`, color || C.ink);
  const count = n => f.big(`${n} / 3`, "databases with balance = 80");

  /* before step 1: every database is at #41 with balance = 100 */
  function reset() {
    fx.replaceChildren();
    reads = [0, 0];
    [app, prim, ...reps].forEach(b => b.state("idle"));
    value(prim, 100); reps.forEach(r => value(r, 100));
    setWal(pWal, false); rWal.forEach(l => setWal(l, false));
    count(0);
    f.status("all databases are at WAL #41");
  }
  function enter() { fx.replaceChildren(); [wWrite, ...wShip, ...wRead].forEach(w => lit(w)); }

  const STEPS = [
    {
      title: "write",
      text: "A server sends an update. The primary plans the query, then writes it to its WAL on disk before it changes the data.",
      async play(s) {
        app.state("on"); lit(wWrite, C.app);
        await travel(s, fx, wWrite, C.app, 500);
        prim.state("on");
        pop(fx, 345, 82, "plan · execute", C.soft);
        await s.wait(700);
        setWal(pWal, true);
        pop(fx, 345, 200, "WAL on disk first", C.wal, { size: 10.5 });
        await s.wait(500);
        value(prim, 80); count(1);
        lit(wWrite); app.state("idle");
      },
    },
    {
      title: "ship",
      text: "Change data capture sends the new WAL entry over the network to both replicas.",
      async play(s) {
        f.status("shipping WAL #42");
        await Promise.all(wShip.map(async (w, i) => {
          lit(w, C.wal);
          await travel(s, fx, w, C.wal, 700 + i * 120);
          setWal(rWal[i], true);
          reps[i].state("on");
          lit(w);
        }));
        prim.state("idle");
      },
    },
    {
      title: "replay",
      text: "The replicas don't plan the query again. They only execute the WAL, and get balance = 80.",
      async play(s) {
        for (const [i, r] of reps.entries()) {
          await s.wait(350);
          value(r, 80); r.state("ok"); count(i + 2);
          pop(fx, r.cx, r.y - 4, "✓ replayed #42", OKT, { size: 10.5 });
        }
        f.status("all databases are at WAL #42", OKT);
        await s.wait(400);
      },
    },
    {
      title: "reads",
      text: "All writes go to the primary. Reads go to the replicas, so the primary keeps its time for the writes.",
      async play(s) {
        reps.forEach(r => r.state("idle"));
        for (let k = 0; k < 6; k++) {
          const i = k % 2;
          lit(wRead[i], C.app);
          await travel(s, fx, wRead[i], C.app, 380);
          reads[i]++;
          value(reps[i], 80, C.ink, ` · ${reads[i]} reads`);
          lit(wRead[i]);
        }
        f.big("6 reads", "0 of them on the primary", OKT);
        f.status("the single point of truth is the primary", OKT);
      },
    },
  ];
  f.steps(STEPS, { reset, enter });
});

/* ======================================================================
   Figure: write backlog on one node vs two shards
   ====================================================================== */
Kit.figure("shard", f => {
  f.chrome({ tag: "write amplification", label: "sharding the users table" });
  const svg = f.svg(880, 250, { label: "Writes coming in at 15 per second to one database or to two shards", minWidth: 660 });
  const wires = sv("g"), nodes = sv("g"), fx = sv("g");
  svg.append(wires, nodes, fx);

  const MAX = 30;
  const src = box(nodes, { x: 10, y: 90, w: 160, h: 70, label: "writes", sub: "15 WAL / s", color: C.app });
  function node(y, label, sub) {
    const g = sv("g");
    nodes.appendChild(g);
    const b = box(g, { x: 420, y, w: 440, h: 96, top: 22, label, sub, color: C.db });
    const q = Array.from({ length: MAX }, (_, i) => cell(g, 436 + (i % 15) * 27, y + 48 + Math.floor(i / 15) * 22, 21, 16));
    return { g, b, q, backlog: 0 };
  }
  const one = node(77, "users db", "executes 10 WAL / s");
  const shards = [node(14, "shard A", "users 1 – 500K · executes 10 WAL / s"), node(140, "shard B", "users 500K+1 – 1M · executes 10 WAL / s")];
  const wOne = wire(wires, "M170,125 H420");
  const wTwo = [wire(wires, "M170,115 C300,115 300,62 420,62"), wire(wires, "M170,135 C300,135 300,188 420,188")];

  const mode = f.segmented([["one", "1 node"], ["two", "2 shards"]], "one", () => steps.redo(), { label: "Setup" });
  const split = () => mode.value === "two";
  const setQ = (n, k, color) => { n.backlog = k; n.q.forEach((c, i) => i < k ? c.fill(color || C.wal) : c.clear()); };
  const total = () => split() ? shards[0].backlog + shards[1].backlog : one.backlog;
  const count = (sec, color) => f.big(String(total()), `WAL waiting after ${sec} s`, color);

  /* before step 1: nothing waiting */
  function reset() {
    fx.replaceChildren();
    one.g.style.display = split() ? "none" : "";
    shards.forEach(n => { n.g.style.display = split() ? "" : "none"; });
    wOne.style.opacity = split() ? 0 : 1;
    wTwo.forEach(w => { w.style.opacity = split() ? 1 : 0; });
    [one, ...shards].forEach(n => { setQ(n, 0); n.b.state("idle"); });
    src.state("idle");
    count(0);
    f.status(split() ? "the users table is split in two" : "one database for every write");
  }
  function enter() { fx.replaceChildren(); [wOne, ...wTwo].forEach(w => lit(w)); }

  const STEPS = [
    {
      title: "the rate",
      text: () => split()
        ? "The users table is split: users 1 to 500K go to shard A, users 500K+1 to 1M go to shard B."
        : "15 WAL per second come in. The database executes only 10 WAL per second.",
      async play(s) {
        src.state("on");
        if (split()) shards.forEach(n => n.b.state("on")); else one.b.state("on");
        await s.wait(900);
      },
    },
    {
      title: "6 seconds",
      text: () => split()
        ? "Each shard gets about 7.5 WAL per second and executes 10. Nothing is left over."
        : "Every second, 5 WAL are left over. The backlog grows and never catches up.",
      async play(s) {
        const paths = split() ? wTwo : [wOne];
        paths.forEach(w => lit(w, C.app));
        for (let sec = 1; sec <= 6; sec++) {
          await Promise.all(paths.flatMap(w => [0, 1, 2].map(k => s.wait(k * 120).then(() => travel(s, fx, w, C.app, 420)))));
          if (!split()) setQ(one, one.backlog + 5);
          count(sec, split() ? null : WARNT);
          f.status(`${sec} s · ${split() ? "both shards keep up" : `${one.backlog} WAL waiting`}`, split() ? OKT : WARNT);
          await s.wait(200);
        }
        paths.forEach(w => lit(w));
      },
    },
    {
      title: "result",
      text: () => split()
        ? "Together the shards execute 20 WAL per second. The cost: a join across both shards needs 2 network calls."
        : "After 6 s the backlog is 30 WAL, and it grows by 5 every second.",
      async play(s) {
        if (split()) { shards.forEach(n => n.b.state("ok")); count(6, OKT); }
        else { one.b.state("bad"); setQ(one, one.backlog, C.bad); count(6, BADT); }
        await s.wait(700);
      },
    },
  ];
  const steps = f.steps(STEPS, { reset, enter });
});

/* ======================================================================
   Figure: a replica out of sync, available vs consistent
   ====================================================================== */
Kit.figure("tradeoff", f => {
  f.chrome({ tag: "trade-off", label: "available or consistent" });
  const svg = f.svg(880, 300, { label: "A primary, pgpool and three read replicas, one of them out of sync", minWidth: 660 });
  const wires = sv("g"), nodes = sv("g"), fx = sv("g");
  svg.append(wires, nodes, fx);

  const RY = i => 14 + i * 100, CAP = 10;
  const wWal = [0, 1, 2].map(i => wire(wires, `M210,44 C400,44 420,${RY(i) + 24} 600,${RY(i) + 24}`, { dash: "4 5" }));
  const wRead = [0, 1, 2].map(i => wire(wires, `M210,205 C400,205 420,${RY(i) + 50} 600,${RY(i) + 50}`));
  const prim = box(nodes, { x: 10, y: 14, w: 200, h: 60, label: "primary", sub: "x = 2", color: C.db });
  const lb = box(nodes, { x: 10, y: 170, w: 200, h: 70, label: "pgpool", sub: "25K reads / s", color: C.pool });
  const reps = [0, 1, 2].map(i => {
    const b = box(nodes, { x: 600, y: RY(i), w: 270, h: 72, top: 22, label: "replica " + (i + 1), sub: "", color: C.rep });
    const bg = sv("rect", { x: 614, y: RY(i) + 50, width: 240, height: 8 });
    bg.style.fill = C.line;
    const bar = sv("rect", { x: 614, y: RY(i) + 50, width: 0, height: 8 });
    bar.style.transition = "width .4s ease, fill .3s ease";
    nodes.append(bg, bar);
    return { b, bar, x: 1, load: 0 };
  });

  const mode = f.segmented([["avail", "stay available"], ["cons", "stay consistent"]], "avail", () => steps.redo(), { label: "Choice" });
  const avail = () => mode.value === "avail";
  const show = (r, color) => {
    r.b.text(`x = ${r.x} · ${r.load ? r.load.toFixed(1).replace(".0", "") : 0}K / ${CAP}K reads`, color || C.ink);
    r.bar.setAttribute("width", 240 * Math.min(1, r.load / CAP));
    r.bar.style.fill = r.load >= CAP ? C.warn : C.rep;
  };

  /* before step 1: every replica is at x = 1, the primary already has x = 2 */
  function reset() {
    fx.replaceChildren();
    prim.state("idle"); prim.text("x = 2"); lb.state("idle");
    reps.forEach((r, i) => { r.x = 1; r.load = 0; r.b.state("idle"); r.b.label.textContent = "replica " + (i + 1); show(r); });
    f.big("25K", "reads / s · 10K per replica");
    f.status("the primary writes x = 2");
  }
  function enter() { fx.replaceChildren(); [...wWal, ...wRead].forEach(w => lit(w)); }

  const STEPS = [
    {
      title: "missed WAL",
      text: "The primary ships the WAL for x = 2. The network fails on the way to replica 3, so it still has x = 1.",
      async play(s) {
        prim.state("on");
        await Promise.all(reps.map(async (r, i) => {
          lit(wWal[i], C.wal);
          if (i === 2) {
            await travel(s, fx, wWal[i], C.wal, 750, { to: 0.6 });
            const p = Kit.pointAt(wWal[i], 0.6);
            pop(fx, p.x, p.y - 10, "✕ network failure", BADT);
            r.b.state("bad"); show(r, BADT);
          } else {
            await travel(s, fx, wWal[i], C.wal, 750);
            r.x = 2; show(r);
          }
          lit(wWal[i]);
        }));
        prim.state("idle");
        f.status("replica 3 is out of sync", WARNT);
        await s.wait(300);
      },
    },
    {
      get title() { return avail() ? "stay available" : "stay consistent"; },
      text: () => avail()
        ? "We keep replica 3 in the pool. The 25K reads spread as about 8.3K on each replica, so some users get x = 1: stale data."
        : "We remove replica 3 from the pool. Replicas 1 and 2 take 10K each, at their fullest. 5K reads per second have nowhere to go.",
      async play(s) {
        lb.state("on");
        const live = avail() ? [0, 1, 2] : [0, 1];
        if (!avail()) { reps[2].b.state("dim"); f.status("replica 3 removed from the pool"); }
        for (let k = 0; k < 6; k++) {
          const i = live[k % live.length];
          lit(wRead[i], C.app);
          await travel(s, fx, wRead[i], C.app, 360);
          lit(wRead[i]);
        }
        live.forEach(i => { reps[i].load = avail() ? 25 / 3 : CAP; show(reps[i], i === 2 ? BADT : null); });
        if (avail()) {
          pop(fx, 735, RY(2) - 4, "stale: x = 1", WARNT, { ms: 2200 });
          f.big("8.3K", "reads / s get stale data", WARNT);
          f.status("available, but not consistent", WARNT);
        } else {
          pop(fx, 110, 160, "✕ 5K / s · 503", BADT, { ms: 2200 });
          f.big("5K", "reads / s dropped with a 503", BADT);
          f.status("consistent, but not available", BADT);
        }
        await s.wait(600);
      },
    },
    {
      title: "primary down",
      text: "The original database goes down too. Pgpool promotes replica 1, and it becomes the primary for the writes.",
      async play(s) {
        prim.state("bad"); prim.text("down ✕", BADT);
        await s.wait(700);
        reps[0].b.label.textContent = "replica 1 → primary";
        reps[0].b.state("on");
        pop(fx, 735, RY(0) - 2, "✓ promoted", OKT);
        f.status("pgpool sends the writes to the new primary", OKT);
        await s.wait(600);
      },
    },
  ];
  const steps = f.steps(STEPS, { reset, enter });
});
