/* Brief of the Future — transparent lamp video.
   The source export's "alpha channel" is metadata-only — both ffmpeg and
   the browser decode it as a fully opaque frame with a solid black
   background baked in (confirmed by sampling: background is pure
   0,0,0; the bulb itself never drops below ~110 on any channel). So
   real alpha compositing isn't available here; instead this keys the
   near-black background out per-pixel on a canvas — same visual result,
   works in every browser that can decode the video at all. */

(function () {
  'use strict';

  const canvas = document.querySelector('.lamp-canvas');
  if (!canvas || !canvas.getContext) return;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const probe = document.createElement('video');
  const canWebm = !!(probe.canPlayType && probe.canPlayType('video/webm; codecs="vp9"'));

  const video = document.createElement('video');
  video.src = canWebm ? 'assets/lamp2.webm' : 'assets/lamp2.mp4';
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'none';
  let ready = false, loaded = false, running = false, rafId = 0;
  video.addEventListener('loadeddata', () => { ready = true; draw(); }, { once: true });

  /* luma-key: below LOW → fully transparent, above HIGH → fully opaque,
     linear ramp between (removes compression noise around the black) */
  const LOW = 16, HIGH = 46, RANGE = HIGH - LOW;

  /* glow sync: the radial glow behind the lamp follows the bulb's real
     brightness — measured from the same pixels the key already reads —
     so the flicker of the filament and the room glow move as one */
  const glow = document.querySelector('.qa-glow');
  let minL = Infinity, maxL = -Infinity, glowNow = 0.7;

  function draw() {
    if (ready) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = frame.data;
      let sum = 0, count = 0;
      for (let i = 0; i < d.length; i += 4) {
        const luma = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        d[i + 3] = luma <= LOW ? 0 : luma >= HIGH ? 255 : Math.round((luma - LOW) / RANGE * 255);
        if (luma >= HIGH) { sum += luma; count++; }
      }
      ctx.putImageData(frame, 0, 0);

      if (glow && count > 0) {
        const avg = sum / count;
        minL = Math.min(minL, avg);
        maxL = Math.max(maxL, avg);
        const norm = maxL > minL ? (avg - minL) / (maxL - minL) : 0.5;
        const target = 0.45 + 0.55 * norm;
        glowNow += (target - glowNow) * 0.12;   // ease so it breathes, not strobes
        glow.style.opacity = glowNow.toFixed(3);
      }
    }
    if (running && !reduceMotion) rafId = requestAnimationFrame(draw);
  }

  function setRunning(on) {
    if (on === running) return;
    running = on;
    if (on) {
      if (!loaded) { loaded = true; video.load(); }
      const p = video.play(); if (p) p.catch(() => {});
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(draw);
    } else {
      video.pause();
      cancelAnimationFrame(rafId);
    }
  }

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => setRunning(entry.isIntersecting && !document.hidden));
    }, { rootMargin: '600px 0px' });
    io.observe(canvas);
  } else {
    setRunning(true);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { video.pause(); cancelAnimationFrame(rafId); }
    else if (running) { const p = video.play(); if (p) p.catch(() => {}); rafId = requestAnimationFrame(draw); }
  });
})();
