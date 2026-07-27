/* ═══════════════════════════════════════════════════════════════
   LineSidebar — vanilla port of react-bits/LineSidebar (JS + CSS)
   as a persistent section rail down the left gutter.

   Same proximity engine as upstream: one rAF loop eases each item's
   --effect toward its target with frame-rate independent smoothing,
   and CSS derives colour, shift and marker scale from that value.

   Added on top of upstream: scroll-spy (the active item follows the
   section in view), click-to-scroll through Lenis, and a guarantee it
   never sits over content — the rail only appears when the viewport is
   wide enough to hold it in the page gutter.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* Mirrors the menu overlay so the two navigations agree.
     `id` is where a click scrolls to; `spy` is every section that lights the
     item up, so one label can cover a run of sections. */
  var ITEMS = [
    { label: 'Home', id: 'hero', spy: ['hero', 'film'] },
    { label: 'Services', id: 'services', spy: ['services', 'process', 'engage'] },
    { label: 'Newsletter', id: 'statement', spy: ['statement', 'newsletter'] },
    { label: 'Contact', id: 'contact', spy: ['contact'] }
  ];

  var OPTS = {
    accentColor: '#C99763',   // Primary
    textColor: '#8F8A84',     // Muted
    markerColor: '#8F8A84',   // Muted
    proximityRadius: 100,
    maxShift: 14,             // upstream 30 — trimmed so labels stay inside the gutter
    falloff: 'smooth',
    markerLength: 40,
    markerGap: 0,
    tickScale: 0.5,
    itemGap: 18,
    fontSize: 0.78,
    smoothing: 100,
    minViewport: 1280         // below this the rail is not shown at all
  };

  var FALLOFF = {
    linear: function (p) { return p; },
    smooth: function (p) { return p * p * (3 - 2 * p); },
    sharp: function (p) { return p * p * p; }
  };

  if (window.matchMedia('(hover: none)').matches) return;   // touch: no cursor to be near

  /* ── build ─────────────────────────────────────────────────────── */
  var nav = document.createElement('nav');
  nav.className = 'line-sidebar line-sidebar--markers line-sidebar--scale-tick';
  nav.setAttribute('aria-label', 'Section navigation');
  nav.style.cssText =
    '--accent-color:' + OPTS.accentColor + ';' +
    '--text-color:' + OPTS.textColor + ';' +
    '--marker-color:' + OPTS.markerColor + ';' +
    '--marker-length:' + OPTS.markerLength + 'px;' +
    '--marker-gap:' + OPTS.markerGap + 'px;' +
    '--tick-scale:' + OPTS.tickScale + ';' +
    '--max-shift:' + OPTS.maxShift + 'px;' +
    '--item-gap:' + OPTS.itemGap + 'px;' +
    '--font-size:' + OPTS.fontSize + 'rem;' +
    '--smoothing:' + OPTS.smoothing + 'ms;';

  var list = document.createElement('ul');
  list.className = 'line-sidebar__list';
  nav.appendChild(list);

  var els = ITEMS.map(function (item, i) {
    var li = document.createElement('li');
    li.className = 'line-sidebar__item';
    li.innerHTML =
      '<span class="line-sidebar__marker" aria-hidden="true"></span>' +
      '<a class="line-sidebar__label" href="#' + item.id + '" data-cursor="hover">' +
      '<span class="line-sidebar__index">' + String(i + 1).padStart(2, '0') + '</span>' +
      '<span class="line-sidebar__text">' + item.label + '</span>' +
      '</a>';
    list.appendChild(li);
    return li;
  });

  document.body.appendChild(nav);

  /* ── proximity engine (upstream logic) ─────────────────────────── */
  var targets = els.map(function () { return 0; });
  var current = els.map(function () { return 0; });
  var activeIndex = 0;
  var raf = null, last = 0;

  function runFrame(now) {
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    var tau = Math.max(OPTS.smoothing, 1) / 1000;
    var k = 1 - Math.exp(-dt / tau);

    var moving = false;
    for (var i = 0; i < els.length; i++) {
      var target = Math.max(targets[i] || 0, activeIndex === i ? 1 : 0);
      var cur = current[i] || 0;
      var next = cur + (target - cur) * k;
      var settled = Math.abs(target - next) < 0.0015;
      var value = settled ? target : next;
      current[i] = value;
      els[i].style.setProperty('--effect', value.toFixed(4));
      if (!settled) moving = true;
    }
    raf = moving ? requestAnimationFrame(runFrame) : null;
  }
  function startLoop() {
    if (raf != null) return;
    last = performance.now();
    raf = requestAnimationFrame(runFrame);
  }

  /* The rail is narrow, so proximity tracks the cursor anywhere down the left
     edge rather than only while it is over the list itself. */
  window.addEventListener('pointermove', function (e) {
    var rect = list.getBoundingClientRect();
    var withinReach = e.clientX <= rect.right + 120;
    var ease = FALLOFF[OPTS.falloff] || FALLOFF.linear;
    for (var i = 0; i < els.length; i++) {
      if (!withinReach) { targets[i] = 0; continue; }
      var r = els[i].getBoundingClientRect();
      var center = r.top + r.height / 2;
      targets[i] = ease(Math.max(0, 1 - Math.abs(e.clientY - center) / OPTS.proximityRadius));
    }
    startLoop();
  }, { passive: true });

  document.addEventListener('mouseleave', function () {
    targets = targets.map(function () { return 0; });
    startLoop();
  });

  /* ── scroll-spy ────────────────────────────────────────────────── */
  var sections = [];
  ITEMS.forEach(function (item, idx) {
    item.spy.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) sections.push({ el: el, idx: idx });
    });
  });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var hit = sections.filter(function (s) { return s.el === entry.target; })[0];
        var idx = hit ? hit.idx : -1;
        if (idx > -1 && idx !== activeIndex) {
          activeIndex = idx;
          els.forEach(function (el, i) {
            if (i === activeIndex) el.setAttribute('aria-current', 'true');
            else el.removeAttribute('aria-current');
          });
          startLoop();
        }
      });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    sections.forEach(function (s) { io.observe(s.el); });
  }

  /* ── click → smooth scroll (Lenis owns scrolling on this site) ─── */
  list.addEventListener('click', function (e) {
    var link = e.target.closest('.line-sidebar__label');
    if (!link) return;
    var target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    if (window.lenis && typeof window.lenis.scrollTo === 'function') window.lenis.scrollTo(target);
    else target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ── never overlay content ─────────────────────────────────────────
     The rail is shown only when the viewport is wide enough for it to sit in
     the page gutter; below that it is hidden entirely (the CSS carries the
     same breakpoint as a belt-and-braces guard). */
  function fit() {
    nav.classList.toggle('is-visible', window.innerWidth >= OPTS.minViewport);
  }
  fit();
  window.addEventListener('resize', fit, { passive: true });

  /* Never overlay content — measured, not assumed.
     Several sections reclaim this column as you scroll (the film stage is
     full-bleed; the Process track, Services rows and glitch marquee all
     translate horizontally through it). Rather than hard-coding that list, the
     rail hit-tests its own footprint: if anything carrying text is under it, it
     parks (fades out) until the column is clear again. */
  var railPoints = [0.08, 0.3, 0.5, 0.7, 0.92];
  function hasTextUnderRail() {
    var r = nav.getBoundingClientRect();
    var xs = [r.left + 2, (r.left + r.right) / 2, r.right - 2];
    for (var i = 0; i < railPoints.length; i++) {
      var y = r.top + r.height * railPoints[i];
      for (var j = 0; j < xs.length; j++) {
        var stack = document.elementsFromPoint(xs[j], y);
        for (var k = 0; k < stack.length; k++) {
          var el = stack[k];
          if (nav.contains(el) || el === document.body || el === document.documentElement) continue;
          if (el.tagName === 'CANVAS' || el.tagName === 'VIDEO' || el.tagName === 'IMG') continue;
          // only a node with its own text counts — wrappers don't
          for (var n = 0; n < el.childNodes.length; n++) {
            var node = el.childNodes[n];
            if (node.nodeType === 3 && node.textContent.trim()) return true;
          }
        }
      }
    }
    return false;
  }

  var parkQueued = false;
  function parkCheck() {
    parkQueued = false;
    if (!nav.classList.contains('is-visible')) return;
    nav.classList.toggle('is-parked', hasTextUnderRail());
  }
  function queueParkCheck() {
    if (parkQueued) return;
    parkQueued = true;
    requestAnimationFrame(parkCheck);
  }
  window.addEventListener('scroll', queueParkCheck, { passive: true });
  window.addEventListener('resize', queueParkCheck, { passive: true });
  parkCheck();

  window.__lineSidebarParkCheck = parkCheck;   // forced check when rAF is frozen

  startLoop();

  window.__lineSidebar = { nav: nav, items: els, opts: OPTS, fit: fit };
})();
