/* ═══════════════════════════════════════════════════════════════
   VariableProximity — vanilla port of react-bits/VariableProximity.
   Each letter of the hero copy interpolates its variable-font weight
   toward the cursor, by distance.

   Axis note: this site loads Archivo with `wdth 62.5..125, wght 100..900`
   and no `opsz`, so upstream's 'opsz' axis does not exist here. Only
   'wght' is driven — animating 'wdth' would reflow the line every frame
   and could change where it wraps.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var TARGETS = [
    { sel: '.hero-title .hl-inner', from: "'wght' 400", to: "'wght' 900", radius: 110 },
    { sel: '.hero-tag .ht-inner', from: "'wght' 400", to: "'wght' 750", radius: 90 }
  ];
  var FALLOFF = 'linear';

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.matchMedia('(hover: none)').matches) return;   // no cursor to be near

  function parse(str) {
    var map = {};
    str.split(',').forEach(function (part) {
      var bits = part.trim().split(' ');
      map[bits[0].replace(/['"]/g, '')] = parseFloat(bits[1]);
    });
    return map;
  }

  /* Split every text node into per-letter spans, preserving the element
     structure around them (the third hero line contains an <em>). */
  function splitLetters(root, bucket) {
    var nodes = [];
    (function walk(node) {
      for (var i = 0; i < node.childNodes.length; i++) {
        var child = node.childNodes[i];
        if (child.nodeType === 3 && child.textContent.length) nodes.push(child);
        else if (child.nodeType === 1 && !child.classList.contains('vp-letter')) walk(child);
      }
    })(root);

    nodes.forEach(function (textNode) {
      var frag = document.createDocumentFragment();
      /* Letters are inline-block, so they would otherwise be individual break
         opportunities and a word could split across two lines. Each word gets a
         nowrap wrapper (as upstream does) so wrapping only happens at spaces. */
      textNode.textContent.split(/(\s+)/).forEach(function (token) {
        if (!token) return;
        if (/^\s+$/.test(token)) {
          frag.appendChild(document.createTextNode(' '));
          return;
        }
        var word = document.createElement('span');
        word.className = 'vp-word';
        token.split('').forEach(function (ch) {
          var span = document.createElement('span');
          span.className = 'vp-letter';
          span.textContent = ch;
          span.setAttribute('aria-hidden', 'true');
          word.appendChild(span);
          bucket.push(span);
        });
        frag.appendChild(word);
      });
      textNode.parentNode.replaceChild(frag, textNode);
    });
  }

  var letters = [];   // { el, from, radius, axes }

  function build() {
    TARGETS.forEach(function (t) {
      var els = document.querySelectorAll(t.sel);
      if (!els.length) return;
      var from = parse(t.from), to = parse(t.to);
      var axes = Object.keys(from).map(function (a) {
        return { axis: a, from: from[a], to: to[a] === undefined ? from[a] : to[a] };
      });

      Array.prototype.forEach.call(els, function (el) {
        if (el.dataset.vpDone) return;

        /* Keep the wording available to screen readers — the letter spans are
           aria-hidden, exactly as upstream does it. */
        var sr = document.createElement('span');
        sr.className = 'sr-only';
        sr.textContent = el.textContent.replace(/\s+/g, ' ').trim();

        var bucket = [];
        splitLetters(el, bucket);
        el.appendChild(sr);
        el.dataset.vpDone = '1';

        bucket.forEach(function (span) {
          span.style.fontVariationSettings = t.from;
          letters.push({ el: span, from: t.from, radius: t.radius, axes: axes });
        });
      });
    });
  }

  /* ── cursor tracking + rAF loop (upstream behaviour) ───────────── */
  var mouse = { x: -9999, y: -9999 };
  var lastX = null, lastY = null;
  window.addEventListener('mousemove', function (e) {
    mouse.x = e.clientX; mouse.y = e.clientY;
  }, { passive: true });

  function falloffValue(distance, radius) {
    var norm = Math.min(Math.max(1 - distance / radius, 0), 1);
    if (FALLOFF === 'exponential') return norm * norm;
    if (FALLOFF === 'gaussian') return Math.exp(-Math.pow(distance / (radius / 2), 2) / 2);
    return norm;
  }

  function tick() {
    if (mouse.x !== lastX || mouse.y !== lastY) {
      lastX = mouse.x; lastY = mouse.y;
      for (var i = 0; i < letters.length; i++) {
        var L = letters[i];
        var r = L.el.getBoundingClientRect();
        if (!r.width) continue;
        var dx = mouse.x - (r.left + r.width / 2);
        var dy = mouse.y - (r.top + r.height / 2);
        var d = Math.sqrt(dx * dx + dy * dy);

        if (d >= L.radius) {
          L.el.style.fontVariationSettings = L.from;
          continue;
        }
        var f = falloffValue(d, L.radius);
        L.el.style.fontVariationSettings = L.axes.map(function (a) {
          return "'" + a.axis + "' " + (a.from + (a.to - a.from) * f).toFixed(1);
        }).join(', ');
      }
    }
    requestAnimationFrame(tick);
  }

  /* Build after load so the split never races the hero intro reveal
     (main.js animates .hl-inner itself, not its characters). */
  function boot() {
    build();
    if (letters.length) requestAnimationFrame(tick);
  }
  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);

  window.__variableProximity = { letters: letters, build: build, boot: boot, tick: tick, mouse: mouse };
})();
