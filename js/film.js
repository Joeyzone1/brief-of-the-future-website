/* Brief of the Future — brand film.
   Code-drawn "living network": drifting gold nodes, linked when close,
   with bright pulses travelling along the links. Stands in for real
   footage; replace the canvas with a <video> in .film-frame to swap. */

(function () {
  'use strict';

  const canvas = document.getElementById('film-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let w = 0, h = 0, pts = [], pulses = [], raf = null, lastSpawn = 0;
  const LINK = 150;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }

  function seed() {
    const n = Math.round(Math.min(120, (w * h) / 14000));
    pts = [];
    for (let i = 0; i < n; i++) {
      pts.push({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
        r: 0.8 + Math.random() * 1.5
      });
    }
    pulses = [];
  }

  function spawnPulse(now) {
    // pick a random linked pair to light up
    for (let tries = 0; tries < 12; tries++) {
      const a = pts[(Math.random() * pts.length) | 0];
      const b = pts[(Math.random() * pts.length) | 0];
      if (a === b) continue;
      const dx = a.x - b.x, dy = a.y - b.y;
      if (dx * dx + dy * dy < LINK * LINK * 0.7) {
        pulses.push({ a, b, t: 0, speed: 0.012 + Math.random() * 0.012 });
        lastSpawn = now;
        return;
      }
    }
  }

  function step(now) {
    ctx.clearRect(0, 0, w, h);

    // soft gold glow behind the centre
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.6);
    g.addColorStop(0, 'rgba(198, 154, 90, 0.11)');
    g.addColorStop(1, 'rgba(198, 154, 90, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // links
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      for (let j = i + 1; j < pts.length; j++) {
        const b = pts[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < LINK * LINK) {
          const alpha = (1 - Math.sqrt(d2) / LINK) * 0.34;
          ctx.strokeStyle = 'rgba(198, 154, 90, ' + alpha.toFixed(3) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // nodes — bright core with a soft gold halo
    for (const p of pts) {
      ctx.fillStyle = 'rgba(198, 154, 90, 0.18)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(240, 216, 178, 0.95)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      if (!reduceMotion) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < -10) p.x = w + 10; else if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10; else if (p.y > h + 10) p.y = -10;
      }
    }

    // pulses: bright dots running along links
    if (!reduceMotion) {
      if (now - lastSpawn > 700 && pulses.length < 7) spawnPulse(now);
      pulses = pulses.filter(pl => pl.t <= 1);
      for (const pl of pulses) {
        pl.t += pl.speed;
        const x = pl.a.x + (pl.b.x - pl.a.x) * pl.t;
        const y = pl.a.y + (pl.b.y - pl.a.y) * pl.t;
        const fade = Math.sin(Math.PI * Math.min(pl.t, 1));
        // wide outer glow
        ctx.fillStyle = 'rgba(198, 154, 90, ' + (0.22 * fade).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(x, y, 14, 0, Math.PI * 2);
        ctx.fill();
        // inner halo
        ctx.fillStyle = 'rgba(216, 174, 124, ' + (0.5 * fade).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
        // hot core
        ctx.fillStyle = 'rgba(255, 235, 200, ' + fade.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    raf = requestAnimationFrame(step);
  }

  function start() {
    if (raf === null) raf = requestAnimationFrame(step);
  }
  function stop() {
    if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
  }

  // only animate while the film section is near the viewport
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => (e.isIntersecting ? start() : stop()));
  }, { rootMargin: '200px' });
  io.observe(canvas);

  window.addEventListener('resize', resize);
  resize();
  if (reduceMotion) { step(0); stop(); } // draw one static frame
})();
