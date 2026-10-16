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
      if (best && byId[best.id]) byId[best.id].classList.add("active");
    };
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { visible[e.target.id] = e.isIntersecting; }); setActive(); }, { rootMargin: "0px 0px -60% 0px" });
    heads.forEach(function (h) { io.observe(h); });
    addEventListener("scroll", function () { requestAnimationFrame(setActive); }, { passive: true });
    setActive();
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
})();
