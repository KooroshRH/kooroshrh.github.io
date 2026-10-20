// Portrait "diffusion sampling" intro.
//
// Plays a reverse-diffusion trajectory over the portrait, following the DDPM forward process
//   x_t = sqrt(abar_t) * x0_hat + sqrt(1 - abar_t) * eps
// with a cosine noise schedule. Like a real sampler, the model's prediction x0_hat starts as a
// low-contrast, low-frequency guess and sharpens as noise drops (coarse structure first, fine
// detail last), and the noise is partly re-drawn every step as in ancestral sampling.
// Click the photo to sample again. Skipped entirely for prefers-reduced-motion.
(function () {
  var root = document.documentElement;
  var figure = document.querySelector(".hero-photo");
  var img = figure && figure.querySelector("img");
  if (!img || !root.classList.contains("diffuse-pending")) return;

  var W = 240;
  var H = 300;
  var N = W * H;
  var STEPS = 50;
  var FRAME_MS = 46;
  var HOLD_MS = 220;
  var ETA = 0.4; // share of fresh noise per step (0 = deterministic DDIM, 1 = fully re-sampled)
  var SIGMAS = [0, 1.5, 3, 6, 12, 24]; // blur pyramid for x0_hat, in pixels

  var canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  canvas.className = "hero-diffusion";
  canvas.setAttribute("aria-hidden", "true");
  var label = document.createElement("span");
  label.className = "hero-diffusion-step";
  label.setAttribute("aria-hidden", "true");
  figure.appendChild(canvas);
  figure.appendChild(label);
  var ctx = canvas.getContext("2d");
  var frame = ctx.createImageData(W, H);
  var px = frame.data;

  var eps = new Float32Array(N * 3);
  var spare = null;
  function gauss() {
    if (spare !== null) {
      var s = spare;
      spare = null;
      return s;
    }
    var u = 1 - Math.random();
    var v = Math.random();
    var r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  }
  function freshNoise() {
    for (var i = 0; i < eps.length; i++) eps[i] = gauss();
  }
  function stirNoise() {
    var keep = Math.sqrt(1 - ETA * ETA);
    for (var i = 0; i < eps.length; i++) eps[i] = keep * eps[i] + ETA * gauss();
  }

  // Cosine schedule (Nichol & Dhariwal, 2021).
  function alphaBar(t) {
    var s = 0.008;
    var f = Math.cos(((t + s) / (1 + s)) * (Math.PI / 2));
    return Math.min(0.9999, Math.max(1e-4, f * f));
  }

  function draw(x0, contrast, mean, a, b) {
    for (var i = 0, j = 0; i < N; i++, j += 4) {
      for (var c = 0; c < 3; c++) {
        var k = i * 3 + c;
        var pred = x0 ? mean[c] + (x0[k] - mean[c]) * contrast : 0;
        var x = a * pred + b * eps[k];
        px[j + c] = x <= -1 ? 0 : x >= 1 ? 255 : (x + 1) * 127.5;
      }
      px[j + 3] = 255;
    }
    ctx.putImageData(frame, 0, 0);
  }

  // Pure noise right away, so the photo never flashes before sampling starts.
  freshNoise();
  draw(null, 0, null, 0, 1);
  label.textContent = "t = 999";

  function separableBlur(src, sigma) {
    var r = Math.ceil(sigma * 2.5);
    var kernel = new Float32Array(2 * r + 1);
    var sum = 0;
    for (var i = -r; i <= r; i++) sum += kernel[i + r] = Math.exp((-i * i) / (2 * sigma * sigma));
    for (i = 0; i < kernel.length; i++) kernel[i] /= sum;
    var tmp = new Float32Array(src.length);
    var out = new Float32Array(src.length);
    var x, y, c, k, acc, xx, yy;
    for (y = 0; y < H; y++)
      for (x = 0; x < W; x++)
        for (c = 0; c < 3; c++) {
          acc = 0;
          for (k = -r; k <= r; k++) {
            xx = x + k < 0 ? 0 : x + k >= W ? W - 1 : x + k;
            acc += src[(y * W + xx) * 3 + c] * kernel[k + r];
          }
          tmp[(y * W + x) * 3 + c] = acc;
        }
    for (y = 0; y < H; y++)
      for (x = 0; x < W; x++)
        for (c = 0; c < 3; c++) {
          acc = 0;
          for (k = -r; k <= r; k++) {
            yy = y + k < 0 ? 0 : y + k >= H ? H - 1 : y + k;
            acc += tmp[(yy * W + x) * 3 + c] * kernel[k + r];
          }
          out[(y * W + x) * 3 + c] = acc;
        }
    return out;
  }

  function prepare() {
    // Same centre crop as the <img> (object-fit: cover into a 4:5 frame).
    var off = document.createElement("canvas");
    off.width = W;
    off.height = H;
    var octx = off.getContext("2d");
    var iw = img.naturalWidth;
    var ih = img.naturalHeight;
    var scale = Math.max(W / iw, H / ih);
    var sw = W / scale;
    var sh = H / scale;
    octx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, W, H);
    var data = octx.getImageData(0, 0, W, H).data;
    var x0 = new Float32Array(N * 3);
    var mean = [0, 0, 0];
    for (var i = 0; i < N; i++)
      for (var c = 0; c < 3; c++) {
        var v = data[i * 4 + c] / 127.5 - 1;
        x0[i * 3 + c] = v;
        mean[c] += v / N;
      }
    var pyramid = SIGMAS.map(function (s) {
      return s ? separableBlur(x0, s) : x0;
    });
    return { pyramid: pyramid, mean: mean };
  }

  // x0_hat at noise level t: blur roughly in step with the noise-to-signal ratio, so detail
  // finer than the noise can resolve is not yet "predicted".
  var blended = new Float32Array(N * 3);
  function predict(pyramid, a, b) {
    var sigma = Math.min(SIGMAS[SIGMAS.length - 1], (3.2 * b) / Math.max(a, 1e-3));
    var hi = 1;
    while (hi < SIGMAS.length - 1 && SIGMAS[hi] < sigma) hi++;
    var lo = hi - 1;
    var w = Math.max(0, Math.min(1, (sigma - SIGMAS[lo]) / (SIGMAS[hi] - SIGMAS[lo])));
    var A = pyramid[lo];
    var B = pyramid[hi];
    for (var i = 0; i < blended.length; i++) blended[i] = A[i] + (B[i] - A[i]) * w;
    return blended;
  }

  var running = false;
  function sample(data) {
    if (running) return;
    running = true;
    canvas.classList.remove("is-done");
    label.classList.remove("is-done");
    freshNoise();
    draw(null, 0, null, 0, 1);
    label.textContent = "t = 999";
    var step = 0;
    function tick() {
      step++;
      var t = 1 - step / STEPS;
      var abar = alphaBar(t);
      var a = Math.sqrt(abar);
      var b = Math.sqrt(1 - abar);
      // Early predictions regress toward the mean colour, as a real denoiser does at high noise.
      var contrast = Math.pow(abar, 0.35);
      stirNoise();
      draw(predict(data.pyramid, a, b), contrast, data.mean, a, b);
      label.textContent = "t = " + Math.round(t * 999);
      if (step < STEPS) {
        setTimeout(tick, FRAME_MS);
      } else {
        canvas.classList.add("is-done");
        label.classList.add("is-done");
        running = false;
      }
    }
    setTimeout(tick, HOLD_MS);
  }

  function start() {
    var data;
    try {
      data = prepare();
    } catch (e) {
      // Canvas unavailable or tainted: just show the photo.
      root.classList.remove("diffuse-pending");
      canvas.remove();
      label.remove();
      return;
    }
    root.classList.remove("diffuse-pending");
    sample(data);
    figure.addEventListener("click", function () {
      sample(data);
    });
    figure.classList.add("is-replayable");
  }

  if (img.complete && img.naturalWidth) start();
  else img.addEventListener("load", start, { once: true });
})();
