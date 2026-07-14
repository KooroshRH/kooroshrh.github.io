(function () {
  "use strict";
  var svg = document.getElementById("signal-banner");
  if (!svg) return;
  var NS = "http://www.w3.org/2000/svg";
  var reduce = false;
  try {
    reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {
    /* ignore */
  }

  var root = document.createElementNS(NS, "g");
  svg.appendChild(root);

  var W = 0;
  var H = 0;
  var dots = [];
  var ripples = [];
  var pointer = { x: -9999, y: -9999, on: false };
  var sweepLine = null;
  var reticle = null;
  var rafId = null;

  var LAYERS = [
    { frac: 0.36, amp: 0.11, freq: 0.011, speed: 0.00042, phase: 0.0, r: 1.7, o: 0.5 },
    { frac: 0.55, amp: 0.17, freq: 0.008, speed: -0.0003, phase: 2.1, r: 2.1, o: 0.36 },
    { frac: 0.72, amp: 0.09, freq: 0.015, speed: 0.00055, phase: 4.4, r: 1.4, o: 0.26 },
  ];

  function el(name, attrs, parent, cls) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (cls) n.setAttribute("class", cls);
    (parent || root).appendChild(n);
    return n;
  }

  function build() {
    while (root.firstChild) root.removeChild(root.firstChild);
    dots = [];
    ripples = [];

    var rect = svg.getBoundingClientRect();
    W = Math.max(300, Math.round(rect.width));
    H = Math.max(80, Math.round(rect.height));
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);

    el("line", { x1: 0, y1: H - 12, x2: W, y2: H - 12, "stroke-width": 1 }, root, "sb-axis");
    for (var tx = 0; tx <= W; tx += 60) {
      el("line", { x1: tx, y1: H - 12, x2: tx, y2: H - 8, "stroke-width": 1 }, root, "sb-axis");
    }

    var l1 = el("text", { x: 1, y: 11 }, root, "sb-label");
    l1.textContent = "fig. 0 · ambient sensing field";
    var l2 = el("text", { x: W, y: H - 1, "text-anchor": "end" }, root, "sb-label");
    l2.textContent = "mmWave · RGB-D · IMU · BLE";

    var gDots = el("g", {}, root);
    var spacing = 13;
    for (var li = 0; li < LAYERS.length; li++) {
      var L = LAYERS[li];
      for (var x = spacing / 2; x < W; x += spacing) {
        var alt = dots.length % 9 === 4;
        var c = el(
          "circle",
          { cx: x, cy: H * L.frac, r: L.r, opacity: L.o },
          gDots,
          alt ? "sb-dot sb-dot--alt" : "sb-dot"
        );
        dots.push({ el: c, bx: x, L: L, jitter: Math.random() * 6.28, jr: 0.75 + Math.random() * 0.5 });
      }
    }

    sweepLine = el(
      "line",
      { x1: 0, y1: 6, x2: 0, y2: H - 16, "stroke-width": 1, opacity: 0 },
      root,
      "sb-sweep"
    );

    reticle = el("g", { opacity: 0 }, root, "sb-ret");
    reticle.h = el("line", { x1: 0, y1: 0, x2: W, y2: 0, "stroke-width": 1 }, reticle);
    reticle.v = el("line", { x1: 0, y1: 6, x2: 0, y2: H - 12, "stroke-width": 1 }, reticle);
    reticle.c = el("circle", { r: 11, "stroke-width": 1 }, reticle);
    reticle.t = el("text", {}, reticle, "sb-readout");
  }

  function updateReticle() {
    if (!reticle) return;
    if (!pointer.on) {
      reticle.setAttribute("opacity", 0);
      return;
    }
    var x = pointer.x;
    var y = pointer.y;
    reticle.setAttribute("opacity", 1);
    reticle.h.setAttribute("y1", y);
    reticle.h.setAttribute("y2", y);
    reticle.v.setAttribute("x1", x);
    reticle.v.setAttribute("x2", x);
    reticle.c.setAttribute("cx", x);
    reticle.c.setAttribute("cy", y);

    var dx = x - W / 2;
    var dy = H - y;
    var az = (Math.atan2(dx, dy) * 180) / Math.PI;
    var rng = Math.sqrt(dx * dx + dy * dy) / Math.sqrt((W / 2) * (W / 2) + H * H);
    var azStr = (az >= 0 ? "+" : "−") + ("000" + Math.abs(az).toFixed(0)).slice(-3) + "°";
    reticle.t.textContent = "az " + azStr + " · rng " + rng.toFixed(2);

    var flip = x > W - 150;
    reticle.t.setAttribute("text-anchor", flip ? "end" : "start");
    reticle.t.setAttribute("x", flip ? x - 16 : x + 16);
    reticle.t.setAttribute("y", Math.max(18, y - 12));
  }

  function frame(now) {
    var cycle = W + 420;
    var sx = ((now * 0.12) % cycle) - 210;
    sweepLine.setAttribute("x1", sx);
    sweepLine.setAttribute("x2", sx);
    sweepLine.setAttribute("opacity", sx > 0 && sx < W ? 0.55 : 0);

    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      var L = d.L;
      var x = d.bx;
      var y =
        H * L.frac +
        H * L.amp * Math.sin(d.bx * L.freq + now * L.speed + L.phase) +
        2.2 * Math.sin(now * 0.0011 + d.jitter);

      var ds = x - sx;
      var e = Math.exp(-(ds * ds) / 1400);
      if (ds < 0) e += 0.3 * Math.exp(ds / 120);
      if (e > 1) e = 1;

      var glow = 0;
      if (pointer.on) {
        var dx = x - pointer.x;
        var dy = y - pointer.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist < 90) {
          var f = 1 - dist / 90;
          var push = f * f * 16;
          x += (dx / dist) * push;
          y += (dy / dist) * push;
          glow += f;
        }
      }
      for (var ri = 0; ri < ripples.length; ri++) {
        var rp = ripples[ri];
        var age = Math.max(0, now - rp.t0) / 1000;
        var rr = age * 240;
        var ddx = d.bx - rp.x;
        var ddy = y - rp.y;
        var dd = Math.sqrt(ddx * ddx + ddy * ddy);
        glow += Math.exp(-((dd - rr) * (dd - rr)) / 500) * Math.max(0, 1 - age / 1.5);
      }
      if (glow > 1) glow = 1;

      d.el.setAttribute("cx", x);
      d.el.setAttribute("cy", y);
      d.el.setAttribute("r", L.r * d.jr * (1 + 1.5 * e + 1.2 * glow));
      d.el.setAttribute("opacity", Math.min(1, L.o + 0.5 * e + 0.55 * glow));
    }

    for (var j = ripples.length - 1; j >= 0; j--) {
      var r2 = ripples[j];
      var age2 = Math.max(0, now - r2.t0) / 1000;
      if (age2 > 1.5) {
        if (r2.el.parentNode) r2.el.parentNode.removeChild(r2.el);
        ripples.splice(j, 1);
      } else {
        r2.el.setAttribute("r", age2 * 240);
        r2.el.setAttribute("opacity", (1 - age2 / 1.5) * 0.5);
      }
    }

    rafId = requestAnimationFrame(frame);
  }

  function toLocal(ev) {
    var r = svg.getBoundingClientRect();
    return {
      x: ((ev.clientX - r.left) / r.width) * W,
      y: ((ev.clientY - r.top) / r.height) * H,
    };
  }

  build();

  if (reduce) {
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      var L = d.L;
      d.el.setAttribute("cy", H * L.frac + H * L.amp * Math.sin(d.bx * L.freq + L.phase));
    }
  } else {
    svg.addEventListener("pointermove", function (ev) {
      var p = toLocal(ev);
      pointer.x = p.x;
      pointer.y = p.y;
      pointer.on = true;
      updateReticle();
    });
    svg.addEventListener("pointerleave", function () {
      pointer.on = false;
      updateReticle();
    });
    svg.addEventListener("pointerdown", function (ev) {
      var p = toLocal(ev);
      if (ripples.length >= 6) return;
      var c = el("circle", { cx: p.x, cy: p.y, r: 1, "stroke-width": 1 }, root, "sb-ripple");
      ripples.push({ x: p.x, y: p.y, t0: performance.now(), el: c });
    });

    if (typeof ResizeObserver !== "undefined") {
      var pending = null;
      new ResizeObserver(function () {
        if (pending) clearTimeout(pending);
        pending = setTimeout(function () {
          if (rafId) cancelAnimationFrame(rafId);
          build();
          rafId = requestAnimationFrame(frame);
        }, 150);
      }).observe(svg);
    }

    rafId = requestAnimationFrame(frame);
  }
})();
