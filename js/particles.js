/* Brief of the Future — interactive particle portrait hero.
   Canvas 2D, per-particle spring physics. Source pixels are sampled from
   assets/portrait.png; near-white studio background is rejected so only
   the figure becomes particles. Starfield lives on its own canvas layer
   and never reacts to the pointer. */

(function () {
  'use strict';

  const REPEL_RADIUS = 90;      // px — matches the verified prototype
  const REPEL_FORCE = 7;
  const SPRING = 0.06;          // pull toward target
  const FRICTION = 0.86;
  const MAX_PARTICLES = 6500;
  const BG_LUMA = 225;          // reject pixels brighter than this (white studio bg)

  const stage = document.getElementById('hero-portrait');
  if (!stage) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || !window.CanvasRenderingContext2D) {
    stage.classList.add('portrait-fallback');
    return;
  }

  const starCanvas = document.getElementById('star-canvas');
  const dotCanvas = document.getElementById('particle-canvas');
  const starCtx = starCanvas.getContext('2d');
  const ctx = dotCanvas.getContext('2d');

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let particles = [];
  let stars = [];
  let mouse = { x: -9999, y: -9999 };
  let width = 0, height = 0;
  let img = null;
  let rafId = null;

  function warm(r, g, b) {
    // Nudge sampled pixel colors toward the brand gold (#C99763)
    const mix = 0.22;
    return [
      Math.round(r * (1 - mix) + 201 * mix),
      Math.round(g * (1 - mix) + 151 * mix),
      Math.round(b * (1 - mix) + 99 * mix)
    ];
  }

  function buildParticles() {
    particles = [];
    const rect = stage.getBoundingClientRect();
    width = rect.width;
    height = rect.height;

    [starCanvas, dotCanvas].forEach(c => {
      c.width = width * dpr;
      c.height = height * dpr;
      c.style.width = width + 'px';
      c.style.height = height + 'px';
    });
    starCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Fit the portrait into the stage, anchored to the bottom
    const scale = Math.min(width / img.width, (height * 0.96) / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const offX = (width - drawW) / 2;
    const offY = height - drawH;

    // Sample the image at a resolution that keeps particle count in budget
    const sample = document.createElement('canvas');
    let step = 3; // display px between particle targets
    let cols = Math.floor(drawW / step);
    let rows = Math.floor(drawH / step);
    while (cols * rows > MAX_PARTICLES * 2.2 && step < 10) {
      step += 0.5;
      cols = Math.floor(drawW / step);
      rows = Math.floor(drawH / step);
    }
    sample.width = cols;
    sample.height = rows;
    const sctx = sample.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(img, 0, 0, cols, rows);
    const data = sctx.getImageData(0, 0, cols, rows).data;

    /* Background mask: flood-fill from the frame edges. Any light, colorless
       region connected to the edge is studio backdrop (incl. gradients and
       shadows); interior light pixels (shirt, glasses glints) survive. */
    const bgMask = new Uint8Array(cols * rows);
    const stack = [];
    const isBgPixel = idx => {
      const i = idx * 4;
      if (data[i + 3] < 120) return true;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      return sat < 26 && luma > 120;
    };
    const seed = idx => {
      if (!bgMask[idx] && isBgPixel(idx)) { bgMask[idx] = 1; stack.push(idx); }
    };
    for (let x = 0; x < cols; x++) { seed(x); seed((rows - 1) * cols + x); }
    for (let y = 0; y < rows; y++) { seed(y * cols); seed(y * cols + cols - 1); }
    while (stack.length) {
      const idx = stack.pop();
      const x = idx % cols, y = (idx / cols) | 0;
      if (x > 0) seed(idx - 1);
      if (x < cols - 1) seed(idx + 1);
      if (y > 0) seed(idx - cols);
      if (y < rows - 1) seed(idx + cols);
    }

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const idx = y * cols + x;
        if (bgMask[idx]) continue;
        const i = idx * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 120) continue;
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (luma > BG_LUMA && (Math.max(r, g, b) - Math.min(r, g, b)) < 12) continue;
        // Luminance-shaded density: drop a share of the darkest pixels
        if (luma < 46 && ((x + y * 7) % 3 === 0)) continue;

        const [wr, wg, wb] = warm(r, g, b);
        // Jitter home positions off the grid for a pointillist, organic look
        const tx = offX + x * step + step / 2 + (Math.random() - 0.5) * step * 0.55;
        const ty = offY + y * step + step / 2 + (Math.random() - 0.5) * step * 0.55;
        particles.push({
          tx, ty,
          x: tx + (Math.random() - 0.5) * width * 0.9,
          y: ty + (Math.random() - 0.5) * height * 0.9,
          vx: 0, vy: 0,
          r: Math.max(0.8, step * 0.46 * (0.55 + Math.random() * 0.6) * (0.7 + (luma / 255) * 0.6)),
          color: 'rgb(' + wr + ',' + wg + ',' + wb + ')'
        });
        if (particles.length >= MAX_PARTICLES) { y = rows; break; }
      }
    }

    buildStars();
  }

  function buildStars() {
    stars = [];
    const count = Math.round((width * height) / 9000);
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.5 + 0.3,
        a: Math.random() * 0.55 + 0.1,
        gold: Math.random() < 0.35,
        drift: Math.random() * 0.05 + 0.01
      });
    }
  }

  function drawStars() {
    starCtx.clearRect(0, 0, width, height);
    for (const s of stars) {
      s.y -= s.drift;
      if (s.y < -2) { s.y = height + 2; s.x = Math.random() * width; }
      starCtx.globalAlpha = s.a;
      starCtx.fillStyle = s.gold ? '#D8AE7C' : '#F2F0EC';
      starCtx.beginPath();
      starCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      starCtx.fill();
    }
    starCtx.globalAlpha = 1;
  }

  function tick() {
    drawStars();
    ctx.clearRect(0, 0, width, height);
    for (const p of particles) {
      let dx = p.x - mouse.x;
      let dy = p.y - mouse.y;
      let d = Math.sqrt(dx * dx + dy * dy);
      if (d < REPEL_RADIUS) {
        if (d < 0.5) { d = 0.5; dx = 0.5; dy = 0; } // zero-distance guard
        const f = ((REPEL_RADIUS - d) / REPEL_RADIUS) * REPEL_FORCE;
        p.vx += (dx / d) * f;
        p.vy += (dy / d) * f;
      }
      p.vx = (p.vx + (p.tx - p.x) * SPRING) * FRICTION;
      p.vy = (p.vy + (p.ty - p.y) * SPRING) * FRICTION;
      p.x += p.vx;
      p.y += p.vy;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    rafId = requestAnimationFrame(tick);
  }

  function pointerMove(e) {
    const rect = stage.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    mouse.x = src.clientX - rect.left;
    mouse.y = src.clientY - rect.top;
  }
  function pointerLeave() {
    mouse.x = -9999;
    mouse.y = -9999;
  }

  let resizeTimer;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(buildParticles, 180);
  }

  /* Rebuild whenever the stage itself changes size (covers layout that
     settles after image load — window resize alone misses that). */
  let lastW = 0, lastH = 0;
  const ro = new ResizeObserver(entries => {
    const r = entries[0].contentRect;
    if (!img || !img.complete) return;
    if (Math.abs(r.width - lastW) > 2 || Math.abs(r.height - lastH) > 2) {
      lastW = r.width; lastH = r.height;
      onResize();
    }
  });
  ro.observe(stage);

  img = new Image();
  img.src = 'assets/portrait.png';
  img.onload = function () {
    buildParticles();
    tick();
    stage.classList.add('portrait-ready');
    window.addEventListener('mousemove', pointerMove, { passive: true });
    window.addEventListener('touchmove', pointerMove, { passive: true });
    window.addEventListener('touchend', pointerLeave, { passive: true });
    document.addEventListener('mouseleave', pointerLeave);
    window.addEventListener('resize', onResize);
  };
  img.onerror = function () {
    stage.classList.add('portrait-fallback');
    if (rafId) cancelAnimationFrame(rafId);
  };
})();
