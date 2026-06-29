(function () {
  const INTRO_EVENT = "photoquilt:intro-complete";

  function upgradeFigure(img) {
    const hqSrc = img.dataset.hqSrc;
    if (!hqSrc || img.dataset.hqLoaded === "1") return;

    const hq = new Image();
    hq.decoding = "async";
    hq.onload = () => {
      img.src = hqSrc;
      img.dataset.hqLoaded = "1";
      img.classList.add("is-hq");
      img.dispatchEvent(new CustomEvent("figure-hq-loaded", { bubbles: true }));
    };
    hq.onerror = () => {
      img.dispatchEvent(new CustomEvent("figure-hq-error", { bubbles: true }));
    };
    hq.src = hqSrc;
  }

  window.PhotoQuiltFigures = { upgradeFigure };

  window.addEventListener(
    INTRO_EVENT,
    () => {
      document
        .querySelectorAll("img.figure-upgrade[data-hq-src]:not([data-hq-defer])")
        .forEach(upgradeFigure);
    },
    { once: true }
  );
})();
