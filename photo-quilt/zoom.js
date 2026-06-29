(function () {
  const ZOOM_LEVELS = [1, 2.4, 4.25];
  const DRAG_THRESHOLD = 5;

  function clampPan(pan, scale, imageSize, viewSize) {
    const scaled = imageSize * scale;
    if (scaled <= viewSize) return (viewSize - scaled) / 2;
    return Math.max(viewSize - scaled, Math.min(0, pan));
  }

  function initFigureZoom(figure) {
    const viewport = figure.querySelector(".figure-zoom__viewport");
    const stage = figure.querySelector(".figure-zoom__stage");
    const img = figure.querySelector(".figure-zoom__img");
    const resetBtn = figure.querySelector(".figure-zoom__reset");
    if (!viewport || !stage || !img || !resetBtn) return;

    let level = 0;
    let panX = 0;
    let panY = 0;
    let dragging = false;
    let pointerDown = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let panStartX = 0;
    let panStartY = 0;
    let activePointerId = null;
    let savedViewFrac = null;

    function naturalSize() {
      const natW = img.naturalWidth || Number(img.getAttribute("width")) || 1;
      const natH = img.naturalHeight || Number(img.getAttribute("height")) || 1;
      return { natW, natH };
    }

    function baseFit() {
      const { natW, natH } = naturalSize();
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      if (!vw || !vh || !natW || !natH) return 1;
      return Math.min(vw / natW, vh / natH);
    }

    function currentScale() {
      return baseFit() * ZOOM_LEVELS[level];
    }

    function layoutImage() {
      const { natW, natH } = naturalSize();
      img.style.width = `${natW}px`;
      img.style.height = `${natH}px`;
    }

    function imagePointFromClient(clientX, clientY) {
      const vr = viewport.getBoundingClientRect();
      const vx = clientX - vr.left;
      const vy = clientY - vr.top;
      const scale = currentScale();
      return {
        px: (vx - panX) / scale,
        py: (vy - panY) / scale,
      };
    }

    function captureViewFraction() {
      const scale = currentScale();
      const { natW, natH } = naturalSize();
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      return {
        fx: (vw / 2 - panX) / scale / natW,
        fy: (vh / 2 - panY) / scale / natH,
      };
    }

    function restoreViewFraction(frac) {
      layoutImage();
      const scale = currentScale();
      const { natW, natH } = naturalSize();
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      const px = frac.fx * natW;
      const py = frac.fy * natH;
      panX = vw / 2 - px * scale;
      panY = vh / 2 - py * scale;
      clampPanToBounds();
      applyTransform(false);
    }

    function clampPanToBounds() {
      if (level === 0) return;
      const scale = currentScale();
      const { natW, natH } = naturalSize();
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      panX = clampPan(panX, scale, natW, vw);
      panY = clampPan(panY, scale, natH, vh);
    }

    function applyTransform(animate) {
      const bf = baseFit();
      stage.style.transition = animate ? "transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)" : "none";
      stage.style.transformOrigin = "0 0";

      if (level === 0) {
        panX = 0;
        panY = 0;
        stage.style.transform = `scale(${bf})`;
      } else {
        stage.style.transform = `translate(${panX}px, ${panY}px) scale(${currentScale()})`;
      }
    }

    function setZoomState() {
      figure.classList.toggle("is-zoomed", level > 0);
      figure.classList.toggle("is-zoom-2", level >= 2);
      resetBtn.hidden = level === 0;
    }

    function maybeLoadHq() {
      if (level > 0 && img.dataset.hqSrc && img.dataset.hqLoaded !== "1" && window.PhotoQuiltFigures) {
        savedViewFrac = captureViewFraction();
        figure.classList.add("is-loading-hq");
        window.PhotoQuiltFigures.upgradeFigure(img);
      }
    }

    function zoomToPoint(clientX, clientY, targetLevel) {
      const { px, py } = imagePointFromClient(clientX, clientY);
      level = targetLevel;

      const scale = currentScale();
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;

      panX = vw / 2 - px * scale;
      panY = vh / 2 - py * scale;
      clampPanToBounds();
      applyTransform(true);
      setZoomState();
      maybeLoadHq();
    }

    function zoomOut() {
      if (level === 0) return;
      level = 0;
      panX = 0;
      panY = 0;
      savedViewFrac = null;
      figure.classList.remove("is-dragging", "is-loading-hq");
      setZoomState();
      applyTransform(true);

      const onEnd = (event) => {
        if (event.propertyName !== "transform") return;
        stage.removeEventListener("transitionend", onEnd);
        if (level === 0) applyTransform(false);
      };
      stage.addEventListener("transitionend", onEnd);
    }

    function onLayoutChange() {
      layoutImage();
      if (level > 0 && savedViewFrac) {
        restoreViewFraction(savedViewFrac);
      } else if (level > 0) {
        clampPanToBounds();
        applyTransform(false);
      } else {
        applyTransform(false);
      }
    }

    function onPointerDown(e) {
      if (e.button !== 0 || e.target === resetBtn) return;

      pointerDown = true;
      dragging = false;
      activePointerId = e.pointerId;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      panStartX = panX;
      panStartY = panY;
      viewport.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e) {
      if (!pointerDown || e.pointerId !== activePointerId || level === 0) return;

      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;

      if (!dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        dragging = true;
        figure.classList.add("is-dragging");
      }

      const scale = currentScale();
      const { natW, natH } = naturalSize();
      panX = clampPan(panStartX + dx, scale, natW, viewport.clientWidth);
      panY = clampPan(panStartY + dy, scale, natH, viewport.clientHeight);
      applyTransform(false);
    }

    function onPointerUp(e) {
      if (!pointerDown || e.pointerId !== activePointerId) return;

      viewport.releasePointerCapture(e.pointerId);
      figure.classList.remove("is-dragging");

      if (!dragging) {
        if (level === 0) {
          zoomToPoint(e.clientX, e.clientY, 1);
        } else if (level === 1) {
          zoomToPoint(e.clientX, e.clientY, 2);
        } else {
          zoomToPoint(e.clientX, e.clientY, 2);
        }
      }

      pointerDown = false;
      dragging = false;
      activePointerId = null;
    }

    function onPointerCancel(e) {
      if (e.pointerId !== activePointerId) return;
      viewport.releasePointerCapture(e.pointerId);
      figure.classList.remove("is-dragging");
      pointerDown = false;
      dragging = false;
      activePointerId = null;
    }

    viewport.addEventListener("pointerdown", onPointerDown);
    viewport.addEventListener("pointermove", onPointerMove);
    viewport.addEventListener("pointerup", onPointerUp);
    viewport.addEventListener("pointercancel", onPointerCancel);

    resetBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      zoomOut();
    });

    figure.addEventListener("keydown", (e) => {
      if (e.key === "Escape") zoomOut();
    });

    img.addEventListener("load", onLayoutChange);

    img.addEventListener("figure-hq-loaded", () => {
      figure.classList.remove("is-loading-hq");
      if (level > 0 && savedViewFrac) {
        restoreViewFraction(savedViewFrac);
        savedViewFrac = null;
      } else {
        onLayoutChange();
      }
    });

    img.addEventListener("figure-hq-error", () => {
      figure.classList.remove("is-loading-hq");
      savedViewFrac = null;
    });

    window.addEventListener("resize", () => {
      if (level > 0) {
        clampPanToBounds();
        applyTransform(false);
      } else {
        applyTransform(false);
      }
    });

    if (img.complete) onLayoutChange();
  }

  document.querySelectorAll(".figure-zoom").forEach(initFigureZoom);
})();
