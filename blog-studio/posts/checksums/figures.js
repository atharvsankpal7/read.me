/*
 * Figures for the checksums post. Each Kit.figure(id, setup) fills the `::figure <id>` block
 * with the same name in post.md. Every checksum shown is a real CRC-32C of the bytes on screen.
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
  /* diagram parts: senders, receivers, apps, postgres, the WAL, dynamodb replicas and checksum values */
  app: v("prod"), recv: v("cons"), net: v("cp"), pg: v("pg"), wal: v("retry"), dyn: v("kafka"), sum: v("dest"),
};
const OKT = C.ok, BADT = C.bad, WARNT = C.warn;

/* ---------- CRC-32C (Castagnoli), the checksum PostgreSQL uses for WAL records ---------- */
const CRC_T = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0x82f63b78 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32c = bytes => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_T[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const enc = str => Array.from(new TextEncoder().encode(str));
const hex = (n, d = 8) => n.toString(16).padStart(d, "0");
/* short checksum for labels: the low 16 bits of the CRC-32C */
const sum4 = str => hex(crc32c(enc(str)) & 0xffff, 4);

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


/* a dot that moves along part of a path, from fraction a to fraction b */
async function move(s, layer, path, color, ms, a, b, o = {}) {
  const c = sv("circle", { r: o.r || 6, cx: -99, cy: -99, fill: color, stroke: C.bg, "stroke-width": 2 });
  layer.appendChild(c);
  try {
    await s.tween(ms, t => {
      const p = Kit.pointAt(path, Kit.lerp(a, b, t));
      c.setAttribute("cx", p.x); c.setAttribute("cy", p.y);
    }, o.ease || Kit.ease.linear);
  } finally {
    c.remove();
  }
}

/* a line of SVG text made of one tspan per character, so single characters can change colour */
function digits(parent, x, y, n, o = {}) {
  const t = sv("text", { x, y, "font-size": o.size || 24, "font-weight": 600, "letter-spacing": o.spacing ?? 2 });
  parent.appendChild(t);
  const spans = Array.from({ length: n }, () => { const sp = sv("tspan", { text: "·" }); t.appendChild(sp); return sp; });
  return {
    set(str, colorAt) {
      spans.forEach((sp, i) => { sp.textContent = str[i] ?? ""; sp.style.fill = colorAt ? colorAt(i) : C.ink; });
    },
  };
}

/* ======================================================================
   Figure: one flipped bit, a completely different checksum
   ====================================================================== */
Kit.figure("fingerprint", f => {
  f.chrome({ tag: "crc-32c", label: "a digital fingerprint" });
  const svg = f.svg(880, 250, { label: "Four bytes shown as 32 bits, with the CRC-32C checksum before and after one bit flips", minWidth: 660 });
  const nodes = sv("g"), fx = sv("g");
  svg.append(nodes, fx);

  const TEXT = "ping", ORIG = enc(TEXT), FLIP = 13;
  const BX = i => 20 + Math.floor(i / 8) * 214 + (i % 8) * 25;
  let cur = ORIG.slice(), flipped = new Set();
  const bitOf = (bytes, i) => (bytes[i >> 3] >> (7 - (i & 7))) & 1;
  const charLabels = ORIG.map((_, b) => txt(nodes, BX(b * 8), 28, "", { size: 11 }));
  const bits = Array.from({ length: 32 }, (_, i) => {
    const c = cell(nodes, BX(i), 40, 21, 30);
    c.r.style.cursor = "pointer";
    c.r.addEventListener("click", () => flipBit(i));
    c.t.style.pointerEvents = "none";
    return c;
  });
  const sent = box(nodes, { x: 20, y: 110, w: 410, h: 120, top: 24, label: "checksum sent", sub: "crc32c(data)", color: C.app });
  const got = box(nodes, { x: 450, y: 110, w: 410, h: 120, top: 24, label: "checksum at the receiver", sub: "crc32c(data received)", color: C.recv });
  const sentD = digits(nodes, 36, 196, 10), gotD = digits(nodes, 466, 196, 10);
  const A = () => "0x" + hex(crc32c(ORIG)), B = () => "0x" + hex(crc32c(cur));

  function drawBits(upTo = 32) {
    bits.forEach((c, i) => {
      if (i >= upTo) { c.clear(); return; }
      const b = bitOf(cur, i);
      c.fill(flipped.has(i) ? C.bad : b ? C.accent : null, String(b));
    });
    ORIG.forEach((_, b) => {
      const ch = String.fromCharCode(cur[b]);
      charLabels[b].textContent = upTo > b * 8 ? `'${/[\x20-\x7e]/.test(ch) ? ch : "?"}' · 0x${hex(cur[b], 2)}` : "";
      charLabels[b].style.fill = cur[b] !== ORIG[b] ? C.bad : C.muted;
    });
  }
  function compare() {
    const a = A(), b = B();
    gotD.set(b, i => a[i] === b[i] ? C.ink : C.bad);
    const diff = [...a].filter((ch, i) => i > 1 && ch !== b[i]).length;
    const same = a === b;
    got.state(same ? "ok" : "bad");
    f.big(same ? "match" : `${diff} of 8`, same ? "the data is intact" : "hex digits changed", same ? OKT : BADT);
    f.status(same ? "✓ checksums match" : `✕ ${flipped.size} ${flipped.size === 1 ? "bit" : "bits"} flipped · checksums differ`, same ? OKT : BADT);
  }
  /* the reader clicks a bit: flip it and compare at once */
  function flipBit(i) {
    steps.seek(3);
    fx.replaceChildren();
    sentD.set(A());
    flipped.has(i) ? flipped.delete(i) : flipped.add(i);
    cur[i >> 3] ^= 1 << (7 - (i & 7));
    drawBits(); compare();
  }
  f.foot.append(h("span", { class: "fig-note", text: "click any bit to flip it" }));

  /* before step 1: nothing calculated yet */
  function reset() {
    fx.replaceChildren();
    cur = ORIG.slice(); flipped = new Set();
    drawBits(0);
    sentD.set("··········", () => C.faint); gotD.set("··········", () => C.faint);
    [sent, got].forEach(b => b.state("idle"));
    f.big("4 bytes", "the text \"ping\"");
    f.status("");
  }

  const STEPS = [
    {
      title: "data",
      text: "Four bytes of data: the text \"ping\", which is 32 bits.",
      async play(s) {
        for (let i = 1; i <= 32; i++) { drawBits(i); await s.wait(30); }
        await s.wait(300);
      },
    },
    {
      title: "checksum",
      text: "The sender calculates a small value from the data: a CRC-32C. It travels with the data.",
      async play(s) {
        sent.state("on");
        const scan = sv("rect", { x: 14, y: 36, width: 30, height: 38, fill: "none", "stroke-width": 2 });
        scan.style.stroke = C.sum;
        fx.appendChild(scan);
        await s.tween(900, t => scan.setAttribute("x", Kit.lerp(14, BX(31) - 4, t)));
        scan.remove();
        sentD.set(A(), () => C.sum);
        f.big(A(), "checksum of \"ping\"");
        await s.wait(400);
        sent.state("idle");
      },
    },
    {
      title: "flip",
      text: "On the way, a single bit flips. The text is now \"pmng\".",
      async play(s) {
        flipped.add(FLIP);
        cur[FLIP >> 3] ^= 1 << (7 - (FLIP & 7));
        drawBits();
        pop(fx, BX(FLIP) + 10, 98, "bit flip", BADT);
        f.status("1 bit flipped in transit", WARNT);
        await s.wait(700);
      },
    },
    {
      title: "recalculate",
      text: "The receiver calculates the checksum again. One flipped bit gives a completely different value.",
      async play(s) {
        got.state("on");
        await s.wait(400);
        compare();
        await s.wait(500);
      },
    },
  ];
  const steps = f.steps(STEPS, { reset, enter: () => fx.replaceChildren() });
});

/* ======================================================================
   Figure: TCP, UDP and no checksum with one corrupted packet
   ====================================================================== */
Kit.figure("transport", f => {
  f.chrome({ tag: "transport layer", label: "what the app gets" });
  const svg = f.svg(880, 230, { label: "A game server sends three packets over the network to a receiver and an app", minWidth: 660 });
  const wires = sv("g"), nodes = sv("g"), fx = sv("g");
  svg.append(wires, nodes, fx);

  const net = wire(wires, "M160,112 H560", { dash: "4 6" });
  const up = wire(wires, "M710,112 H740");
  txt(nodes, 360, 96, "network", { size: 10.5, anchor: "middle", color: C.faint });
  const srv = box(nodes, { x: 10, y: 80, w: 150, h: 64, label: "game server", sub: "sends packets", color: C.app });
  const rcv = box(nodes, { x: 560, y: 40, w: 150, h: 144, top: 24, label: "receiver", sub: "", color: C.recv });
  const app = box(nodes, { x: 740, y: 80, w: 130, h: 64, label: "app", sub: "game client", color: C.app });
  const slots = [0, 1, 2].map(i => cell(nodes, 574 + i * 42, 90, 36, 36, { text: "#" + (i + 1) }));
  const slotNote = txt(nodes, 574, 150, "", { size: 10.5 });

  const mode = f.segmented([["tcp", "TCP"], ["udp", "UDP"], ["none", "no checksum"]], "tcp", () => steps.redo(), { label: "Protocol" });
  const m = () => mode.value;
  let delivered = [];
  const showApp = (color) => {
    app.text(delivered.length ? "got " + delivered.map(n => "#" + n).join(" ") : "game client", color || C.muted);
  };

  /* before step 1: nothing sent */
  function reset() {
    fx.replaceChildren();
    delivered = [];
    slots.forEach(c => c.clear());
    slotNote.textContent = "";
    [srv, rcv, app].forEach(b => b.state("idle"));
    rcv.text(m() === "none" ? "no checksum" : `${m().toUpperCase()} checksum`);
    showApp();
    f.big("3", "packets to send");
    f.status("");
  }
  function enter() { fx.replaceChildren(); lit(net); lit(up); }

  const STEPS = [
    {
      title: "send",
      text: () => m() === "none"
        ? "The server sends 3 packets with no checksum. Packet 2 gets a flipped bit on the way."
        : "The server sends 3 packets. Each one carries a checksum over its header and payload. Packet 2 gets a flipped bit on the way.",
      async play(s) {
        srv.state("on"); lit(net, C.app);
        for (let i = 0; i < 3; i++) {
          if (i === 1) {
            await move(s, fx, net, C.app, 450, 0, 0.5);
            pop(fx, 360, 136, "bit flip", BADT);
            await move(s, fx, net, C.bad, 450, 0.5, 1);
          } else {
            await move(s, fx, net, C.app, 900, 0, 1);
          }
          slots[i].fill(C.line2);
        }
        lit(net); srv.state("idle");
        f.big("3", "packets arrived");
      },
    },
    {
      title: "verify",
      text: () => m() === "none"
        ? "There is no checksum, so the receiver can't tell that packet 2 is corrupted."
        : "The receiver calculates each checksum again. Packet 2 doesn't match.",
      async play(s) {
        rcv.state("on");
        for (let i = 0; i < 3; i++) {
          await s.wait(350);
          if (m() === "none") slots[i].fill(C.line2);
          else slots[i].fill(i === 1 ? C.bad : C.ok);
        }
        slotNote.textContent = m() === "none" ? "#2 looks fine" : "#2 ✕ checksum";
        slotNote.style.fill = m() === "none" ? C.muted : C.bad;
        await s.wait(300);
      },
    },
    {
      get title() { return m() === "tcp" ? "discard + ARQ" : m() === "udp" ? "drop" : "garbled"; },
      text: () => m() === "tcp"
        ? "TCP discards packet 2 and gets the correct data again with Automatic Repeat Request. The app gets all 3, correct."
        : m() === "udp"
          ? "UDP simply drops packet 2. The app gets packets 1 and 3, and never reads the bad data."
          : "The app reads random, garbled bits as legitimate instructions. It can crash instantly or behave erratically.",
      async play(s) {
        if (m() === "tcp") {
          slots[1].clear(); slotNote.textContent = "#2 discarded"; slotNote.style.fill = C.bad;
          await s.wait(300);
          lit(net, C.accent);
          await move(s, fx, net, C.accent, 700, 1, 0, { r: 4 });
          pop(fx, 85, 70, "send #2 again", C.accent);
          lit(net, C.app);
          await move(s, fx, net, C.app, 900, 0, 1);
          lit(net);
          slots[1].fill(C.ok); slotNote.textContent = "#2 ✓ checksum"; slotNote.style.fill = C.ok;
        } else if (m() === "udp") {
          slots[1].clear(); slotNote.textContent = "#2 dropped"; slotNote.style.fill = C.bad;
          await s.wait(300);
        }
        lit(up, C.recv);
        const keep = m() === "udp" ? [1, 3] : [1, 2, 3];
        for (const n of keep) {
          await travel(s, fx, up, C.recv, 260);
          delivered.push(n);
          showApp(m() === "none" && n === 2 ? BADT : C.ink);
        }
        lit(up);
        if (m() === "none") {
          app.state("bad"); app.text("✕ crashed on #2", BADT);
          pop(fx, 805, 70, "✕ garbled input", BADT, { ms: 2200 });
          f.big("crash", "bad data processed", BADT); f.status("processing bad data", BADT);
        } else if (m() === "udp") {
          app.state("ok");
          f.big("2 of 3", "packets, all correct", OKT); f.status("dropping is safer than bad data", OKT);
        } else {
          app.state("ok");
          f.big("3 of 3", "packets, all correct", OKT); f.status("✓ data integrity", OKT);
        }
        await s.wait(500);
      },
    },
  ];
  const steps = f.steps(STEPS, { reset, enter });
});

/* ======================================================================
   Figure: a PostgreSQL page, bit rot on disk, and the read
   ====================================================================== */
Kit.figure("page", f => {
  f.chrome({ tag: "postgresql · 8 KB pages", label: "a page checksum" });
  const svg = f.svg(880, 240, { label: "A page in shared buffers written to disk with a checksum, then read back", minWidth: 660 });
  const wires = sv("g"), nodes = sv("g"), fx = sv("g");
  svg.append(wires, nodes, fx);

  const bus = wire(wires, "M320,125 H560");
  const mem = box(nodes, { x: 10, y: 14, w: 310, h: 210, top: 24, label: "shared buffers", sub: "memory", color: C.pg });
  const disk = box(nodes, { x: 560, y: 14, w: 310, h: 210, top: 24, label: "disk", sub: "data file", color: C.net });
  const ROWS = ["id 1 · balance 100", "id 2 · balance 250", "id 3 · balance 75"];
  /* a page drawn inside a box: header with the checksum, then the rows */
  function page(x, y) {
    const g = sv("g");
    nodes.appendChild(g);
    const r = sv("rect", { x, y, width: 270, height: 140, "stroke-width": 1.2 });
    r.style.cssText = `fill:${C.bg};stroke:${C.line2};transition:fill .3s ease, stroke .3s ease`;
    g.appendChild(r);
    const head = txt(g, x + 12, y + 22, "", { size: 11, weight: 600 });
    const rows = ROWS.map((_, i) => txt(g, x + 12, y + 56 + i * 24, "", { size: 11.5, color: C.ink }));
    return {
      g, r,
      set(o) {
        g.style.opacity = o ? 1 : 0;
        if (!o) return;
        head.textContent = `page 17 · 8 KB · checksum ${o.sum ?? "none"}`;
        head.style.fill = o.sumColor || C.sum;
        rows.forEach((t, i) => { t.textContent = o.rows[i]; t.style.fill = o.bad === i ? C.bad : C.ink; });
        r.style.stroke = o.state === "bad" ? C.bad : o.state === "ok" ? C.ok : C.line2;
        r.style.fill = o.state === "bad" ? C.bad + "12" : C.bg;
      },
    };
  }
  const pMem = page(30, 66), pDisk = page(580, 66);
  const mode = f.segmented([["on", "checksums on"], ["off", "checksums off"]], "on", () => steps.redo(), { label: "Checksums" });
  const on = () => mode.value === "on";
  const pageSum = rows => "0x" + sum4(rows.join("\n"));
  /* the flipped bit: '0' (0x30) in "balance 100" becomes '4' (0x34) */
  const ROT = ROWS.map((r, i) => i === 0 ? r.replace("100", "104") : r);

  /* before step 1: the page is dirty in memory and not on disk yet */
  function reset() {
    fx.replaceChildren();
    [mem, disk].forEach(b => b.state("idle"));
    pMem.set({ rows: ROWS, sum: on() ? "—" : "none", sumColor: C.muted });
    pDisk.set(null);
    f.big("page 17", "dirty in memory");
    f.status(on() ? "data checksums are on" : "data checksums are off (the old default)");
  }
  function enter() { fx.replaceChildren(); lit(bus); }

  const STEPS = [
    {
      title: "write",
      text: () => on()
        ? "PostgreSQL writes the 8 KB page to disk. It calculates a checksum and writes it with the page."
        : "PostgreSQL writes the 8 KB page to disk, with no checksum.",
      async play(s) {
        mem.state("on");
        if (on()) { await s.wait(300); pMem.set({ rows: ROWS, sum: pageSum(ROWS) }); pop(fx, 165, 56, "checksum calculated", C.sum); await s.wait(500); }
        lit(bus, C.pg);
        await slide(s, fx, { x0: 30, y0: 66, x1: 580, y1: 66, w: 270, h: 140, color: C.pg, label: "page 17", arc: 30 }, 1000);
        lit(bus);
        pDisk.set({ rows: ROWS, sum: on() ? pageSum(ROWS) : "none", sumColor: on() ? C.sum : C.muted });
        pMem.set(null);
        mem.state("idle"); disk.state("on");
        f.big("page 17", "on disk");
        await s.wait(300);
      },
    },
    {
      title: "bit rot",
      text: "Later, a bad disk sector flips one bit inside the stored page. Balance 100 is now 104.",
      async play(s) {
        await s.wait(400);
        disk.state("bad");
        pDisk.set({ rows: ROT, sum: on() ? pageSum(ROWS) : "none", sumColor: on() ? C.sum : C.muted, bad: 0 });
        pop(fx, 715, 56, "bit flip", BADT);
        f.status("1 bit flipped on disk", WARNT);
        await s.wait(700);
      },
    },
    {
      title: "read",
      text: () => on()
        ? `PostgreSQL reads the page and calculates the checksum again: ${pageSum(ROT)}, not ${pageSum(ROWS)}. It reports an error, and doesn't use the bad data.`
        : "PostgreSQL reads the page. Without a checksum it can't tell, and the query returns balance 104.",
      async play(s) {
        lit(bus, C.pg);
        await slide(s, fx, { x0: 580, y0: 66, x1: 30, y1: 66, w: 270, h: 140, color: C.pg, label: "page 17", arc: 30 }, 1000);
        lit(bus);
        disk.state("idle"); mem.state("on");
        if (on()) {
          pMem.set({ rows: ROT, sum: `${pageSum(ROT)} ≠ ${pageSum(ROWS)}`, sumColor: C.bad, bad: 0, state: "bad" });
          mem.state("bad");
          pop(fx, 165, 56, "✕ ERROR: invalid page", BADT, { ms: 2400 });
          f.big("error", "the corruption is caught", OKT);
          f.status("checksum mismatch: bad data never reaches the query", OKT);
        } else {
          pMem.set({ rows: ROT, sum: "none", sumColor: C.muted, bad: 0 });
          pop(fx, 165, 56, "returns balance 104", WARNT, { ms: 2400 });
          f.big("104", "returned as if it were correct", BADT);
          f.status("silent corruption", BADT);
        }
        await s.wait(600);
      },
    },
  ];
  const steps = f.steps(STEPS, { reset, enter });
});

/* ======================================================================
   Figure: WAL streamed to a replica, verified before replay
   ====================================================================== */
Kit.figure("wal", f => {
  f.chrome({ tag: "wal · crc-32c", label: "verify, then replay" });
  const svg = f.svg(880, 220, { label: "A primary streams four WAL records to a replica, which checks each CRC before replay", minWidth: 660 });
  const wires = sv("g"), nodes = sv("g"), fx = sv("g");
  svg.append(wires, nodes, fx);

  const net = wire(wires, "M250,110 H630", { dash: "4 6" });
  txt(nodes, 440, 94, "network", { size: 10.5, anchor: "middle", color: C.faint });
  const prim = box(nodes, { x: 10, y: 20, w: 240, h: 180, top: 24, label: "primary", sub: "WAL records", color: C.pg });
  const rep = box(nodes, { x: 630, y: 20, w: 240, h: 180, top: 24, label: "replica", sub: "replays verified WAL", color: C.dyn });
  const REC = [["#41", "INSERT user 7"], ["#42", "UPDATE balance"], ["#43", "DELETE order 9"], ["#44", "INSERT order 10"]];
  const crc = r => hex(crc32c(enc(r.join(" "))));
  const pLines = REC.map((r, i) => txt(nodes, 24, 88 + i * 26, `${r[0]} crc ${crc(r)}`, { size: 11, color: C.ink }));
  const rLines = REC.map((_, i) => txt(nodes, 644, 88 + i * 26, "", { size: 11 }));
  let replayed = 0;
  const count = color => f.big(`${replayed} / 4`, "records replayed", color);
  const line = (i, text, color) => { rLines[i].textContent = text; rLines[i].style.fill = color; };

  /* before step 1: the replica is at #40 */
  function reset() {
    fx.replaceChildren();
    replayed = 0;
    rLines.forEach((_, i) => line(i, "", C.muted));
    pLines.forEach(t => { t.style.fill = C.ink; });
    [prim, rep].forEach(b => b.state("idle"));
    count();
    f.status("the replica has replayed up to #40");
  }
  function enter() { fx.replaceChildren(); lit(net); }

  const STEPS = [
    {
      title: "stream",
      text: "The primary streams WAL records #41 to #44 over the network. Each record carries its CRC-32C. Record #43 gets corrupted in transit.",
      async play(s) {
        prim.state("on"); lit(net, C.wal);
        for (let i = 0; i < 4; i++) {
          pLines[i].style.fill = C.wal;
          if (i === 2) {
            await move(s, fx, net, C.wal, 380, 0, 0.5);
            pop(fx, 440, 134, "bit flip", BADT);
            await move(s, fx, net, C.bad, 380, 0.5, 1);
          } else {
            await move(s, fx, net, C.wal, 760, 0, 1);
          }
          pLines[i].style.fill = C.ink;
          line(i, `${REC[i][0]} received`, C.muted);
        }
        lit(net); prim.state("idle");
      },
    },
    {
      title: "verify",
      text: "The replica calculates each CRC again before replay. #41 and #42 match, so it replays them. #43 doesn't match, so it stops there.",
      async play(s) {
        rep.state("on");
        for (let i = 0; i < 3; i++) {
          await s.wait(450);
          if (i < 2) { line(i, `${REC[i][0]} ✓ replayed`, C.ok); replayed++; count(); }
          else { line(i, `${REC[i][0]} ✕ crc mismatch`, C.bad); }
        }
        line(3, `${REC[3][0]} waits for #43`, C.muted);
        f.status("bad WAL is never replayed", WARNT);
        await s.wait(400);
      },
    },
    {
      title: "stream again",
      text: "The replica asks the primary for the WAL again, starting at #43.",
      async play(s) {
        lit(net, C.accent);
        await move(s, fx, net, C.accent, 700, 1, 0, { r: 4 });
        pop(fx, 130, 14, "from #43", C.accent);
        prim.state("on"); lit(net, C.wal);
        for (const i of [2, 3]) {
          await move(s, fx, net, C.wal, 760, 0, 1);
          line(i, `${REC[i][0]} received`, C.muted);
        }
        lit(net); prim.state("idle");
      },
    },
    {
      title: "replay",
      text: "Both CRCs match now. The replica replays #43 and #44, and has the same data as the primary.",
      async play(s) {
        for (const i of [2, 3]) {
          await s.wait(450);
          line(i, `${REC[i][0]} ✓ replayed`, C.ok); replayed++; count();
        }
        rep.state("ok"); count(OKT);
        f.status("✓ replica in sync with the primary", OKT);
        await s.wait(400);
      },
    },
  ];
  f.steps(STEPS, { reset, enter });
});

/* ======================================================================
   Figure: three replicas, a scrub, and Merkle trees
   ====================================================================== */
Kit.figure("merkle", f => {
  f.chrome({ tag: "dynamodb · scrub", label: "comparing replicas with merkle trees" });
  const svg = f.svg(880, 290, { label: "Three replicas of one partition, each with a Merkle tree over four items", minWidth: 660 });
  const back = sv("g"), nodes = sv("g"), fx = sv("g");
  svg.append(back, nodes, fx);

  const ITEMS = [["k1", "ana"], ["k2", "raj"], ["k3", "meera"], ["k4", "dev"]];
  const BAD = 2, BADV = "meerb";
  const NAMES = ["replica A", "replica B", "replica C"];
  const leafHash = (k, val) => sum4(k + "=" + val);
  const reps = NAMES.map((name, r) => {
    const x0 = 10 + r * 293, cx = x0 + 134;
    box(back, { x: x0, y: 10, w: 268, h: 270, top: 22, label: name, sub: "host " + (r + 1), color: C.dyn });
    const vals = ITEMS.map(([, val], i) => r === 2 && i === BAD ? BADV : val);
    const L = i => x0 + 12 + i * 63, LW = 55;
    const MX = j => cx - 96 + j * 112, MW = 80;
    const lines = [];
    const link = (x1, y1, x2, y2) => { const p = wire(back, `M${x1},${y1} L${x2},${y2}`); lines.push(p); return p; };
    const rootL = [0, 1].map(j => link(cx, 82, MX(j) + MW / 2, 128));
    const midL = [0, 1, 2, 3].map(i => link(MX(i >> 1) + MW / 2, 156, L(i) + LW / 2, 206));
    const root = cell(nodes, cx - 50, 54, 100, 28, { text: "root" });
    const mids = [0, 1].map(j => cell(nodes, MX(j), 128, MW, 28, { text: "" }));
    const leaves = ITEMS.map(([k], i) => cell(nodes, L(i), 206, LW, 50, { text: k, sub: " " }));
    return { x0, cx, vals, root, mids, leaves, rootL, midL, lines };
  });
  const hashes = rp => {
    const lh = ITEMS.map(([k], i) => leafHash(k, rp.vals[i]));
    const mh = [sum4(lh[0] + lh[1]), sum4(lh[2] + lh[3])];
    return { lh, mh, rh: sum4(mh[0] + mh[1]) };
  };

  /* before step 1: only the items, no hashes */
  function reset() {
    fx.replaceChildren();
    reps.forEach(rp => {
      rp.leaves.forEach((c, i) => { c.clear(); c.t.textContent = ITEMS[i][0]; c.sub.textContent = rp.vals[i]; });
      rp.mids.forEach(c => c.clear());
      rp.root.clear(); rp.root.t.textContent = "";
      rp.lines.forEach(p => { lit(p); p.style.opacity = 0.25; });
    });
    f.big("3", "replicas of one partition");
    f.status("");
  }

  const STEPS = [
    {
      title: "replicas",
      text: "DynamoDB keeps three replicas of the same partition on different physical machines. Replica C has one bad item.",
      async play(s) {
        await s.wait(900);
      },
    },
    {
      title: "hash",
      text: "Each replica builds a Merkle tree: a checksum for each item, then a checksum of those checksums, up to one root.",
      async play(s) {
        reps.forEach(rp => {
          const { lh } = hashes(rp);
          rp.leaves.forEach((c, i) => { c.fill(C.sum); c.t.textContent = lh[i]; });
        });
        await s.wait(500);
        reps.forEach(rp => {
          const { mh } = hashes(rp);
          rp.midL.forEach(p => { p.style.opacity = 1; });
          rp.mids.forEach((c, j) => c.fill(C.sum, mh[j]));
        });
        await s.wait(500);
        reps.forEach(rp => {
          rp.rootL.forEach(p => { p.style.opacity = 1; });
          rp.root.fill(C.sum, hashes(rp).rh);
        });
        f.big("3", "roots, one per replica");
        await s.wait(400);
      },
    },
    {
      title: "scrub",
      text: "The scrub process compares the replicas. Comparing only the roots is enough: A and B match, C is different.",
      async play(s) {
        await s.wait(300);
        reps.forEach((rp, r) => rp.root.fill(r === 2 ? C.bad : C.ok));
        pop(fx, reps[2].cx, 46, "✕ root differs", BADT, { ms: 2200 });
        f.big("1 of 3", "replicas differ", BADT);
        f.status("replica C is out of sync", BADT);
        await s.wait(600);
      },
    },
    {
      title: "find it",
      text: "To find where, compare one level down: only the right half differs. Then only k3. The rest of the tree is never compared.",
      async play(s) {
        const [A, , Cr] = reps;
        for (const rp of [A, Cr]) { rp.mids[0].fill(C.ok); }
        Cr.mids[1].fill(C.bad); A.mids[1].fill(C.ok);
        lit(Cr.rootL[1], C.bad);
        await s.wait(700);
        Cr.leaves[2].fill(C.bad); Cr.leaves[3].fill(C.ok); A.leaves[2].fill(C.ok); A.leaves[3].fill(C.ok);
        lit(Cr.midL[2], C.bad);
        Cr.leaves[2].sub.textContent = BADV;
        Cr.leaves[2].sub.style.fill = C.bad;
        pop(fx, Cr.x0 + 12 + 2 * 63 + 27, 272, `k3 = "${BADV}", not "meera"`, BADT, { ms: 2600, size: 10.5 });
        f.big("k3", "the one item that differs", BADT);
        f.status("found in 2 comparisons below the root", OKT);
        await s.wait(700);
      },
    },
  ];
  f.steps(STEPS, { reset, enter: () => fx.replaceChildren() });
});
