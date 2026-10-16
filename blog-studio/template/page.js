/* Blog page runtime: reading progress, back to top, toc, previews, code copy, lab chrome, and the Kit API for simulations. */
(function () {
  "use strict";
  var doc = document, root = doc.documentElement;

  /* ---------- theme ----------
     The site is light only. The studio preview can force a theme via data-theme, and Kit.onTheme
     listeners still fire when that attribute changes. */
  var themeListeners = [];
  function currentTheme() { return root.getAttribute("data-theme") === "dark" ? "dark" : "light"; }
  new MutationObserver(function () {
    var t = currentTheme();
    themeListeners.slice().forEach(function (fn) { try { fn(t); } catch (e) { console.error(e); } });
  }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  /* ---------- reading progress + back to top ---------- */
  var prog = doc.querySelector(".progress"), toTop = doc.querySelector(".to-top"), ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var y = window.scrollY, max = Math.max(1, doc.documentElement.scrollHeight - innerHeight);
      if (prog) prog.style.width = (Math.min(1, y / max) * 100).toFixed(2) + "%";
      if (toTop) toTop.classList.toggle("show", y > 400);
    });
  }
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  if (toTop) toTop.addEventListener("click", function () { scrollTo({ top: 0, behavior: "smooth" }); });

  /* ---------- writing previews (blog index) ---------- */
  var previewLinks = doc.querySelectorAll(".post-link[data-preview-body]");
  if (previewLinks.length && window.matchMedia && matchMedia("(hover: hover)").matches) {
    var pop = doc.createElement("div"), current = null;
    pop.className = "popover"; pop.setAttribute("aria-hidden", "true");
    pop.innerHTML = '<h3></h3><p class="meta"></p><p class="body"></p>';
    doc.body.appendChild(pop);
    var show = function (a) {
      current = a;
      pop.querySelector("h3").textContent = a.textContent.trim();
      pop.querySelector(".meta").textContent = [a.dataset.previewDate, a.dataset.previewMinutes && a.dataset.previewMinutes + " min read"].filter(Boolean).join(" · ");
      pop.querySelector(".body").textContent = a.dataset.previewBody;
      var r = a.getBoundingClientRect(), gap = 8, h = pop.offsetHeight;
      var top = r.bottom + gap + h <= innerHeight ? r.bottom + gap : r.top - gap - h;
      pop.style.top = Math.max(8, top) + "px";
      pop.style.left = Math.max(8, Math.min(r.left, innerWidth - pop.offsetWidth - 16)) + "px";
      pop.classList.add("show");
    };
    var hide = function () { current = null; pop.classList.remove("show"); };
    previewLinks.forEach(function (a) {
      a.addEventListener("mouseenter", function () { show(a); });
      a.addEventListener("focus", function () { show(a); });
      a.addEventListener("mouseleave", hide);
      a.addEventListener("blur", hide);
    });
    addEventListener("scroll", function () {
      if (!current) return;
      if (current.matches(":hover") || current === doc.activeElement) show(current); else hide();
    }, { passive: true });
  }

  /* ---------- toc highlight ---------- */
  var tocLinks = [].slice.call(doc.querySelectorAll(".toc a"));
  if (tocLinks.length && "IntersectionObserver" in window) {
    var byId = {}, heads = [];
    tocLinks.forEach(function (a) {
      var id = decodeURIComponent(a.getAttribute("href").slice(1)), h = doc.getElementById(id);
      if (h) { byId[id] = a; heads.push(h); }
    });
    var visible = {};
    var setActive = function () {
      var best = null;
      for (var i = 0; i < heads.length; i++) {
        if (heads[i].getBoundingClientRect().top < innerHeight * 0.35) best = heads[i]; else break;
      }
      tocLinks.forEach(function (a) { a.classList.remove("active"); });
      var on = best && byId[best.id];
      if (on) {
        on.classList.add("active");
        /* in the side toc, keep the active entry inside the toc's own scroll area (never scrolls the page) */
        var box = on.closest(".toc");
        if (box && box.scrollHeight > box.clientHeight) {
          var top = on.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop, pad = 40;
          if (top < box.scrollTop + pad) box.scrollTop = Math.max(0, top - pad);
          else if (top + on.offsetHeight > box.scrollTop + box.clientHeight - pad) box.scrollTop = top + on.offsetHeight - box.clientHeight + pad;
        }
      }
    };
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { visible[e.target.id] = e.isIntersecting; }); setActive(); }, { rootMargin: "0px 0px -60% 0px" });
    heads.forEach(function (h) { io.observe(h); });
    addEventListener("scroll", function () { requestAnimationFrame(setActive); }, { passive: true });
    setActive();
  }

  /* toc in the side gutter (wide screens) hides while the wide simulation lab is on screen */
  var tocEl = doc.querySelector(".toc"), labWrap = doc.querySelector(".lab-wrap");
  if (tocEl && labWrap && "IntersectionObserver" in window) {
    new IntersectionObserver(function (es) { tocEl.classList.toggle("away", es[0].isIntersecting); }).observe(labWrap);
  }

  /* ---------- code copy ---------- */
  doc.querySelectorAll(".code .copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var code = btn.closest(".code").querySelector("pre code");
      var txt = code ? code.textContent : "";
      var done = function () { btn.textContent = "Copied"; btn.classList.add("done"); setTimeout(function () { btn.textContent = "Copy"; btn.classList.remove("done"); }, 1400); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () {});
      else { var ta = doc.createElement("textarea"); ta.value = txt; doc.body.appendChild(ta); ta.select(); try { doc.execCommand("copy"); done(); } catch (e) {} ta.remove(); }
    });
  });

  /* ---------- lab: fullscreen ---------- */
  doc.querySelectorAll(".lab").forEach(function (lab) {
    lab.querySelectorAll("[data-fullscreen]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var fsEl = doc.fullscreenElement || doc.webkitFullscreenElement;
        if (fsEl) { (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc); return; }
        if (lab.classList.contains("fake-fs")) { lab.classList.remove("fake-fs"); doc.body.style.overflow = ""; return; }
        var req = lab.requestFullscreen || lab.webkitRequestFullscreen;
        if (req) { var p = req.call(lab); if (p && p.catch) p.catch(fakeFs); }
        else fakeFs();
        function fakeFs() { lab.classList.add("fake-fs"); doc.body.style.overflow = "hidden"; }
      });
    });
  });

  /* ---------- Kit: the API simulations are written against ---------- */
  var labEl = doc.querySelector(".lab"), labVisible = true;
  if (labEl && "IntersectionObserver" in window) {
    new IntersectionObserver(function (es) { labVisible = es[0].isIntersecting; }, { rootMargin: "300px 0px" }).observe(labEl);
  }
  var cs = function () { return getComputedStyle(root); };
  var Kit = {
    version: 1,
    root: doc.querySelector(".lab-body"),
    /* canvas text was laid out for a proportional face; mono overflows the diagram boxes */
    font: { sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', mono: '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace' },
    get theme() { return currentTheme(); },
    reducedMotion: !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches),
    /* read one CSS custom property, e.g. Kit.css("--accent") */
    css: function (name) { return cs().getPropertyValue(name.indexOf("--") === 0 ? name : "--" + name).trim(); },
    /* read many at once: Kit.colors(["accent", "ok"]) -> { accent: "#8b5cf6", ok: "..." } */
    colors: function (names) { var s = cs(), o = {}; names.forEach(function (n) { o[n] = s.getPropertyValue("--" + n.replace(/^--/, "")).trim(); }); return o; },
    /* run fn(theme) whenever light/dark changes; returns an unsubscribe function */
    onTheme: function (fn) { themeListeners.push(fn); return function () { themeListeners = themeListeners.filter(function (f) { return f !== fn; }); }; },
    /* animation loop, fn(dtSeconds, nowMs). Skips frames while the lab is off screen or the tab is hidden. */
    loop: function (fn, opts) {
      opts = opts || {}; var maxDt = opts.maxDt || 0.1, last = performance.now(), stopped = false;
      function frame(now) {
        if (stopped) return;
        var dt = Math.min(maxDt, (now - last) / 1000); last = now;
        if ((labVisible || opts.always) && !doc.hidden) {
          try { fn(dt, now); } catch (e) { stopped = true; Kit.fail(e); return; }
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
      return { stop: function () { stopped = true; } };
    },
    /* size a canvas to its container for a logical width x height scene; returns { ctx, scale, dpr } with the
       transform already applied so you draw in logical units */
    fitCanvas: function (canvas, w, h, opts) {
      opts = opts || {};
      var box = opts.container || canvas.parentElement, avail = Math.max(0, box.clientWidth - 2);
      var scale = Math.min(opts.max || 1.25, Math.max(avail / w, opts.min || 0.5)), dpr = window.devicePixelRatio || 1;
      var cw = Math.round(w * scale), ch = Math.round(h * scale);
      if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
        canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
        canvas.style.width = cw + "px"; canvas.style.height = ch + "px";
      }
      var ctx = canvas.getContext("2d"); ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
      return { ctx: ctx, scale: scale, dpr: dpr };
    },
    /* resolves once web fonts are loaded so canvas text measures correctly */
    ready: doc.fonts && doc.fonts.ready ? doc.fonts.ready.then(function () {}) : Promise.resolve(),
    esc: function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); },
    /* show a readable error inside the lab instead of a blank box */
    fail: function (err) {
      console.error(err);
      if (!Kit.root) return;
      var pre = doc.createElement("pre"); pre.className = "lab-error";
      pre.textContent = "The simulation hit an error and stopped.\n\n" + (err && (err.stack || err.message) || err);
      Kit.root.prepend(pre);
    }
  };
  window.Kit = Kit;

  /* ---------- figures: small animated scenes placed with `::figure <id>` lines ----------
     figures.js registers each one with Kit.figure(id, function (f) { ... }). Every figure gets its own
     clock that only runs while the figure is on screen, so waits and tweens pause when scrolled away. */
  var SVGNS = "http://www.w3.org/2000/svg", CANCEL = {}, figs = [];
  function build(ns, tag, attrs, kids) {
    var el = ns ? doc.createElementNS(ns, tag) : doc.createElement(tag);
    for (var k in attrs || {}) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    (kids || []).forEach(function (c) { if (c != null) el.appendChild(typeof c === "string" ? doc.createTextNode(c) : c); });
    return el;
  }
  /* Kit.h("div", { class: "x", text: "hi", onclick: fn }, [children]) and the SVG twin Kit.s("rect", {...}) */
  Kit.h = function (tag, attrs, kids) { return build(null, tag, attrs, kids); };
  Kit.s = function (tag, attrs, kids) { return build(SVGNS, tag, attrs, kids); };
  Kit.ease = {
    linear: function (t) { return t; },
    out: function (t) { return 1 - Math.pow(1 - t, 3); },
    inOut: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
  };
  Kit.lerp = function (a, b, t) { return a + (b - a) * t; };

  function makeFigure(el) {
    var panel = el.querySelector(".fig-panel"), jobs = [], frames = [], token = null, enter = [], entered = false;
    var f = {
      el: el, panel: panel, id: el.getAttribute("data-figure"),
      time: 0, visible: false, speed: 1, reducedMotion: Kit.reducedMotion,
      h: Kit.h, s: Kit.s,
      /* header + big readout + actions + stage, laid out like every other figure */
      chrome: function (o) {
        o = o || {};
        var head = Kit.h("div", { class: "fig-head" }, [
          Kit.h("span", { class: "fig-tags" }, [
            o.tag ? Kit.h("span", { class: "fig-pill", text: "✻ " + o.tag }) : null,
            o.label ? Kit.h("span", { class: "fig-label", text: o.label }) : null,
          ]),
          f.statusEl = Kit.h("span", { class: "fig-status", "aria-live": "polite" }),
        ]);
        var bar = Kit.h("div", { class: "fig-bar" }, [
          Kit.h("div", { class: "fig-big" }, [f.bigEl = Kit.h("b"), f.unitEl = Kit.h("span")]),
          f.actions = Kit.h("div", { class: "fig-actions" }),
        ]);
        f.stage = Kit.h("div", { class: "fig-stage" + (o.stageClass ? " " + o.stageClass : "") });
        f.foot = Kit.h("div", { class: "fig-foot" });
        panel.append(head, bar, f.stage, f.foot);
        return f;
      },
      status: function (text, color) { f.statusEl.textContent = text; f.statusEl.style.color = color || ""; },
      big: function (value, unit, color) {
        f.bigEl.textContent = value; f.bigEl.style.color = color || "";
        if (unit != null) f.unitEl.textContent = unit;
      },
      button: function (label, onClick, o) {
        o = o || {};
        var b = Kit.h("button", { type: "button", class: "fig-btn" + (o.primary ? " primary" : ""), text: label, onclick: onClick });
        (o.parent || f.actions).appendChild(b); return b;
      },
      /* segmented control: f.segmented([["all", "acks=all"], ["1", "acks=1"]], "all", fn) */
      segmented: function (options, value, onChange, o) {
        o = o || {};
        var wrap = Kit.h("div", { class: "fig-seg", role: "group", "aria-label": o.label || "" }), btns = [];
        var set = function (v, fire) {
          value = v;
          btns.forEach(function (b) { var on = b.dataset.v === String(v); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
          if (fire) onChange(v);
        };
        options.forEach(function (opt) {
          var b = Kit.h("button", { type: "button", "data-v": opt[0], text: opt[1], onclick: function () { if (String(value) !== opt[0]) set(opt[0], true); } });
          btns.push(b); wrap.appendChild(b);
        });
        set(value, false);
        (o.parent || f.actions).appendChild(wrap);
        return { get value() { return value; }, set: set };
      },
      svg: function (w, h, o) {
        o = o || {};
        var svg = Kit.s("svg", { viewBox: "0 0 " + w + " " + h, class: "fig-svg", role: "img", "aria-label": o.label || "" });
        if (o.minWidth) { svg.style.minWidth = o.minWidth + "px"; (o.parent || f.stage).classList.add("fig-wide"); }
        (o.parent || f.stage).appendChild(svg); return svg;
      },
      /* per-frame callback while visible: fn(dtSeconds, figureTimeMs) */
      loop: function (fn) { frames.push(fn); },
      /* first time the figure is mostly on screen; replays start from here */
      onEnter: function (fn) { if (entered) fn(); else enter.push(fn); },
      /* run an async sequence; starting a new one cancels the old. s.wait(ms), s.tween(ms, fn, ease) */
      run: function (fn) {
        if (token) token.dead = true;
        var tk = token = { dead: false };
        jobs = jobs.filter(function (j) { return !j.tk.dead; });
        var add = function (j) {
          return new Promise(function (res, rej) {
            if (tk.dead) return rej(CANCEL);
            j.tk = tk; j.start = f.time; j.res = res; jobs.push(j);
          });
        };
        var s = {
          get alive() { return !tk.dead; },
          wait: function (ms) { return add({ dur: ms }); },
          tween: function (ms, cb, ease) {
            if (f.reducedMotion) { cb(1); return s.wait(Math.min(ms, 120)); }
            return add({ dur: ms, cb: cb, ease: ease || Kit.ease.inOut });
          },
        };
        return Promise.resolve().then(function () { return fn(s); }).catch(function (e) { if (e !== CANCEL) f.fail(e); });
      },
      stop: function () { if (token) token.dead = true; jobs = []; },
      fail: function (err) {
        console.error(err);
        panel.prepend(Kit.h("pre", { class: "fig-error", text: "Figure \"" + f.id + "\" hit an error.\n\n" + (err && (err.stack || err.message) || err) }));
      },
      _tick: function (dt) {
        f.time += dt * 1000 * f.speed;
        var list = jobs.slice();
        for (var i = 0; i < list.length; i++) {
          var j = list[i];
          if (j.tk.dead) continue;
          var p = j.dur > 0 ? Math.min(1, (f.time - j.start) / j.dur) : 1;
          if (j.cb) j.cb(j.ease(p));
          if (p >= 1) { jobs.splice(jobs.indexOf(j), 1); j.res(); }
        }
        for (var k = 0; k < frames.length; k++) frames[k](dt, f.time);
      },
      _enter: function () { if (entered) return; entered = true; enter.splice(0).forEach(function (fn) { fn(); }); },
    };
    return f;
  }

  /* point and tangent angle at fraction t of an SVG path */
  Kit.pointAt = function (path, t) {
    var len = path.getTotalLength(), p = path.getPointAtLength(Math.max(0, Math.min(1, t)) * len);
    return { x: p.x, y: p.y };
  };

  var figIO = "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      var f = e.target.__fig; if (!f) return;
      f.visible = e.isIntersecting;
      if (e.intersectionRatio >= 0.35 || (e.isIntersecting && e.boundingClientRect.height > innerHeight)) f._enter();
    });
  }, { threshold: [0, 0.35, 0.6] }) : null;

  var figLast = 0, figLooping = false;
  function figFrame(now) {
    var dt = figLast ? Math.min(0.1, (now - figLast) / 1000) : 0; figLast = now;
    if (!doc.hidden) figs.forEach(function (f) { if (f.visible) { try { f._tick(dt); } catch (e) { f.visible = false; f.fail(e); } } });
    requestAnimationFrame(figFrame);
  }

  Kit.figure = function (id, setup) {
    var els = doc.querySelectorAll('figure.fig[data-figure="' + id + '"]');
    if (!els.length) { console.warn('Kit.figure("' + id + '"): the article has no "::figure ' + id + '" line'); return; }
    els.forEach(function (el) {
      if (el.__fig) return;
      el.querySelector(".fig-panel").innerHTML = "";
      el.classList.add("mounted");
      var f = el.__fig = makeFigure(el);
      figs.push(f);
      try { setup(f); } catch (e) { f.fail(e); }
      if (figIO) figIO.observe(el); else { f.visible = true; f._enter(); }
    });
    if (!figLooping) { figLooping = true; requestAnimationFrame(figFrame); }
  };
  /* called after figures.js: flag ::figure lines that nothing registered */
  Kit.figuresReady = function () {
    doc.querySelectorAll("figure.fig:not(.mounted) .fig-fallback").forEach(function (p) {
      var id = p.closest("figure").getAttribute("data-figure");
      console.warn('No Kit.figure("' + id + '") in figures.js');
    });
  };
})();
