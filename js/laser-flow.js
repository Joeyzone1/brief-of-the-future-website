/* ═══════════════════════════════════════════════════════════════
   LaserFlow — hero background beam + wisps + volumetric fog
   Vanilla port of react-bits/LaserFlow (JS-CSS). Upstream wraps a
   three.js RawShaderMaterial; the fragment shader below is the
   upstream source verbatim, so it runs on a plain WebGL1 context
   with no three.js dependency.

   Composited additively over the ink page (premultiplied canvas),
   underneath the SplashCursor sim (js/splash-cursor.js).
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var host = document.getElementById('hero');
  if (!host) return;

  /* ── props (as specified) ──────────────────────────────────────── */
  var opts = {
    color: '#C99763',
    wispDensity: 1,
    flowSpeed: 0.35,
    verticalSizing: 2,
    horizontalSizing: 0.5,
    fogIntensity: 0.45,
    fogScale: 0.3,
    wispSpeed: 15,
    wispIntensity: 5,
    flowStrength: 0.25,
    decay: 1.1,
    horizontalBeamOffset: 0,
    verticalBeamOffset: -0.5,
    // upstream defaults
    falloffStart: 1.2,
    fogFallSpeed: 0.6,
    mouseTiltStrength: 0.01,
    mouseSmoothTime: 0.0,
    maxDpr: 1.5
  };

  var VERT = [
    'precision highp float;',
    'attribute vec3 position;',
    'void main(){',
    '  gl_Position = vec4(position, 1.0);',
    '}'
  ].join('\n');

  /* Upstream fragment shader — do not reformat. */
  var FRAG = `
#ifdef GL_ES
#extension GL_OES_standard_derivatives : enable
#endif
precision highp float;
precision mediump int;

uniform float iTime;
uniform vec3 iResolution;
uniform vec4 iMouse;
uniform float uWispDensity;
uniform float uTiltScale;
uniform float uFlowTime;
uniform float uFogTime;
uniform float uBeamXFrac;
uniform float uBeamYFrac;
uniform float uFlowSpeed;
uniform float uVLenFactor;
uniform float uHLenFactor;
uniform float uFogIntensity;
uniform float uFogScale;
uniform float uWSpeed;
uniform float uWIntensity;
uniform float uFlowStrength;
uniform float uDecay;
uniform float uFalloffStart;
uniform float uFogFallSpeed;
uniform vec3 uColor;
uniform float uFade;

// Core beam/flare shaping and dynamics
#define PI 3.14159265359
#define TWO_PI 6.28318530718
#define EPS 1e-6
#define EDGE_SOFT (DT_LOCAL*4.0)
#define DT_LOCAL 0.0038
#define TAP_RADIUS 6
#define R_H 150.0
#define R_V 150.0
#define FLARE_HEIGHT 16.0
#define FLARE_AMOUNT 8.0
#define FLARE_EXP 2.0
#define TOP_FADE_START 0.1
#define TOP_FADE_EXP 1.0
#define FLOW_PERIOD 0.5
#define FLOW_SHARPNESS 1.5

// Wisps (animated micro-streaks) that travel along the beam
#define W_BASE_X 1.5
#define W_LAYER_GAP 0.25
#define W_LANES 10
#define W_SIDE_DECAY 0.5
#define W_HALF 0.01
#define W_AA 0.15
#define W_CELL 20.0
#define W_SEG_MIN 0.01
#define W_SEG_MAX 0.55
#define W_CURVE_AMOUNT 15.0
#define W_CURVE_RANGE (FLARE_HEIGHT - 3.0)
#define W_BOTTOM_EXP 10.0

// Volumetric fog controls
#define FOG_ON 1
#define FOG_CONTRAST 1.2
#define FOG_SPEED_U 0.1
#define FOG_SPEED_V -0.1
#define FOG_OCTAVES 5
#define FOG_BOTTOM_BIAS 0.8
#define FOG_TILT_TO_MOUSE 0.05
#define FOG_TILT_DEADZONE 0.01
#define FOG_TILT_MAX_X 0.35
#define FOG_TILT_SHAPE 1.5
#define FOG_BEAM_MIN 0.0
#define FOG_BEAM_MAX 0.75
#define FOG_MASK_GAMMA 0.5
#define FOG_EXPAND_SHAPE 12.2
#define FOG_EDGE_MIX 0.5

// Horizontal vignette for the fog volume
#define HFOG_EDGE_START 0.20
#define HFOG_EDGE_END 0.98
#define HFOG_EDGE_GAMMA 1.4
#define HFOG_Y_RADIUS 25.0
#define HFOG_Y_SOFT 60.0

// Beam extents and edge masking
#define EDGE_X0 0.22
#define EDGE_X1 0.995
#define EDGE_X_GAMMA 1.25
#define EDGE_LUMA_T0 0.0
#define EDGE_LUMA_T1 2.0
#define DITHER_STRENGTH 1.0

    float g(float x){return x<=0.00031308?12.92*x:1.055*pow(x,1.0/2.4)-0.055;}
    float bs(vec2 p,vec2 q,float powr){
        float d=distance(p,q),f=powr*uFalloffStart,r=(f*f)/(d*d+EPS);
        return powr*min(1.0,r);
    }
    float bsa(vec2 p,vec2 q,float powr,vec2 s){
        vec2 d=p-q; float dd=(d.x*d.x)/(s.x*s.x)+(d.y*d.y)/(s.y*s.y),f=powr*uFalloffStart,r=(f*f)/(dd+EPS);
        return powr*min(1.0,r);
    }
    float tri01(float x){float f=fract(x);return 1.0-abs(f*2.0-1.0);}
    float tauWf(float t,float tmin,float tmax){float a=smoothstep(tmin,tmin+EDGE_SOFT,t),b=1.0-smoothstep(tmax-EDGE_SOFT,tmax,t);return max(0.0,a*b);}
    float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+34.123);return fract(p.x*p.y);}
    float vnoise(vec2 p){
        vec2 i=floor(p),f=fract(p);
        float a=h21(i),b=h21(i+vec2(1,0)),c=h21(i+vec2(0,1)),d=h21(i+vec2(1,1));
        vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
    }
    float fbm2(vec2 p){
        float v=0.0,amp=0.6; mat2 m=mat2(0.86,0.5,-0.5,0.86);
        for(int i=0;i<FOG_OCTAVES;++i){v+=amp*vnoise(p); p=m*p*2.03+17.1; amp*=0.52;}
        return v;
    }
    float rGate(float x,float l){float a=smoothstep(0.0,W_AA,x),b=1.0-smoothstep(l,l+W_AA,x);return max(0.0,a*b);}
    float flareY(float y){float t=clamp(1.0-(clamp(y,0.0,FLARE_HEIGHT)/max(FLARE_HEIGHT,EPS)),0.0,1.0);return pow(t,FLARE_EXP);}

    float vWisps(vec2 uv,float topF){
    float y=uv.y,yf=(y+uFlowTime*uWSpeed)/W_CELL;
    float dRaw=clamp(uWispDensity,0.0,2.0),d=dRaw<=0.0?1.0:dRaw;
    float lanesF=floor(float(W_LANES)*min(d,1.0)+0.5); // WebGL1-safe
    int lanes=int(max(1.0,lanesF));
    float sp=min(d,1.0),ep=max(d-1.0,0.0);
    float fm=flareY(max(y,0.0)),rm=clamp(1.0-(y/max(W_CURVE_RANGE,EPS)),0.0,1.0),cm=fm*rm;
    const float G=0.05; float xS=1.0+(FLARE_AMOUNT*W_CURVE_AMOUNT*G)*cm;
    float sPix=clamp(y/R_V,0.0,1.0),bGain=pow(1.0-sPix,W_BOTTOM_EXP),sum=0.0;
    for(int s=0;s<2;++s){
        float sgn=s==0?-1.0:1.0;
        for(int i=0;i<W_LANES;++i){
            if(i>=lanes) break;
            float off=W_BASE_X+float(i)*W_LAYER_GAP,xc=sgn*(off*xS);
            float dx=abs(uv.x-xc),lat=1.0-smoothstep(W_HALF,W_HALF+W_AA,dx),amp=exp(-off*W_SIDE_DECAY);
            float seed=h21(vec2(off,sgn*17.0)),yf2=yf+seed*7.0,ci=floor(yf2),fy=fract(yf2);
            float seg=mix(W_SEG_MIN,W_SEG_MAX,h21(vec2(ci,off*2.3)));
            float spR=h21(vec2(ci,off+sgn*31.0)),seg1=rGate(fy,seg)*step(spR,sp);
            if(ep>0.0){float spR2=h21(vec2(ci*3.1+7.0,off*5.3+sgn*13.0)); float f2=fract(fy+0.5); seg1+=rGate(f2,seg*0.9)*step(spR2,ep);}
            sum+=amp*lat*seg1;
        }
    }
    float span=smoothstep(-3.0,0.0,y)*(1.0-smoothstep(R_V-6.0,R_V,y));
    return uWIntensity*sum*topF*bGain*span;
}

void mainImage(out vec4 fc,in vec2 frag){
    vec2 C=iResolution.xy*.5; float invW=1.0/max(C.x,1.0);
    vec2 sc=(512.0/iResolution.xy)*.4;
    vec2 uv=(frag-C)*sc,off=vec2(uBeamXFrac*iResolution.x*sc.x,uBeamYFrac*iResolution.y*sc.y);
    vec2 uvc = uv - off;
    float a=0.0,b=0.0;
    float basePhase=1.5*PI+uDecay*.5; float tauMin=basePhase-uDecay; float tauMax=basePhase;
    float cx=clamp(uvc.x/(R_H*uHLenFactor),-1.0,1.0),tH=clamp(TWO_PI-acos(cx),tauMin,tauMax);
    for(int k=-TAP_RADIUS;k<=TAP_RADIUS;++k){
        float tu=tH+float(k)*DT_LOCAL,wt=tauWf(tu,tauMin,tauMax); if(wt<=0.0) continue;
        float spd=max(abs(sin(tu)),0.02),u=clamp((basePhase-tu)/max(uDecay,EPS),0.0,1.0),env=pow(1.0-abs(u*2.0-1.0),0.8);
        vec2 p=vec2((R_H*uHLenFactor)*cos(tu),0.0);
        a+=wt*bs(uvc,p,env*spd);
    }
    float yPix=uvc.y,cy=clamp(-yPix/(R_V*uVLenFactor),-1.0,1.0),tV=clamp(TWO_PI-acos(cy),tauMin,tauMax);
    for(int k=-TAP_RADIUS;k<=TAP_RADIUS;++k){
        float tu=tV+float(k)*DT_LOCAL,wt=tauWf(tu,tauMin,tauMax); if(wt<=0.0) continue;
        float yb=(-R_V)*cos(tu),s=clamp(yb/R_V,0.0,1.0),spd=max(abs(sin(tu)),0.02);
        float env=pow(1.0-s,0.6)*spd;
        float cap=1.0-smoothstep(TOP_FADE_START,1.0,s); cap=pow(cap,TOP_FADE_EXP); env*=cap;
        float ph=s/max(FLOW_PERIOD,EPS)+uFlowTime*uFlowSpeed;
        float fl=pow(tri01(ph),FLOW_SHARPNESS);
        env*=mix(1.0-uFlowStrength,1.0,fl);
        float yp=(-R_V*uVLenFactor)*cos(tu),m=pow(smoothstep(FLARE_HEIGHT,0.0,yp),FLARE_EXP),wx=1.0+FLARE_AMOUNT*m;
        vec2 sig=vec2(wx,1.0),p=vec2(0.0,yp);
        float mask=step(0.0,yp);
        b+=wt*bsa(uvc,p,mask*env,sig);
    }
    float sPix=clamp(yPix/R_V,0.0,1.0),topA=pow(1.0-smoothstep(TOP_FADE_START,1.0,sPix),TOP_FADE_EXP);
    float L=a+b*topA;
    float w=vWisps(vec2(uvc.x,yPix),topA);
    float fog=0.0;
#if FOG_ON
    vec2 fuv=uvc*uFogScale;
    float mAct=step(1.0,length(iMouse.xy)),nx=((iMouse.x-C.x)*invW)*mAct;
    float ax = abs(nx);
    float stMag = mix(ax, pow(ax, FOG_TILT_SHAPE), 0.35);
    float st = sign(nx) * stMag * uTiltScale;
    st = clamp(st, -FOG_TILT_MAX_X, FOG_TILT_MAX_X);
    vec2 dir=normalize(vec2(st,1.0));
    fuv+=uFogTime*uFogFallSpeed*dir;
    vec2 prp=vec2(-dir.y,dir.x);
    fuv+=prp*(0.08*sin(dot(uvc,prp)*0.08+uFogTime*0.9));
    float n=fbm2(fuv+vec2(fbm2(fuv+vec2(7.3,2.1)),fbm2(fuv+vec2(-3.7,5.9)))*0.6);
    n=pow(clamp(n,0.0,1.0),FOG_CONTRAST);
    float pixW = 1.0 / max(iResolution.y, 1.0);
#ifdef GL_OES_standard_derivatives
    float wL = max(fwidth(L), pixW);
#else
    float wL = pixW;
#endif
    float m0=pow(smoothstep(FOG_BEAM_MIN - wL, FOG_BEAM_MAX + wL, L),FOG_MASK_GAMMA);
    float bm=1.0-pow(1.0-m0,FOG_EXPAND_SHAPE); bm=mix(bm*m0,bm,FOG_EDGE_MIX);
    float yP=1.0-smoothstep(HFOG_Y_RADIUS,HFOG_Y_RADIUS+HFOG_Y_SOFT,abs(yPix));
    float nxF=abs((frag.x-C.x)*invW),hE=1.0-smoothstep(HFOG_EDGE_START,HFOG_EDGE_END,nxF); hE=pow(clamp(hE,0.0,1.0),HFOG_EDGE_GAMMA);
    float hW=mix(1.0,hE,clamp(yP,0.0,1.0));
    float bBias=mix(1.0,1.0-sPix,FOG_BOTTOM_BIAS);
    float browserFogIntensity = uFogIntensity;
    browserFogIntensity *= 1.8;
    float radialFade = 1.0 - smoothstep(0.0, 0.7, length(uvc) / 120.0);
    float safariFog = n * browserFogIntensity * bBias * bm * hW * radialFade;
    fog = safariFog;
#endif
    float LF=L+fog;
    float dith=(h21(frag)-0.5)*(DITHER_STRENGTH/255.0);
    float tone=g(LF+w);
    vec3 col=tone*uColor+dith;
    float alpha=clamp(g(L+w*0.6)+dith*0.6,0.0,1.0);
    float nxE=abs((frag.x-C.x)*invW),xF=pow(clamp(1.0-smoothstep(EDGE_X0,EDGE_X1,nxE),0.0,1.0),EDGE_X_GAMMA);
    float scene=LF+max(0.0,w)*0.5,hi=smoothstep(EDGE_LUMA_T0,EDGE_LUMA_T1,scene);
    float eM=mix(xF,1.0,hi);
    col*=eM; alpha*=eM;
    col*=uFade; alpha*=uFade;
    fc=vec4(col,alpha);
}

void main(){
  vec4 fc;
  mainImage(fc, gl_FragCoord.xy);
  gl_FragColor = fc;
}
`;

  /* ── canvas + context ──────────────────────────────────────────── */
  var canvas = document.createElement('canvas');
  canvas.className = 'laser-flow';
  canvas.setAttribute('aria-hidden', 'true');
  host.insertBefore(canvas, host.firstChild);

  var gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false
  });
  if (!gl) { canvas.remove(); return; }
  gl.getExtension('OES_standard_derivatives');

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[laserflow]', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }
  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) { canvas.remove(); return; }

  var program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.bindAttribLocation(program, 0, 'position');
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('[laserflow]', gl.getProgramInfoLog(program));
    canvas.remove();
    return;
  }
  gl.useProgram(program);

  // fullscreen triangle — same geometry as the upstream mesh
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  function u(name) { return gl.getUniformLocation(program, name); }
  var U = {
    iTime: u('iTime'), iResolution: u('iResolution'), iMouse: u('iMouse'),
    uWispDensity: u('uWispDensity'), uTiltScale: u('uTiltScale'),
    uFlowTime: u('uFlowTime'), uFogTime: u('uFogTime'),
    uBeamXFrac: u('uBeamXFrac'), uBeamYFrac: u('uBeamYFrac'),
    uFlowSpeed: u('uFlowSpeed'), uVLenFactor: u('uVLenFactor'), uHLenFactor: u('uHLenFactor'),
    uFogIntensity: u('uFogIntensity'), uFogScale: u('uFogScale'),
    uWSpeed: u('uWSpeed'), uWIntensity: u('uWIntensity'),
    uFlowStrength: u('uFlowStrength'), uDecay: u('uDecay'),
    uFalloffStart: u('uFalloffStart'), uFogFallSpeed: u('uFogFallSpeed'),
    uColor: u('uColor'), uFade: u('uFade')
  };

  function hexToRGB(hex) {
    var c = String(hex).trim();
    if (c[0] === '#') c = c.slice(1);
    if (c.length === 3) c = c.split('').map(function (x) { return x + x; }).join('');
    var n = parseInt(c.slice(0, 6), 16) || 0xffffff;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function pushStatics() {
    gl.uniform1f(U.uWispDensity, opts.wispDensity);
    gl.uniform1f(U.uTiltScale, opts.mouseTiltStrength);
    gl.uniform1f(U.uBeamXFrac, opts.horizontalBeamOffset);
    gl.uniform1f(U.uBeamYFrac, opts.verticalBeamOffset);
    gl.uniform1f(U.uFlowSpeed, opts.flowSpeed);
    gl.uniform1f(U.uVLenFactor, opts.verticalSizing);
    gl.uniform1f(U.uHLenFactor, opts.horizontalSizing);
    gl.uniform1f(U.uFogIntensity, opts.fogIntensity);
    gl.uniform1f(U.uFogScale, opts.fogScale);
    gl.uniform1f(U.uWSpeed, opts.wispSpeed);
    gl.uniform1f(U.uWIntensity, opts.wispIntensity);
    gl.uniform1f(U.uFlowStrength, opts.flowStrength);
    gl.uniform1f(U.uDecay, opts.decay);
    gl.uniform1f(U.uFalloffStart, opts.falloffStart);
    gl.uniform1f(U.uFogFallSpeed, opts.fogFallSpeed);
    var c = hexToRGB(opts.color);
    gl.uniform3f(U.uColor, c[0], c[1], c[2]);
  }
  pushStatics();

  /* Additive over the ink page: the canvas is premultiplied, so the black
     regions of the shader contribute nothing and only beam/fog add light. */
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.DEPTH_TEST);

  /* ── sizing ────────────────────────────────────────────────────── */
  var dpr = Math.min(window.devicePixelRatio || 1, opts.maxDpr);
  var lastW = 0, lastH = 0;
  function resize() {
    var w = canvas.clientWidth || 1;
    var h = canvas.clientHeight || 1;
    var pw = Math.max(1, Math.floor(w * dpr));
    var ph = Math.max(1, Math.floor(h * dpr));
    if (pw === lastW && ph === lastH) return false;
    lastW = pw; lastH = ph;
    canvas.width = pw; canvas.height = ph;
    gl.viewport(0, 0, pw, ph);
    gl.uniform3f(U.iResolution, pw, ph, dpr);
    return true;
  }
  resize();
  /* The canvas is often measured before layout settles, so the first buffer can be
     built at the wrong size (cf. particles.js). Re-measure on every signal, not just
     inside the rAF loop. */
  if ('ResizeObserver' in window) {
    var ro = new ResizeObserver(resize);
    ro.observe(host);
    ro.observe(canvas);
  }
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('load', resize, { passive: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize).catch(function () {});

  /* ── mouse (drives the fog tilt only) ──────────────────────────── */
  var mouseTarget = [0, 0], mouseSmooth = [0, 0];
  window.addEventListener('pointermove', function (e) {
    var r = canvas.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
      mouseTarget[0] = 0; mouseTarget[1] = 0;
      return;
    }
    mouseTarget[0] = (e.clientX - r.left) * dpr;
    mouseTarget[1] = r.height * dpr - (e.clientY - r.top) * dpr;
  }, { passive: true });

  /* ── loop ──────────────────────────────────────────────────────── */
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var t0 = performance.now();
  var prev = 0, flowTime = 0, fogTime = 0, fade = 0;
  var running = false, inView = true, hidden = false;

  // one render, no scheduling (also the forced-render hook used to verify
  // the shader when the preview pane is hidden and rAF is frozen)
  function draw() {
    var t = (performance.now() - t0) / 1000;
    var dt = Math.max(0, t - prev);
    prev = t;
    var cdt = Math.min(0.033, Math.max(0.001, dt));

    flowTime += cdt;
    fogTime += cdt;
    if (fade < 1) fade = Math.min(1, fade + cdt / 1.0); // 1s fade-in

    var tau = Math.max(1e-3, opts.mouseSmoothTime);
    var alpha = 1 - Math.exp(-cdt / tau);
    mouseSmooth[0] += (mouseTarget[0] - mouseSmooth[0]) * alpha;
    mouseSmooth[1] += (mouseTarget[1] - mouseSmooth[1]) * alpha;

    gl.uniform1f(U.iTime, t);
    gl.uniform1f(U.uFlowTime, flowTime);
    gl.uniform1f(U.uFogTime, fogTime);
    gl.uniform1f(U.uFade, fade);
    gl.uniform4f(U.iMouse, mouseSmooth[0], mouseSmooth[1], 0, 0);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* Adaptive resolution (upstream behaviour): this shader is expensive at full
     DPR, so drop toward 0.6× when the frame rate sags and recover when it holds. */
  var baseDpr = dpr, emaDt = 16.7, fpsSamples = [], lastFpsCheck = performance.now(), lastDprChange = 0;
  function adjustDpr(now, dtMs) {
    emaDt = emaDt * 0.9 + dtMs * 0.1;
    fpsSamples.push(1000 / Math.max(1, emaDt));
    if (now - lastFpsCheck < 750 || !fpsSamples.length) return;
    var avg = fpsSamples.reduce(function (a, b) { return a + b; }, 0) / fpsSamples.length;
    var next = dpr;
    if (avg < 50) next = Math.max(0.6, Math.min(baseDpr, dpr * 0.85));
    else if (avg > 58 && dpr < baseDpr) next = Math.max(0.6, Math.min(baseDpr, dpr * 1.1));
    if (Math.abs(next - dpr) > 0.01 && now - lastDprChange > 2000) {
      dpr = next;
      lastDprChange = now;
      lastW = lastH = 0; // force resize() to rebuild at the new scale
    }
    fpsSamples = [];
    lastFpsCheck = now;
  }

  function frame() {
    if (!running) return;
    resize();
    var before = performance.now();
    draw();
    adjustDpr(before, before - (frame.last || before));
    frame.last = before;
    requestAnimationFrame(frame);
  }
  function start() {
    if (running || reduceMotion) return;
    running = true;
    prev = (performance.now() - t0) / 1000;
    requestAnimationFrame(frame);
  }
  function stop() { running = false; }

  document.addEventListener('visibilitychange', function () {
    hidden = document.hidden;
    if (hidden) stop(); else if (inView) start();
  }, { passive: true });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      if (inView && !hidden) start(); else stop();
    }, { threshold: 0 }).observe(host);
  }

  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); stop(); }, false);
  canvas.addEventListener('webglcontextrestored', function () { start(); }, false);

  if (reduceMotion) {
    fade = 1;
    draw(); // one still frame, no loop
  } else {
    start();
  }

  // exposed for live tuning / forced renders while the preview pane is hidden
  window.__laserFlow = { opts: opts, start: start, stop: stop, frame: draw, gl: gl, apply: pushStatics };
})();
