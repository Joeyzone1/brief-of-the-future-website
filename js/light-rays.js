/* ═══════════════════════════════════════════════════════════════
   LightRays — vanilla port of react-bits/LightRays (JS + CSS variant).

   Upstream renders a full-screen fragment shader through ogl
   (Renderer/Program/Triangle/Mesh). This is the same shader driven by raw
   WebGL, matching the approach already used in js/laser-flow.js, so the
   site stays dependency-free.

   Mounted into the lamp scene (#lamp-rays inside .qa-pin) with the props
   the brief specified:
     raysOrigin top-center · raysColor #ffffff · raysSpeed 1.2
     lightSpread 0.6 · rayLength 2.1 · pulsating false · fadeDistance 1
     saturation 1 · followMouse · mouseInfluence 0.1
     noiseAmount 0 · distortion 0
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var host = document.getElementById('lamp-rays');
  if (!host) return;

  var CONFIG = {
    raysOrigin: 'top-center',
    raysColor: '#ffffff',
    raysSpeed: 1.2,
    lightSpread: 0.6,
    rayLength: 2.1,
    pulsating: false,
    fadeDistance: 1.0,
    saturation: 1.0,
    followMouse: true,
    mouseInfluence: 0.1,
    noiseAmount: 0.0,
    distortion: 0.0,
    /* Not an upstream prop. The component is built for a bare dark page; here
       it stacks on the lamp's own glow and the warm vignette, so at full
       strength it flattens the scene. This scales the final colour — turn it
       up toward 1 for the stock look. */
    intensity: 0.32
  };

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  var canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);

  var gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power'
  });
  if (!gl) { host.remove(); return; }

  /* ── shaders ───────────────────────────────────────────────── */
  var VERT = [
    'attribute vec2 position;',
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = position * 0.5 + 0.5;',
    '  gl_Position = vec4(position, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform float iTime;',
    'uniform vec2  iResolution;',
    'uniform vec2  rayPos;',
    'uniform vec2  rayDir;',
    'uniform vec3  raysColor;',
    'uniform float raysSpeed;',
    'uniform float lightSpread;',
    'uniform float rayLength;',
    'uniform float pulsating;',
    'uniform float fadeDistance;',
    'uniform float saturation;',
    'uniform vec2  mousePos;',
    'uniform float mouseInfluence;',
    'uniform float noiseAmount;',
    'uniform float distortion;',
    'uniform float intensity;',
    'varying vec2 vUv;',

    'float noise(vec2 st) {',
    '  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);',
    '}',

    'float rayStrength(vec2 raySource, vec2 rayRefDirection, vec2 coord,',
    '                  float seedA, float seedB, float speed) {',
    '  vec2 sourceToCoord = coord - raySource;',
    '  vec2 dirNorm = normalize(sourceToCoord);',
    '  float cosAngle = dot(dirNorm, rayRefDirection);',

    '  float distortedAngle = cosAngle + distortion * sin(iTime * 2.0 + length(sourceToCoord) * 0.01) * 0.2;',
    '  float spreadFactor = pow(max(distortedAngle, 0.0), 1.0 / max(lightSpread, 0.001));',

    '  float dist = length(sourceToCoord);',
    '  float maxDistance = iResolution.x * rayLength;',
    '  float lengthFalloff = clamp((maxDistance - dist) / maxDistance, 0.0, 1.0);',

    '  float fadeEdge = iResolution.x * fadeDistance;',
    '  float fadeFalloff = clamp((fadeEdge - dist) / fadeEdge, 0.5, 1.0);',
    '  float pulse = pulsating > 0.5 ? (0.8 + 0.2 * sin(iTime * speed * 3.0)) : 1.0;',

    '  float baseStrength = clamp(',
    '    (0.45 + 0.15 * sin(distortedAngle * seedA + iTime * speed)) +',
    '    (0.30 + 0.20 * cos(-distortedAngle * seedB + iTime * speed)),',
    '    0.0, 1.0);',

    '  return baseStrength * lengthFalloff * fadeFalloff * spreadFactor * pulse;',
    '}',

    'void main() {',
    '  vec2 fragCoord = vUv * iResolution.xy;',
    /* Flip to a y-down screen space so the anchor maths below reads naturally. */
    '  vec2 coord = vec2(fragCoord.x, iResolution.y - fragCoord.y);',

    '  vec2 finalRayDir = rayDir;',
    '  if (mouseInfluence > 0.0) {',
    '    vec2 mouseScreenPos = mousePos * iResolution.xy;',
    '    vec2 mouseDirection = normalize(mouseScreenPos - rayPos);',
    '    finalRayDir = normalize(mix(rayDir, mouseDirection, mouseInfluence));',
    '  }',

    '  float s1 = rayStrength(rayPos, finalRayDir, coord, 36.2214, 21.11349, 1.5 * raysSpeed);',
    '  float s2 = rayStrength(rayPos, finalRayDir, coord, 22.3991, 18.02350, 1.1 * raysSpeed);',
    '  vec4 fragColor = vec4(1.0) * s1 * 0.5 + vec4(1.0) * s2 * 0.4;',

    '  if (noiseAmount > 0.0) {',
    '    float n = noise(coord * 0.01 + iTime * 0.1);',
    '    fragColor.rgb *= (1.0 - noiseAmount + noiseAmount * n);',
    '  }',

    /* Upstream tints the channels by height so the rays cool as they fall. */
    '  float brightness = 1.0 - (coord.y / iResolution.y);',
    '  fragColor.r *= 0.1 + brightness * 0.8;',
    '  fragColor.g *= 0.3 + brightness * 0.6;',
    '  fragColor.b *= 0.5 + brightness * 0.5;',

    '  if (saturation != 1.0) {',
    '    float gray = dot(fragColor.rgb, vec3(0.299, 0.587, 0.114));',
    '    fragColor.rgb = mix(vec3(gray), fragColor.rgb, saturation);',
    '  }',

    '  fragColor.rgb *= raysColor;',
    /* Scale colour and alpha together so the rays stay premultiplied and the
       browser composites them without a grey halo. */
    '  gl_FragColor = fragColor * intensity;',
    '}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) { host.remove(); return; }

  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { host.remove(); return; }
  gl.useProgram(prog);

  /* One oversized triangle covers the viewport with no seam down the middle. */
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'position');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var U = {};
  ['iTime', 'iResolution', 'rayPos', 'rayDir', 'raysColor', 'raysSpeed',
   'lightSpread', 'rayLength', 'pulsating', 'fadeDistance', 'saturation',
   'mousePos', 'mouseInfluence', 'noiseAmount', 'distortion', 'intensity'
  ].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

  function hexToRgb(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m
      ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255]
      : [1, 1, 1];
  }

  /* Where the rays are born and which way they travel. The anchor is pushed
     20% outside the frame so the origin is never visible as a hotspot. */
  function anchorAndDir(origin, w, h) {
    var out = 0.2;
    switch (origin) {
      case 'top-left':      return { pos: [0, -out * h],            dir: [0, 1] };
      case 'top-right':     return { pos: [w, -out * h],            dir: [0, 1] };
      case 'left':          return { pos: [-out * w, 0.5 * h],      dir: [1, 0] };
      case 'right':         return { pos: [(1 + out) * w, 0.5 * h], dir: [-1, 0] };
      case 'bottom-left':   return { pos: [0, (1 + out) * h],       dir: [0, -1] };
      case 'bottom-center': return { pos: [0.5 * w, (1 + out) * h], dir: [0, -1] };
      case 'bottom-right':  return { pos: [w, (1 + out) * h],       dir: [0, -1] };
      default:              return { pos: [0.5 * w, -out * h],      dir: [0, 1] };
    }
  }

  var rgb = hexToRgb(CONFIG.raysColor);
  var mouse = { x: 0.5, y: 0.5 };
  var smooth = { x: 0.5, y: 0.5 };
  var W = 0, H = 0;

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    W = Math.round(r.width * dpr);
    H = Math.round(r.height * dpr);
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    gl.viewport(0, 0, W, H);

    var a = anchorAndDir(CONFIG.raysOrigin, W, H);
    gl.useProgram(prog);
    gl.uniform2f(U.iResolution, W, H);
    gl.uniform2f(U.rayPos, a.pos[0], a.pos[1]);
    gl.uniform2f(U.rayDir, a.dir[0], a.dir[1]);
  }

  gl.useProgram(prog);
  gl.uniform3f(U.raysColor, rgb[0], rgb[1], rgb[2]);
  gl.uniform1f(U.raysSpeed, CONFIG.raysSpeed);
  gl.uniform1f(U.lightSpread, CONFIG.lightSpread);
  gl.uniform1f(U.rayLength, CONFIG.rayLength);
  gl.uniform1f(U.pulsating, CONFIG.pulsating ? 1 : 0);
  gl.uniform1f(U.fadeDistance, CONFIG.fadeDistance);
  gl.uniform1f(U.saturation, CONFIG.saturation);
  gl.uniform1f(U.mouseInfluence, CONFIG.followMouse ? CONFIG.mouseInfluence : 0);
  gl.uniform1f(U.noiseAmount, CONFIG.noiseAmount);
  gl.uniform1f(U.distortion, CONFIG.distortion);
  gl.uniform1f(U.intensity, CONFIG.intensity);
  gl.clearColor(0, 0, 0, 0);
  resize();

  var startTime = performance.now();
  var rafId = 0;
  var running = false;

  function frame(now) {
    if (!running) return;
    smooth.x += (mouse.x - smooth.x) * 0.08;
    smooth.y += (mouse.y - smooth.y) * 0.08;

    gl.useProgram(prog);
    gl.uniform1f(U.iTime, (now - startTime) * 0.001);
    gl.uniform2f(U.mousePos, smooth.x, smooth.y);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    rafId = requestAnimationFrame(frame);
  }

  function play() {
    if (running) return;
    running = true;
    rafId = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  if (CONFIG.followMouse) {
    window.addEventListener('mousemove', function (e) {
      var r = host.getBoundingClientRect();
      if (!r.width || !r.height) return;
      mouse.x = (e.clientX - r.left) / r.width;
      mouse.y = (e.clientY - r.top) / r.height;
    }, { passive: true });
  }

  /* Only burn GPU while the lamp scene is actually on screen. */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { play(); } else { stop(); }
    }, { rootMargin: '200px 0px' }).observe(host);
  } else {
    play();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { stop(); } else { play(); }
  });

  var rafResize = 0;
  window.addEventListener('resize', function () {
    cancelAnimationFrame(rafResize);
    rafResize = requestAnimationFrame(resize);
  });
  if (window.ResizeObserver) new ResizeObserver(resize).observe(host);

  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); stop(); }, false);
  canvas.addEventListener('webglcontextrestored', function () { resize(); play(); }, false);
})();
