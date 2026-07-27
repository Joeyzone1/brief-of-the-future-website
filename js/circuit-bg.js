/* Brief of the Future — interactive circuit background.
   The gold circuit-and-clouds artwork (assets/hero-circuit2.mp4)
   rendered through Canvas 2D so it can react to the cursor — the video
   IS the art, the canvas adds the life:

   1. base pass    — the video frame, cover-cropped to the viewport
   2. breath pass  — the same frame composited additively with a slow
                     sine alpha, so the linework quietly brightens and
                     settles ("breathing"); black stays black

   (Cursor glow pass removed for now, 19 Jul — by request.)

   No libraries. Pauses when scrolled past the hero or the tab hides. */

(function () {
  'use strict';

  const canvas = document.getElementById('circuit-bg');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── the artwork ──────────────────────────────────────────── */
  const video = document.createElement('video');
  video.src = 'assets/hero-character.mp4';
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'auto';
  let videoReady = false, videoFailed = false;
  video.addEventListener('loadeddata', () => { videoReady = true; syncPlayback(); }, { once: true });
  video.addEventListener('error', () => { videoFailed = true; }, { once: true });

  /* ── state ────────────────────────────────────────────────── */
  let W = 0, H = 0, DPR = 1, heroH = 0;
  let running = false, rafId = 0;

  /* ── placement: the video lives in the RIGHT portion of the
     viewport (cover-fit, right-anchored); the left stays pure black
     for the headline column ─────────────────────────────────── */
  const VIDEO_ZONE = () => (W < 700 ? 0.5 : 0.62);  // fraction of width the video occupies
  function destRect() {
    const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
    const rw = W * VIDEO_ZONE();
    const scale = Math.max(rw / vw, H / vh);        // cover the right zone
    const dw = vw * scale, dh = vh * scale;
    return [W - dw, (H - dh) / 2, dw, dh];
  }

  /* wide feathered blend where black meets video — no visible seam */
  let fade = null;
  function buildFade() {
    const zone = VIDEO_ZONE();
    const solidEnd = 1 - zone;                       // black under the text column
    const blendEnd = solidEnd + (W < 700 ? 0.32 : 0.26); // feather width
    fade = ctx.createLinearGradient(0, 0, W, 0);
    fade.addColorStop(0, 'rgba(6,5,4,1)');
    fade.addColorStop(solidEnd, 'rgba(6,5,4,1)');
    fade.addColorStop(solidEnd + (blendEnd - solidEnd) * 0.45, 'rgba(6,5,4,0.55)');
    fade.addColorStop(Math.min(blendEnd, 0.98), 'rgba(6,5,4,0)');
    fade.addColorStop(1, 'rgba(6,5,4,0)');
  }

  /* ── per-frame render ─────────────────────────────────────── */
  function frame(t) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#060504';
    ctx.fillRect(0, 0, W, H);

    if (videoReady && !videoFailed) {
      const [dx, dy, dw, dh] = destRect();

      /* 1 · base — the character, right-anchored (no breath pass:
         brightness pulsing reads wrong on a portrait) */
      ctx.drawImage(video, dx, dy, dw, dh);

      /* 2 · left fade into solid black under the headline column */
      if (fade) {
        ctx.fillStyle = fade;
        ctx.fillRect(0, 0, W, H);
      }
    }

    if (running && !reduceMotion) rafId = requestAnimationFrame(frame);
  }

  /* ── lifecycle ────────────────────────────────────────────── */
  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, W < 700 ? 1 : 1.5);
    canvas.width = Math.max(1, Math.round(W * DPR));
    canvas.height = Math.max(1, Math.round(H * DPR));
    buildFade();
    const hero = document.querySelector('.hero');
    heroH = (hero && hero.offsetHeight) || H;
    if (reduceMotion && videoReady) frame(0);
  }

  function syncPlayback() {
    if (!videoReady || videoFailed) return;
    if (reduceMotion) {
      video.pause();
      frame(0);                            // one crisp still of the artwork
      return;
    }
    if (running) { const p = video.play(); if (p) p.catch(() => {}); }
    else video.pause();
  }

  function setRunning(on) {
    if (on === running) return;
    running = on;
    syncPlayback();
    if (running && !reduceMotion) rafId = requestAnimationFrame(frame);
    else cancelAnimationFrame(rafId);
  }

  function onScroll() {
    const y = window.scrollY || 0;
    const op = Math.max(0, Math.min(1, 1 - (y - heroH * 0.45) / (heroH * 0.6)));
    canvas.style.opacity = op.toFixed(3);
    setRunning(op > 0.01 && !document.hidden);
  }

  let resizeT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { resize(); onScroll(); }, 200);
  });
  document.addEventListener('visibilitychange', onScroll);
  window.addEventListener('scroll', onScroll, { passive: true });

  resize();
  onScroll();

  /* debug/verification handle */
  window.__circuitBG = {
    renderOnce: t => frame(t || 0),
    isRunning: () => running,
    videoReady: () => videoReady
  };
})();
