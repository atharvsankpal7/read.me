/*
 * Figures for the checkpointing post. Each Kit.figure(id, setup) fills the `::figure <id>` block
 * with the same name in post.md. The write and crash figures use the same pages and LSNs.
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
  /* diagram parts: the client, pages and table files, the WAL, dirty pages and the checkpointer */
  client: v("prod"), page: v("pg"), wal: v("retry"), dirty: v("dest"), ckpt: v("kafka"),
};
/* short status words use the status colours directly; they always sit next to a ✓ / ✕ glyph */
const OKT = C.ok, BADT = C.bad;

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

/* a dot that travels along a path; o.reverse runs it backwards, o.to stops part way, o.keep leaves it there */
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
    if (!o.keep) c.remove();
  }
  return c;
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

/* a slot inside a box (a page, a WAL record): a small line on top, the value in the middle, a note under it.
   set(null) shows an empty, dashed slot. */
function slot(parent, x, y, w, ht, empty = "") {
  const g = sv("g");
  const r = sv("rect", { x, y, width: w, height: ht, "stroke-width": 1.2 });
  r.style.transition = "fill .3s ease, stroke .3s ease";
  const a = sv("text", { x: x + w / 2, y: y + 15, "font-size": 9, "text-anchor": "middle" });
  const b = sv("text", { x: x + w / 2, y: y + ht / 2 + 5, "font-weight": 600, "text-anchor": "middle" });
  const c = sv("text", { x: x + w / 2, y: y + ht - 9, "font-size": 9.5, "text-anchor": "middle" });
  g.append(r, a, b, c);
  g.style.transition = "opacity .3s ease";
  parent.appendChild(g);
  const self = {
    g, x, y, w, h: ht, cx: x + w / 2, cy: y + ht / 2,
    /* o: { top, mid, low, color, lowColor, midSize, strong, dim } */
    set(o) {
      if (o) r.removeAttribute("stroke-dasharray"); else r.setAttribute("stroke-dasharray", "3 4");
      r.style.fill = o ? (o.color ? o.color + (o.strong ? "3d" : "17") : C.bg) : "none";
      r.style.stroke = o ? o.color || C.line2 : C.line2;
      a.textContent = o ? o.top || "" : "";
      b.textContent = o ? o.mid || "" : "";
      c.textContent = o ? o.low || "" : empty;
      b.setAttribute("font-size", o && o.midSize || 13);
      a.style.fill = C.muted;
      b.style.fill = C.ink;
      c.style.fill = o ? o.lowColor || C.muted : C.faint;
      g.style.opacity = o && o.dim ? 0.4 : 1;
      return self;
    },
  };
  return self.set(null);
}

const key = (color, label) => h("span", { class: "fig-key" }, [h("i", { style: `background:${color}` }), label]);
const clockStr = sec => { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); };

/* ---------- the two lanes every write goes through ---------- */

/* memory on top (shared buffers, WAL buffers), the SSD below (table file, pg_wal); each box has 4 slots */
function lanes(back, nodes) {
  const div = sv("line", { x1: 172, x2: 870, y1: 164, y2: 164, "stroke-dasharray": "2 5" });
  div.style.stroke = C.line2;
  back.appendChild(div);
  txt(back, 870, 158, "memory", { size: 10, anchor: "end", color: C.faint });
  txt(back, 870, 178, "SSD", { size: 10, anchor: "end", color: C.faint });
  const mk = (x, y, w, label, color, empty) => {
    const b = box(nodes, { x, y, w, h: 120, top: 20, label, color });
    b.slots = [0, 1, 2, 3].map(k => slot(nodes, x + 14 + k * 76, y + 34, 68, 62, empty));
    b.info = txt(nodes, x + w - 12, y + 20, "", { size: 10.5, anchor: "end" });
    return b;
  };
  return {
    buf: mk(190, 22, 330, "shared buffers", C.page, "free"),
    walb: mk(550, 22, 320, "WAL buffers", C.wal, ""),
    table: mk(190, 186, 330, "table file", C.page, ""),
    pgwal: mk(550, 186, 320, "pg_wal", C.wal, ""),
  };
}
/* the y just under a slot, for pops */
const under = sl => sl.y + sl.h + 14;
/* a copy of one slot moves onto another slot */
const move = (s, layer, from, to, color, label, ms = 700) =>
  slide(s, layer, { x0: from.x, y0: from.y, x1: to.x, y1: to.y, w: from.w, h: from.h, color, label, arc: 0 }, ms);

/* red wash over the memory lane while the machine is down */
function deadMemory(layer) {
  const g = sv("g");
  const r = sv("rect", { x: 178, y: 2, width: 698, height: 148, "stroke-dasharray": "4 4" });
  r.style.cssText = `fill:${C.bad}0d;stroke:${C.bad}`;
  g.appendChild(r);
  txt(g, 527, 16, "✕ power lost · everything in memory is gone", { size: 11, anchor: "middle", color: BADT, weight: 600 }).classList.add("fx-halo");
  g.style.cssText = "opacity:0;transition:opacity .3s ease;pointer-events:none";
  layer.appendChild(g);
  return g;
}

const PAGE = (name, lsn, val, o = {}) => ({
  top: `${name} · lsn ${lsn}`, mid: String(val), low: o.low || "",
  color: o.dirty ? C.dirty : C.page, lowColor: o.dirty ? C.dirty : null,
});
const REC = (lsn, mid, low, o = {}) => ({ top: `lsn ${lsn}`, mid, low, color: C.wal, dim: o.dim });

/* the SSD before the update: user 7's balance (100) lives on p3, last changed by tx 900 at lsn 40 */
function startSsd(L) {
  const T = L.table.slots, PW = L.pgwal.slots;
  T[0].set(PAGE("p1", 31, 12)); T[1].set(PAGE("p2", 35, 55));
  T[2].set(PAGE("p3", 40, 100, { low: "id 7" })); T[3].set(PAGE("p4", 22, 31));
  PW[0].set(REC(40, "p3 = 100", "tx 900")); PW[1].set(REC(41, "commit", "tx 900"));
  PW[2].set(null); PW[3].set(null);
}

/* the WAL buffers go to pg_wal: lsn 42 and 43 land after the two old records */
async function flushTwo(s, fx, W, L, tx) {
  const WB = L.walb.slots, PW = L.pgwal.slots;
  lit(W.flush, C.wal);
  await Promise.all([0, 1].map(k => move(s, fx, WB[k], PW[k + 2], C.wal, "lsn " + (42 + k), 700)));
  PW[2].set(REC(42, "p3 = 80", tx)); PW[3].set(REC(43, "commit", tx));
  WB[0].set(REC(42, "p3 = 80", "flushed", { dim: true })); WB[1].set(REC(43, "commit", "flushed", { dim: true }));
  pop(fx, 712, 160, "fsync ✓", OKT, { size: 10.5 });
  lit(W.flush);
}

/* ======================================================================
   Figure: the life of one update (step through)
   ====================================================================== */
Kit.figure("write", f => {
  f.chrome({ tag: "postgres · write path", label: "the life of one update" });
  const svg = f.svg(880, 316, { label: "A client, shared buffers and WAL buffers in memory, and the table file and pg_wal on the SSD, with one update moving through them", minWidth: 660 });
  const back = sv("g"), wires = sv("g"), nodes = sv("g"), fx = sv("g");
  svg.append(back, wires, nodes, fx);

  const W = {
    query: wire(wires, "M150,64 H190"),
    load: wire(wires, "M390,186 C390,164 314,164 314,142"),
    rec: wire(wires, "M520,82 H550"),
    flush: wire(wires, "M712,142 V186"),
    ack: wire(wires, "M598,186 V172 H80 V92"),
    bg: wire(wires, "M150,260 H190"),
  };
  const L = lanes(back, nodes);
  const N = {
    client: box(nodes, { x: 10, y: 36, w: 140, h: 56, label: "client", sub: "psql", color: C.client }),
    proc: box(nodes, { x: 10, y: 232, w: 140, h: 56, label: "bgwriter", sub: "or checkpointer", color: C.ckpt }),
    buf: L.buf, walb: L.walb, table: L.table, pgwal: L.pgwal,
  };
  const B = L.buf.slots, WB = L.walb.slots, T = L.table.slots;

  /* flipping the page replays the current step the other way (the UPDATE looks the same, so start at the lookup) */
  const cached = f.segmented([["hit", "page in shared buffers"], ["miss", "page not in memory"]], "hit", () => steps.go(Math.max(1, steps.index), true), { label: "Page" });
  const hit = () => cached.value === "hit";

  const STEPS = [
    {
      title: "UPDATE",
      text: "The client sends an update for user 7. The row lives on page p3 of the users table.",
      on: ["client"],
      async play(s) {
        lit(W.query, C.client);
        await travel(s, fx, W.query, C.client, 500);
        pop(fx, 170, 52, "UPDATE", C.soft, { size: 10.5 });
        await s.wait(400);
      },
    },
    {
      title: "find the page",
      text: () => hit()
        ? "p3 is already in shared buffers, so Postgres uses it from memory. No SSD read."
        : "p3 isn't in shared buffers, so Postgres reads the whole 8 KB page from the table file into shared buffers first.",
      on: () => hit() ? ["buf"] : ["buf", "table"],
      async play(s) {
        if (hit()) {
          pop(fx, B[1].cx, under(B[1]), "✓ in memory", OKT, { size: 10.5 });
          await s.wait(800);
          return;
        }
        lit(W.load, C.page);
        await move(s, fx, T[2], B[1], C.page, "p3", 800);
        B[1].set(PAGE("p3", 40, 100, { low: "id 7" }));
        pop(fx, B[1].cx, under(B[1]), "read 8 KB", C.soft, { size: 10.5 });
        await s.wait(400);
      },
    },
    {
      title: "dirty",
      text: "Postgres applies the change to p3 in shared buffers. The table file on the SSD still says 100, so p3 is now a dirty page.",
      on: ["buf"],
      async play(s) {
        B[1].set(PAGE("p3", 40, 80, { dirty: true, low: "dirty" }));
        pop(fx, B[1].cx, under(B[1]), "100 → 80", C.dirty, { size: 10.5 });
        await s.wait(900);
      },
    },
    {
      title: "WAL record",
      text: "The same change goes into the WAL buffers as record lsn 42. p3 now remembers lsn 42, the last WAL record that changed it.",
      on: ["buf", "walb"],
      async play(s) {
        lit(W.rec, C.wal);
        await travel(s, fx, W.rec, C.wal, 450);
        WB[0].set(REC(42, "p3 = 80", "tx 901"));
        B[1].set(PAGE("p3", 42, 80, { dirty: true, low: "dirty" }));
        pop(fx, B[1].cx, under(B[1]), "lsn 40 → 42", C.soft, { size: 10.5 });
        await s.wait(700);
      },
    },
    {
      title: "COMMIT",
      text: "On COMMIT, Postgres adds a commit record and flushes the WAL buffers to pg_wal on the SSD, with fsync.",
      on: ["client", "walb", "pgwal"],
      async play(s) {
        lit(W.query, C.client);
        await travel(s, fx, W.query, C.client, 450);
        pop(fx, 170, 52, "COMMIT", C.soft, { size: 10.5 });
        WB[1].set(REC(43, "commit", "tx 901"));
        await s.wait(500);
        await flushTwo(s, fx, W, L, "tx 901");
        await s.wait(300);
      },
    },
    {
      title: "safe",
      text: "Only after the flush does the client get COMMIT back. The table file still says 100, and that's fine: the WAL on the SSD has the change.",
      on: ["client", "pgwal"],
      async play(s) {
        lit(W.ack, C.ok);
        await travel(s, fx, W.ack, C.ok, 900);
        N.client.text("✓ COMMIT", OKT);
        f.status("the client has COMMIT · the table file still says 100");
        await s.wait(500);
      },
    },
    {
      title: "later",
      text: "Later the background writer or the checkpointer writes p3 to the table file. The WAL is already on the SSD up to lsn 42, so the page is allowed to go.",
      on: ["proc", "buf", "table"],
      async play(s) {
        lit(W.bg, C.ckpt);
        await travel(s, fx, W.bg, C.ckpt, 450);
        lit(W.load, C.dirty);
        await move(s, fx, B[1], T[2], C.dirty, "p3", 800);
        T[2].set(PAGE("p3", 42, 80, { low: "id 7" }));
        B[1].set(PAGE("p3", 42, 80, { low: "clean" }));
        pop(fx, T[2].cx, under(T[2]), "✓ written", OKT, { size: 10.5 });
        f.status("p3 is clean again");
        await s.wait(500);
      },
    },
  ];

  /* before step 1: p3 is on the SSD (and in memory too, for a hit), nothing in the WAL buffers */
  function reset() {
    fx.replaceChildren();
    startSsd(L);
    B[0].set(PAGE("p1", 31, 12));
    B[1].set(hit() ? PAGE("p3", 40, 100, { low: "id 7" }) : null);
    B[2].set(null); B[3].set(null);
    WB.forEach(sl => sl.set(null));
    N.client.text("psql");
    f.status("UPDATE users SET balance = 80 WHERE id = 7");
  }
  /* each step lights the boxes it is about */
  function enter(i) {
    fx.replaceChildren();
    const st = STEPS[i], on = typeof st.on === "function" ? st.on() : st.on;
    Object.entries(N).forEach(([k, b]) => b.state(on.includes(k) ? "on" : "idle"));
    Object.values(W).forEach(w => lit(w));
    f.big(`${i + 1}/${STEPS.length}`, st.title);
  }
  const steps = f.steps(STEPS, { reset, enter });
  f.foot.append(key(C.page, "clean page"), key(C.dirty, "dirty page"), key(C.wal, "WAL record"));
});

/* ======================================================================
   Figure: a crash before and after the WAL flush
   ====================================================================== */
Kit.figure("crash", f => {
  f.chrome({ tag: "atomicity · durability", label: "where the crash happens" });
  const svg = f.svg(880, 316, { label: "The same lanes as before. One transaction is cut by a crash before or after its WAL flush, then Postgres restarts", minWidth: 660 });
  const back = sv("g"), wires = sv("g"), nodes = sv("g"), top = sv("g"), fx = sv("g");
  svg.append(back, wires, nodes, top, fx);

  const W = {
    query: wire(wires, "M150,64 H190"),
    load: wire(wires, "M390,186 C390,164 314,164 314,142"),
    rec: wire(wires, "M520,82 H550"),
    flush: wire(wires, "M712,142 V186"),
    ack: wire(wires, "M598,186 V172 H80 V92"),
  };
  const L = lanes(back, nodes);
  const N = {
    client: box(nodes, { x: 10, y: 36, w: 140, h: 56, label: "client", sub: "psql", color: C.client }),
    startup: box(nodes, { x: 10, y: 232, w: 140, h: 56, label: "startup", sub: "replays pg_wal", color: C.muted }),
    buf: L.buf, walb: L.walb, table: L.table, pgwal: L.pgwal,
  };
  const B = L.buf.slots, WB = L.walb.slots, T = L.table.slots, PW = L.pgwal.slots;
  const dead = deadMemory(top);

  /* the crash point picks the story; switching replays the current step the other way */
  const when = f.segmented([["before", "crash before the flush"], ["after", "crash after the flush"]], "before", () => steps.go(Math.max(1, steps.index), true), { label: "Crash point" });
  const early = () => when.value === "before";

  const STEPS = [
    {
      title: "write",
      text: "tx 902 sets user 7's balance to 80. p3 is dirty in shared buffers and record lsn 42 is in the WAL buffers. Nothing is on the SSD yet.",
      on: ["client", "buf", "walb"],
      async play(s) {
        lit(W.query, C.client);
        await travel(s, fx, W.query, C.client, 450);
        B[1].set(PAGE("p3", 40, 80, { dirty: true, low: "dirty" }));
        lit(W.rec, C.wal);
        await travel(s, fx, W.rec, C.wal, 400);
        WB[0].set(REC(42, "p3 = 80", "tx 902"));
        B[1].set(PAGE("p3", 42, 80, { dirty: true, low: "dirty" }));
        await s.wait(500);
      },
    },
    {
      title: "COMMIT",
      text: () => early()
        ? "The client sends COMMIT. The commit record goes into the WAL buffers, and the flush to the SSD starts..."
        : "The client sends COMMIT. The WAL buffers are flushed to pg_wal, and only then the client gets COMMIT back.",
      on: () => early() ? ["client", "walb"] : ["client", "walb", "pgwal"],
      async play(s) {
        lit(W.query, C.client);
        await travel(s, fx, W.query, C.client, 450);
        pop(fx, 170, 52, "COMMIT", C.soft, { size: 10.5 });
        WB[1].set(REC(43, "commit", "tx 902"));
        await s.wait(400);
        if (early()) {
          /* the flush is on its way when the next step cuts the power */
          lit(W.flush, C.wal);
          await travel(s, fx, W.flush, C.wal, 700, { to: 0.45, ease: Kit.ease.linear, keep: true });
          return;
        }
        await flushTwo(s, fx, W, L, "tx 902");
        lit(W.ack, C.ok);
        await travel(s, fx, W.ack, C.ok, 800);
        N.client.text("✓ COMMIT", OKT);
      },
    },
    {
      title: "crash",
      text: () => early()
        ? "...and the machine dies before the flush reaches the SSD. Everything in memory is gone, and the client gets a connection error, not COMMIT."
        : "The machine dies. Shared buffers and WAL buffers are gone, and the table file still says 100. The change is only in pg_wal.",
      on: [],
      async play(s) {
        dead.style.opacity = 1;
        B.forEach(sl => sl.set(null));
        WB.forEach(sl => sl.set(null));
        if (early()) N.client.text("✕ connection lost", BADT);
        f.status("✕ crashed", BADT);
        await s.wait(800);
      },
    },
    {
      title: "restart",
      text: () => early()
        ? "Postgres replays pg_wal. There is nothing of tx 902 in it, so p3 stays 100. The client was told the transaction failed, and nothing of it is visible. This is atomicity."
        : "Postgres replays pg_wal. p3 on the SSD has lsn 40, older than record 42, so the change is applied, and commit 43 marks tx 902 committed. p3 = 80 again. This is durability.",
      on: ["startup", "pgwal", "table", "buf"],
      async play(s) {
        dead.style.opacity = 0;
        f.status("restarting · replaying pg_wal");
        lit(W.load, C.page);
        await move(s, fx, T[2], B[1], C.page, "p3", 600);
        B[1].set(PAGE("p3", 40, 100, { low: "id 7" }));
        lit(W.load);
        if (early()) {
          pop(fx, PW[1].cx, under(PW[1]), "end of WAL", C.soft, { size: 10.5 });
          await s.wait(500);
          f.big("100", "user 7's balance after the restart");
          f.status("✓ tx 902 never happened · atomic", OKT);
        } else {
          await move(s, fx, PW[2], B[1], C.wal, "lsn 42", 800);
          B[1].set(PAGE("p3", 42, 80, { dirty: true, low: "replayed" }));
          pop(fx, B[1].cx, under(B[1]), "lsn 40 < 42 · apply", C.soft, { size: 10.5 });
          await s.wait(400);
          pop(fx, PW[3].x + PW[3].w, under(PW[3]), "✓ tx 902 committed", OKT, { size: 10.5, anchor: "end" });
          f.big("80", "user 7's balance after the restart");
          f.status("✓ the committed change survived · durable", OKT);
        }
        await s.wait(500);
      },
    },
  ];

  /* before step 1: p3 is clean in memory and on the SSD, the WAL buffers are empty */
  function reset() {
    fx.replaceChildren();
    startSsd(L);
    B[0].set(PAGE("p1", 31, 12));
    B[1].set(PAGE("p3", 40, 100, { low: "id 7" }));
    B[2].set(null); B[3].set(null);
    WB.forEach(sl => sl.set(null));
    dead.style.opacity = 0;
    N.client.text("psql");
    f.status("UPDATE users SET balance = 80 WHERE id = 7; COMMIT;");
  }
  function enter(i) {
    fx.replaceChildren();
    const st = STEPS[i], on = typeof st.on === "function" ? st.on() : st.on;
    Object.entries(N).forEach(([k, b]) => b.state(on.includes(k) ? "on" : "idle"));
    Object.values(W).forEach(w => lit(w));
    f.big(`${i + 1}/${STEPS.length}`, st.title);
  }
  const steps = f.steps(STEPS, { reset, enter });
});

/* ======================================================================
   Figure: what a checkpoint does (step through)
   ====================================================================== */
Kit.figure("checkpoint", f => {
  f.chrome({ tag: "postgres · checkpointer", label: "what a checkpoint does" });
  const svg = f.svg(880, 326, { label: "Shared buffers with eight pages, the WAL in six segments, the table file and pg_control, with the checkpointer writing the dirty pages", minWidth: 660 });
  const nodes = sv("g"), marks = sv("g"), fx = sv("g");
  svg.append(nodes, marks, fx);

  const N = {
    ckpt: box(nodes, { x: 10, y: 10, w: 150, h: 56, label: "checkpointer", sub: "", color: C.ckpt }),
    ctl: box(nodes, { x: 10, y: 214, w: 150, h: 104, top: 22, label: "pg_control", sub: "", color: C.muted }),
    buf: box(nodes, { x: 190, y: 10, w: 680, h: 104, top: 20, label: "shared buffers", color: C.page }),
    table: box(nodes, { x: 190, y: 214, w: 680, h: 104, top: 20, label: "table file", color: C.page }),
  };
  const ctl2 = txt(nodes, 24, 272, "", { size: 10.5 });
  const bufInfo = txt(nodes, 858, 30, "", { size: 10.5, anchor: "end" });
  const B = Array.from({ length: 8 }, (_, k) => slot(nodes, 204 + k * 82, 40, 74, 62));
  const T = Array.from({ length: 8 }, (_, k) => slot(nodes, 204 + k * 82, 244, 74, 62));

  /* the WAL: 6 segments of 16 MB; positions are in segments (2.5 = half way through seg 3) */
  txt(nodes, 160, 166, "pg_wal", { size: 12, anchor: "end", color: C.ink, weight: 600 });
  txt(nodes, 160, 182, "16 MB segments", { size: 10, anchor: "end" });
  const SEG = Array.from({ length: 6 }, (_, k) => {
    const x = 190 + k * 114;
    const frame = sv("rect", { x, y: 150, width: 108, height: 36, "stroke-width": 1 });
    frame.style.cssText = `fill:${C.bg2};stroke:${C.line2};transition:opacity .35s ease`;
    const fill = sv("rect", { x, y: 150, width: 0, height: 36 });
    fill.style.fill = C.wal + "40";
    const label = txt(nodes, x + 7, 172, "", { size: 9.5, color: C.soft });
    nodes.insertBefore(frame, label);
    nodes.insertBefore(fill, label);
    return { frame, fill, label };
  });
  const posX = p => { const k = Math.min(5, Math.max(0, Math.floor(p))); return 190 + k * 114 + (p - k) * 108; };
  /* a redo point: a line across the WAL with its name above */
  function marker() {
    const g = sv("g"); marks.appendChild(g);
    const l = sv("line", { y1: 144, y2: 192, "stroke-width": 1.6 });
    const t = txt(g, 0, 139, "", { size: 10, anchor: "middle", weight: 600 });
    g.insertBefore(l, t);
    g.style.transition = "opacity .35s ease";
    return {
      at(p, label, color) {
        const x = posX(p);
        l.setAttribute("x1", x); l.setAttribute("x2", x); l.style.stroke = color;
        t.setAttribute("x", x); t.textContent = label; t.style.fill = color;
      },
      show(on) { g.style.opacity = on ? 1 : 0; },
    };
  }
  /* a checkpoint record: a thin block in the WAL with "ckpt" under it */
  function ckRec() {
    const g = sv("g"); marks.appendChild(g);
    const r = sv("rect", { y: 151, width: 5, height: 34 });
    r.style.fill = C.ckpt;
    const t = txt(g, 0, 200, "ckpt", { size: 9.5, anchor: "middle", color: C.ckpt, weight: 600 });
    g.insertBefore(r, t);
    g.style.transition = "opacity .35s ease";
    return {
      at(p) { const x = posX(p); r.setAttribute("x", x - 2.5); t.setAttribute("x", x); },
      show(on) { g.style.opacity = on ? 1 : 0; },
    };
  }
  const oldRedo = marker(), newRedo = marker(), oldCk = ckRec(), newCk = ckRec();

  const FIRST = [1, 4, 0, 6, 3];
  let W = 0, redoDone = 0, redoNew = 0, gone = 0;
  const dirty = Array(8).fill(false);
  const page = (k, st) => ({
    mid: `p${k + 1}`, low: st === "new" ? "after redo" : st,
    color: st === "clean" ? C.page : C.dirty, lowColor: st === "clean" ? null : C.dirty,
  });
  const info = () => { bufInfo.textContent = `${dirty.filter(Boolean).length} dirty`; };
  function drawWal() {
    SEG.forEach((sg, k) => sg.fill.setAttribute("width", k < gone ? 0 : Math.max(0, Math.min(1, W - k)) * 108));
    f.big(`${Math.round((W - redoDone) * 16)} MB`, "WAL to replay after a crash");
  }
  /* the WAL grows by d segments */
  async function grow(s, d, ms) {
    const from = W;
    await s.tween(ms, t => { W = from + d * t; drawWal(); }, Kit.ease.linear);
  }
  const seg = p => `seg ${Math.floor(p) + 1}`;

  const STEPS = [
    {
      title: "writes",
      text: "Transactions keep coming. Every change dirties a page in shared buffers and adds to the WAL, so the WAL to replay after a crash grows with it.",
      on: ["buf"],
      async play(s) {
        for (const k of FIRST) {
          await grow(s, 0.42, 420);
          dirty[k] = true; B[k].set(page(k, "dirty")); info();
        }
        await s.wait(300);
      },
    },
    {
      title: "redo point",
      text: "checkpoint_timeout is up. The checkpointer notes where the WAL is right now. This is the new redo point.",
      on: ["ckpt"],
      async play(s) {
        N.ckpt.text("checkpoint starts");
        oldRedo.at(0.1, "old redo", C.muted);
        redoNew = W;
        newRedo.at(W, "redo", C.accent); newRedo.show(true);
        await s.wait(900);
      },
    },
    {
      title: "write pages",
      text: "It writes the 5 pages that were dirty at the redo point, spread out over time. A new change to p3 comes in meanwhile. It is after the redo point, so it waits for the next checkpoint.",
      on: ["ckpt", "buf", "table"],
      async play(s) {
        for (const [i, k] of FIRST.entries()) {
          N.ckpt.text(`writing ${i + 1}/${FIRST.length}`);
          await move(s, fx, B[k], T[k], C.dirty, `p${k + 1}`, 650);
          dirty[k] = false; B[k].set(page(k, "clean")); info();
          T[k].set({ mid: `p${k + 1}`, low: "✓ written", color: C.page, lowColor: OKT });
          if (i === 1) {
            await grow(s, 0.3, 300);
            dirty[2] = true; B[2].set(page(2, "new")); info();
          }
          await s.wait(250);
        }
      },
    },
    {
      title: "checkpoint record",
      text: "The table files are fsynced, a checkpoint record goes into the WAL, and pg_control now points to it. After a crash, replay starts at the new redo point.",
      on: ["ckpt", "ctl"],
      async play(s) {
        N.ckpt.text("fsync · done");
        await grow(s, 0.04, 200);
        newCk.at(W - 0.02); newCk.show(true);
        await s.wait(400);
        redoDone = redoNew; drawWal();
        N.ctl.text(`redo → ${seg(redoNew)}`); ctl2.textContent = `checkpoint → ${seg(W)}`;
        N.ctl.state("ok");
        f.status("✓ the WAL to replay drops to the new redo point", OKT);
        await s.wait(700);
      },
    },
    {
      title: "recycle",
      text: "WAL before the new redo point isn't needed for crash recovery anymore. Segments 1 and 2 are recycled (renamed and reused for new WAL), unless a replica or the archiver still needs them.",
      on: ["ctl"],
      async play(s) {
        gone = Math.floor(redoNew);
        for (let k = 0; k < gone; k++) { SEG[k].frame.style.opacity = 0.35; SEG[k].label.textContent = "recycled"; }
        oldRedo.show(false); oldCk.show(false);
        drawWal();
        f.status(`✓ ${gone} segments recycled`, OKT);
        await s.wait(700);
      },
    },
  ];

  /* before step 1: the last checkpoint is at the start of seg 1 and every page is clean */
  function reset() {
    fx.replaceChildren();
    W = 0.4; redoDone = 0.1; redoNew = 0; gone = 0;
    dirty.fill(false);
    B.forEach((sl, k) => sl.set(page(k, "clean")));
    T.forEach((sl, k) => sl.set({ mid: `p${k + 1}`, color: C.page }));
    SEG.forEach((sg, k) => { sg.frame.style.opacity = 1; sg.label.textContent = `seg ${k + 1}`; });
    oldRedo.at(0.1, "redo", C.muted); oldRedo.show(true);
    oldCk.at(0.15); oldCk.show(true);
    newRedo.show(false); newCk.show(false);
    N.ckpt.text("next in 5 min");
    N.ctl.text("redo → seg 1"); ctl2.textContent = "checkpoint → seg 1";
    info(); drawWal();
    f.status("the last checkpoint was at the start of seg 1");
  }
  function enter(i) {
    fx.replaceChildren();
    const on = STEPS[i].on;
    Object.entries(N).forEach(([k, b]) => b.state(on.includes(k) ? "on" : "idle"));
  }
  f.steps(STEPS, { reset, enter });
  f.foot.append(key(C.dirty, "dirty page"), key(C.wal + "66", "WAL"), key(C.accent, "redo point"), key(C.ckpt, "checkpoint record"));
});

/* ======================================================================
   Figure: crash recovery from the redo point (step through)
   ====================================================================== */
Kit.figure("recovery", f => {
  f.chrome({ tag: "postgres · startup", label: "replay from the redo point" });
  const svg = f.svg(880, 292, { label: "pg_control, pg_xact, eight WAL records and four table pages, with replay moving through the records", minWidth: 660 });
  const nodes = sv("g"), marks = sv("g"), fx = sv("g");
  svg.append(nodes, marks, fx);

  const N = {
    ctl: box(nodes, { x: 10, y: 34, w: 150, h: 66, top: 20, label: "pg_control", sub: "ckpt lsn 130", color: C.muted }),
    xact: box(nodes, { x: 10, y: 140, w: 150, h: 140, top: 22, label: "pg_xact", sub: "commit status", color: C.muted }),
    pages: box(nodes, { x: 190, y: 140, w: 680, h: 140, top: 20, label: "pages", color: C.page }),
  };
  txt(nodes, 24, 86, "redo lsn 110", { size: 10.5 });
  txt(nodes, 858, 160, "read from the SSD into shared buffers", { size: 10.5, anchor: "end", color: C.faint });
  const XL = [0, 1, 2].map(i => txt(nodes, 24, 202 + i * 22, "", { size: 10.5 }));
  txt(nodes, 190, 22, "pg_wal", { size: 11, color: C.ink, weight: 600 });

  const RECS = [
    { lsn: 100, mid: "p1 = 5", low: "tx 902" },
    { lsn: 110, mid: "p2 = 7", low: "tx 903" },
    { lsn: 120, mid: "commit", low: "tx 903" },
    { lsn: 130, mid: "checkpoint", low: "redo 110", ckpt: true },
    { lsn: 140, mid: "p3 = 9", low: "tx 904" },
    { lsn: 150, mid: "p1 = 6", low: "tx 905" },
    { lsn: 160, mid: "commit", low: "tx 904" },
    { lsn: 170, mid: "p4 = 3", low: "tx 905" },
  ];
  const R = RECS.map((_, k) => slot(nodes, 190 + k * 85, 34, 78, 66));
  const rec = (k, o = {}) => ({ top: `lsn ${RECS[k].lsn}`, mid: RECS[k].mid, low: RECS[k].low, color: RECS[k].ckpt ? C.ckpt : C.wal, midSize: RECS[k].ckpt ? 11 : null, ...o });
  const P = [0, 1, 2, 3].map(k => slot(nodes, 204 + k * 166, 172, 154, 92));
  /* the pages as the crash left them on the SSD: p2 was written by the bgwriter after lsn 110 */
  const DISK = [{ lsn: 100, val: 5 }, { lsn: 110, val: 7 }, { lsn: 90, val: 8 }, { lsn: 80, val: 2 }];
  const pg = (k, lsn, val, o = {}) => ({ top: `p${k + 1} · lsn ${lsn}`, mid: String(val), color: C.page, ...o });

  const redo = sv("g"); marks.appendChild(redo);
  const redoL = sv("line", { x1: 271.5, x2: 271.5, y1: 28, y2: 106, "stroke-width": 1.6 });
  redoL.style.stroke = C.accent;
  redo.appendChild(redoL);
  txt(redo, 271.5, 22, "redo", { size: 10, anchor: "middle", color: C.accent, weight: 600 });
  redo.style.transition = "opacity .35s ease";
  /* the replay cursor under the record being read */
  const cur = sv("path", { d: "M-6,10 L0,0 L6,10 Z" });
  cur.style.cssText = `fill:${C.accent};transition:transform .3s ease, opacity .3s ease`;
  marks.appendChild(cur);
  const at = k => { cur.style.transform = `translate(${R[k].cx}px, 106px)`; cur.style.opacity = 1; };

  let applied = 0, skipped = 0;
  const count = () => f.big(String(applied), `applied · ${skipped} skipped`);
  const xact = (i, text, color) => { XL[i].textContent = text; XL[i].style.fill = color || C.muted; };
  /* one record goes from the WAL to its page */
  const apply = (s, k, p) => slide(s, fx, { x0: R[k].x + 9, y0: R[k].y + 20, x1: P[p].cx - 30, y1: P[p].y + 33, w: 60, h: 26, color: C.wal, label: `lsn ${RECS[k].lsn}`, arc: 24 }, 650);

  const STEPS = [
    {
      title: "crash",
      text: "The machine died with dirty pages in memory, and they are gone. What is left is on the SSD: the table pages, pg_wal and pg_control.",
      on: [],
      async play(s) { await s.wait(900); },
    },
    {
      title: "pg_control",
      text: "Postgres reads pg_control. The latest checkpoint record is at lsn 130, and its redo point is lsn 110. Everything before lsn 110 is already in the table files.",
      on: ["ctl"],
      async play(s) {
        R[3].set(rec(3, { strong: true }));
        await s.wait(400);
        redo.style.opacity = 1;
        R[0].set(rec(0, { dim: true }));
        f.status("replay starts at lsn 110");
        await s.wait(700);
      },
    },
    {
      title: "skip",
      text: "Replay starts at the redo point. lsn 110 changes p2, but p2 on the SSD already has lsn 110: the background writer wrote it after this change. So the record is skipped.",
      on: ["pages"],
      async play(s) {
        at(1);
        await s.wait(500);
        P[1].set(pg(1, 110, 7, { low: "lsn 110 ≥ 110 · skip", strong: true }));
        skipped++; count();
        await s.wait(700);
      },
    },
    {
      title: "apply",
      text: "lsn 120 commits tx 903, and the checkpoint record has nothing to replay. p3 has lsn 90, older than 140, so that change is applied. The same for p1 at lsn 150. lsn 160 commits tx 904.",
      on: ["pages", "xact"],
      async play(s) {
        P[1].set(pg(1, 110, 7, { low: "skipped" }));
        at(2); await s.wait(450);
        xact(0, "tx 903 · committed ✓", OKT);
        at(3); await s.wait(350);
        pop(fx, R[3].cx, 128, "nothing to do", C.soft, { size: 10 });
        await s.wait(250);
        at(4); await s.wait(300);
        await apply(s, 4, 2);
        P[2].set(pg(2, 140, 9, { low: "lsn 90 < 140 · apply", strong: true }));
        applied++; count();
        at(5); await s.wait(300);
        await apply(s, 5, 0);
        P[0].set(pg(0, 150, 6, { low: "tx 905 · applied", strong: true }));
        applied++; count();
        at(6); await s.wait(450);
        xact(1, "tx 904 · committed ✓", OKT);
        await s.wait(300);
      },
    },
    {
      title: "end of WAL",
      text: "The next record is torn. The crash cut it in the middle, so its checksum doesn't match. This is the end of the WAL.",
      on: [],
      async play(s) {
        at(7); await s.wait(350);
        R[7].set(rec(7, { color: C.bad, low: "✕ bad CRC", lowColor: BADT }));
        pop(fx, R[7].x + R[7].w, 128, "end of WAL", BADT, { size: 10.5, anchor: "end" });
        f.status("the WAL ends at lsn 170");
        await s.wait(700);
      },
    },
    {
      title: "done",
      text: "tx 905 has no commit record, so it is aborted. Its row stays in p1 but is invisible: queries still see p1 = 5. Postgres takes an end-of-recovery checkpoint and accepts connections again.",
      on: ["xact", "pages"],
      async play(s) {
        cur.style.opacity = 0;
        xact(2, "tx 905 · aborted ✕", BADT);
        await s.wait(400);
        P[0].set(pg(0, 150, 5, { low: "1 aborted row (tx 905)", lowColor: BADT }));
        f.big("2", "committed · 1 aborted", OKT);
        f.status("✓ ready for connections", OKT);
        await s.wait(500);
      },
    },
  ];

  /* before step 1: the pages as the crash left them and nothing replayed */
  function reset() {
    fx.replaceChildren();
    applied = skipped = 0; count();
    RECS.forEach((_, k) => R[k].set(rec(k)));
    DISK.forEach((d, k) => P[k].set(pg(k, d.lsn, d.val)));
    [903, 904, 905].forEach((tx, i) => xact(i, `tx ${tx} · ?`));
    redo.style.opacity = 0; cur.style.opacity = 0;
    f.status("✕ crashed · restarting", BADT);
  }
  function enter(i) {
    fx.replaceChildren();
    const on = STEPS[i].on;
    Object.entries(N).forEach(([k, b]) => b.state(on.includes(k) ? "on" : "idle"));
  }
  f.steps(STEPS, { reset, enter });
});

/* ======================================================================
   Figure: checkpoint interval vs WAL to replay and page writes
   ====================================================================== */
Kit.figure("tradeoff", f => {
  f.chrome({ tag: "checkpoint_timeout", label: "short recovery or less I/O" });
  const svg = f.svg(880, 292, { label: "WAL to replay after a crash over 30 minutes, and when the checkpointer writes pages", minWidth: 660 });
  const grid = sv("g"), plot = sv("g"), marks = sv("g");
  svg.append(grid, plot, marks);

  const X0 = 64, X1 = 862, Y0 = 30, Y1 = 186, YMAX = 500, LT = 232, LB = 272;
  const xOf = t => X0 + (X1 - X0) * t / 30, yOf = mb => Y1 - (Y1 - Y0) * Math.min(mb, YMAX) / YMAX;
  const hline = (y, color, dash) => {
    const l = sv("line", { x1: X0, x2: X1, y1: y, y2: y, "stroke-dasharray": dash || null });
    l.style.stroke = color;
    grid.appendChild(l);
  };
  for (let mb = 0; mb <= YMAX; mb += 100) {
    hline(yOf(mb), mb ? C.line : C.line2, mb ? "2 4" : null);
    txt(grid, X0 - 8, yOf(mb) + 3.5, String(mb), { size: 10, anchor: "end", color: C.faint });
  }
  txt(grid, X0, 16, "WAL to replay if we crash now (MB)", { size: 10.5 });
  for (let t = 0; t <= 30; t += 5) txt(grid, xOf(t), Y1 + 16, t ? `${t} min` : "0", { size: 10, anchor: "middle", color: C.faint });
  txt(grid, X0, LT - 10, "checkpointer writing pages", { size: 10.5 });
  hline(LB, C.line2);

  const band = sv("rect", { y: Y0, height: Y1 - Y0 });
  band.style.fill = C.bad + "12";
  const area = sv("path");
  area.style.fill = C.wal + "1f";
  const curve = sv("path", { fill: "none", "stroke-width": 1.8, "stroke-linejoin": "round" });
  curve.style.stroke = C.wal;
  const bars = sv("g");
  plot.append(band, area, curve, bars);
  const redoL = sv("line", { y1: Y0, y2: Y1, "stroke-dasharray": "3 3" });
  redoL.style.stroke = C.muted;
  const redoT = txt(marks, 0, Y1 - 6, "redo", { size: 10, color: C.muted });
  const crashL = sv("line", { y1: Y0 - 4, y2: LB, "stroke-width": 1.4 });
  crashL.style.stroke = C.bad;
  const crashT = txt(marks, 0, Y0 + 8, "⚡ crash", { size: 10.5, color: BADT, weight: 600 });
  const dot = sv("circle", { r: 4.5, "stroke-width": 2 });
  dot.style.cssText = `fill:${C.bad};stroke:${C.bg}`;
  marks.insertBefore(redoL, redoT); marks.insertBefore(crashL, crashT); marks.appendChild(dot);
  redoT.classList.add("fx-halo"); crashT.classList.add("fx-halo");

  /* illustrative numbers: 12 MB/min of WAL, a hot set of 6000 pages, 300 cold pages a minute.
     After each checkpoint starts, the first change to a hot page adds a full 8 KB copy to the WAL. */
  const BASE = 12, HOT = 6000, TAU = 2, COLD = 300, FPW = HOT * 8 / 1024, DT = 0.01;
  const cache = {};
  function model(I) {
    if (cache[I]) return cache[I];
    const t0 = -2 * I, n = Math.round((30 - t0) / DT), cum = new Float64Array(n + 1);
    for (let i = 1; i <= n; i++) {
      const t = t0 + (i - 0.5) * DT, since = t - Math.floor(t / I) * I;
      cum[i] = cum[i - 1] + (BASE + (FPW / TAU) * Math.exp(-since / TAU)) * DT;
    }
    const wal = t => cum[Math.max(0, Math.min(n, Math.round((t - t0) / DT)))];
    /* a checkpoint only counts once it finishes (90% of the interval after it starts) */
    const redo = t => I * Math.floor((t - 0.9 * I) / I);
    const replay = t => wal(t) - wal(redo(t));
    const pts = [];
    for (let i = 0; i <= 600; i++) pts.push([xOf(i / 20), yOf(replay(i / 20))]);
    return (cache[I] = {
      I, redo, replay, pts, n: Math.round(30 / I), wal30: wal(30) - wal(0),
      pages: HOT * (1 - Math.exp(-I / TAU)) + COLD * I,
    });
  }

  const every = f.segmented([["1", "every 1 min"], ["5", "every 5 min"], ["15", "every 15 min"]], "5", () => { drawBars(); crashAt(+slider.value); reveal(); }, { label: "Checkpoint interval" });
  const slider = h("input", { type: "range", min: 1, max: 30, step: 0.25, value: 22.5, "aria-label": "Crash time" });
  const sliderV = h("span", { class: "fx-range-v" });
  f.actions.append(h("label", { class: "fx-range" }, [slider, sliderV]));
  slider.addEventListener("input", () => crashAt(+slider.value));

  function draw(p) {
    const m = model(+every.value), pts = m.pts.slice(0, Math.max(2, Math.round((m.pts.length - 1) * p) + 1));
    const d = "M" + pts.map(q => q[0].toFixed(1) + "," + q[1].toFixed(1)).join("L");
    curve.setAttribute("d", d);
    area.setAttribute("d", `${d}L${pts[pts.length - 1][0].toFixed(1)},${Y1}L${X0},${Y1}Z`);
  }
  function drawBars() {
    const m = model(+every.value), rate = m.pages / (0.9 * m.I), ht = (LB - LT) * Math.min(1, rate / 3000);
    bars.replaceChildren();
    for (let t = 0; t < 30; t += m.I) {
      const x0 = xOf(t), x1 = xOf(Math.min(30, t + 0.9 * m.I));
      const r = sv("rect", { x: x0, y: LB - ht, width: Math.max(1, x1 - x0 - 1), height: ht });
      r.style.fill = C.ckpt + "59";
      const tick = sv("line", { x1: x0, x2: x0, y1: LT - 2, y2: LB });
      tick.style.stroke = C.ckpt;
      bars.append(r, tick);
    }
  }
  function crashAt(tc) {
    const m = model(+every.value), r = m.replay(tc), rd = m.redo(tc), x = xOf(tc), rx = xOf(Math.max(0, rd));
    crashL.setAttribute("x1", x); crashL.setAttribute("x2", x);
    dot.setAttribute("cx", x); dot.setAttribute("cy", yOf(r));
    const right = x > X1 - 80;
    crashT.setAttribute("x", right ? x - 6 : x + 6); crashT.setAttribute("text-anchor", right ? "end" : "start");
    band.setAttribute("x", rx); band.setAttribute("width", Math.max(0, x - rx));
    redoL.setAttribute("x1", rx); redoL.setAttribute("x2", rx); redoL.style.opacity = rd < 0 ? 0 : 1;
    redoT.setAttribute("x", rx + 4); redoT.textContent = rd < 0 ? "redo is before 0:00" : "redo";
    sliderV.textContent = `crash at ${clockStr(tc * 60)}`;
    f.big(`${Math.round(r)} MB`, `WAL to replay if we crash at ${clockStr(tc * 60)}`);
    f.status(`${m.n} checkpoints · ${Math.round(m.pages * m.n * 8 / 1024)} MB of page writes · ${Math.round(m.wal30)} MB of WAL in 30 min`);
  }
  function reveal() {
    f.run(async s => { await s.tween(1100, p => draw(p), Kit.ease.out); });
  }

  drawBars(); draw(1); crashAt(+slider.value);
  f.onEnter(() => { draw(0); reveal(); });
  f.foot.append(
    key(C.wal, "WAL to replay"), key(C.bad + "33", "replayed after this crash"), key(C.ckpt + "88", "checkpointer writing pages"),
    h("span", { class: "fig-note", text: "a checkpoint only counts once it finishes · numbers are illustrative" }),
  );
});

/* ======================================================================
   Figure: the crash lab (free play)
   ====================================================================== */
Kit.figure("lab", f => {
  f.chrome({ tag: "postgres · crash lab", label: "pull the plug" });
  const svg = f.svg(880, 316, { label: "A small Postgres: client, WAL writer, checkpointer, pg_control, shared buffers, WAL buffers, the table file and pg_wal", minWidth: 660 });
  const back = sv("g"), wires = sv("g"), nodes = sv("g"), top = sv("g"), fx = sv("g");
  svg.append(back, wires, nodes, top, fx);

  const W = {
    query: wire(wires, "M160,40 H190"),
    ack: wire(wires, "M598,186 V172 H174 V66 H160"),
    rec: wire(wires, "M520,82 H550"),
    flush: wire(wires, "M712,142 V186"),
    write: wire(wires, "M160,213 H190"),
  };
  const L = lanes(back, nodes);
  const N = {
    client: box(nodes, { x: 10, y: 22, w: 150, h: 54, label: "client", sub: "", color: C.client }),
    walw: box(nodes, { x: 10, y: 88, w: 150, h: 54, label: "WAL writer", sub: "flushes every 3 s", color: C.wal }),
    ckpt: box(nodes, { x: 10, y: 186, w: 150, h: 54, label: "checkpointer", sub: "", color: C.ckpt }),
    ctl: box(nodes, { x: 10, y: 252, w: 150, h: 54, label: "pg_control", sub: "", color: C.muted }),
  };
  const B = L.buf.slots, WB = L.walb.slots, T = L.table.slots, PW = L.pgwal.slots;
  const dead = deadMemory(top);

  /* the lab runs faster than real life: checkpoint_timeout is 30 s and the WAL writer flushes every 3 s */
  const INIT = [40, 25, 60, 10], ORDER = [2, 0, 3, 1], CKPT_MS = 30000, WALW_MS = 3000;
  let S = null, busy = false, syncCommit = "on", lastSec = -1;
  const clone = p => ({ lsn: p.lsn, vers: p.vers.slice() });

  /* every page keeps its row versions; a version is visible once its transaction is committed */
  function fresh() {
    S = {
      disk: INIT.map(val => ({ lsn: 10, vers: [{ val, tx: 1 }] })),
      buf: [null, null, null, null], dirty: [false, false, false, false],
      wal: [{ lsn: 10, kind: "ckpt", redo: 10 }], next: 11, flushed: 10, ctl: { ckpt: 10, redo: 10 },
      tx: 2, open: null, committed: new Set([1]), commits: new Map(), acked: [],
      crashed: false, recovering: false, inCkpt: false, cursor: null, shown: [],
      replayed: 0, replayTotal: 0, pending: null, result: null, pick: 0,
      nextWal: f.time + WALW_MS, nextCkpt: f.time + CKPT_MS, walFlash: 0,
    };
  }
  const visible = p => {
    for (let i = p.vers.length - 1; i >= 0; i--) if (S.committed.has(p.vers[i].tx)) return p.vers[i].val;
    return "—";
  };
  function pageView(k, p, dirty) {
    const last = p.vers[p.vers.length - 1];
    let low = dirty ? "dirty" : "", lowColor = dirty ? C.dirty : null;
    if (!S.committed.has(last.tx)) {
      if (last.tx === S.open) { low = `open: ${last.val}`; lowColor = C.dirty; }
      else { low = `aborted: ${last.val}`; lowColor = BADT; }
    }
    return { top: `p${k + 1} · lsn ${p.lsn}`, mid: String(visible(p)), low, lowColor, color: dirty ? C.dirty : C.page };
  }
  const recView = (r, cur) => ({
    top: `lsn ${r.lsn}`,
    mid: r.kind === "upd" ? `p${r.p + 1} = ${r.val}` : r.kind === "commit" ? "commit" : "ckpt",
    low: r.kind === "ckpt" ? `redo ${r.redo}` : `tx ${r.tx}`,
    color: r.kind === "ckpt" ? C.ckpt : C.wal, strong: cur,
  });

  function render() {
    for (let k = 0; k < 4; k++) {
      B[k].set(S.buf[k] ? pageView(k, S.buf[k], S.dirty[k]) : null);
      T[k].set(pageView(k, S.disk[k], false));
    }
    const unflushed = S.wal.filter(r => r.lsn > S.flushed), flushed = S.wal.filter(r => r.lsn <= S.flushed);
    const wb = unflushed.slice(-4);
    WB.forEach((sl, i) => sl.set(wb[i] ? recView(wb[i]) : null));
    /* pg_wal shows its last 4 records, or the ones around the record being replayed */
    let from = Math.max(0, flushed.length - 4);
    if (S.cursor != null) from = Math.max(0, Math.min(flushed.length - 4, flushed.findIndex(r => r.lsn === S.cursor) - 1));
    S.shown = flushed.slice(from, from + 4);
    PW.forEach((sl, i) => sl.set(S.shown[i] ? recView(S.shown[i], S.shown[i].lsn === S.cursor) : null));
    const toReplay = flushed.filter(r => r.lsn >= S.ctl.redo).length;
    L.buf.info.textContent = `${S.dirty.filter(Boolean).length} dirty`;
    L.walb.info.textContent = unflushed.length ? `${unflushed.length} not flushed` : "";
    L.pgwal.info.textContent = `${toReplay} since redo`;
    N.client.text(S.open != null ? `tx ${S.open} open` : `${S.acked.length} acked`);
    N.ctl.text(`redo lsn ${S.ctl.redo}`);
    dead.style.opacity = S.crashed ? 1 : 0;
    N.walw.state(S.crashed ? "dim" : f.time < S.walFlash ? "on" : "idle");
    readout(toReplay);
    syncButtons();
  }
  function readout(toReplay) {
    if (S.crashed) {
      f.big("✕", "crashed · memory is gone", BADT);
      f.status("press restart to replay pg_wal", BADT);
    } else if (S.recovering) {
      f.big(String(S.replayed), `of ${S.replayTotal} WAL records replayed`);
      f.status(S.cursor != null ? `replaying lsn ${S.cursor}` : "end-of-recovery checkpoint");
    } else if (S.result) {
      const n = S.result.lost.length;
      f.big(String(n), n === 1 ? "acked commit lost" : "acked commits lost", n ? BADT : OKT);
      f.status(S.result.text, n ? BADT : OKT);
    } else {
      f.big(String(S.acked.length), S.acked.length === 1 ? "commit acked to the client" : "commits acked to the client");
      f.status(`${toReplay} WAL record${toReplay === 1 ? "" : "s"} to replay if we crash now`);
    }
  }

  async function flushTo(s, lsn, why) {
    if (lsn <= S.flushed) return;
    lit(W.flush, C.wal);
    await travel(s, fx, W.flush, C.wal, 350);
    lit(W.flush);
    S.flushed = Math.min(lsn, S.next - 1);
    render();
    pop(fx, 712, 160, why || "fsync ✓", why ? C.soft : OKT, { size: 10.5 });
  }

  async function update(s, commit) {
    const tx = S.open ?? S.tx++;
    const k = ORDER[S.pick++ % ORDER.length];
    lit(W.query, C.client);
    await travel(s, fx, W.query, C.client, 320);
    lit(W.query);
    if (!S.buf[k]) {
      await move(s, fx, T[k], B[k], C.page, `p${k + 1}`, 420);
      S.buf[k] = clone(S.disk[k]);
      render();
    }
    const p = S.buf[k], last = p.vers[p.vers.length - 1];
    const val = (last.tx === tx ? last.val : visible(p)) + 5;
    const r = { lsn: S.next++, kind: "upd", p: k, val, tx };
    p.vers.push({ val, tx }); p.lsn = r.lsn; S.dirty[k] = true;
    S.wal.push(r); S.open = tx;
    render();
    lit(W.rec, C.wal);
    await travel(s, fx, W.rec, C.wal, 280);
    lit(W.rec);
    if (!commit) { pop(fx, 85, 14, `tx ${tx} open · no COMMIT`, C.dirty, { size: 10.5 }); return; }
    const c = { lsn: S.next++, kind: "commit", tx };
    S.wal.push(c); S.commits.set(tx, c.lsn); S.committed.add(tx); S.open = null;
    render();
    if (syncCommit === "on") {
      await flushTo(s, c.lsn);
      lit(W.ack, C.ok);
      await travel(s, fx, W.ack, C.ok, 650);
      lit(W.ack);
    } else {
      /* asynchronous commit: the answer comes before the flush */
      lit(W.query, C.ok);
      await travel(s, fx, W.query, C.ok, 300, { reverse: true });
      lit(W.query);
    }
    S.acked.push(tx);
    render();
    pop(fx, 85, 14, syncCommit === "on" ? "✓ COMMIT" : "✓ COMMIT · not flushed yet", OKT, { size: 10.5 });
  }

  /* write every dirty page (WAL first), add the checkpoint record, point pg_control at it, recycle old WAL */
  async function checkpoint(s, why) {
    S.inCkpt = true;
    const redo = S.next;
    N.ckpt.state("on"); N.ckpt.text(`${why} · redo ${redo}`);
    render();
    await s.wait(500);
    const list = [0, 1, 2, 3].filter(k => S.dirty[k]);
    for (const [i, k] of list.entries()) {
      const p = S.buf[k];
      if (p.lsn > S.flushed) await flushTo(s, p.lsn, "WAL first");
      lit(W.write, C.ckpt);
      await move(s, fx, B[k], T[k], C.dirty, `p${k + 1}`, 450);
      lit(W.write);
      S.disk[k] = clone(p); S.dirty[k] = false;
      N.ckpt.text(`wrote ${i + 1}/${list.length} pages`);
      render();
    }
    const r = { lsn: S.next++, kind: "ckpt", redo };
    S.wal.push(r);
    render();
    await flushTo(s, r.lsn);
    S.ctl = { ckpt: r.lsn, redo };
    const before = S.wal.length;
    S.wal = S.wal.filter(x => x.lsn >= redo);
    const gone = before - S.wal.length;
    N.ckpt.text(gone ? `${gone} records recycled` : "done");
    N.ctl.state("ok");
    render();
    await s.wait(800);
    N.ckpt.state("idle"); N.ctl.state("idle");
    S.inCkpt = false;
    S.nextCkpt = f.time + CKPT_MS;
  }

  /* memory is gone; only what was flushed to pg_wal and written to the table file is left */
  function crash() {
    fx.replaceChildren();
    Object.values(W).forEach(w => lit(w));
    S.wal = S.wal.filter(r => r.lsn <= S.flushed);
    S.next = S.flushed + 1;
    for (const [tx, lsn] of S.commits) if (lsn > S.flushed) S.commits.delete(tx);
    S.committed = new Set([1, ...S.commits.keys()]);
    S.pending = {
      lost: S.acked.filter(tx => !S.committed.has(tx)),
      unheard: [...S.commits.keys()].filter(tx => !S.acked.includes(tx)),
    };
    S.buf = [null, null, null, null]; S.dirty = [false, false, false, false];
    S.open = null; S.crashed = true; S.recovering = false; S.inCkpt = false; S.cursor = null; S.result = null;
    Object.values(N).forEach(b => b.state("idle"));
    N.ckpt.text("down");
    render();
  }

  /* replay pg_wal from the redo point in pg_control, then an end-of-recovery checkpoint */
  async function restart(s) {
    S.crashed = false; S.recovering = true; S.replayed = 0;
    const recs = S.wal.filter(r => r.lsn >= S.ctl.redo);
    S.replayTotal = recs.length;
    N.ctl.state("on");
    render();
    await s.wait(700);
    N.ctl.state("idle");
    for (const r of recs) {
      S.cursor = r.lsn;
      render();
      const j = S.shown.indexOf(r);
      await s.wait(220);
      if (r.kind === "upd") {
        if (!S.buf[r.p]) {
          await move(s, fx, T[r.p], B[r.p], C.page, `p${r.p + 1}`, 300);
          S.buf[r.p] = clone(S.disk[r.p]);
          render();
        }
        const p = S.buf[r.p];
        if (p.lsn >= r.lsn) pop(fx, B[r.p].cx, under(B[r.p]), "skip", C.soft, { size: 10.5, ms: 900 });
        else {
          if (j >= 0) await move(s, fx, PW[j], B[r.p], C.wal, `lsn ${r.lsn}`, 380);
          p.vers.push({ val: r.val, tx: r.tx }); p.lsn = r.lsn; S.dirty[r.p] = true;
          pop(fx, B[r.p].cx, under(B[r.p]), "apply", C.soft, { size: 10.5, ms: 900 });
        }
      } else if (r.kind === "commit" && j >= 0) {
        pop(fx, PW[j].cx, under(PW[j]), `✓ tx ${r.tx}`, OKT, { size: 10.5, ms: 900 });
      }
      S.replayed++;
      render();
      await s.wait(160);
    }
    S.cursor = null;
    if (recs.length) pop(fx, 712, 160, "end of WAL", C.soft, { size: 10.5 });
    await checkpoint(s, "end-of-recovery");
    const { lost, unheard } = S.pending;
    S.acked = S.acked.filter(tx => S.committed.has(tx));
    S.result = {
      lost,
      text: lost.length ? `tx ${lost.join(", ")} got COMMIT before its WAL reached the SSD`
        : unheard.length ? `✓ nothing acked was lost · tx ${unheard.join(", ")} committed, but the client never heard back`
        : "✓ every acked commit survived the crash",
    };
    S.recovering = false;
  }

  /* one sequence at a time; a crash cuts whatever is running */
  function act(fn, force) {
    if (busy && !force) return;
    busy = true;
    syncButtons();
    f.run(async s => {
      try { await fn(s); } finally { busy = false; render(); }
    });
  }
  const bCommit = f.button("UPDATE + COMMIT", () => { S.result = null; act(s => update(s, true)); }, { primary: true });
  const bOpen = f.button("UPDATE, no COMMIT", () => { S.result = null; act(s => update(s, false)); });
  const bCkpt = f.button("CHECKPOINT", () => { S.result = null; act(s => checkpoint(s, "CHECKPOINT")); });
  const bCrash = f.button("⚡ crash", () => { if (S.crashed) act(restart); else act(async () => crash(), true); });
  f.segmented([["on", "synchronous_commit = on"], ["off", "off"]], "on", val => { syncCommit = val; }, { label: "synchronous_commit" });
  f.button("reset", () => act(async () => {
    fx.replaceChildren();
    Object.values(W).forEach(w => lit(w));
    Object.values(N).forEach(b => b.state("idle"));
    fresh();
  }, true));
  function syncButtons() {
    bCommit.disabled = bOpen.disabled = bCkpt.disabled = busy || S.crashed;
    bCrash.textContent = S.crashed ? "↻ restart" : "⚡ crash";
    bCrash.disabled = S.crashed && busy;
  }

  /* the background: the WAL writer flushes, and checkpoint_timeout starts a checkpoint */
  f.loop((dt, t) => {
    if (S.crashed) return;
    if (!busy && t >= S.nextWal) {
      S.nextWal = t + WALW_MS;
      if (S.next - 1 > S.flushed) {
        S.flushed = S.next - 1;
        S.walFlash = t + 700;
        render();
        pop(fx, 712, 160, "WAL writer flush", C.soft, { size: 10.5 });
      }
    }
    if (S.walFlash && t >= S.walFlash) { S.walFlash = 0; N.walw.state("idle"); }
    if (!busy && t >= S.nextCkpt) { act(s => checkpoint(s, "checkpoint_timeout")); return; }
    if (!S.inCkpt && !S.recovering) {
      const sec = Math.max(0, Math.ceil((S.nextCkpt - t) / 1000));
      if (sec !== lastSec) { lastSec = sec; N.ckpt.text(`next in ${sec} s`); }
    } else lastSec = -1;
  });

  fresh();
  render();
  f.foot.append(
    key(C.page, "clean page"), key(C.dirty, "dirty page"), key(C.wal, "WAL record"), key(C.ckpt, "checkpoint record"),
    h("span", { class: "fig-note", text: "checkpoint every 30 s and WAL writer every 3 s here (5 min and 200 ms by default)" }),
  );
});
