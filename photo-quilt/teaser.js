(function () {
  const ZOOM = 2.85;
  const LENS_D = 148;
  const LENS_R = LENS_D / 2;
  const LENS_DPR = Math.min(window.devicePixelRatio || 1, 2);
  const HOVER_MQ = window.matchMedia("(hover: hover) and (pointer: fine)");

  function tileDimensions(tile) {
    const w = tile.naturalWidth || tile.width || 0;
    const h = tile.naturalHeight || tile.height || 0;
    return { w, h };
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`failed to load ${url}`));
      img.src = url;
    });
  }

  class TileCache {
    constructor(limit = 96) {
      this.limit = limit;
      this.map = new Map();
    }

    get(url) {
      if (this.map.has(url)) {
        const entry = this.map.get(url);
        this.map.delete(url);
        this.map.set(url, entry);
        return entry;
      }

      const promise = loadImage(url);
      this.map.set(url, promise);
      promise.catch(() => this.map.delete(url));

      if (this.map.size > this.limit) {
        const oldest = this.map.keys().next().value;
        this.map.delete(oldest);
      }

      return promise;
    }
  }

  function readTileConfig(baseImg) {
    const raw = baseImg.dataset.tiles;
    if (!raw) return null;
    try {
      const config = JSON.parse(raw);
      if (!config.base || !config.width || !config.height || !config.tile) return null;
      return {
        base: config.base,
        width: config.width,
        height: config.height,
        tile: config.tile,
        cols: config.cols,
        rows: config.rows,
        ext: config.ext || "png",
      };
    } catch (_) {
      return null;
    }
  }

  function tilePath(manifest, row, col) {
    return `${manifest.base}/${row}_${col}.${manifest.ext}`;
  }

  function nativeSize(baseImg, manifest) {
    const natW =
      (baseImg.naturalWidth > 0 && baseImg.naturalWidth) ||
      (manifest && manifest.width) ||
      Number(baseImg.getAttribute("width")) ||
      baseImg.clientWidth;
    const natH =
      (baseImg.naturalHeight > 0 && baseImg.naturalHeight) ||
      (manifest && manifest.height) ||
      Number(baseImg.getAttribute("height")) ||
      baseImg.clientHeight;
    return { natW, natH };
  }

  function sourceRect(pointerX, pointerY, viewW, viewH, natW, natH) {
    if (!viewW || !viewH || !natW || !natH) return { sx: 0, sy: 0, sw: 0, sh: 0 };

    const srcHalfW = ((LENS_D / ZOOM) * 0.5 * natW) / viewW;
    const srcHalfH = ((LENS_D / ZOOM) * 0.5 * natH) / viewH;
    const natX = (pointerX / viewW) * natW;
    const natY = (pointerY / viewH) * natH;

    let sx = natX - srcHalfW;
    let sy = natY - srcHalfH;
    let sw = srcHalfW * 2;
    let sh = srcHalfH * 2;

    if (sx < 0) {
      sw += sx;
      sx = 0;
    }
    if (sy < 0) {
      sh += sy;
      sy = 0;
    }
    if (sx + sw > natW) sw = natW - sx;
    if (sy + sh > natH) sh = natH - sy;

    return { sx, sy, sw, sh };
  }

  function tilesForRect(manifest, sx, sy, sw, sh) {
    const { tile, cols, rows } = manifest;
    const c0 = Math.max(0, Math.floor(sx / tile));
    const c1 = Math.min(cols - 1, Math.floor((sx + sw - 1) / tile));
    const r0 = Math.max(0, Math.floor(sy / tile));
    const r1 = Math.min(rows - 1, Math.floor((sy + sh - 1) / tile));
    const list = [];

    for (let row = r0; row <= r1; row += 1) {
      for (let col = c0; col <= c1; col += 1) {
        list.push({ row, col });
      }
    }

    return list;
  }

  function paintCssLens(lens, baseImg, pointerX, pointerY, viewW, viewH, natW, natH) {
    const src = baseImg.currentSrc || baseImg.src;
    if (!src || !viewW || !viewH || !natW || !natH) return;

    const zoomW = viewW * ZOOM;
    const zoomH = viewH * ZOOM;
    const cx = pointerX;
    const cy = pointerY;

    lens.style.backgroundImage = `url("${src}")`;
    lens.style.backgroundSize = `${zoomW}px ${zoomH}px`;
    lens.style.backgroundPosition = `${LENS_R - (cx / viewW) * zoomW}px ${LENS_R - (cy / viewH) * zoomH}px`;
  }

  async function paintTiledLens(ctx, manifest, cache, rect) {
    const { sx, sy, sw, sh } = rect;
    if (sw <= 0 || sh <= 0) return false;

    const tiles = tilesForRect(manifest, sx, sy, sw, sh);
    const scaleX = LENS_D / sw;
    const scaleY = LENS_D / sh;
    const tileSize = manifest.tile;

    const loaded = (
      await Promise.allSettled(
        tiles.map(async ({ row, col }) => ({
          row,
          col,
          tile: await cache.get(tilePath(manifest, row, col)),
        }))
      )
    )
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);

    if (!loaded.length) return false;

    ctx.clearRect(0, 0, LENS_D, LENS_D);

    for (const { row, col, tile } of loaded) {
      const tileX = col * tileSize;
      const tileY = row * tileSize;
      const { w: tileW, h: tileH } = tileDimensions(tile);

      const ix0 = Math.max(sx, tileX);
      const iy0 = Math.max(sy, tileY);
      const ix1 = Math.min(sx + sw, tileX + tileW);
      const iy1 = Math.min(sy + sh, tileY + tileH);

      const cropW = ix1 - ix0;
      const cropH = iy1 - iy0;
      if (cropW <= 0 || cropH <= 0) continue;

      ctx.drawImage(
        tile,
        ix0 - tileX,
        iy0 - tileY,
        cropW,
        cropH,
        (ix0 - sx) * scaleX,
        (iy0 - sy) * scaleY,
        cropW * scaleX,
        cropH * scaleY
      );
    }

    return true;
  }

  function initMagnifier(root) {
    const baseImg = root.querySelector(".teaser-img");
    const lens = root.querySelector(".teaser-lens");
    if (!baseImg || !lens) return;

    const manifest = readTileConfig(baseImg);
    const cache = new TileCache();
    let tilesAvailable = false;

    if (manifest) {
      loadImage(tilePath(manifest, 0, 0))
        .then(() => {
          tilesAvailable = true;
        })
        .catch(() => {
          tilesAvailable = false;
        });
    }

    let enabled = false;
    let active = false;
    let pending = false;
    let paintGen = 0;
    let pointerX = 0;
    let pointerY = 0;
    let viewW = 0;
    let viewH = 0;
    let canvas = null;
    let ctx = null;

    function ensureCanvas() {
      if (!manifest || canvas) return;
      canvas = document.createElement("canvas");
      canvas.width = Math.round(LENS_D * LENS_DPR);
      canvas.height = Math.round(LENS_D * LENS_DPR);
      canvas.className = "teaser-lens-canvas";
      canvas.hidden = true;
      lens.appendChild(canvas);
      ctx = canvas.getContext("2d", { alpha: false });
      ctx.setTransform(LENS_DPR, 0, 0, LENS_DPR, 0, 0);
      ctx.imageSmoothingEnabled = true;
      if ("imageSmoothingQuality" in ctx) {
        ctx.imageSmoothingQuality = "high";
      }
    }

    function measure() {
      viewW = baseImg.clientWidth || root.clientWidth;
      if (baseImg.clientHeight) {
        viewH = baseImg.clientHeight;
      } else {
        const { natW, natH } = nativeSize(baseImg, manifest);
        viewH = viewW && natW ? (viewW * natH) / natW : root.clientHeight;
      }
    }

    async function paintLens() {
      const gen = ++paintGen;
      const { natW, natH } = nativeSize(baseImg, manifest);
      const rect = sourceRect(pointerX, pointerY, viewW, viewH, natW, natH);

      paintCssLens(lens, baseImg, pointerX, pointerY, viewW, viewH, natW, natH);

      if (tilesAvailable && manifest && ctx) {
        try {
          const painted = await paintTiledLens(ctx, manifest, cache, rect);
          if (gen !== paintGen) return;
          if (painted) {
            canvas.hidden = false;
            lens.style.backgroundImage = "none";
            return;
          }
        } catch (_) {
          /* keep CSS fallback */
        }
      }

      if (canvas) canvas.hidden = true;
      if (gen !== paintGen) return;
    }

    function positionLens() {
      const rootRect = root.getBoundingClientRect();
      const imgRect = baseImg.getBoundingClientRect();
      const x = imgRect.left - rootRect.left + pointerX;
      const y = imgRect.top - rootRect.top + pointerY;
      let left = x - LENS_R;
      let top = y - LENS_R;
      const boundsW = root.clientWidth;
      const boundsH = baseImg.offsetTop + viewH;
      left = Math.max(0, Math.min(left, boundsW - LENS_D));
      top = Math.max(baseImg.offsetTop, Math.min(top, boundsH - LENS_D));
      lens.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    }

    function queuePaint() {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        if (!active) return;
        positionLens();
        paintLens();
      });
    }

    function show(e) {
      if (!enabled || active) return;
      active = true;
      ensureCanvas();
      measure();
      if (e) pointerFromEvent(e);
      lens.hidden = false;
      root.classList.add("is-magnifying");
      positionLens();
      paintLens();
    }

    function hide() {
      active = false;
      pending = false;
      paintGen += 1;
      lens.hidden = true;
      lens.style.backgroundImage = "none";
      if (canvas) canvas.hidden = true;
      root.classList.remove("is-magnifying");
    }

    function pointerFromEvent(e) {
      const imgRect = baseImg.getBoundingClientRect();
      pointerX = e.clientX - imgRect.left;
      pointerY = e.clientY - imgRect.top;
    }

    function onMove(e) {
      if (!active) return;
      pointerFromEvent(e);
      queuePaint();
    }

    function enable() {
      if (enabled || !HOVER_MQ.matches) return;
      enabled = true;
      baseImg.addEventListener("mouseenter", show);
      baseImg.addEventListener("mouseleave", hide);
      baseImg.addEventListener("mousemove", onMove);
    }

    function disable() {
      if (!enabled) return;
      hide();
      enabled = false;
      baseImg.removeEventListener("mouseenter", show);
      baseImg.removeEventListener("mouseleave", hide);
      baseImg.removeEventListener("mousemove", onMove);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) enable();
        else disable();
      },
      { rootMargin: "120px 0px", threshold: 0.01 }
    );

    observer.observe(root);
    if (HOVER_MQ.matches) enable();

    HOVER_MQ.addEventListener("change", () => {
      if (
        HOVER_MQ.matches &&
        root.getBoundingClientRect().bottom > 0 &&
        root.getBoundingClientRect().top < window.innerHeight
      ) {
        enable();
      } else {
        disable();
      }
    });

    window.addEventListener("resize", () => {
      if (active) {
        measure();
        queuePaint();
      }
    });

    baseImg.addEventListener("load", () => {
      if (active) {
        measure();
        paintLens();
      }
    });
  }

  document.querySelectorAll(".teaser-mag").forEach(initMagnifier);
})();
