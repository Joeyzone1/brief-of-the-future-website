/* ═══════════════════════════════════════════════════════════════
   Process map — draws the wires between the automation nodes, then
   builds the whole map under the scroll.

   Layout is CSS's job (a flex column, stepped left/right off the centre
   line). This reads the real port positions and draws a cubic bezier from
   each node's output port into the next node's input port, so the curves
   stay correct at every width without a hard-coded coordinate.

   The scroll pass then wires that geometry to a scrubbed GSAP timeline:
   a node fades up, its outgoing wire draws itself with a comet on the
   tip, the wire flashes as it lands, the gate label appears, and the
   next node takes over. Segment durations are proportional to the real
   pixel distances, so each wire draws exactly as its own gap crosses the
   viewport — the build tracks the scroll instead of racing it.

   Wires are inert decoration: no pointer events, no layout effect.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  var map = document.getElementById('pmap');
  var svg = document.getElementById('pmap-wires');
  if (!map || !svg) return;

  var section = map.closest('.process');
  var nodes = Array.prototype.slice.call(map.querySelectorAll('.pnode'));
  var labels = Array.prototype.slice.call(map.querySelectorAll('.pn-edge'));
  if (nodes.length < 2) return;

  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var animated = !!(gsap && ScrollTrigger) && !reduceMotion;

  var WIRE_DIM = 'rgba(201, 151, 99, 0.45)';
  var WIRE_HOT = 'rgba(216, 174, 124, 0.95)';

  var wires = [];       // one entry per gap: { path, comet, pulse, len }
  var timeline = null;
  var scrambled = false;

  /* ── geometry ───────────────────────────────────────────────────
     offsetTop/offsetLeft rather than getBoundingClientRect: the reveal
     animation transforms the nodes, and rects include transforms. Offsets
     don't, so a mid-animation redraw still lands the wires on the ports'
     resting positions. */
  function offsetUpTo(el, root) {
    var y = 0;
    while (el && el !== root) { y += el.offsetTop; el = el.offsetParent; }
    return y;
  }

  /* Document-space top of the section, valid whether or not it is pinned.
     While the pin is engaged the section itself is position:fixed, so neither
     its client rect nor its offset chain says where it lives in the page — but
     the pin-spacer ScrollTrigger wraps it in is still sitting in normal flow at
     exactly that spot, so measure whichever of the two is in the document.
     (A refresh triggered mid-pin — any resize while the hold is on screen —
     reads the section itself as ~-745 without this.) */
  function sectionTop() {
    var host = section.parentNode;
    var el = (host && host.classList && host.classList.contains('pin-spacer')) ? host : section;
    return offsetUpTo(el, null);
  }

  function offsetIn(el) {
    var x = 0, y = 0;
    while (el && el !== map) {
      x += el.offsetLeft;
      y += el.offsetTop;
      el = el.offsetParent;
    }
    return { x: x, y: y };
  }

  /* Port centre in the map's own coordinate space. Node 01 hides its input
     port (nothing feeds a trigger), hence the fallback to the node edge. */
  function portPoint(node, which) {
    var port = node.querySelector(which === 'in' ? '.pn-port-in' : '.pn-port-out');
    if (port && port.offsetParent) {
      var p = offsetIn(port);
      return { x: p.x + port.offsetWidth / 2, y: p.y + port.offsetHeight / 2 };
    }
    var n = offsetIn(node);
    return {
      x: n.x + node.offsetWidth / 2,
      y: which === 'in' ? n.y : n.y + node.offsetHeight
    };
  }

  /* Cubic bezier with vertical handles — the shape every node editor uses
     for a top-to-bottom connection. The handle grows with the horizontal
     offset so a big sideways step still leaves the port travelling straight
     down before it turns, and is capped at 0.8·dy so the curve never
     overshoots the far port and doubles back. */
  function wirePath(a, b) {
    var dy = b.y - a.y;
    var dx = Math.abs(b.x - a.x);
    var h = Math.max(dy * 0.45, Math.min(dx * 0.6, dy * 0.8, 140));
    return 'M ' + a.x + ' ' + a.y +
           ' C ' + a.x + ' ' + (a.y + h) +
           ' ' + b.x + ' ' + (b.y - h) +
           ' ' + b.x + ' ' + b.y;
  }

  function draw() {
    var w = map.offsetWidth, h = map.offsetHeight;
    if (!w || !h) return false;

    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    wires = [];

    for (var i = 0; i < nodes.length - 1; i++) {
      var d = wirePath(portPoint(nodes[i], 'out'), portPoint(nodes[i + 1], 'in'));

      var path = document.createElementNS(NS, 'path');
      path.setAttribute('class', 'pmap-wire');
      path.setAttribute('d', d);
      svg.appendChild(path);

      var entry = { path: path, len: path.getTotalLength(), comet: null, pulse: null };

      /* The steady-state signal, once the wire exists. animateMotion follows
         the path itself, so no JS ticker is involved after setup. */
      if (!reduceMotion) {
        var pulse = document.createElementNS(NS, 'circle');
        pulse.setAttribute('class', 'pmap-pulse');
        pulse.setAttribute('r', '3');
        var motion = document.createElementNS(NS, 'animateMotion');
        motion.setAttribute('dur', '3s');
        motion.setAttribute('repeatCount', 'indefinite');
        motion.setAttribute('begin', (i * 0.45) + 's');
        motion.setAttribute('path', d);
        pulse.appendChild(motion);
        svg.appendChild(pulse);
        entry.pulse = pulse;

        /* Rides the tip of the wire while it draws. */
        var comet = document.createElementNS(NS, 'circle');
        comet.setAttribute('class', 'pmap-comet');
        comet.setAttribute('r', '4');
        comet.setAttribute('opacity', '0');
        svg.appendChild(comet);
        entry.comet = comet;
      }

      wires.push(entry);

      /* Park the gate label on the curve's midpoint. */
      var label = labels[i];
      if (label) {
        var mid = path.getPointAtLength(entry.len / 2);
        label.style.left = mid.x + 'px';
        label.style.top = mid.y + 'px';
        label.classList.add('is-placed');
      }
    }
    return true;
  }

  /* ── scroll choreography ────────────────────────────────────────
     One scrubbed timeline across the map. Every segment is positioned and
     sized in normalised map-height units, so timeline time == vertical
     position: whatever is crossing the 80% line is what's building. */
  function buildTimeline() {
    if (timeline) {
      if (timeline.scrollTrigger) timeline.scrollTrigger.kill();
      timeline.kill();
      timeline = null;
    }

    var mapH = map.offsetHeight;
    if (!mapH) return;
    var u = function (px) { return px / mapH; };

    timeline = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: map,
        /* Absolute scroll positions, not 'top 88%' / 'bottom 25%'.
           The section is pinned for its last stretch (see buildPin), and the
           map lives inside it — so for any element-based position ScrollTrigger
           adds the pin's distance, which pushes the end of the build past the
           whole hold. That is exactly backwards: the point of the hold is that
           the build finishes *during* it. Numbers bypass that correction.

           These run on every refresh, when ScrollTrigger has reverted the pins,
           so the geometry they read is the natural (unpinned) layout.
              start — map top at 88% of the viewport, same as before.
              end   — 0.83 of a viewport past the pin's start, i.e. about
                      three-quarters into the hold, leaving the rest still. */
        start: function () {
          return sectionTop() + offsetUpTo(map, section) - window.innerHeight * 0.88;
        },
        end: function () {
          return sectionTop() + section.offsetHeight - window.innerHeight * 0.17;
        },
        scrub: 1.2,
        invalidateOnRefresh: true
      }
    });

    nodes.forEach(function (node, i) {
      var top = node.offsetTop;
      var bottom = top + node.offsetHeight;

      /* The node lands just before its own top reaches the trigger line. */
      var nodeAt = Math.max(0, u(top) - 0.03);
      var nodeDur = 0.055;
      var ports = node.querySelectorAll('.pn-port');

      gsap.set(node, { autoAlpha: 0, y: 26, scale: 0.97, transformOrigin: '50% 50%' });
      gsap.set(ports, { scale: 0, transformOrigin: '50% 50%' });

      timeline.to(node, {
        autoAlpha: 1, y: 0, scale: 1, duration: nodeDur, ease: 'power2.out'
      }, nodeAt);
      timeline.to(ports, {
        scale: 1, duration: 0.022, ease: 'back.out(3)'
      }, nodeAt + nodeDur * 0.55);

      var wire = wires[i];
      if (!wire) return;

      /* The wire owns exactly the gap between this node and the next, so it
         finishes drawing the moment the next node is due. */
      var from = u(bottom);
      var to = u(nodes[i + 1].offsetTop);
      var dur = Math.max(0.03, to - from);

      gsap.set(wire.path, { strokeDasharray: wire.len, strokeDashoffset: wire.len });
      timeline.to(wire.path, { strokeDashoffset: 0, duration: dur }, from);

      if (wire.comet) {
        var tip = { t: 0 };
        gsap.set(wire.comet, { opacity: 0 });
        timeline.set(wire.comet, { opacity: 1 }, from);
        timeline.to(tip, {
          t: 1,
          duration: dur,
          onUpdate: function () {
            var p = wire.path.getPointAtLength(tip.t * wire.len);
            wire.comet.setAttribute('cx', p.x);
            wire.comet.setAttribute('cy', p.y);
          }
        }, from);
        timeline.to(wire.comet, { opacity: 0, duration: 0.02 }, from + dur);
      }

      /* Contact flash as the wire lands on the next node's port. */
      timeline.to(wire.path, { stroke: WIRE_HOT, duration: 0.015 }, from + dur);
      timeline.to(wire.path, { stroke: WIRE_DIM, duration: 0.06 }, from + dur + 0.015);

      /* The looping signal only makes sense once the wire is connected. */
      if (wire.pulse) {
        gsap.set(wire.pulse, { opacity: 0 });
        timeline.to(wire.pulse, { opacity: 1, duration: 0.03 }, from + dur);
      }

      var label = labels[i];
      if (label) {
        gsap.set(label, { opacity: 0 });
        timeline.to(label, { opacity: 1, duration: 0.03 }, from + dur * 0.6);
      }
    });
  }

  /* ── the hold ───────────────────────────────────────────────────
     Once the section's bottom reaches the bottom of the viewport, the whole
     section is pinned: the page stops moving for ~0.9 of a viewport of scroll.
     The build's own trigger keeps advancing through that scroll (it measures
     raw scroll, and the section is frozen on screen), so the last node, its
     wire and the "System live" cap finish while nothing else moves — then the
     pin releases and the next section arrives.

     Created once. The end is a function and invalidateOnRefresh is on, so a
     resize re-measures it rather than needing a rebuild. */
  var pinST = null;
  function buildPin() {
    if (pinST || !animated || !section) return;
    pinST = ScrollTrigger.create({
      trigger: section,
      start: 'bottom bottom',
      /* ~0.65vh of that hold is the build finishing; the rest is the beat. */
      end: function () { return '+=' + Math.round(window.innerHeight * 1.1); },
      pin: true,
      pinSpacing: true,
      anticipatePin: 1,
      invalidateOnRefresh: true
    });
  }

  /* Each node's type label boots in once, the first time it is reached.
     Separate one-shot triggers: scrambling text under a scrub just jitters. */
  function buildScramble() {
    if (scrambled || !window.ScrambleTextPlugin) return;
    scrambled = true;
    nodes.forEach(function (node) {
      var kind = node.querySelector('.pn-kind');
      if (!kind) return;
      var text = kind.textContent;
      ScrollTrigger.create({
        trigger: node,
        start: 'top 78%',
        once: true,
        onEnter: function () {
          gsap.to(kind, {
            duration: 0.7,
            scrambleText: { text: text, chars: 'upperCase', speed: 0.5 }
          });
        }
      });
    });
  }

  /* This map sits ABOVE a pinned section. Recreating our own ScrollTrigger only
     re-measures ours — so whenever the map's height changes, every trigger below
     it is left pointing at stale page offsets and the pin engages early. */
  var lastHeight = -1;
  var refreshQueued = false;
  function refreshAll() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(function () {
      refreshQueued = false;
      ScrollTrigger.refresh();
    });
  }

  function render() {
    if (!draw()) return;
    if (!animated) return;
    buildTimeline();
    buildPin();
    buildScramble();
    /* Height-guarded so a refresh can't feed the ResizeObserver back into here. */
    var h = map.offsetHeight;
    if (h !== lastHeight) {
      lastHeight = h;
      refreshAll();
    }
  }

  /* Fonts change node heights, which moves every port. */
  var fontsReady = (document.fonts && document.fonts.ready)
    ? document.fonts.ready
    : Promise.resolve();

  render();
  fontsReady.then(render);
  window.addEventListener('load', render);

  var raf = 0;
  function schedule() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(render);
  }
  window.addEventListener('resize', schedule);

  /* Node heights also change on their own (late layout passes, wrapping
     changes), so watch the map rather than relying on resize alone. Transforms
     don't affect the content box, so the reveal animation won't retrigger it. */
  if (window.ResizeObserver) {
    new ResizeObserver(schedule).observe(map);
  }

  /* Let the rest of the site force a rebuild after its own layout settles. */
  window.redrawProcessMap = render;
})();
