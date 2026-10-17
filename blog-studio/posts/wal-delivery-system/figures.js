/*
 * Figures for the WAL delivery post. Each Kit.figure(id, setup) fills the `::figure <id>` block
 * with the same name in post.md. Names (orders, search-index, ...) match the simulation at the end.
 */
const { h, s: sv } = Kit;

/* colours come from template/figure.css (--fx-*), so the figures follow the site theme from one place.
   bg is the stage surface, bg2 the card the boxes sit on. */
const CSSV = getComputedStyle(document.querySelector("figure.fig") || document.documentElement);
const v = n => CSSV.getPropertyValue("--fx-" + n).trim();
const C = {
  bg: v("bg-2"), bg2: v("bg"), line: v("line"), line2: v("line-2"),
  ink: v("ink"), soft: v("soft"), muted: v("muted"), faint: v("faint"), accent: v("accent"),
  prod: v("prod"), kafka: v("kafka"), cons: v("cons"), dest: v("dest"), pg: v("pg"), retry: v("retry"), cp: v("cp"),
  ok: v("ok"), bad: v("bad"), warn: v("warn"),
};
/* short status words use the status colours directly; they always sit next to a ✓ / ✕ glyph */
const OKT = C.ok, BADT = C.bad, WARNT = C.warn;

/* ---------- small SVG kit ---------- */

/* labelled box with a coloured accent bar; state() switches idle / on / dim / bad / ok */
function box(svg, o) {
  const g = sv("g");
  const rect = sv("rect", { x: o.x, y: o.y, width: o.w, height: o.h, rx: o.r ?? 0, "stroke-width": 1.2 });
  rect.style.cssText = `fill:${C.bg2};stroke:${C.line2};transition:fill .35s ease, stroke .35s ease`;
  const bar = sv("rect", { x: o.x, y: o.y + 9, width: 3, height: o.h - 18, rx: 1.5, fill: o.color });
  const size = o.size || 13;
  const label = sv("text", { x: o.x + 14, y: o.y + (o.sub != null ? o.h / 2 - 3 : o.h / 2 + 4.5), "font-size": size, "font-weight": 600, text: o.label });
  label.style.fill = C.ink;
  const sub = o.sub != null ? sv("text", { x: o.x + 14, y: o.y + o.h / 2 + 13, "font-size": 10.5, text: o.sub }) : null;
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
    if (!o.keep) c.remove();
  }
  return c;
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

/* fn after ms on the figure's clock, without holding up the sequence; dropped if a newer run replaces it */
const later = (s, ms, fn) => s.wait(ms).then(fn, () => {});

/* deterministic random numbers so replays look the same */
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clockStr = sec => { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); };

/* ======================================================================
   Figure: the life of one log (step through)
   ====================================================================== */
Kit.figure("overview", f => {
  f.chrome({ tag: "phase 1 · at least once", label: "the life of one log" });
  f.status("order doesn't matter · dedupe by idempotency key");
  const svg = f.svg(880, 292, { label: "Generator, producer, outbox, Kafka, consumer and three destinations, with one log moving through them", minWidth: 660 });
  const wires = sv("g"), nodes = sv("g"), fx = sv("g");
  svg.append(wires, nodes, fx);

  const W = {
    genProd: wire(wires, "M140,148 H190"),
    prodKafka: wire(wires, "M320,148 H380"),
    prodOutbox: wire(wires, "M255,174 V228"),
    outboxKafka: wire(wires, "M320,254 C352,254 352,180 380,180"),
    cpProd: wire(wires, "M372,32 H255 V122", { dash: "3 5" }),
    cpCons: wire(wires, "M540,32 H660 V122", { dash: "3 5" }),
    kafkaCons: wire(wires, "M540,148 H590"),
    dest: [
      wire(wires, "M730,148 C752,148 750,60 772,60"),
      wire(wires, "M730,148 H772"),
      wire(wires, "M730,148 C752,148 750,236 772,236"),
    ],
  };
  const N = {
    gen: box(nodes, { x: 8, y: 122, w: 132, h: 52, label: "checkout-app", sub: "generator", color: C.muted }),
    prod: box(nodes, { x: 190, y: 122, w: 130, h: 52, label: "producer", sub: "LB · 3 pods", color: C.prod }),
    cp: box(nodes, { x: 372, y: 10, w: 168, h: 44, label: "control plane", sub: "config cached in memory", color: C.cp }),
    outbox: box(nodes, { x: 190, y: 228, w: 130, h: 52, label: "outbox", sub: "postgres · pg-boss", color: C.pg }),
    kafka: box(nodes, { x: 380, y: 104, w: 160, h: 92, label: "kafka", sub: "orders · offset 42", color: C.kafka }),
    cons: box(nodes, { x: 590, y: 122, w: 140, h: 52, label: "shared-consumer", sub: "group · 2 pods", color: C.cons, size: 12 }),
    dests: ["search-index", "audit-log", "email-service"].map((name, i) =>
      box(nodes, { x: 772, y: 38 + i * 88, w: 104, h: 44, label: name, color: C.dest, size: 11.5 })),
  };
  /* the kafka node moves its label up to make room for three replica cells */
  N.kafka.label.setAttribute("y", 128); N.kafka.sub.setAttribute("y", 144);
  const replicas = [0, 1, 2].map(i => {
    const r = sv("rect", { x: 394 + i * 46, y: 160, width: 40, height: 22, rx: 0, "stroke-width": 1 });
    r.style.cssText = `fill:${C.bg};stroke:${C.line2};transition:fill .3s ease, stroke .3s ease`;
    const t = txt(nodes, 414 + i * 46, 175, i ? "f" + i : "lead", { size: 10, anchor: "middle" });
    nodes.insertBefore(r, t);
    return { r, t };
  });
  const fillReplica = (i, on) => {
    replicas[i].r.style.fill = on ? C.kafka + "55" : C.bg;
    replicas[i].r.style.stroke = on ? C.kafka : C.line2;
    replicas[i].t.style.fill = on ? C.ink : C.muted;
  };
  const tick = (i, on) => N.dests[i].state(on ? "ok" : "idle");

  /* flipping the route replays the current step the other way (intake looks the same, so start at route) */
  const route = f.segmented([["direct", "direct"], ["outbox", "needs processing"]], "direct", () => steps.go(Math.max(1, steps.index), true), { label: "Route" });

  const viaOutbox = () => route.value === "outbox";
  const STEPS = [
    {
      title: "intake",
      text: () => "checkout-app sends a log to the producer service. It is the only way in, sitting behind a load balancer with a watchdog.",
      on: ["gen", "prod"],
      async play(s) {
        lit(W.genProd, C.prod);
        pop(fx, 165, 138, "POST /logs", C.soft, { size: 10.5 });
        await travel(s, fx, W.genProd, C.prod, 650);
      },
    },
    {
      title: "route",
      text: () => viaOutbox()
        ? "The producer checks its cached config: payments logs need CPU/IO bound processing first, so they go to the outbox."
        : "The producer checks its cached config: orders logs go straight to Kafka with acks=all (the default when a topic doesn't set one).",
      on: ["prod", "cp"],
      async play(s) {
        lit(W.cpProd, C.cp);
        await travel(s, fx, W.cpProd, C.cp, 700, { reverse: true, r: 4 });
        pop(fx, 255, 112, viaOutbox() ? "payments → outbox" : "orders → acks=all", C.ink, { ms: 2200 });
        await s.wait(700);
      },
    },
    {
      title: "durable",
      text: () => viaOutbox()
        ? "The row is committed in Postgres and the generator gets its answer. A processor picks it up with SKIP LOCKED, sends the processed log to Kafka, and marks it stored only after Kafka acks."
        : "Kafka writes the log to the leader and both followers. Only after that acks=all acknowledgement does the producer answer the generator.",
      on: () => viaOutbox() ? ["prod", "outbox", "kafka", "gen"] : ["prod", "kafka", "gen"],
      async play(s) {
        if (viaOutbox()) {
          lit(W.prodOutbox, C.pg);
          await travel(s, fx, W.prodOutbox, C.prod, 500);
          N.outbox.text("pending", C.soft);
          pop(fx, 255, 220, "row committed", C.soft);
          lit(W.genProd, C.ok);
          await travel(s, fx, W.genProd, C.ok, 550, { reverse: true });
          pop(fx, 74, 112, "✓ 200 stored", OKT);
          for (const st of ["processing", "processed"]) { await s.wait(550); N.outbox.text(st, C.soft); }
          lit(W.outboxKafka, C.pg);
          await travel(s, fx, W.outboxKafka, C.pg, 650);
          for (let i = 0; i < 3; i++) { fillReplica(i, true); await s.wait(170); }
          await travel(s, fx, W.outboxKafka, C.ok, 500, { reverse: true });
          N.outbox.text("stored ✓", OKT);
        } else {
          lit(W.prodKafka, C.prod);
          await travel(s, fx, W.prodKafka, C.prod, 450);
          fillReplica(0, true); await s.wait(260);
          fillReplica(1, true); fillReplica(2, true);
          pop(fx, 460, 98, "3 of 3 replicas", C.soft);
          await s.wait(380);
          lit(W.prodKafka, C.ok);
          await travel(s, fx, W.prodKafka, C.ok, 420, { reverse: true });
          lit(W.genProd, C.ok);
          await travel(s, fx, W.genProd, C.ok, 500, { reverse: true });
          pop(fx, 74, 112, "✓ 200 stored", OKT);
        }
        await s.wait(500);
      },
    },
    {
      title: "fan out",
      text: () => "The shared consumer reads the log once and delivers a copy to every destination subscribed to the topic, using the protocol each one registered in the control plane.",
      on: ["kafka", "cons", "d0", "d1", "d2"],
      async play(s) {
        lit(W.kafkaCons, C.cons);
        await travel(s, fx, W.kafkaCons, C.kafka, 420);
        W.dest.forEach(w => lit(w, C.cons));
        await Promise.all(W.dest.map(async (w, i) => {
          await travel(s, fx, w, C.cons, 560 + i * 90);
          tick(i, true);
          pop(fx, 824, 32 + i * 88, "✓ delivered", OKT, { size: 10.5 });
        }));
        await s.wait(400);
      },
    },
    {
      title: "commit",
      text: () => "Only when every destination has its copy (or a copy is durably parked in a retry topic) does the consumer commit the offset. A crash before this line means the log is read again, never lost.",
      on: ["kafka", "cons"],
      async play(s) {
        lit(W.kafkaCons, C.accent);
        await travel(s, fx, W.kafkaCons, C.accent, 500, { reverse: true, r: 4 });
        N.kafka.text(`${viaOutbox() ? "payments" : "orders"} · committed 42`, C.ink);
        pop(fx, 460, 98, "✓ offset committed", OKT);
        await s.wait(600);
      },
    },
  ];

  /* before step 1: nothing written, nothing delivered */
  function reset() {
    fx.replaceChildren();
    const outbox = viaOutbox();
    W.prodOutbox.style.opacity = W.outboxKafka.style.opacity = outbox ? 1 : 0.35;
    W.prodKafka.style.opacity = outbox ? 0.35 : 1;
    [0, 1, 2].forEach(r => fillReplica(r, false));
    [0, 1, 2].forEach(d => tick(d, false));
    N.outbox.text("postgres · pg-boss");
    N.kafka.text(outbox ? "payments · offset 42" : "orders · offset 42");
  }
  /* each step lights the boxes it is about */
  function enter(i) {
    fx.replaceChildren();
    const st = STEPS[i], on = typeof st.on === "function" ? st.on() : st.on;
    ["gen", "prod", "cp", "outbox", "kafka", "cons"].forEach(k => N[k].state(on.includes(k) ? "on" : "idle"));
    if (!on.includes("outbox") && !viaOutbox()) N.outbox.state("dim");
    N.dests.forEach((d, k) => { if (on.includes("d" + k)) d.state("on"); });
    Object.values(W).flat().forEach(w => lit(w));
    f.big(`${i + 1}/${STEPS.length}`, st.title);
  }
  const steps = f.steps(STEPS, { reset, enter });
});

/* ======================================================================
   Figure: config push, poll fallback, peer fetch
   ====================================================================== */
Kit.figure("config", f => {
  f.chrome({ tag: "control plane", label: "how config reaches every pod" });
  const svg = f.svg(880, 318, { label: "Control plane pushing config to two producer and two consumer pods, with poll and peer fallbacks", minWidth: 660 });
  const wires = sv("g"), nodes = sv("g"), fx = sv("g");
  svg.append(wires, nodes, fx);

  const PODS = [
    { name: "producer-1", color: C.prod }, { name: "producer-2", color: C.prod },
    { name: "consumer-1", color: C.cons }, { name: "consumer-2", color: C.cons },
  ].map((p, i) => ({ ...p, x: 20 + i * 220, version: 12 }));
  const recon = [wire(wires, "M500,32 H640"), wire(wires, "M640,48 H500")];
  PODS.forEach(p => {
    const cx = p.x + 90;
    p.push = wire(wires, `M400,66 C400,112 ${cx},104 ${cx},150`);
    p.peer = wire(wires, `M${cx},204 C${cx},238 440,230 440,262`);
  });
  const cp = box(nodes, { x: 300, y: 14, w: 200, h: 52, label: "control plane", sub: "config v12", color: C.cp });
  const kafka = box(nodes, { x: 640, y: 14, w: 170, h: 52, label: "kafka", sub: "topics + acks", color: C.kafka });
  const lb = box(nodes, { x: 300, y: 262, w: 280, h: 46, label: "load balancer", sub: "ask a peer for its cached config", color: C.muted });
  PODS.forEach(p => {
    p.node = box(nodes, { x: p.x, y: 150, w: 180, h: 54, label: p.name, sub: "cache", color: p.color });
    const bx = p.x + 180 - 64;
    p.badgeR = sv("rect", { x: bx, y: 166, width: 52, height: 22, rx: 0, "stroke-width": 1 });
    p.badgeR.style.cssText = `fill:${C.bg};stroke:${C.line2};transition:stroke .3s ease, fill .3s ease`;
    nodes.appendChild(p.badgeR);
    p.badgeT = txt(nodes, bx + 26, 181, "v12", { size: 11.5, anchor: "middle", color: C.ink, weight: 600 });
  });

  let version = 12;
  const setBadge = (s, p, v, flash) => {
    p.version = v;
    p.badgeT.textContent = v ? "v" + v : "—";
    p.badgeT.style.fill = v === version ? C.ink : C.muted;
    p.badgeR.style.stroke = flash ? C.ok : C.line2;
    p.badgeR.style.fill = flash ? C.ok + "22" : C.bg;
    if (flash) later(s, 900, () => { p.badgeR.style.stroke = C.line2; p.badgeR.style.fill = C.bg; });
  };
  const count = () => {
    const n = PODS.filter(p => p.version === version).length;
    f.big(`${n} / 4`, `pods on v${version}`, n === 4 ? OKT : C.ink);
  };
  /* before step 1: every pod caches v12 */
  const reset = () => {
    version = 12;
    fx.replaceChildren();
    [cp, kafka, lb].forEach(n => n.state("idle"));
    cp.text("config v12");
    PODS.forEach(p => { p.node.state("idle"); p.node.text("cache"); setBadge(null, p, 12); });
    count(); f.status("producers and consumers cache config in memory");
  };
  const enter = () => {
    fx.replaceChildren();
    recon.forEach(w => lit(w));
    PODS.forEach(p => { lit(p.push); lit(p.peer); });
  };

  /* changing the drops shows the push step again */
  const drops = f.segmented([["0", "pushes arrive"], ["2", "2 pushes dropped"]], "2", () => steps.go(1, true), { label: "Pushes" });
  const lost = () => drops.value === "2" ? [1, 3] : [];
  const lostNames = () => lost().map(i => PODS[i].name).join(" and ");
  f.foot.append(
    h("span", { class: "fig-key" }, [h("i", { style: `background:${C.cp}` }), "push"]),
    h("span", { class: "fig-key" }, [h("i", { style: `background:${C.muted}` }), "poll fallback"]),
    h("span", { class: "fig-key" }, [h("i", { style: `background:${C.accent}` }), "peer fetch through the load balancer"]),
  );

  const victim = PODS[3], peer = PODS[2];
  const STEPS = [
    {
      title: "reconcile",
      text: "The control plane saves config v13. First it reconciles the topics with Kafka.",
      async play(s) {
        version = 13;
        PODS.forEach(p => setBadge(s, p, p.version));
        count();
        cp.state("on"); cp.text(`saving v${version}…`, C.soft);
        f.status(`reconciling v${version} with kafka`);
        lit(recon[0], C.cp);
        await travel(s, fx, recon[0], C.cp, 600);
        kafka.state("on"); pop(fx, 725, 88, "✓ topics in sync", OKT);
        lit(recon[1], C.kafka);
        await travel(s, fx, recon[1], C.kafka, 600);
        kafka.state("idle"); lit(recon[0]); lit(recon[1]);
        cp.text(`config v${version} · reconciled`, C.ink);
      },
    },
    {
      title: "push",
      text: () => lost().length
        ? "Then it pushes v13 to every producer and consumer pod. Two of the pushes get lost on the way."
        : "Then it pushes v13 to every producer and consumer pod. Each pod keeps the config in memory.",
      async play(s) {
        f.status(`pushing v${version} to producers and consumers`);
        await Promise.all(PODS.map(async (p, i) => {
          lit(p.push, C.cp);
          if (lost().includes(i)) {
            await travel(s, fx, p.push, C.cp, 800, { to: 0.62 });
            const pt = Kit.pointAt(p.push, 0.62);
            pop(fx, pt.x, pt.y - 10, "✕ push lost", BADT);
            lit(p.push);
            return;
          }
          await travel(s, fx, p.push, C.cp, 800);
          p.node.state("on"); setBadge(s, p, version, true); count();
        }));
        cp.state("idle");
        if (lost().length) f.status(`${lostNames()} missed the push`, WARNT);
        else f.status(`every pod serves v${version} from memory`, OKT);
      },
    },
    {
      title: "poll",
      text: () => lost().length
        ? `${lostNames()} missed the push. Their poll fallback asks the control plane and gets v13.`
        : "Every push arrived, so no pod needs the poll fallback this time.",
      async play(s) {
        if (!lost().length) { await s.wait(600); return; }
        f.status(`${lostNames()} poll the control plane`, WARNT);
        lost().forEach(i => PODS[i].node.text("polling…", WARNT));
        await s.wait(500);
        await Promise.all(lost().map(async i => {
          const p = PODS[i];
          lit(p.push, C.muted);
          await travel(s, fx, p.push, C.muted, 650, { reverse: true, r: 4 });
          await travel(s, fx, p.push, C.cp, 650);
          p.node.state("on"); p.node.text("cache"); setBadge(s, p, version, true); count();
          pop(fx, p.x + 90, 140, "✓ poll", OKT);
        }));
        f.status(`every pod serves v${version} from memory`, OKT);
      },
    },
    {
      title: "outage",
      text: `The control plane goes down. Then ${victim.name} restarts with an empty cache.`,
      async play(s) {
        PODS.forEach(p => p.node.state("idle"));
        cp.state("bad"); cp.text("down ✕", BADT);
        f.status("control plane is down", BADT);
        await s.wait(700);
        victim.node.state("dim"); setBadge(s, victim, 0); count();
        f.status(`${victim.name} restarted with an empty cache`, WARNT);
        await s.wait(300);
      },
    },
    {
      title: "no answer",
      text: `${victim.name} polls the control plane, but nothing answers.`,
      async play(s) {
        victim.node.state("on"); victim.node.text("polling…", WARNT);
        lit(victim.push, C.muted);
        await travel(s, fx, victim.push, C.muted, 800, { reverse: true, to: 0.55, r: 4 });
        const pt = Kit.pointAt(victim.push, 0.45);
        pop(fx, pt.x + 40, pt.y, "✕ no answer", BADT);
        lit(victim.push);
        await s.wait(400);
      },
    },
    {
      title: "ask a peer",
      text: `${victim.name} asks its peers through the load balancer. ${peer.name} sends back its cached v13.`,
      async play(s) {
        victim.node.text("asking peers…", C.soft);
        f.status(`${victim.name} asks its peers through the load balancer`);
        lit(victim.peer, C.accent); lb.state("on");
        await travel(s, fx, victim.peer, C.accent, 600);
        lit(peer.peer, C.accent);
        await travel(s, fx, peer.peer, C.accent, 600, { reverse: true });
        peer.node.state("on"); pop(fx, peer.x + 90, 140, `v${version}`, C.ink);
        await travel(s, fx, peer.peer, C.accent, 600);
        await travel(s, fx, victim.peer, C.accent, 600, { reverse: true });
        setBadge(s, victim, version, true); victim.node.text("cache"); count();
        f.status(`${victim.name} got v${version} from ${peer.name} · control plane still down`, OKT);
      },
    },
    {
      title: "back",
      text: "The control plane comes back. The pods never needed it to do their work: each one runs on its cached config.",
      async play(s) {
        lb.state("idle"); peer.node.state("idle"); victim.node.state("idle");
        await s.wait(300);
        cp.state("idle"); cp.text(`config v${version}`);
        f.status("control plane back · pods keep their cache", OKT);
        await s.wait(600);
      },
    },
  ];
  const steps = f.steps(STEPS, { reset, enter });
});

/* ======================================================================
   Figure: outbox rows moving through their states
   ====================================================================== */
Kit.figure("outbox", f => {
  f.chrome({ tag: "postgres · pg-boss", label: "the outbox, row by row", stageClass: "ob-stage" });
  const STATES = ["pending", "processing", "processed", "stored"];
  const flow = h("div", { class: "ob-flow" });
  const counts = {};
  STATES.concat("dlq").forEach((st, i) => {
    if (i) flow.appendChild(h("span", { class: "ob-arrow" + (st === "dlq" ? " to-dlq" : ""), text: st === "dlq" ? "5 fails ⟶" : "→" }));
    const c = h("span", { class: "ob-count st-" + st }, [h("b", { text: "0" }), h("span", { text: st === "dlq" ? "DLQ" : st })]);
    counts[st] = c.firstChild; flow.appendChild(c);
  });
  const table = h("div", { class: "ob-table", role: "table", "aria-label": "Outbox rows" });
  table.appendChild(h("div", { class: "ob-row ob-th", role: "row" }, ["id", "idempotency key", "state", "attempts", "locked by"].map(t => h("span", { role: "columnheader", text: t }))));
  const side = h("div", { class: "ob-side" });
  const workers = ["w1", "w2"].map(id => {
    const el = h("div", { class: "ob-worker" }, [h("b", { text: id }), h("span", { text: "idle" })]);
    side.appendChild(el);
    return { id, el, label: el.lastChild, row: null, alive: true, until: 0, back: 0 };
  });
  const kafkaEl = h("div", { class: "ob-sink" }, [h("span", { text: "kafka acks" }), h("b", { text: "0" })]);
  side.append(kafkaEl, h("p", { class: "ob-sql", html: "SELECT … FOR UPDATE<br><em>SKIP LOCKED</em>" }));
  f.stage.append(flow, h("div", { class: "ob-main" }, [table, side]));

  const KEYS = ["pay_8f3a", "pay_19c2", "pay_e07d", "pay_5b61", "pay_d4a9", "pay_2e8f", "pay_a36c", "pay_71bd"];
  const POISON = 4; // pay_d4a9 never processes
  const CRASH_AT = 5, TICK = 560; // w2 crashes on tick 5, holding a row it has processed but not sent
  let rows = [], acks = 0, crashAt = -1, crashed = false, T = 0, fails = 0;

  f.foot.append(
    h("span", { class: "fig-key" }, [h("i", { style: `background:${C.pg}` }), "processing (row is locked)"]),
    h("span", { class: "fig-key" }, [h("i", { style: `background:${C.kafka}` }), "sent, waiting for kafka ack"]),
    h("span", { class: "fig-note", text: "one tick ≈ half a second here; leases expire after 6 ticks" }),
  );

  function render() {
    rows.forEach(r => {
      r.el.className = "ob-row st-" + r.state + (r.flash ? " " + r.flash : "");
      r.stateEl.textContent = r.state === "sending" ? "→ kafka" : r.state === "dlq" ? "✕ DLQ" : r.state === "stored" ? "✓ stored" : r.state;
      r.att.textContent = "●".repeat(r.attempts) + "○".repeat(5 - r.attempts);
      r.lock.textContent = r.owner ? "🔒 " + r.owner.id : "";
    });
    const n = st => rows.filter(r => r.state === st || (st === "processed" && r.state === "sending")).length;
    STATES.concat("dlq").forEach(st => { counts[st].textContent = n(st); });
    workers.forEach(w => {
      w.el.classList.toggle("dead", !w.alive);
      w.label.textContent = !w.alive ? "✕ crashed" : w.row ? `#${w.row.id} · ${w.row.state === "sending" ? "→ kafka" : w.row.state}` : "polling";
    });
    kafkaEl.lastChild.textContent = acks;
    const stored = n("stored"), dlq = n("dlq");
    f.big(`${stored} / ${rows.length}`, `rows stored · ${dlq} in DLQ · 0 dual writes`, stored + dlq === rows.length ? OKT : C.ink);
  }

  function setup() {
    table.querySelectorAll(".ob-row:not(.ob-th)").forEach(e => e.remove());
    rows = KEYS.map((key, i) => {
      const el = h("div", { class: "ob-row", role: "row" });
      const r = { id: 1041 + i, key, state: "pending", attempts: 0, owner: null, lease: 0, left: 0, el, flash: "" };
      el.append(h("span", { text: "#" + r.id }), h("span", { class: "k", text: key + "…" }),
        r.stateEl = h("span", { class: "chip" }), r.att = h("span", { class: "att" }), r.lock = h("span", { class: "lock" }));
      table.appendChild(el);
      return r;
    });
    workers.forEach(w => { w.row = null; w.alive = true; w.back = 0; });
    acks = 0; T = 0; crashed = false; crashAt = CRASH_AT; fails = 0;
    render();
    f.status("rows wait in pending until a worker locks them");
  }

  function step() {
    T++;
    rows.forEach(r => { r.flash = ""; });
    /* a crashed worker's row keeps its state until the lease runs out. Unprocessed rows go back to pending;
       rows already processed keep that flag, so the retry only resends them to Kafka (processing is idempotent). */
    rows.forEach(r => {
      if (["processing", "processed", "sending"].includes(r.state) && r.owner && !r.owner.alive && T >= r.lease) {
        const done = r.state !== "processing";
        r.owner.row = null; r.owner = null; r.state = done ? "processed" : "pending"; r.flash = "expired";
        f.status(done ? `lease on #${r.id} expired · already processed, only resend to kafka` : `lease on #${r.id} expired · back to pending, will retry`, WARNT);
      }
    });
    if (crashAt >= 0 && T >= crashAt && workers[1].alive) {
      const w = workers[1]; w.alive = false; w.back = T + 9; crashAt = -1; crashed = true;
      f.status(w.row ? `w2 crashed holding #${w.row.id} · its lease will expire` : "w2 crashed", BADT);
    }
    workers.forEach(w => {
      if (!w.alive) { if (T >= w.back) { w.alive = true; w.row = null; f.status("w2 restarted by the watchdog"); } return; }
      const r = w.row;
      if (r) {
        if (--r.left > 0) return;
        if (r.state === "processing") {
          if (rows.indexOf(r) === POISON) {
            r.owner = null; w.row = null; fails++;
            if (r.attempts >= 5) { r.state = "dlq"; r.flash = "bad"; f.status(`#${r.id} failed 5 times · moved to the DLQ, on-call alerted`, BADT); }
            else { r.state = "pending"; r.flash = "bad"; f.status(`processing #${r.id} failed · attempt ${r.attempts} of 5`, WARNT); }
          } else { r.state = "processed"; r.left = 1; }
        } else if (r.state === "processed") { r.state = "sending"; r.left = 2; }
        else if (r.state === "sending") {
          acks++; r.state = "stored"; r.flash = "ok"; r.owner = null; w.row = null;
          f.status(`kafka acked #${r.id} · only now is it flagged stored`);
        }
        return;
      }
      /* SKIP LOCKED: take the first pending row nobody holds; rows held by the other worker are skipped */
      for (const cand of rows) {
        if (cand.owner && cand.owner !== w && !cand.flash) cand.flash = "skip";
        if (cand.owner) continue;
        if (cand.state === "pending") { cand.state = "processing"; cand.attempts++; cand.left = 3; }
        else if (cand.state === "processed") cand.left = 1;
        else continue;
        cand.owner = w; cand.lease = T + 6; w.row = cand;
        break;
      }
    });
    render();
    return rows.every(r => r.state === "stored" || r.state === "dlq");
  }

  /* each step runs ticks until the moment it is about */
  const until = async (s, done) => { do { await s.wait(TICK); if (step()) break; } while (!done()); };
  const STEPS = [
    {
      title: "lock",
      text: "Two workers poll with SELECT … FOR UPDATE SKIP LOCKED. w1 locks #1041. w2 skips that locked row and takes #1042, so no row has two owners.",
      play: async s => { f.status("two workers polling the outbox"); await until(s, () => workers.every(w => w.row)); },
    },
    {
      title: "crash",
      text: "Both rows are processed. Then w2 crashes while it holds #1042: the row is processed, but Kafka does not have it yet.",
      play: s => until(s, () => crashed),
    },
    {
      title: "stored",
      text: "Kafka acks #1041, and only then is the row flagged stored. In the same tick the lease on #1042 runs out. The row keeps its processed flag.",
      play: s => until(s, () => rows[0].state === "stored"),
    },
    {
      title: "resend",
      text: "w1 picks up #1042 and only sends it to Kafka. Processing is idempotent and the flag says it is done, so it does not run again.",
      play: s => until(s, () => rows[1].state === "stored"),
    },
    {
      title: "poison",
      text: "Meanwhile the watchdog restarts w2. Then #1045 (pay_d4a9) fails to process. It goes back to pending with one attempt used.",
      play: s => until(s, () => fails > 0),
    },
    {
      title: "DLQ",
      text: "#1045 fails again on every attempt. After 5 attempts it moves to the DLQ and on-call gets an alert. The other rows never wait for it.",
      play: s => until(s, () => rows[POISON].state === "dlq"),
    },
    {
      title: "done",
      text: "Every row is stored or in the DLQ, including the row the crash interrupted. No row was flagged stored before Kafka had it.",
      async play(s) {
        await until(s, () => false);
        f.status("everything stored or in the DLQ, including the row the crash interrupted", OKT);
      },
    },
  ];
  f.steps(STEPS, { reset: setup });
});

/* ======================================================================
   Figure: acks=1 vs acks=all, then the leader dies
   ====================================================================== */
Kit.figure("acks", f => {
  f.chrome({ tag: "kafka · replication", label: "what an ack is worth" });
  const svg = f.svg(880, 268, { label: "Producer writing to a leader broker and two followers; the leader crashes after acking", minWidth: 660 });
  const wires = sv("g"), nodes = sv("g"), fx = sv("g");
  svg.append(wires, nodes, fx);

  const BX = [260, 460, 660], BY = 78, BW = 170, BH = 170;
  const W = {
    write: wire(wires, "M156,136 H260"),
    rep: [null, wire(wires, `M${BX[0] + BW / 2 + 40},${BY + 82} H${BX[1] + 20}`), wire(wires, `M${BX[0] + 80},${BY + BH} C${BX[0] + 80},${BY + BH + 22} ${BX[2] + 80},${BY + BH + 22} ${BX[2] + 80},${BY + BH}`)],
    ctrl: [0, 1, 2].map(i => wire(wires, `M495,44 C495,60 ${BX[i] + 85},56 ${BX[i] + 85},${BY}`, { dash: "3 5" })),
  };
  const prod = box(nodes, { x: 16, y: 108, w: 140, h: 56, label: "producer", sub: "topic orders", color: C.prod });
  const ctrl = box(nodes, { x: 380, y: 8, w: 230, h: 36, label: "controller · KRaft", color: C.kafka });
  const B = BX.map((x, i) => {
    const g = sv("g"); nodes.appendChild(g);
    const n = box(g, { x, y: BY, w: BW, h: BH, label: `broker ${i + 1}`, sub: "", color: C.kafka });
    n.label.setAttribute("y", BY + 26); n.sub.setAttribute("y", BY + 44);
    const cells = [40, 41, 42, 43, 44].map((off, k) => {
      const r = sv("rect", { x: x + 16 + k * 29, y: BY + 66, width: 25, height: 26, rx: 0, "stroke-width": 1.2 });
      r.style.transition = "fill .3s ease, stroke .3s ease";
      g.appendChild(r);
      txt(g, x + 28.5 + k * 29, BY + 108, String(off), { size: 9.5, anchor: "middle", color: C.faint });
      return r;
    });
    const note = txt(g, x + 14, BY + 140, "", { size: 11 });
    return { n, cells, note, alive: true };
  });
  const cell = (b, k, st) => {
    const r = B[b].cells[k];
    r.style.fill = st === "full" ? C.kafka + "66" : st === "missing" ? C.bad + "1a" : C.bg;
    r.style.stroke = st === "full" ? C.kafka : st === "missing" ? C.bad : C.line2;
    r.setAttribute("stroke-dasharray", st === "missing" ? "3 3" : "");
  };

  /* the segmented control jumps to the first step of that mode */
  const acks = f.segmented([["1", "acks=1"], ["all", "acks=all"]], "1", v => steps.go(v === "1" ? 0 : 2), { label: "Acks" });

  function reset(mode) {
    fx.replaceChildren();
    B.forEach((b, i) => {
      b.alive = true; b.n.state("idle");
      b.n.text(i === 0 ? "leader" : "follower", i === 0 ? C.ink : C.muted);
      b.note.textContent = "";
      [0, 1].forEach(k => cell(i, k, "full")); [2, 3, 4].forEach(k => cell(i, k, "empty"));
    });
    ctrl.state("idle"); prod.state("idle");
    Object.values(W).flat().forEach(w => w && lit(w));
    prod.text(mode === "1" ? "topic clickstream" : "topic orders");
    f.big("—", mode === "1" ? "acks=1: leader only" : "acks=all: leader + in-sync followers");
    f.status("");
  }

  /* the producer writes offset 42 and gets its ack */
  async function write(s, mode) {
    reset(mode);
    f.status("producer sends offset 42");
    prod.state("on"); lit(W.write, C.prod);
    await travel(s, fx, W.write, C.prod, 600);
    cell(0, 2, "full"); B[0].n.state("on");
    if (mode === "all") {
      await Promise.all([1, 2].map(async i => {
        lit(W.rep[i], C.kafka);
        await travel(s, fx, W.rep[i], C.kafka, 700);
        cell(i, 2, "full");
      }));
      pop(fx, 545, 70, "3 of 3 in sync", C.soft);
      await s.wait(250);
    }
    lit(W.write, C.ok);
    await travel(s, fx, W.write, C.ok, 450, { reverse: true });
    pop(fx, 86, 98, mode === "1" ? "✓ ack · 1 of 3 copies" : "✓ ack · 3 of 3 copies", OKT);
    f.status("producer told the generator: stored");
    await s.wait(400);
  }

  /* the leader dies; with acks=1 the followers were still fetching 42 */
  async function crash(s, mode) {
    if (mode === "1") {
      /* the dots never arrive: the leader dies first */
      [1, 2].forEach(i => { lit(W.rep[i], C.kafka); travel(s, fx, W.rep[i], C.kafka, 1800, { to: 0.9, ease: Kit.ease.linear }).catch(() => {}); });
      await s.wait(500);
      fx.replaceChildren();
    } else {
      await s.wait(300);
    }
    W.rep.forEach(w => w && lit(w)); lit(W.write); prod.state("idle");
    B[0].alive = false; B[0].n.state("bad"); B[0].n.text("✕ crashed", BADT);
    f.status("broker 1 (the leader) crashed", BADT);
    await s.wait(700);
    ctrl.state("on"); W.ctrl.forEach((w, i) => i && lit(w, C.kafka));
    await travel(s, fx, W.ctrl[1], C.kafka, 600);
    B[1].n.text("leader (elected)", C.ink); B[1].n.state("on");
    W.ctrl.forEach(w => lit(w)); ctrl.state("idle");
    await s.wait(450);
    if (mode === "1") {
      cell(1, 2, "missing"); cell(2, 2, "missing");
      B[1].note.textContent = "✕ offset 42 missing"; B[1].note.style.fill = BADT;
      f.big("1", "acked log lost", BADT);
      f.status("the new leader never had it · the ack was a lie", BADT);
    } else {
      B[1].note.textContent = "✓ has offset 42"; B[1].note.style.fill = OKT;
      f.big("0", "acked logs lost", OKT);
      f.status("the new leader already had it", OKT);
    }
  }

  const STEPS = [
    {
      title: "acks=1",
      text: "acks=1 answers as soon as the leader has the write: 1 of 3 copies. Only topics that are inherently not that important (clickstream here) may use it.",
      play: s => write(s, "1"),
    },
    {
      title: "leader dies",
      text: "The followers start to fetch offset 42, but the leader crashes first. The new leader never had it, so a log the producer called stored is gone.",
      play: s => crash(s, "1"),
    },
    {
      title: "acks=all",
      text: "acks=all is the default when a topic doesn't set one. The ack waits until the in-sync followers have the write too: 3 of 3 copies.",
      play: s => write(s, "all"),
    },
    {
      title: "leader dies",
      text: "The same crash. The new leader already has offset 42, so no acked log is lost.",
      play: s => crash(s, "all"),
    },
  ];
  const steps = f.steps(STEPS, {
    reset: () => reset("1"),
    enter: i => acks.set(i < 2 ? "1" : "all", false),
  });
});

/* ======================================================================
   Figure: fan-out and when the offset is committed
   ====================================================================== */
Kit.figure("commit", f => {
  f.chrome({ tag: "consumer · offsets", label: "commit only after every copy is safe" });
  const svg = f.svg(880, 298, { label: "Partition offsets, a consumer, three destinations and a retry topic", minWidth: 660 });
  const wires = sv("g"), nodes = sv("g"), fx = sv("g");
  svg.append(wires, nodes, fx);

  const OFF0 = 40, NCELL = 10;
  txt(nodes, 20, 22, "orders · partition 0", { size: 11, color: C.muted });
  const cells = Array.from({ length: NCELL }, (_, k) => {
    const x = 20 + k * 42;
    const r = sv("rect", { x, y: 32, width: 38, height: 30, rx: 0, "stroke-width": 1.2 });
    r.style.cssText = `fill:${C.bg2};stroke:${C.line2};transition:fill .3s ease, stroke .3s ease`;
    nodes.appendChild(r);
    txt(nodes, x + 19, 51, String(OFF0 + k), { size: 11, anchor: "middle", color: C.soft });
    return { r, x };
  });
  const marker = sv("g"); nodes.appendChild(marker);
  marker.style.transition = "transform .5s cubic-bezier(.2,.8,.2,1)";
  marker.append(sv("path", { d: "M0,0 l-6,9 h12 z", fill: C.accent }));
  const markT = txt(marker, 0, 22, "committed", { size: 10, anchor: "middle", color: C.accent });
  const cons = box(nodes, { x: 90, y: 150, w: 180, h: 56, label: "shared-consumer", sub: "pod 1", color: C.cons });
  const retry = box(nodes, { x: 90, y: 248, w: 180, h: 44, label: "retry · step 1", sub: "search-index partition", color: C.retry });
  const DN = ["search-index", "audit-log", "email-service"];
  const dests = DN.map((name, i) => ({ name, n: box(nodes, { x: 690, y: 40 + i * 86, w: 170, h: 50, label: name, sub: "", color: C.dest }), got: 0, dup: 0, seen: new Set(), up: true }));
  const dW = dests.map((d, i) => wire(wires, `M270,178 C480,178 480,${65 + i * 86} 690,${65 + i * 86}`));
  const rW = wire(wires, "M180,206 V248");
  const readW = wire(wires, "M0,0");

  let committed = OFF0, lost = 0;
  const setCommitted = off => {
    committed = off;
    const k = off - OFF0;
    marker.style.transform = `translate(${20 + k * 42 + 19}px, 66px)`;
    cells.forEach((c, i) => {
      c.r.style.fill = i <= k ? C.kafka + "33" : C.bg2;
      c.r.style.stroke = i <= k ? C.kafka + "aa" : C.line2;
    });
  };
  markT.setAttribute("y", 22);
  const destText = d => d.n.text(`${d.up ? "" : "503 · "}got ${d.got}${d.dup ? ` · ${d.dup} dup dropped` : ""}`, d.up ? C.muted : BADT);
  const big = () => f.big(`${committed}`, `committed offset · ${lost} lost · ${dests.reduce((a, d) => a + d.dup, 0)} duplicates dropped by destinations`);

  function setDown(isDown) {
    dests[0].up = !isDown;
    dests[0].n.state(isDown ? "bad" : "idle");
    destText(dests[0]);
  }

  /* read one offset and send a copy to every destination; returns the ones that failed transiently */
  async function deliver(s, off) {
    const c = cells[off - OFF0];
    c.r.style.stroke = C.cons;
    readW.setAttribute("d", `M${c.x + 19},62 C${c.x + 19},110 180,104 180,150`);
    lit(readW, C.cons);
    f.status(`reading offset ${off}`);
    await travel(s, fx, readW, C.kafka, 500);
    lit(readW); cons.state("on");
    const parked = [];
    await Promise.all(dests.map(async (d, i) => {
      lit(dW[i], C.cons);
      await travel(s, fx, dW[i], C.cons, 700 + i * 80, { to: d.up ? 1 : 0.97 });
      lit(dW[i]);
      if (!d.up) { pop(fx, 775, 30 + i * 86, "✕ 503 transient", BADT); parked.push(i); return; }
      if (d.seen.has(off)) { d.dup++; pop(fx, 775, 30 + i * 86, "dup · dropped by key", WARNT); }
      else { d.seen.add(off); d.got++; pop(fx, 775, 30 + i * 86, "✓ delivered", OKT); }
      d.n.state("ok"); later(s, 700, () => d.n.state(d.up ? "idle" : "bad"));
      destText(d);
    }));
    return parked;
  }

  /* park the failed copies in the retry topic, then commit */
  async function commit(s, off, parked) {
    for (const i of parked) {
      lit(rW, C.retry);
      await travel(s, fx, rW, C.retry, 450);
      lit(rW);
      retry.state("on"); pop(fx, 180, 240, `✓ ${DN[i]} copy parked`, OKT, { size: 10.5 });
      later(s, 700, () => retry.state("idle"));
    }
    cons.text("pod " + (cons.sub.textContent.includes("2") ? "2" : "1"));
    lit(readW, C.accent);
    await travel(s, fx, readW, C.accent, 450, { reverse: true, r: 4 });
    lit(readW);
    setCommitted(off);
    cons.state("idle");
    f.status(parked.length ? `committed ${off} after the retry write was acked` : `committed ${off}`, OKT);
    big();
  }
  const handle = async (s, off) => commit(s, off, await deliver(s, off));

  function reset() {
    fx.replaceChildren();
    dests.forEach(d => { d.got = 0; d.dup = 0; d.seen = new Set(); d.up = true; d.n.state("idle"); destText(d); });
    cons.state("idle"); cons.text("pod 1"); retry.state("idle");
    [readW, rW, ...dW].forEach(w => lit(w));
    setCommitted(OFF0); big();
    f.status("one read · three deliveries · one commit");
  }

  const STEPS = [
    {
      title: "commit",
      text: "The consumer reads 41, then 42, and sends one copy to each destination. Every destination answers, so the offset moves right away.",
      async play(s) { await handle(s, 41); await s.wait(600); await handle(s, 42); },
    },
    {
      title: "503s",
      text: "search-index starts to return 503s. Its copy of 43 goes to the retry topic. The offset still moves, after the retry write is acked.",
      async play(s) { setDown(true); await s.wait(700); await handle(s, 43); },
    },
    {
      title: "crash",
      text: "The consumer delivers 44, then crashes before it commits. Nothing is lost: the committed offset is still 43.",
      async play(s) {
        await deliver(s, 44);
        cons.state("bad"); cons.text("✕ crashed", BADT);
        f.status("consumer died before committing 44 · nothing is lost, it will be read again", BADT);
        big();
        await s.wait(600);
      },
    },
    {
      title: "read again",
      text: "Pod 2 resumes from the last commit and reads 44 again. audit-log and email-service drop the duplicate by its idempotency key. Nothing lost, duplicates possible.",
      async play(s) {
        cons.state("on"); cons.text("pod 2 took over", C.ink);
        f.status(`pod 2 resumes from the last commit (${committed}) and reads 44 again`);
        await s.wait(900);
        cons.state("idle");
        await handle(s, 44);
      },
    },
  ];
  f.steps(STEPS, { reset, enter: () => fx.replaceChildren() });
});

/* ======================================================================
   Figure: retry ladder and why jitter matters
   ====================================================================== */
Kit.figure("jitter", f => {
  f.chrome({ tag: "retry topics", label: "200 failures at once" });
  const lad = h("div", { class: "lad", "aria-hidden": "true" });
  [["main topic", C.kafka], ["step 1 · 10s", C.retry], ["step 2 · 1m", C.retry], ["step 3 · 5m", C.retry], ["DLQ", C.bad]].forEach(([t, c], i) => {
    if (i) lad.appendChild(h("span", { class: "lad-arrow" }, [h("i"), h("i"), h("i")]));
    lad.appendChild(h("span", { class: "lad-step", style: `--c:${c}` }, [t]));
  });
  const ladNote = h("p", { class: "lad-note", html: "transient (503) moves one step right · permanent (400) goes straight to the <b>DLQ</b> from any step · each wait starts when the message enters the step" });
  f.stage.append(lad, ladNote);

  /* 200 messages fail within the same second. Each step waits its delay (±30% with jitter) from when the message entered it.
     search-index stays down through steps 1 and 2 and is back by the time step 3 fires. */
  const N = 200, DEL = [10, 60, 300];
  const PANELS = [{ lo: 0, hi: 20 }, { lo: 45, hi: 95 }, { lo: 255, hi: 485 }];
  function simulate(jitter) {
    const r = rng(7), at = [[], [], []];
    for (let m = 0; m < N; m++) {
      let t = r();
      for (let k = 0; k < 3; k++) { t += DEL[k] * (jitter ? 1 + (r() * 2 - 1) * 0.3 : 1); at[k].push(t); }
    }
    return at.map((times, k) => {
      const p = PANELS[k], bins = new Array(p.hi - p.lo).fill(0);
      times.forEach(t => { const b = Math.floor(t - p.lo); if (b >= 0 && b < bins.length) bins[b]++; });
      return bins;
    });
  }
  const data = { on: simulate(true), off: simulate(false) };
  const peak = m => Math.max(...data[m].flat());

  const svg = f.svg(880, 236, { label: "Retry attempts per second hitting search-index for steps 1, 2 and 3", minWidth: 660 });
  const PW = 250, PX = [52, 337, 622], TOP = 36, PH = 150;
  const grid = sv("g"), plot = sv("g"), fx = sv("g");
  svg.append(grid, plot, fx);
  const TITLES = ["step 1 · 10s", "step 2 · 1 min", "step 3 · 5 min · service is back"];
  const clips = PX.map((x, k) => {
    txt(grid, x, 20, TITLES[k], { size: 11, color: C.soft, weight: 600 });
    const p = PANELS[k];
    [p.lo, Math.round((p.lo + p.hi) / 2), p.hi].forEach((v, j) => txt(grid, x + (j / 2) * PW, TOP + PH + 18, v >= 60 ? `${Math.floor(v / 60)}m${v % 60 ? String(v % 60).padStart(2, "0") + "s" : ""}` : v + "s", { size: 10, anchor: j === 0 ? "start" : j === 2 ? "end" : "middle", color: C.faint }));
    const id = `jit-clip-${k}-${Math.random().toString(36).slice(2, 7)}`;
    const cp = sv("clipPath", { id }, [sv("rect", { x, y: 0, width: 0, height: 240 })]);
    svg.appendChild(cp);
    const g = sv("g", { "clip-path": `url(#${id})` });
    plot.appendChild(g);
    return { rect: cp.firstChild, g, x };
  });
  const yTicks = sv("g"); grid.appendChild(yTicks);

  let mode = "on", yMax = 1;
  function draw() {
    yMax = peak(mode) <= 20 ? 20 : peak(mode) <= 50 ? 50 : peak(mode) <= 100 ? 100 : 200;
    yTicks.replaceChildren();
    [0, 0.5, 1].forEach(fr => {
      const y = TOP + PH - fr * PH;
      PX.forEach(x => { const l = sv("line", { x1: x, x2: x + PW, y1: y, y2: y, "stroke-width": 1 }); l.style.stroke = fr ? C.line : C.line2; yTicks.appendChild(l); });
      txt(yTicks, PX[0] - 8, y + 3.5, String(Math.round(fr * yMax)), { size: 9.5, anchor: "end", color: C.faint });
    });
    clips.forEach((c, k) => {
      c.g.replaceChildren();
      const bins = data[mode][k], bw = PW / bins.length;
      bins.forEach((v, i) => {
        if (!v) return;
        const hgt = Math.max(1.5, (v / yMax) * PH);
        const r = sv("rect", { x: c.x + i * bw + (bw > 4 ? 1 : 0), y: TOP + PH - hgt, width: Math.max(1, bw - (bw > 4 ? 2 : 0.2)), height: hgt, rx: 0, fill: v >= yMax * 0.9 && mode === "off" ? C.bad : C.retry });
        c.g.appendChild(r);
      });
    });
    const pk = peak(mode);
    f.big(`${pk}`, mode === "off" ? "retries in the same second · a self-made second outage" : "retries in the busiest second · spread across the window", mode === "off" ? BADT : OKT);
    f.status(mode === "off" ? "no jitter: all wake up together" : "±30% jitter, as in the simulation", mode === "off" ? BADT : C.muted);
  }

  /* hover: which second, how many attempts */
  const tip = h("div", { class: "fx-tip", hidden: true });
  f.stage.appendChild(tip);
  const cross = sv("line", { y1: TOP, y2: TOP + PH, "stroke-width": 1, opacity: 0 }); cross.style.stroke = C.soft; fx.appendChild(cross);
  svg.addEventListener("pointermove", e => {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const k = PX.findIndex(x => p.x >= x && p.x <= x + PW);
    /* only the part of a panel that is drawn so far */
    if (k < 0 || p.x > PX[k] + +clips[k].rect.getAttribute("width")) { tip.hidden = true; cross.setAttribute("opacity", 0); return; }
    const bins = data[mode][k], i = Math.min(bins.length - 1, Math.floor((p.x - PX[k]) / (PW / bins.length)));
    const sec = PANELS[k].lo + i;
    cross.setAttribute("x1", PX[k] + (i + 0.5) * (PW / bins.length)); cross.setAttribute("x2", cross.getAttribute("x1")); cross.setAttribute("opacity", 0.5);
    tip.hidden = false;
    tip.innerHTML = `<b>${bins[i]}</b> attempts<br><span>${sec >= 60 ? clockStr(sec) : sec + "s"} – ${sec + 1 >= 60 ? clockStr(sec + 1) : sec + 1 + "s"} after the outage</span>`;
    const box = f.stage.getBoundingClientRect(), sb = svg.getBoundingClientRect();
    tip.style.left = Math.min(box.width - 170, e.clientX - box.left + 12 + f.stage.scrollLeft) + "px";
    tip.style.top = (sb.top - box.top + 40) + "px";
  });
  svg.addEventListener("pointerleave", () => { tip.hidden = true; cross.setAttribute("opacity", 0); });

  /* the segmented control jumps to the first step of that mode */
  const seg = f.segmented([["off", "jitter off"], ["on", "jitter on"]], "off", v => steps.go(v === "off" ? 0 : 2), { label: "Jitter" });
  f.foot.append(
    h("span", { class: "fig-key" }, [h("i", { style: `background:${C.retry}` }), "retry attempts per second against search-index"]),
    h("span", { class: "fig-note", text: "hover the bars · same 200 messages, same seed, only the jitter changes" }),
  );

  const setMode = m => { mode = m; seg.set(m, false); draw(); clips.forEach(c => c.rect.setAttribute("width", 0)); };
  const reveal = (s, k, ms) => s.tween(ms, t => clips[k].rect.setAttribute("width", t * PW), Kit.ease.linear);
  const peaks = m => data[m].map(bins => Math.max(...bins));
  const STEPS = [
    {
      title: "no jitter",
      text: "200 messages fail in the same second. Without jitter each one waits exactly 10s, so step 1 sends all 200 retries to search-index in one second.",
      play: s => reveal(s, 0, 1100),
    },
    {
      title: "steps 2 and 3",
      text: "Each wait starts when the message enters the step, so the spike moves on intact: 200 at once on step 2, and 200 at once on step 3.",
      async play(s) { await reveal(s, 1, 1100); await s.wait(120); await reveal(s, 2, 1100); },
    },
    {
      title: "±30% jitter",
      text: () => `Now each message waits 10s ±30%, so anywhere from 7s to 13s. The same 200 retries spread out: the busiest second on step 1 has ${peaks("on")[0]}.`,
      async play(s) { setMode("on"); await reveal(s, 0, 1300); },
    },
    {
      title: "steps 2 and 3",
      text: () => `The spread grows with every step: the busiest second has ${peaks("on")[1]} retries on step 2 and ${peaks("on")[2]} on step 3. By then search-index is back.`,
      async play(s) { await reveal(s, 1, 1300); await s.wait(150); await reveal(s, 2, 1300); },
    },
  ];
  const steps = f.steps(STEPS, {
    reset: () => setMode("off"),
    enter: i => seg.set(i < 2 ? "off" : "on", false),
  });
});

/* ======================================================================
   Figure: shared pause, half-open probe and recovery (scrubbable timeline)
   ====================================================================== */
Kit.figure("breaker", f => {
  f.chrome({ tag: "circuit breakers", label: "search-index goes down" });
  const svg = f.svg(880, 376, { label: "Timeline of a destination outage: failures, main breaker, three paused retry steps, probes and backlog", minWidth: 680 });
  const X0 = 178, X1 = 864, TMAX = 12;
  const xOf = m => X0 + (m / TMAX) * (X1 - X0);
  const bg = sv("g"), lanes = sv("g"), top = sv("g");
  svg.append(bg, lanes, top);
  const pid = "brk-hatch-" + Math.random().toString(36).slice(2, 7);
  svg.appendChild(sv("defs", {}, [sv("pattern", { id: pid, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, [
    sv("rect", { width: 6, height: 6, fill: C.warn + "26" }), sv("line", { x1: 0, y1: 0, x2: 0, y2: 6, stroke: C.warn, "stroke-width": 2.2 })])]));
  const clipId = "brk-clip-" + Math.random().toString(36).slice(2, 7);
  const clipR = sv("rect", { x: 0, y: 0, width: X0, height: 376 });
  svg.appendChild(sv("clipPath", { id: clipId }, [clipR]));
  lanes.setAttribute("clip-path", `url(#${clipId})`);

  const LANES = [
    { y: 26, label: "search-index", sub: "destination" },
    { y: 64, label: "failures in a row", sub: "per step · trips at 20" },
    { y: 102, label: "main breaker", sub: "main consumer" },
    { y: 140, label: "retry step 1", sub: "10s" },
    { y: 172, label: "retry step 2", sub: "1 min" },
    { y: 204, label: "retry step 3", sub: "5 min" },
    { y: 250, label: "step 1 backlog", sub: "waiting, durable" },
    { y: 318, label: "email-service", sub: "healthy neighbour" },
  ];
  LANES.forEach(l => {
    txt(bg, X0 - 14, l.y + 12, l.label, { size: 11.5, anchor: "end", color: C.soft, weight: 600 });
    txt(bg, X0 - 14, l.y + 25, l.sub, { size: 9.5, anchor: "end", color: C.faint });
    const g = sv("line", { x1: X0, x2: X1, y1: l.y + 11, y2: l.y + 11, "stroke-width": 1 }); g.style.stroke = C.line; bg.appendChild(g);
  });
  for (let m = 0; m <= TMAX; m += 2) {
    const x = xOf(m);
    const l = sv("line", { x1: x, x2: x, y1: 18, y2: 350, "stroke-width": 1, "stroke-dasharray": "2 4" }); l.style.stroke = C.line; bg.appendChild(l);
    txt(bg, x, 366, m + "m", { size: 10, anchor: "middle", color: C.faint });
  }
  const head = sv("line", { y1: 14, y2: 352, "stroke-width": 1.6 }); head.style.stroke = C.accent; top.appendChild(head);
  const headT = txt(top, 0, 12, "", { size: 10, anchor: "middle", color: C.accent, weight: 600 });

  const RATE = 300;                    // search-index logs per minute while down
  const DRAIN = 750;                   // backpressured resume rate, logs per minute
  let L = 4, M;
  function model() {
    const out = 1, back = out + L, trip = out + 0.35;
    const probes = []; let resume = null;
    for (let k = 1; resume == null; k++) { const t = trip + 2 * k; probes.push({ t, ok: t >= back }); if (t >= back) resume = t; }
    const peakQ = RATE * (resume - out), drained = resume + peakQ / (DRAIN - RATE);
    return { out, back, trip, probes, resume, peakQ, drained };
  }
  const band = (y, a, b, fill, o = {}) => {
    const r = sv("rect", { x: xOf(a), y: y + (o.dy || 2), width: Math.max(0, xOf(b) - xOf(a)), height: o.h || 18, rx: 0, fill });
    lanes.appendChild(r); return r;
  };
  const inLane = (y, a, text, color) => {
    return txt(lanes, xOf(a) + 8, y + 15, text, { size: 10, color: color || C.ink, weight: 600 });
  };
  function draw() {
    M = model();
    lanes.replaceChildren();
    const { out, back, trip, probes, resume, drained, peakQ } = M;
    /* destination health */
    band(LANES[0].y, 0, out, C.ok + "55"); band(LANES[0].y, out, back, C.bad + "88"); band(LANES[0].y, back, TMAX, C.ok + "55");
    inLane(LANES[0].y, out, "503s", BADT); inLane(LANES[0].y, back, "back up", OKT);
    /* consecutive failures ramp to 20, then frozen while paused, reset on success */
    const fy = LANES[1].y, fl = sv("path", { d: `M${xOf(0)},${fy + 20} H${xOf(out)} L${xOf(trip)},${fy + 1} H${xOf(resume)} L${xOf(resume)},${fy + 20} H${xOf(TMAX)}`, fill: "none", "stroke-width": 2 });
    fl.style.stroke = C.retry; lanes.appendChild(fl);
    inLane(fy - 3, trip, "20 → trip", WARNT);
    /* main breaker */
    band(LANES[2].y, trip, resume, C.retry + "99");
    inLane(LANES[2].y, trip, "open · ordinary deliveries go to step 1");
    /* three retry steps: consuming vs one shared pause */
    [3, 4, 5].forEach(i => {
      const y = LANES[i].y;
      band(y, 0, trip, C.prod + "44", { dy: 6, h: 10 });
      band(y, trip, resume, `url(#${pid})`);
      band(y, resume, TMAX, C.prod + "44", { dy: 6, h: 10 });
    });
    inLane(LANES[3].y, trip, "paused together", C.ink);
    /* probes */
    probes.forEach(p => {
      const x = xOf(p.t);
      const l = sv("line", { x1: x, x2: x, y1: LANES[3].y - 4, y2: LANES[5].y + 24, "stroke-width": 1.5, "stroke-dasharray": "3 3" }); l.style.stroke = p.ok ? C.ok : C.bad; lanes.appendChild(l);
      const c = sv("circle", { cx: x, cy: LANES[3].y - 8, r: 7, fill: C.bg, "stroke-width": 1.5 }); c.style.stroke = p.ok ? C.ok : C.bad; lanes.appendChild(c);
      txt(lanes, x, LANES[3].y - 4.5, p.ok ? "✓" : "✕", { size: 9.5, anchor: "middle", color: p.ok ? OKT : BADT, weight: 700 });
    });
    /* backlog */
    const by = LANES[6].y, bh = 46, peakY = by + 50 - bh;
    const yQ = q => by + 50 - (q / peakQ) * bh;
    const area = sv("path", { d: `M${xOf(out)},${by + 50} L${xOf(resume)},${peakY} L${xOf(Math.min(TMAX, drained))},${yQ(Math.max(0, peakQ - (DRAIN - RATE) * (Math.min(TMAX, drained) - resume)))} L${xOf(Math.min(TMAX, drained))},${by + 50} Z` });
    area.style.fill = C.retry + "55"; area.style.stroke = C.retry; area.setAttribute("stroke-width", 1.5);
    lanes.appendChild(area);
    txt(lanes, xOf(resume) + 14, peakY + 4, `${Math.round(peakQ).toLocaleString("en-US")} waiting`, { size: 10, color: C.ink, weight: 600 });
    txt(lanes, xOf(resume) + 14, peakY + 17, "drains with backpressure", { size: 9.5, color: C.muted });
    /* healthy neighbour */
    band(LANES[7].y, 0, TMAX, C.ok + "55");
    inLane(LANES[7].y, 0.1, "✓ delivering normally the whole time", OKT);
  }

  function readout(t) {
    const { out, trip, resume, drained, probes, peakQ } = M;
    const x = xOf(t);
    head.setAttribute("x1", x); head.setAttribute("x2", x);
    headT.setAttribute("x", Math.min(X1 - 14, Math.max(X0 + 14, x))); headT.textContent = clockStr(t * 60);
    clipR.setAttribute("width", x);
    if (t < out) f.big("healthy", "search-index answering", OKT);
    else if (t <= trip) f.big(`${Math.min(20, Math.ceil(((t - out) / (trip - out)) * 20))} / 20`, "transient failures in a row", WARNT);
    else if (t < resume) {
      const nextProbe = probes.find(p => p.t > t);
      f.big("paused", `all 3 steps · next half-open probe in ${clockStr((nextProbe.t - t) * 60)}`, WARNT);
    } else if (t < drained) f.big(Math.max(0, Math.round(peakQ - (DRAIN - RATE) * (t - resume))).toLocaleString("en-US"), "left in step 1 · draining with backpressure", C.ink);
    else f.big("drained", "all three steps consuming normally again", OKT);
  }

  const slider = h("input", { type: "range", min: 1, max: 6, step: 0.5, value: L, "aria-label": "Outage length in minutes" });
  const sliderL = h("span", { class: "fx-range-v", text: `${L} min outage` });
  f.actions.append(h("label", { class: "fx-range" }, [slider, sliderL]));
  /* a new outage length shows the whole new timeline */
  slider.addEventListener("input", () => { L = +slider.value; sliderL.textContent = `${L} min outage`; draw(); steps.seek(STEPS.length - 1); readout(TMAX); });
  f.foot.append(
    h("span", { class: "fig-key" }, [h("i", { style: `background:${C.prod}66` }), "step consuming"]),
    h("span", { class: "fig-key" }, [h("i", { style: `background:repeating-linear-gradient(45deg,${C.warn} 0 2px,${C.warn}33 2px 5px)` }), "shared pause"]),
    h("span", { class: "fig-key" }, ["✕ / ✓ half-open probe every 2 min"]),
    h("span", { class: "fig-note", text: "drag across the timeline to scrub" }),
  );

  /* scrub */
  let scrubbing = false;
  const scrubTo = e => {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const t = Math.max(0, Math.min(TMAX, ((p.x - X0) / (X1 - X0)) * TMAX));
    steps.seek(stepAt(t)); readout(t);
  };
  svg.addEventListener("pointerdown", e => { if (e.button) return; scrubbing = true; svg.setPointerCapture(e.pointerId); scrubTo(e); });
  svg.addEventListener("pointermove", e => { if (scrubbing) scrubTo(e); });
  svg.addEventListener("pointerup", () => { scrubbing = false; });
  svg.style.cursor = "ew-resize"; svg.style.touchAction = "pan-y";

  /* each step moves the playhead from one moment of the outage to the next */
  const at = () => [0, M.trip, M.back, M.resume, M.drained, TMAX];
  const sweep = (s, k) => { const [a, b] = at().slice(k, k + 2); return s.tween(Math.max(1200, (b - a) * 850), u => readout(a + (b - a) * u), Kit.ease.linear); };
  const stepAt = t => Math.max(0, at().findIndex((m, k) => k > 0 && t <= m) - 1);
  const failed = () => M.probes.filter(p => !p.ok).map(p => clockStr(p.t * 60));
  const STEPS = [
    {
      title: "503s",
      text: "At 1:00 search-index starts to return 503s. Each retry step counts transient failures in a row. At 20, the step trips.",
      play: s => sweep(s, 0),
    },
    {
      title: "shared pause",
      text: () => "All three retry steps pause together and the main breaker opens. New logs wait in step 1, durably. "
        + (failed().length ? `The half-open probe at ${failed().join(" and ")} fails, so everything stays paused.` : "The first half-open probe is due 2 minutes after the trip."),
      play: s => sweep(s, 1),
    },
    {
      title: "probe ✓",
      text: () => `search-index is back at ${clockStr(M.back * 60)}. The probe at ${clockStr(M.resume * 60)} gets through, so all three steps resume and the main breaker closes.`,
      play: s => sweep(s, 2),
    },
    {
      title: "drain",
      text: () => `${Math.round(M.peakQ).toLocaleString("en-US")} logs waited in step 1. They drain with backpressure, so the backlog doesn't knock search-index down again.`,
      play: s => sweep(s, 3),
    },
    {
      title: "drained",
      text: "All three steps consume normally again. email-service delivered normally the whole time.",
      play: s => sweep(s, 4),
    },
  ];
  f.status("email-service: unaffected ✓", OKT);
  draw();
  const steps = f.steps(STEPS, { reset: () => readout(0) });
});

/* ======================================================================
   Figure: where a log lives while its destination is down
   ====================================================================== */
Kit.figure("retention", f => {
  f.chrome({ tag: "retention", label: "where the log lives" });
  const svg = f.svg(880, 214, { label: "Days 0 to 16: main topic keeps 7 days, DLQ keeps 14, logs older than 10 days in the DLQ move to S3", minWidth: 660 });
  const X0 = 190, X1 = 862, DMAX = 16;
  const xOf = d => X0 + (d / DMAX) * (X1 - X0);
  const bg = sv("g"), bars = sv("g"), top = sv("g");
  svg.append(bg, bars, top);
  const ROWS = [
    { y: 18, label: "main topic", sub: "7 day retention", from: 0, to: 7, color: C.kafka },
    { y: 58, label: "retry topics", sub: "~6 minutes, then DLQ", from: 0, to: 0.0045, color: C.retry },
    { y: 98, label: "DLQ", sub: "14 day retention", from: 0, to: 10, ghost: 14, color: C.bad },
    { y: 138, label: "S3 archive", sub: "daily worker", from: 10, to: DMAX, color: C.muted },
  ];
  ROWS.forEach(r => {
    txt(bg, X0 - 14, r.y + 13, r.label, { size: 11.5, anchor: "end", color: C.soft, weight: 600 });
    txt(bg, X0 - 14, r.y + 26, r.sub, { size: 9.5, anchor: "end", color: C.faint });
    const base = sv("line", { x1: X0, x2: X1, y1: r.y + 12, y2: r.y + 12 }); base.style.stroke = C.line; bg.appendChild(base);
    if (r.ghost) {
      const g = sv("rect", { x: xOf(r.to), y: r.y + 2, width: xOf(r.ghost) - xOf(r.to), height: 20, rx: 0, fill: "none", "stroke-dasharray": "3 3", "stroke-width": 1.2 });
      g.style.stroke = C.faint; bars.appendChild(g);
      txt(bars, xOf(r.to) + 8, r.y + 16, "moved before retention ends", { size: 9.5, color: C.faint });
    }
    r.bar = sv("rect", { x: xOf(r.from), y: r.y + 2, width: Math.max(3, xOf(r.to) - xOf(r.from)), height: 20, rx: 0, fill: r.color + "aa" });
    r.bar.style.transition = "opacity .25s ease";
    bars.appendChild(r.bar);
  });
  [7, 10, 14].forEach(d => {
    const l = sv("line", { x1: xOf(d), x2: xOf(d), y1: 10, y2: 168, "stroke-dasharray": "2 4" }); l.style.stroke = C.line2; bg.appendChild(l);
  });
  for (let d = 0; d <= DMAX; d += 2) txt(bg, xOf(d), 186, "day " + d, { size: 9.5, anchor: "middle", color: C.faint });
  const head = sv("line", { y1: 8, y2: 172, "stroke-width": 1.6 }); head.style.stroke = C.accent; top.appendChild(head);

  const slider = h("input", { type: "range", min: 0, max: DMAX, step: 0.1, value: 0, "aria-label": "Days since the destination went down" });
  f.actions.append(h("label", { class: "fx-range" }, [slider, h("span", { class: "fx-range-v", text: "drag the day" })]));

  function at(d) {
    head.setAttribute("x1", xOf(d)); head.setAttribute("x2", xOf(d));
    slider.value = d;
    ROWS.forEach(r => { r.bar.style.opacity = d >= r.from && d < r.to + (r.to < 1 ? 0.15 : 0) ? 1 : 0.35; });
    const day = Math.floor(d);
    if (d < 7) {
      f.big(`day ${day}`, "in the main topic and the DLQ · on-call can replay it", C.ink);
      f.status("destination down since day 0 · DLQ alert sent", WARNT);
    } else if (d < 10) {
      f.big(`day ${day}`, "main topic copy expired · still safe in the DLQ", C.ink);
      f.status("7 days on main topics, 14 on retry and DLQ");
    } else {
      f.big(`day ${day}`, "archived to S3 · nothing is lost when DLQ retention runs out", OKT);
      f.status(d >= 14 ? "✓ past DLQ retention, safe in S3" : "daily worker moved it after 10 days", OKT);
    }
  }
  /* each step is one stretch between retention boundaries; it stops just short of the next boundary,
     so the readout still describes this stretch (the last one runs to the end) */
  const DAYS = [0, 7, 10, 14, DMAX];
  const sweep = (s, k) => {
    const a = DAYS[k], b = k + 2 < DAYS.length ? DAYS[k + 1] - 0.05 : DMAX;
    return s.tween(Math.max(1200, (b - a) * 420), u => at(a + (b - a) * u), Kit.ease.inOut);
  };
  const stepAt = d => DAYS.slice(1, -1).filter(m => d >= m).length;
  slider.addEventListener("input", () => { steps.seek(stepAt(+slider.value)); at(+slider.value); });
  const STEPS = [
    {
      title: "days 0–7",
      text: "The destination goes down on day 0. After about 6 minutes of retries the log is in the DLQ, and on-call gets an alert. The main topic still has its copy too.",
      play: s => sweep(s, 0),
    },
    {
      title: "day 7",
      text: "The main topic keeps logs for 7 days, so that copy expires. The log is still safe in the DLQ, and on-call can still replay it.",
      play: s => sweep(s, 1),
    },
    {
      title: "day 10",
      text: "The daily worker moves DLQ logs older than 10 days to the S3 archive.",
      play: s => sweep(s, 2),
    },
    {
      title: "day 14",
      text: "DLQ retention ends at day 14. The log is already in S3, so nothing is lost.",
      play: s => sweep(s, 3),
    },
  ];
  const steps = f.steps(STEPS, { reset: () => at(0) });
});
