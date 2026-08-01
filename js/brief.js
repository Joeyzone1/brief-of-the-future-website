/* ═══════════════════════════════════════════════════════════════
   The Brief — landing page choreography + cost calculator
   Same library set as the homepage (GSAP 3.13 / ScrollTrigger /
   SplitText / ScrambleText / Lenis). js/main.js is NOT loaded here:
   it does homepage-specific work (film sequence, hero pin, process
   map) and would misbehave on this page.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* Current selling price, used by the calculator's comparison copy.
     Founding rate; regular price is $599. If this changes, it must change in
     brief.html (hero, title, meta, JSON-LD, FAQ, CTA) and index.html
     (JSON-LD, services row, engage tier) at the same time. */
  var PRICE = 299;

  /* ── Failsafe ────────────────────────────────────────────────
     Mirrors the forceReveal() guard in js/main.js:9-15. If the CDN
     is blocked or a library fails, un-hide everything immediately.
     A prospect must never land on a blank page.
     ── */
  function forceReveal() {
    document.documentElement.classList.add('no-motion-fallback');
  }

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Runs on every path, including the failsafe ones. The calculator and the
     nav backdrop are not decoration and must never depend on GSAP loading. */
  function initAlways() {
    initCalculator();
    navBackdrop();
  }

  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
    forceReveal();
    initAlways();
    return;
  }

  // Anything unexpected in the animation layer still leaves a readable page.
  window.addEventListener('error', forceReveal, { once: true });

  gsap.registerPlugin(ScrollTrigger);

  if (reduceMotion) {
    forceReveal();
    initAlways();
    return;
  }

  /* ── Smooth scroll — same feel as the homepage ── */
  var isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  if (typeof Lenis !== 'undefined' && !isTouch) {
    // Lower lerp than the homepage's 0.09 gives a longer glide and a heavier,
    // more deliberate feel. Slightly under 1 on the wheel stops it feeling twitchy.
    var lenis = new Lenis({ lerp: 0.075, wheelMultiplier: 0.92, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  var fontsReady = (document.fonts && document.fonts.ready)
    ? document.fonts.ready : Promise.resolve();

  fontsReady.then(init).catch(function () { forceReveal(); initAlways(); });

  function init() {
    heroIn();
    headingReveals();
    genericReveals();
    stepsSequence();
    guaranteeBlock();
    parallax();
    progressBar();
    initAlways();
    ScrollTrigger.refresh();
  }

  /* ── Shared: wrap SplitText lines in overflow-hidden masks ── */
  function maskLines(el) {
    var split = new SplitText(el, { type: 'lines', linesClass: 'sl-inner' });
    split.lines.forEach(function (line) {
      var mask = document.createElement('span');
      mask.className = 'sl-mask';
      line.parentNode.insertBefore(mask, line);
      mask.appendChild(line);
    });
    return split.lines;
  }

  /* ── Every section heading unmasks line by line on entry ──
     This is the single biggest contributor to how the scroll "feels".  */
  function headingReveals() {
    var heads = gsap.utils.toArray('.bh2, .bclose h2');

    /* These headings are excluded from genericReveals() because this function
       owns them. So if SplitText is unavailable we MUST still reveal them here,
       or they stay at the opacity:0 that .rv sets and the page loses its
       headings. Never return early from this function. */
    if (typeof SplitText === 'undefined') {
      heads.forEach(function (h) {
        gsap.to(h, {
          opacity: 1, y: 0, duration: .9, ease: 'power3.out',
          scrollTrigger: { trigger: h, start: 'top 88%', once: true }
        });
      });
      return;
    }

    heads.forEach(function (h) {
      var lines = maskLines(h);
      /* .rv applies BOTH opacity:0 and translateY(28px). The lines carry the
         reveal from here, so clear both — clearing only opacity leaves every
         heading sitting 28px below its true flow position and silently wrecks
         the label-to-heading rhythm on the whole page. */
      gsap.set(h, { opacity: 1, y: 0 });
      gsap.set(lines, { yPercent: 112 });
      gsap.to(lines, {
        yPercent: 0, duration: 1, stagger: 0.075, ease: 'power4.out',
        scrollTrigger: { trigger: h, start: 'top 86%', once: true }
      });
    });
  }

  /* ── Continuous, scroll-linked movement. Things that drift while you
        scroll are what separate "animated" from "alive". ── */
  function parallax() {
    var glow = document.querySelector('.bhero-glow');
    if (glow) {
      gsap.to(glow, {
        yPercent: 26, ease: 'none',
        scrollTrigger: { trigger: '.bhero', start: 'top top', end: 'bottom top', scrub: true }
      });
    }

    /* Deliberately NOT parallaxing section labels. Drifting a label
       independently of the heading it introduces breaks the pairing and made
       the measured label-to-heading gap vary between 46px and 64px depending
       on scroll position. Rhythm beats movement here. */

    // The guarantee number lifts as its block passes through.
    var n = document.querySelector('.bguar-n');
    if (n) {
      gsap.fromTo(n, { y: 26 }, {
        y: -26, ease: 'none',
        scrollTrigger: { trigger: '.bguar', start: 'top bottom', end: 'bottom top', scrub: true }
      });
    }
  }

  /* ── Thin progress line across the top ── */
  function progressBar() {
    var bar = document.querySelector('#bprog i');
    if (!bar) return;
    gsap.to(bar, {
      scaleX: 1, ease: 'none',
      scrollTrigger: { start: 0, end: function () { return document.body.scrollHeight - window.innerHeight; }, scrub: 0.3 }
    });
  }

  /* ── Nav backdrop ───────────────────────────────────────────
     .nav is position:fixed with no background (style.css:151).
     The homepage hides it on scroll via main.js; this page keeps
     it visible, so it needs a backdrop or body text scrolls
     underneath a transparent bar.
     ── */
  function navBackdrop() {
    var nav = document.getElementById('nav');
    if (!nav) return;

    function set(on) { nav.classList.toggle('is-solid', !!on); }

    /* Prefer ScrollTrigger: Lenis drives scrolling here, and ScrollTrigger is
       already wired into it. A bare window 'scroll' listener is not reliable
       under a smooth-scroll proxy. */
    if (typeof ScrollTrigger !== 'undefined') {
      ScrollTrigger.create({
        trigger: document.body,
        start: 'top top-=60',
        end: 'max',
        onEnter:     function () { set(true); },
        onEnterBack: function () { set(true); },
        onLeaveBack: function () { set(false); }
      });
      set(window.scrollY > 60);
      return;
    }

    // No GSAP: plain listener, rAF-throttled.
    var ticking = false;
    function apply() { set(window.scrollY > 60); ticking = false; }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(apply); }
    }, { passive: true });
    apply();
  }

  /* ── 1. Hero — masked line reveal + price scramble ── */
  function heroIn() {
    var h1 = document.querySelector('.bhero h1');
    var tl = gsap.timeline({ delay: 0.15 });

    if (h1 && typeof SplitText !== 'undefined') {
      var lines = maskLines(h1);
      gsap.set(lines, { yPercent: 115 });
      tl.to(lines, { yPercent: 0, duration: 1.15, stagger: 0.1, ease: 'power4.out' });
    } else if (h1) {
      tl.fromTo(h1, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .9, ease: 'power3.out' });
    }

    tl.to('.bhero .rv', { opacity: 1, y: 0, duration: .85, stagger: .1, ease: 'power3.out' }, '-=0.6');

    // Price reveal — ScrambleText if available, otherwise a clean count-up.
    var price = document.querySelector('[data-scramble]');
    if (price) {
      var finalText = price.dataset.scramble;
      if (typeof ScrambleTextPlugin !== 'undefined') {
        gsap.registerPlugin(ScrambleTextPlugin);
        tl.to(price, {
          duration: 1.15,
          scrambleText: { text: finalText, chars: '0123456789$', speed: 0.5, revealDelay: 0.2 }
        }, '-=0.5');
      } else {
        tl.to({ v: 0 }, {
          v: 599, duration: 1.1, ease: 'power2.out',
          onUpdate: function () { price.textContent = '$' + Math.round(this.targets()[0].v); },
          onComplete: function () { price.textContent = finalText; }
        }, '-=0.5');
      }
    }
  }

  /* ── 2. Generic scroll reveals ── */
  function genericReveals() {
    // Headings are owned by headingReveals() and the hero by heroIn().
    // Filtered in JS rather than with a compound :not() selector so it can't
    // silently mismatch and double-animate an element.
    var owned = gsap.utils.toArray('.bh2, .bclose h2');
    gsap.utils.toArray('.rv, .rv-fast').forEach(function (el) {
      if (el.closest('.bhero') || owned.indexOf(el) > -1) return;
      gsap.to(el, {
        opacity: 1, y: 0, duration: el.classList.contains('rv-fast') ? .6 : .9,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true }
      });
    });

    // Cards rise and settle together, with a touch of scale so they feel like
    // they arrive rather than just fade.
    gsap.utils.toArray('.bgrid').forEach(function (grid) {
      var cards = grid.querySelectorAll('.bcard');
      if (!cards.length) return;
      gsap.set(cards, { opacity: 0, y: 34, scale: 0.975 });
      gsap.to(cards, {
        opacity: 1, y: 0, scale: 1, duration: .9, stagger: .1, ease: 'power3.out',
        scrollTrigger: { trigger: grid, start: 'top 86%', once: true }
      });
    });
  }

  /* ── 3. Four steps — line draws, nodes light up in sequence ── */
  function stepsSequence() {
    var wrap = document.querySelector('.bsteps');
    if (!wrap) return;
    var fill = wrap.querySelector('.bstep-line i');
    var steps = wrap.querySelectorAll('.bstep');

    if (fill) {
      gsap.fromTo(fill, { scaleY: 0 }, {
        scaleY: 1, ease: 'none',
        scrollTrigger: { trigger: wrap, start: 'top 72%', end: 'bottom 78%', scrub: 0.5 }
      });
    }

    steps.forEach(function (step) {
      ScrollTrigger.create({
        trigger: step, start: 'top 76%',
        onEnter: function () { step.classList.add('on'); },
        onLeaveBack: function () { step.classList.remove('on'); }
      });
    });
  }

  /* ── 4. Guarantee — number counts up, border draws itself ── */
  function guaranteeBlock() {
    var block = document.querySelector('.bguar');
    if (!block) return;

    var rect = block.querySelector('.bg-frame rect');
    if (rect) {
      // Perimeter, so the dash animation is exact at any size.
      var len = rect.getTotalLength ? rect.getTotalLength() : 2000;
      gsap.set(rect, { strokeDasharray: len, strokeDashoffset: len });
      gsap.to(rect, {
        strokeDashoffset: 0, duration: 1.6, ease: 'power2.inOut',
        scrollTrigger: { trigger: block, start: 'top 78%', once: true }
      });
    }

    var num = block.querySelector('[data-count]');
    if (num) {
      var target = parseFloat(num.dataset.count) || 5;
      var obj = { v: 0 };
      gsap.to(obj, {
        v: target, duration: 1.3, ease: 'power2.out',
        scrollTrigger: { trigger: block, start: 'top 78%', once: true },
        onUpdate: function () { num.firstChild.nodeValue = String(Math.round(obj.v)); }
      });
    }
  }

  /* ═══════════════════════════════════════════════════════════
     COST CALCULATOR

     Pure function, kept free of DOM and outer scope so it can be
     extracted and unit-tested straight from this file.

     The maths is deliberately the PROSPECT'S, not ours. They set
     how many enquiries go cold; we only multiply. No invented
     response-time conversion statistic, because a fabricated
     industry number is the fastest way to lose a sceptical buyer.

     Defaults (1 lost x 12 x $3,000 = $36,000) come from the
     objection-handling script in sales/onboarding-deck.html:865.
     ═══════════════════════════════════════════════════════════ */
  function calcAnnualCost(lostPerMonth, clientValue) {
    var l = Number(lostPerMonth);
    var v = Number(clientValue);
    if (!isFinite(l) || l < 0) l = 0;
    if (!isFinite(v) || v < 0) v = 0;
    return Math.round(l * 12 * v);
  }

  function initCalculator() {
    var root = document.querySelector('.bcalc');
    if (!root) return;

    var enq  = root.querySelector('#enq');
    var val  = root.querySelector('#val');
    var lost = root.querySelector('#lost');
    if (!enq || !val || !lost) return;

    var outEnq  = root.querySelector('#out-enq');
    var outVal  = root.querySelector('#out-val');
    var outLost = root.querySelector('#out-lost');
    var total   = root.querySelector('#out-total');
    var compare = root.querySelector('#out-compare');

    var money = new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', maximumFractionDigits: 0
    });

    function update() {
      // You cannot lose more enquiries than you receive.
      var maxLost = Math.max(0, Number(enq.value));
      if (Number(lost.max) !== maxLost) lost.max = String(maxLost);
      if (Number(lost.value) > maxLost) lost.value = String(maxLost);

      var annual = calcAnnualCost(lost.value, val.value);

      outEnq.value  = enq.value;
      outVal.value  = money.format(Number(val.value));
      outLost.value = lost.value;
      total.textContent = money.format(annual);

      var priceStr = '<b>$' + PRICE + '</b>';
      if (annual <= 0) {
        compare.innerHTML = 'Set how many go cold and you\'ll see the yearly number. ' +
          'If it genuinely is zero, you don\'t need us, and we\'d rather you kept the ' +
          priceStr + '.';
      } else {
        var multiple = annual / PRICE;
        compare.innerHTML = 'The Brief costs ' + priceStr + '. That leak is <b>' +
          (multiple >= 10 ? Math.round(multiple) : multiple.toFixed(1)) +
          '×</b> the price of finding it.';
      }
    }

    [enq, val, lost].forEach(function (el) {
      el.addEventListener('input', update);
    });
    update();
  }

  // Exposed for the browser-console check in the verification pass.
  window.__briefCalc = calcAnnualCost;
})();
