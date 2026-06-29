// PhotoQuilt title animation — expects #main SVG in the page.
(function () {
  const PAL = [
    "#b83818", "#c1440e", "#d4622a", "#e06830", "#f07840",
    "#8b2500", "#a33010", "#c04820",
    "#d4a020", "#e8b830", "#f0c848", "#f5a050",
    "#2e5f82", "#3d6d94", "#4a7c9e", "#5a94b8", "#78b0d0",
    "#8a5838", "#a06840", "#c08050", "#d89060",
    "#2e6838", "#4a8848", "#68a858", "#88c070",
    "#5a3878", "#7848a0", "#9860c0", "#b078d8",
    "#3a5068", "#506880", "#688898",
  ];

  const TILE = 4;
  const GAP = 0.1;
  const ZOOM = 1.4;
  const LENS_R = 36;
  const QCX = 448;
  const QCY = 95;
  const QX0 = 396;
  const QY0 = 31;
  const TILE_PAD = 5;
  const COLS = Math.ceil(104 / TILE) + TILE_PAD * 2;
  const ROWS = Math.ceil(130 / TILE) + TILE_PAD * 2;
  const PARK = { x: 486, y: 150 };
  const INTRO_EVENT = "photoquilt:intro-complete";

  function tileColor(c, r) {
    return PAL[Math.abs((c * 7 + r * 13) ^ (c * 3 + r * 5)) % PAL.length];
  }

  function buildTiles(container, onDone) {
    container.innerHTML = "";
    let row = 0;
    let col = 0;
    const batch = 24;
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 16));

    function step(deadline) {
      let added = 0;
      const budget = deadline && deadline.timeRemaining ? deadline.timeRemaining() : 8;

      while (row < ROWS && added < batch && budget > 1) {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        const x = QX0 + (col - TILE_PAD) * TILE;
        const y = QY0 + (row - TILE_PAD) * TILE;
        rect.setAttribute("x", x);
        rect.setAttribute("y", y);
        rect.setAttribute("width", TILE - GAP);
        rect.setAttribute("height", TILE - GAP);
        rect.setAttribute("fill", tileColor(col, row));
        rect.setAttribute("rx", "0.3");
        container.appendChild(rect);
        col += 1;
        if (col >= COLS) {
          col = 0;
          row += 1;
        }
        added += 1;
      }

      if (row < ROWS) idle(step, { timeout: 120 });
      else onDone();
    }

    idle(step, { timeout: 120 });
  }

  const svg = document.getElementById("main");
  const mosaicTilesZoom = document.getElementById("mosaicTilesZoom");
  const mosaicZoom = document.getElementById("mosaicZoom");
  if (!svg || !mosaicTilesZoom || !mosaicZoom) return;

  buildTiles(mosaicTilesZoom, boot);

  function boot() {
    const zoomTx = QCX * (1 - ZOOM);
    const zoomTy = QCY * (1 - ZOOM);
    mosaicZoom.setAttribute(
      "transform",
      `translate(${zoomTx.toFixed(3)}, ${zoomTy.toFixed(3)}) scale(${ZOOM})`
    );

    const lensRig = document.getElementById("lensRig");
    const mosaicOffset = document.getElementById("mosaicOffset");
    const lensMaskCircle = document.getElementById("lensMaskCircle");
    const lensMosaic = document.getElementById("lensMosaic");
    const lensDecor = document.getElementById("lensDecor");
    if (!lensRig || !mosaicOffset || !lensMaskCircle || !lensMosaic || !lensDecor) return;

    let lensX = 418;
    let lensY = 52;
    let lensMaskR = 0;
    let state = "idle";
    let autoDone = false;

    function setLensMaskRadius(r) {
      lensMaskR = r;
      lensMaskCircle.setAttribute("r", r.toFixed(2));
    }

    function setLens(cx, cy) {
      lensX = cx;
      lensY = cy;
      lensRig.setAttribute("transform", `translate(${cx.toFixed(2)}, ${cy.toFixed(2)})`);
      mosaicOffset.setAttribute("transform", `translate(${(-cx).toFixed(2)}, ${(-cy).toFixed(2)})`);
      lensMaskCircle.setAttribute("cx", cx.toFixed(2));
      lensMaskCircle.setAttribute("cy", cy.toFixed(2));
      if (lensMaskR > 0) setLensMaskRadius(lensMaskR);
    }

    function fi(id, ms) {
      setTimeout(() => {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.transition = "opacity 0.45s ease";
        el.style.opacity = "1";
      }, ms);
    }

    function eio(t) {
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    function lerp(a, b, t) {
      return a + (b - a) * t;
    }

    function setLensOpacity(v, dur = "0.35s") {
      const n = parseFloat(v);
      lensDecor.style.transition = `opacity ${dur} ease`;
      lensDecor.style.opacity = v;
      lensMosaic.style.transition = `opacity ${dur} ease`;
      lensMosaic.style.opacity = n > 0 ? "1" : "0";
      setLensMaskRadius(n > 0 ? LENS_R : 0);
    }

    function finishIntro() {
      if (autoDone) return;
      autoDone = true;
      state = "parked";
      svg.classList.remove("is-lens-touring");
      lensRig.style.animation = "none";
      mosaicOffset.style.animation = "none";
      lensMaskCircle.style.animation = "none";
      setLens(PARK.x, PARK.y);
      setTimeout(() => {
        if (state === "parked") setLensOpacity("0.25", "0.6s");
      }, 500);
      window.dispatchEvent(new CustomEvent(INTRO_EVENT));
    }

    function startAuto() {
      state = "autoplay";
      setLensOpacity("1", "0.35s");
      svg.classList.add("is-lens-touring");
      lensRig.addEventListener("animationend", finishIntro, { once: true });
      setTimeout(finishIntro, 3000);
    }

    let hovering = false;
    let tgtX = PARK.x;
    let tgtY = PARK.y;
    let curX = PARK.x;
    let curY = PARK.y;
    let hRaf = null;

    function svgXY(e) {
      const r = svg.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * (760 / r.width),
        y: (e.clientY - r.top) * (170 / r.height),
      };
    }

    function inQ(x, y) {
      return x >= 396 - 20 && x <= 396 + 104 + 20 && y >= 31 - 10 && y <= 31 + 130 + 15;
    }

    function tickHover() {
      curX += (tgtX - curX) * 0.15;
      curY += (tgtY - curY) * 0.15;
      setLens(curX, curY);
      if (hovering) hRaf = requestAnimationFrame(tickHover);
    }

    svg.addEventListener("mousemove", (e) => {
      if (state === "autoplay") return;
      const { x, y } = svgXY(e);
      if (inQ(x, y)) {
        tgtX = x;
        tgtY = y;
        if (!hovering) {
          hovering = true;
          state = "hover";
          setLensOpacity("1", "0.2s");
          curX = lensX;
          curY = lensY;
          cancelAnimationFrame(hRaf);
          hRaf = requestAnimationFrame(tickHover);
        }
      } else if (hovering) endHover();
    });

    svg.addEventListener("mouseleave", () => {
      if (hovering) endHover();
    });

    function endHover() {
      hovering = false;
      state = "parked";
      cancelAnimationFrame(hRaf);
      const fx = curX;
      const fy = curY;
      const t0 = performance.now();
      const d = 700;

      function ret(now) {
        const t = eio(Math.min((now - t0) / d, 1));
        curX = lerp(fx, PARK.x, t);
        curY = lerp(fy, PARK.y, t);
        setLens(curX, curY);
        if (t < 1) requestAnimationFrame(ret);
        else {
          setTimeout(() => {
            if (state === "parked") setLensOpacity("0.25", "0.55s");
          }, 100);
        }
      }

      requestAnimationFrame(ret);
    }

    setLens(418, 52);
    setLensOpacity("0", "0s");
    fi("tPhoto", 120);
    setTimeout(() => {
      fi("tQ", 190);
      fi("tUilt", 265);
    }, 120);
    setTimeout(startAuto, 660);
  }
})();
