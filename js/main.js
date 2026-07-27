/* Brief of the Future — motion engine.
   Nothin'-style system: Lenis smooth scroll + GSAP ScrollTrigger,
   power4.inOut signature easing, slow scrubs (2–3), line-mask reveals. */

(function () {
  'use strict';

  /* ── Failsafe: never trap the visitor behind the loader ──── */
  function forceReveal() {
    const l = document.getElementById('loader');
    if (l) l.style.display = 'none';
    document.body.classList.remove('is-loading');
    document.documentElement.classList.add('no-motion-fallback');
  }
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined' || typeof SplitText === 'undefined') {
    forceReveal();
    return;
  }
  setTimeout(() => {
    if (document.body.classList.contains('is-loading')) forceReveal();
  }, 8000);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;

  gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin);

  /* Phones fire a resize every time the address bar slides away, which makes
     ScrollTrigger re-measure and every pinned section jump mid-scroll. There
     are four pinned set-pieces now, so that jitter reads as the whole page
     stuttering. Height-only resizes are ignored; a real rotation still refreshes. */
  ScrollTrigger.config({ ignoreMobileResize: true });

  /* ── Measure pinned sections in page order ────────────────────
     Three sections pin: #film, #services, #statement. Each one's pin-spacer
     adds page height, so anything below it must be measured AFTER it.

     GSAP refreshes in creation order, and #statement's trigger happens to be
     created before #services' — so the lamp computed its start without the
     ~2900px that the pinned Services section later inserts above it, engaged
     that far too early, and (being position:fixed while pinned) painted the
     lamp scene straight over the node map and the Engage tiers.

     Ranking every trigger by the section it belongs to, then sorting, makes
     the refresh order match the page order regardless of when each was built.
     Pinned sections get wrapped in a .pin-spacer, hence the contains() test. */
  function orderTriggersByPage() {
    var sections = Array.prototype.slice.call(document.querySelectorAll('main > *'));
    ScrollTrigger.getAll().forEach(function (t) {
      var el = t.pin || t.trigger;
      if (!el || !el.nodeType) return;
      for (var i = 0; i < sections.length; i++) {
        if (sections[i] === el || sections[i].contains(el)) {
          /* Higher refreshes first, so earlier sections get the bigger number. */
          t.vars.refreshPriority = sections.length - i;
          break;
        }
      }
    });
    ScrollTrigger.sort();
    ScrollTrigger.refresh();
  }

  /* The page also keeps growing after the triggers are built — webfonts swap,
     SplitText re-wraps headlines, lazy videos mount — so re-measure once
     everything has landed, then once more for whatever settled during that. */
  window.addEventListener('load', function () {
    orderTriggersByPage();
    setTimeout(orderTriggersByPage, 600);
  });

  /* ── Lenis smooth scroll ─────────────────────────────────── */
  let lenis = null;
  if (!reduceMotion && typeof Lenis !== 'undefined') {
    lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  /* ── Split all .split-lines into masked lines ──────────────
     (don't wait on slow font CDNs forever) */
  const fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
  Promise.race([fontsReady, new Promise(r => setTimeout(r, 2200))]).then(init);

  function splitIntoLines(el) {
    const split = new SplitText(el, { type: 'lines', linesClass: 'sl-inner' });
    split.lines.forEach(line => {
      const mask = document.createElement('span');
      mask.className = 'sl-line';
      line.parentNode.insertBefore(mask, line);
      mask.appendChild(line);
    });
    return split;
  }

  function init() {

    /* Eager background video (hero): kick playback if the browser deferred autoplay */
    document.querySelectorAll('video[autoplay]').forEach(v => {
      const kick = () => { const p = v.play(); if (p) p.catch(() => {}); };
      kick();
      document.addEventListener('pointerdown', kick, { once: true });
    });

    /* Below-fold videos: don't fetch until near viewport, pause once scrolled away */
    const lazyVideos = document.querySelectorAll('video.lazy-video');
    if (lazyVideos.length && 'IntersectionObserver' in window) {
      const loadVideo = v => {
        if (v.dataset.loaded) return;
        v.dataset.loaded = '1';
        v.querySelectorAll('source[data-src]').forEach(s => { s.src = s.dataset.src; });
        v.load();
      };
      const io = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          const v = entry.target;
          if (entry.isIntersecting) {
            loadVideo(v);
            const p = v.play(); if (p) p.catch(() => {});
          } else if (v.dataset.loaded) {
            v.pause();
          }
        });
      }, { rootMargin: '600px 0px' });
      lazyVideos.forEach(v => io.observe(v));
    } else {
      lazyVideos.forEach(v => v.querySelectorAll('source[data-src]').forEach(s => { s.src = s.dataset.src; v.load(); }));
    }

    document.querySelectorAll('.split-lines').forEach(splitIntoLines);

    /* ── Preloader ───────────────────────────────────────────── */
    const loader = document.getElementById('loader');
    const countEl = document.getElementById('loader-count');
    const barEl = document.getElementById('loader-bar');
    const counter = { v: 0 };

    const intro = gsap.timeline({ defaults: { ease: 'power4.inOut' } });

    if (reduceMotion) {
      loader.style.display = 'none';
      document.body.classList.remove('is-loading');
      gsap.set('.hl-inner, .ht-inner', { y: 0 });
    } else {
      intro
        .to('.loader-line > span', { y: 0, duration: 1.1, stagger: 0.12 }, 0.2)
        .fromTo('.loader-eyebrow', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8, ease: 'power2.out' }, 0.4)
        .to(counter, {
          v: 100, duration: 2.0, ease: 'power2.inOut',
          onUpdate: () => {
            const n = Math.round(counter.v);
            countEl.textContent = n < 10 ? '0' + n : String(n);
            barEl.style.width = counter.v + '%';
          }
        }, 0.3)
        // curtain up
        .to('.loader-inner, .loader-count', { y: -60, autoAlpha: 0, duration: 0.7 }, '-=0.25')
        .to(loader, {
          clipPath: 'inset(0 0 100% 0)', duration: 1.1,
          onComplete: () => { loader.style.display = 'none'; }
        }, '-=0.35')
        .add(() => document.body.classList.remove('is-loading'), '<0.3')
        // hero entrance
        .to('.hl-inner', { y: 0, duration: 1.2, stagger: 0.14 }, '<')
        .to('.ht-inner', { y: 0, duration: 1.0 }, '<0.35')
        .fromTo('.hero-foot, .hero-scroll, .nav', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.9, ease: 'power2.out', stagger: 0.08 }, '<0.2');
      gsap.set(loader, { clipPath: 'inset(0 0 0% 0)' });
      gsap.set('.hero-foot, .hero-scroll, .nav', { autoAlpha: 0 });
    }

    /* Eyebrow scramble-in */
    const eyebrow = document.querySelector('.hero-eyebrow');
    if (eyebrow && !reduceMotion) {
      const txt = eyebrow.textContent;
      gsap.set(eyebrow, { autoAlpha: 0 });
      intro.to(eyebrow, { autoAlpha: 1, duration: 0.01 }, '-=1.7');
      intro.to(eyebrow, {
        duration: 1.6, ease: 'none',
        scrambleText: { text: txt, chars: '·/—+×', speed: 0.4 }
      }, '-=1.7');
    }

    /* ── Custom cursor ───────────────────────────────────────── */
    if (!isTouch && !reduceMotion) {
      document.body.classList.add('cursor-on');
      const cursor = document.getElementById('cursor');
      const label = document.getElementById('cursor-label');
      const xTo = gsap.quickTo(cursor, 'x', { duration: 0.35, ease: 'power3.out' });
      const yTo = gsap.quickTo(cursor, 'y', { duration: 0.35, ease: 'power3.out' });
      window.addEventListener('mousemove', e => {
        xTo(e.clientX); yTo(e.clientY);
      }, { passive: true });
      gsap.set(cursor, { xPercent: -50, yPercent: -50 });

      document.querySelectorAll('[data-cursor]').forEach(el => {
        const kind = el.dataset.cursor;
        el.addEventListener('mouseenter', () => {
          cursor.classList.remove('is-hover', 'is-cta', 'is-row');
          if (kind === 'hover') cursor.classList.add('is-hover');
          if (kind === 'cta') { cursor.classList.add('is-cta'); label.textContent = 'GO'; }
          if (kind === 'row') { cursor.classList.add('is-row'); label.textContent = 'OPEN'; }
        });
        el.addEventListener('mouseleave', () => {
          cursor.classList.remove('is-hover', 'is-cta', 'is-row');
          label.textContent = '';
        });
      });
    }

    /* ── Nav hide on scroll down ─────────────────────────────── */
    const nav = document.getElementById('nav');
    ScrollTrigger.create({
      start: 'top top-=80',
      onUpdate: self => {
        if (document.body.classList.contains('menu-open')) return;
        nav.classList.toggle('nav-hidden', self.direction === 1 && self.scroll() > 200);
      }
    });

    /* ── Menu overlay ────────────────────────────────────────── */
    const menuBtn = document.getElementById('menu-btn');
    const overlay = document.getElementById('menu-overlay');
    const menuTl = gsap.timeline({ paused: true, defaults: { ease: 'power4.inOut' } });
    menuTl
      .set(overlay, { visibility: 'visible' })
      .to('.menu-bg', { clipPath: 'inset(0 0 0% 0)', duration: 0.9 })
      .to('.menu-word', { y: 0, duration: 0.9, stagger: 0.06, ease: 'power4.out' }, '-=0.35')
      .fromTo('.menu-foot', { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power2.out' }, '-=0.5');

    let menuOpen = false;
    function toggleMenu(force) {
      menuOpen = force !== undefined ? force : !menuOpen;
      document.body.classList.toggle('menu-open', menuOpen);
      overlay.classList.toggle('is-open', menuOpen);
      menuBtn.setAttribute('aria-expanded', menuOpen);
      if (menuOpen) { menuTl.timeScale(1).play(); lenis && lenis.stop(); }
      else { menuTl.timeScale(1.6).reverse(); lenis && lenis.start(); }
    }
    menuBtn.addEventListener('click', () => toggleMenu());
    document.querySelectorAll('.menu-link').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        const target = document.querySelector(a.getAttribute('href'));
        toggleMenu(false);
        if (target) {
          if (lenis) lenis.scrollTo(target, { offset: 0, duration: 1.6 });
          else target.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });
    window.addEventListener('keydown', e => { if (e.key === 'Escape' && menuOpen) toggleMenu(false); });

    /* ── Smooth in-page anchors (non-menu links) ─────────────── */
    document.querySelectorAll('a[href^="#"]:not(.menu-link)').forEach(a => {
      a.addEventListener('click', e => {
        const target = document.querySelector(a.getAttribute('href'));
        if (!target) return;
        e.preventDefault();
        if (lenis) lenis.scrollTo(target, { duration: 1.6 });
        else target.scrollIntoView({ behavior: 'smooth' });
      });
    });

    /* ── Generic line reveals on scroll ──────────────────────── */
    document.querySelectorAll('.split-lines').forEach(el => {
      gsap.to(el.querySelectorAll('.sl-inner'), {
        y: 0, duration: 1.2, ease: 'power4.out', stagger: 0.09,
        scrollTrigger: { trigger: el, start: 'top 82%' }
      });
    });

    /* Newsletter + finale masked titles */
    [['.nl-inner', '.nl-title'], ['.fin-inner', '.finale-title']].forEach(([inner, trigger]) => {
      gsap.fromTo(inner, { y: '115%' }, {
        y: 0, duration: 1.3, ease: 'power4.out', stagger: 0.12,
        scrollTrigger: { trigger, start: 'top 80%' }
      });
    });

    /* Aside labels fade */
    gsap.utils.toArray('.aside-label').forEach(el => {
      gsap.fromTo(el, { autoAlpha: 0, y: 14 }, {
        autoAlpha: 1, y: 0, duration: 0.9, ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 88%' }
      });
    });

    /* ── Hero parallax: copy lifts on scroll ─────────────────── */
    if (!reduceMotion) {
      gsap.to('.hero-copy', {
        yPercent: -30, autoAlpha: 0.15, ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: '75% top', scrub: 2 }
      });
    }

    /* ── Brand film: opens full-screen, then docks into the museum's
          golden screen as the gallery reveals itself behind it ───── */
    const film = document.getElementById('film');
    if (film) {
      if (reduceMotion) {
        film.classList.add('film-static');
      } else {
       const filmMM = gsap.matchMedia();

       /* Desktop: the film docks into the museum's golden screen. */
       filmMM.add('(min-width: 900px)', () => {
        const frame = document.getElementById('film-frame');
        const screenEl = document.getElementById('museum-screen');

        /* target rect of the golden screen, relative to the section.
           Computed from untransformed layout (offsetWidth/Height) so the
           museum-wrap's animated scale can never skew the capture.
           Percentages mirror .museum-screen in style.css. */
        const wrap = document.getElementById('museum-wrap');
        const shot = () => {
          const secW = film.clientWidth, secH = film.clientHeight;
          const wW = wrap.offsetWidth, wH = wrap.offsetHeight;
          const wL = (secW - wW) / 2, wT = (secH - wH) / 2;
          return {
            left: wL + wW * 0.2925,
            top: wT + wH * 0.2210,
            width: wW * 0.4127,
            height: wH * 0.2869
          };
        };

        const filmTl = gsap.timeline({
          defaults: { ease: 'power4.inOut' },
          scrollTrigger: {
            trigger: film,
            start: 'top top',
            end: '+=420%',
            pin: true,
            scrub: 2,
            anticipatePin: 1,
            invalidateOnRefresh: true
          }
        });
        filmTl
          // opens: slightly inset frame expands to true full screen
          .fromTo(frame,
            { scale: 0.94, autoAlpha: 0.4 },
            { scale: 1, autoAlpha: 1, duration: 0.1, ease: 'power2.out' })
          .to({}, { duration: 0.16 }) // hold full screen
          // the gallery fades in behind, settling from a gentle push-back
          .fromTo('#film-stage', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.22, ease: 'power1.inOut' }, 'dock')
          .fromTo('#museum-wrap', { scale: 1.14 }, { scale: 1, duration: 0.44, ease: 'power2.out' }, 'dock')
          // …while the film glides into the golden screen
          .to(frame, {
            left: () => shot().left + 'px',
            top: () => shot().top + 'px',
            width: () => shot().width + 'px',
            height: () => shot().height + 'px',
            duration: 0.44,
            ease: 'power2.inOut'
          }, 'dock')
          // overlay type scales down with the frame; eyebrow bows out
          .to('.film-eyebrow', { autoAlpha: 0, duration: 0.1, ease: 'power1.out' }, 'dock')
          .to('#film-overlay-inner', {
            scale: () => Math.max(shot().width / window.innerWidth, 0.3),
            duration: 0.44,
            ease: 'power2.inOut'
          }, 'dock')
          // copy rises from the gallery floor
          .fromTo('#film-copy',
            { y: 60, autoAlpha: 0 },
            { y: 0, autoAlpha: 1, duration: 0.16, ease: 'power3.out' }, 'dock+=0.36')
          .to({}, { duration: 0.14 }); // settle before unpin
       });

       /* Phones don't get a lesser version of this — they get a different shot.
          The museum plate is sized max(100vw, 177.7vh), which at 375×812 is
          1443px wide, so the golden screen it docks into sits well off-canvas:
          the docking move cannot be framed on a phone at all. Same beat,
          restaged — the film opens from an inset card to full bleed, the title
          card bows out, and the line rises into the space it leaves. */
       filmMM.add('(max-width: 899px)', () => {
        const frame = document.getElementById('film-frame');
        gsap.set(frame, { scale: 0.9, borderRadius: 18, transformOrigin: '50% 50%' });

        const tl = gsap.timeline({
          defaults: { ease: 'power2.inOut' },
          scrollTrigger: {
            trigger: film,
            start: 'top top',
            /* The phone shows a letterboxed 16:9 band, not a full-screen
               plate — 210% of scrolling made it outstay its welcome. */
            end: '+=140%',
            pin: true,
            scrub: 1.2,
            anticipatePin: 1,
            invalidateOnRefresh: true
          }
        });
        tl.to(frame, { scale: 1, borderRadius: 0, duration: 0.3, ease: 'power3.out' })
          .to({}, { duration: 0.14 })                         // hold at full bleed
          .to('#film-overlay-inner',
            { y: -46, scale: 0.74, autoAlpha: 0.3, duration: 0.24 }, 'hand')
          .fromTo('#film-copy',
            { y: 54, autoAlpha: 0 },
            { y: 0, autoAlpha: 1, duration: 0.24, ease: 'power3.out' }, 'hand+=0.08')
          .to({}, { duration: 0.16 });                        // settle before unpin

        /* gsap.set isn't part of the timeline, so matchMedia's auto-revert
           won't undo it when the breakpoint flips (phone → rotated tablet). */
        return () => gsap.set([frame, '#film-overlay-inner', '#film-copy'], { clearProps: 'all' });
       });
      }
    }

    /* ── Section-break hairlines grow in as you approach ─────── */
    if (!reduceMotion) {
      gsap.utils.toArray('.sb-line').forEach(line => {
        gsap.fromTo(line, { scaleX: 0 }, {
          scaleX: 1, ease: 'none',
          scrollTrigger: { trigger: line.parentElement, start: 'top 92%', end: 'bottom 55%', scrub: 1.5 }
        });
      });
    }

    /* ── Q&A: pinned scroll story — question lands, answer follows,
          hand-off to the next; fully reversible on scroll-up ────── */
    const qa = document.getElementById('statement');
    if (qa && qa.classList.contains('qa')) {
      const steps = gsap.utils.toArray('.qa-step');
      if (reduceMotion) {
        qa.classList.add('qa-static');
      } else {
        /* lamp swings in as the room approaches, then keeps breathing */
        gsap.fromTo('.lamp-video', { yPercent: -28, autoAlpha: 0 }, {
          yPercent: 0, autoAlpha: 1, duration: 1.4, ease: 'power3.out',
          scrollTrigger: { trigger: qa, start: 'top 60%' }
        });
        gsap.to('.lamp-video', {
          rotation: 1.1, transformOrigin: '50% 0%',
          duration: 3.6, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: 1.2
        });
        gsap.fromTo('.qa-glow', { autoAlpha: 0 }, {
          autoAlpha: 1, duration: 1.6, ease: 'power2.out',
          scrollTrigger: { trigger: qa, start: 'top 55%' }
        });
        gsap.to('.qa-glow', {
          scale: 1.06, transformOrigin: '50% 0%',
          duration: 3.2, yoyo: true, repeat: -1, ease: 'sine.inOut'
        });

        /* set initial states up front so no step flashes early */
        steps.forEach(step => {
          gsap.set(step.querySelector('.qa-eyebrow'), { autoAlpha: 0, y: 26 });
          gsap.set(step.querySelector('.qa-q'), { autoAlpha: 0, y: 110, rotate: 1.5 });
          gsap.set(step.querySelectorAll('.qa-a, .qa-cta'), { autoAlpha: 0, y: 50 });
        });

        const qaTl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: qa,
            start: 'top top',
            end: '+=' + (steps.length * 120) + '%',
            pin: true,
            scrub: 1.8,
            anticipatePin: 1,
            invalidateOnRefresh: true
          }
        });

        steps.forEach((step, i) => {
          const eyebrow = step.querySelector('.qa-eyebrow');
          const q = step.querySelector('.qa-q');
          const rest = step.querySelectorAll('.qa-a, .qa-cta');
          const at = i; // one timeline-unit per step
          const last = i === steps.length - 1;

          qaTl
            .to(q, { autoAlpha: 1, y: 0, rotate: 0, duration: 0.3, ease: 'power3.out' }, at)
            .to(eyebrow, { autoAlpha: 1, y: 0, duration: 0.14, ease: 'power2.out' }, at + 0.04)
            .to(rest, { autoAlpha: 1, y: 0, duration: 0.24, ease: 'power3.out' }, at + 0.2);

          if (!last) {
            qaTl.to([eyebrow, q, ...rest], {
              autoAlpha: 0, y: -80, duration: 0.24, ease: 'power2.in', stagger: 0.02
            }, at + 0.72);
          } else {
            qaTl.to({}, { duration: 0.4 }); // hold the closer before unpin
          }
        });
      }
    }

    /* ── Services: pinned scroll story — the section holds while each
          scroll step pops the next tier in (desktop); on phones/short
          screens each tier reveals as it scrolls into view instead ── */
    const mm = gsap.matchMedia();
    mm.add('(min-width: 901px) and (min-height: 640px)', () => {
      const tiers = gsap.utils.toArray('.atier');
      /* hidden from the start — mid-timeline fromTo tweens don't
         immediateRender, so without this the tiers would sit visible
         until the playhead first reaches them */
      gsap.set(tiers, { autoAlpha: 0 });
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: '.services',
          start: 'top top',
          end: '+=280%',
          pin: true,
          scrub: 1,
          anticipatePin: 1,
          invalidateOnRefresh: true
        }
      });
      tiers.forEach((t, i) => {
        tl.fromTo(t,
          { autoAlpha: 0, x: i % 2 ? 130 : -130, y: 60 },
          { autoAlpha: 1, x: 0, y: 0, duration: 1, ease: 'back.out(1.3)' },
          i === 0 ? 0.1 : '+=0.45');
      });
      tl.to({}, { duration: 0.5 });   // breathing room after the last tier
      return () => gsap.set(tiers, { clearProps: 'all' });
    });
    /* Phones can't pin this one: at 375px the section stands 1582px tall, so
       holding it still would park two thirds of it off-screen. The tiers keep
       their own scroll instead, and earn their entrance in pieces — card, then
       its header line, then the examples — so each one arrives as a beat rather
       than a single flat fade. */
    mm.add('(max-width: 900px), (max-height: 639px)', () => {
      gsap.utils.toArray('.atier').forEach(row => {
        const tl = gsap.timeline({
          scrollTrigger: { trigger: row, start: 'top 86%', toggleActions: 'play none none reverse' }
        });
        tl.fromTo(row,
            { autoAlpha: 0, y: 64, scale: 0.97 },
            { autoAlpha: 1, y: 0, scale: 1, duration: 0.85, ease: 'power3.out' })
          .fromTo(row.querySelectorAll('.at-idx, .at-price'),
            { autoAlpha: 0, x: -20 },
            { autoAlpha: 1, x: 0, duration: 0.5, stagger: 0.08, ease: 'power2.out' }, '-=0.52')
          .fromTo(row.querySelectorAll('.at-examples li'),
            { autoAlpha: 0, y: 16 },
            { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.09, ease: 'power2.out' }, '-=0.34');
      });
    });

    /* ── Process: the map is a plain vertical flow now. Its wires are drawn by
       js/process-map.js; scroll choreography is still to come. ────────────── */

    /* ── Tiers stagger in + subtle tilt on hover ─────────────── */
    gsap.fromTo('.tier', { autoAlpha: 0, y: 80 }, {
      autoAlpha: 1, y: 0, duration: 1.1, ease: 'power4.out', stagger: 0.12,
      scrollTrigger: { trigger: '.tiers', start: 'top 82%' }
    });
    if (!isTouch && !reduceMotion) {
      document.querySelectorAll('[data-tilt]').forEach(card => {
        card.addEventListener('mousemove', e => {
          const r = card.getBoundingClientRect();
          const rx = ((e.clientY - r.top) / r.height - 0.5) * -5;
          const ry = ((e.clientX - r.left) / r.width - 0.5) * 5;
          gsap.to(card, { rotateX: rx, rotateY: ry, transformPerspective: 800, duration: 0.5, ease: 'power2.out' });
        });
        card.addEventListener('mouseleave', () => {
          gsap.to(card, { rotateX: 0, rotateY: 0, duration: 0.8, ease: 'elastic.out(1, 0.5)' });
        });
      });
    }

    /* ── Glitch marquee rows: opposing scrub + scramble bursts ─ */
    document.querySelectorAll('.glitch-row').forEach((row, i) => {
      if (reduceMotion) return;
      const dir = i % 2 === 0 ? -1 : 1;
      gsap.fromTo(row, { x: dir * -160 }, {
        x: dir * 160, ease: 'none',
        scrollTrigger: { trigger: '.glitch', start: 'top bottom', end: 'bottom top', scrub: 3 }
      });
    });
    // periodic scramble "glitch" on one row at a time
    if (!reduceMotion) {
      const rows = document.querySelectorAll('.glitch-row > span');
      if (rows.length) {
        const originals = [...rows].map(r => r.textContent);
        setInterval(() => {
          const i = Math.floor(Math.random() * rows.length);
          gsap.to(rows[i], {
            duration: 0.9, ease: 'none',
            scrambleText: { text: originals[i], chars: '·/—+×01', speed: 1.2 }
          });
        }, 2600);
      }
    }

    /* ── Finale: ring buttons entrance ───────────────────────── */
    gsap.fromTo('.finale-ctas .btn-ring', { autoAlpha: 0, scale: 0.75 }, {
      autoAlpha: 1, scale: 1, duration: 1, ease: 'back.out(1.4)', stagger: 0.12,
      scrollTrigger: { trigger: '.finale-ctas', start: 'top 88%' }
    });

    /* Magnetic ring buttons */
    if (!isTouch && !reduceMotion) {
      document.querySelectorAll('.btn-ring').forEach(btn => {
        btn.addEventListener('mousemove', e => {
          const r = btn.getBoundingClientRect();
          gsap.to(btn, {
            x: (e.clientX - r.left - r.width / 2) * 0.3,
            y: (e.clientY - r.top - r.height / 2) * 0.3,
            duration: 0.5, ease: 'power2.out'
          });
        });
        btn.addEventListener('mouseleave', () => {
          gsap.to(btn, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.35)' });
        });
      });
    }

    /* ── Substack subscribe ──────────────────────────────────── */
    const form = document.getElementById('subscribe-form');
    if (form) {
      form.addEventListener('submit', e => {
        e.preventDefault();
        const email = document.getElementById('subscribe-email').value.trim();
        const url = 'https://briefofthefuture.substack.com/subscribe' +
          (email ? '?email=' + encodeURIComponent(email) : '');
        window.open(url, '_blank', 'noopener');
      });
    }

    ScrollTrigger.refresh();
  }
})();
