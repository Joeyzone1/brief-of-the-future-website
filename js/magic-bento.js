/* ═══════════════════════════════════════════════════════════════
   MagicBento effects — vanilla port of react-bits/MagicBento
   (JS + CSS variant), applied to the cards this site already has
   rather than the demo's 6-card grid of placeholder content.

   Effects: global spotlight · border glow · hover particles ·
            3D tilt · magnetism · click ripple
   Brand: the glow is Primary #C99763 — the demo's purple is unused.

   GSAP is already loaded globally by index.html.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  if (!window.gsap) return;

  var GLOW = '201, 151, 99';        // Primary #C99763 as an rgb triplet (no rgba wrapper)
  var SPOTLIGHT_RADIUS = 300;
  var PARTICLE_COUNT = 12;
  var MOBILE_BREAKPOINT = 768;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isTouch = window.matchMedia('(hover: none)').matches;
  var isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
  if (reduceMotion || isTouch || isMobile) return;   // upstream disables on mobile too

  /* Which existing cards get the treatment.
     tilt is false for .tier — main.js already owns [data-tilt] hover tilt, and two
     gsap tweens on rotateX/rotateY would fight over the same properties. */
  var GROUPS = [
    { cards: '.tier', section: '.tiers', tilt: false, magnetism: true },
    /* tilt/magnetism are off here: both transform the node, which would drag its
       ports away from the SVG wires process-map.js pinned to them. */
    { cards: '.pnode:not(.pn-end)', section: '.pmap', tilt: false, magnetism: false }
  ];

  var gsap = window.gsap;

  /* ── per-card effects ──────────────────────────────────────────── */
  function makeParticle(x, y) {
    var el = document.createElement('div');
    el.className = 'bento-particle';
    el.style.cssText =
      'position:absolute;width:4px;height:4px;border-radius:50%;' +
      'background:rgba(' + GLOW + ',1);box-shadow:0 0 6px rgba(' + GLOW + ',0.6);' +
      'pointer-events:none;left:' + x + 'px;top:' + y + 'px;';
    return el;
  }

  function enhance(card, opts) {
    card.classList.add('bento-fx');

    /* Particles and ripples live in their own clipped layer, so the card's own
       overflow is left alone (upstream forces overflow:hidden on the card, which
       would clip labels that sit outside it). */
    var layer = document.createElement('div');
    layer.className = 'bento-fx-layer';
    layer.setAttribute('aria-hidden', 'true');
    card.appendChild(layer);

    var particles = [];      // live clones currently in the DOM
    var seeds = null;        // lazily built templates
    var timeouts = [];
    var hovered = false;
    var magnetTween = null;

    function seedParticles() {
      if (seeds) return;
      var r = card.getBoundingClientRect();
      seeds = [];
      for (var i = 0; i < PARTICLE_COUNT; i++) {
        seeds.push(makeParticle(Math.random() * r.width, Math.random() * r.height));
      }
    }

    function clearParticles() {
      timeouts.forEach(clearTimeout);
      timeouts = [];
      if (magnetTween) magnetTween.kill();
      particles.forEach(function (p) {
        gsap.to(p, {
          scale: 0, opacity: 0, duration: 0.3, ease: 'back.in(1.7)',
          onComplete: function () { if (p.parentNode) p.parentNode.removeChild(p); }
        });
      });
      particles = [];
    }

    function animateParticles() {
      seedParticles();
      seeds.forEach(function (seed, i) {
        timeouts.push(setTimeout(function () {
          if (!hovered) return;
          var clone = seed.cloneNode(true);
          layer.appendChild(clone);
          particles.push(clone);
          gsap.fromTo(clone, { scale: 0, opacity: 0 },
            { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.7)' });
          gsap.to(clone, {
            x: (Math.random() - 0.5) * 100,
            y: (Math.random() - 0.5) * 100,
            rotation: Math.random() * 360,
            duration: 2 + Math.random() * 2,
            ease: 'none', repeat: -1, yoyo: true
          });
          gsap.to(clone, { opacity: 0.3, duration: 1.5, ease: 'power2.inOut', repeat: -1, yoyo: true });
        }, i * 100));
      });
    }

    card.addEventListener('mouseenter', function () {
      hovered = true;
      animateParticles();
      if (opts.tilt) {
        gsap.to(card, { rotateX: 5, rotateY: 5, duration: 0.3, ease: 'power2.out', transformPerspective: 1000 });
      }
    });

    card.addEventListener('mouseleave', function () {
      hovered = false;
      clearParticles();
      if (opts.tilt) gsap.to(card, { rotateX: 0, rotateY: 0, duration: 0.3, ease: 'power2.out' });
      if (opts.magnetism) gsap.to(card, { x: 0, y: 0, duration: 0.3, ease: 'power2.out' });
    });

    card.addEventListener('mousemove', function (e) {
      if (!opts.tilt && !opts.magnetism) return;
      var r = card.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      var cx = r.width / 2, cy = r.height / 2;
      if (opts.tilt) {
        gsap.to(card, {
          rotateX: ((y - cy) / cy) * -10,
          rotateY: ((x - cx) / cx) * 10,
          duration: 0.1, ease: 'power2.out', transformPerspective: 1000
        });
      }
      if (opts.magnetism) {
        magnetTween = gsap.to(card, {
          x: (x - cx) * 0.05, y: (y - cy) * 0.05,
          duration: 0.3, ease: 'power2.out'
        });
      }
    });

    card.addEventListener('click', function (e) {
      var r = card.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      var maxD = Math.max(
        Math.hypot(x, y), Math.hypot(x - r.width, y),
        Math.hypot(x, y - r.height), Math.hypot(x - r.width, y - r.height)
      );
      var ripple = document.createElement('div');
      ripple.style.cssText =
        'position:absolute;width:' + maxD * 2 + 'px;height:' + maxD * 2 + 'px;border-radius:50%;' +
        'background:radial-gradient(circle, rgba(' + GLOW + ',0.4) 0%, rgba(' + GLOW + ',0.2) 30%, transparent 70%);' +
        'left:' + (x - maxD) + 'px;top:' + (y - maxD) + 'px;pointer-events:none;';
      layer.appendChild(ripple);
      gsap.fromTo(ripple, { scale: 0, opacity: 1 }, {
        scale: 1, opacity: 0, duration: 0.8, ease: 'power2.out',
        onComplete: function () { ripple.remove(); }
      });
    });
  }

  /* ── wire up the groups ────────────────────────────────────────── */
  var sections = [];
  GROUPS.forEach(function (g) {
    var section = document.querySelector(g.section);
    var cards = Array.prototype.slice.call(document.querySelectorAll(g.cards));
    if (!section || !cards.length) return;
    section.classList.add('bento-section');
    cards.forEach(function (card) { enhance(card, g); });
    sections.push({ el: section, cards: cards });
  });
  if (!sections.length) return;

  /* ── global spotlight ──────────────────────────────────────────── */
  var spotlight = document.createElement('div');
  spotlight.className = 'global-spotlight';
  spotlight.setAttribute('aria-hidden', 'true');
  spotlight.style.cssText =
    'position:fixed;width:800px;height:800px;border-radius:50%;pointer-events:none;' +
    'background:radial-gradient(circle,' +
      'rgba(' + GLOW + ',0.15) 0%,' +
      'rgba(' + GLOW + ',0.08) 15%,' +
      'rgba(' + GLOW + ',0.04) 25%,' +
      'rgba(' + GLOW + ',0.02) 40%,' +
      'rgba(' + GLOW + ',0.01) 65%,' +
      'transparent 70%);' +
    'z-index:200;opacity:0;transform:translate(-50%,-50%);mix-blend-mode:screen;';
  document.body.appendChild(spotlight);

  var proximity = SPOTLIGHT_RADIUS * 0.5;
  var fadeDistance = SPOTLIGHT_RADIUS * 0.75;

  function dimAll() {
    sections.forEach(function (s) {
      s.cards.forEach(function (c) { c.style.setProperty('--glow-intensity', '0'); });
    });
  }

  document.addEventListener('mousemove', function (e) {
    var active = null;
    for (var i = 0; i < sections.length; i++) {
      var r = sections[i].el.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        active = sections[i];
        break;
      }
    }

    if (!active) {
      gsap.to(spotlight, { opacity: 0, duration: 0.3, ease: 'power2.out' });
      dimAll();
      return;
    }

    var minDistance = Infinity;
    dimAll();
    active.cards.forEach(function (card) {
      var r = card.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var d = Math.max(0, Math.hypot(e.clientX - cx, e.clientY - cy) - Math.max(r.width, r.height) / 2);
      minDistance = Math.min(minDistance, d);

      var intensity = 0;
      if (d <= proximity) intensity = 1;
      else if (d <= fadeDistance) intensity = (fadeDistance - d) / (fadeDistance - proximity);

      card.style.setProperty('--glow-x', ((e.clientX - r.left) / r.width) * 100 + '%');
      card.style.setProperty('--glow-y', ((e.clientY - r.top) / r.height) * 100 + '%');
      card.style.setProperty('--glow-intensity', String(intensity));
      card.style.setProperty('--glow-radius', SPOTLIGHT_RADIUS + 'px');
    });

    gsap.to(spotlight, { left: e.clientX, top: e.clientY, duration: 0.1, ease: 'power2.out' });

    var target = minDistance <= proximity ? 0.8
      : minDistance <= fadeDistance ? ((fadeDistance - minDistance) / (fadeDistance - proximity)) * 0.8
      : 0;
    gsap.to(spotlight, { opacity: target, duration: target > 0 ? 0.2 : 0.5, ease: 'power2.out' });
  }, { passive: true });

  document.addEventListener('mouseleave', function () {
    dimAll();
    gsap.to(spotlight, { opacity: 0, duration: 0.3, ease: 'power2.out' });
  });

  window.__magicBento = { glow: GLOW, sections: sections, spotlight: spotlight };
})();
