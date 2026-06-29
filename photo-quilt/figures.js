(function () {
  const INTRO_EVENT = "photoquilt:intro-complete";

  function upgradeFigure(img) {
    const hqSrc = img.dataset.hqSrc;
    if (!hqSrc || img.dataset.hqLoaded === "1") return;

    const hq = new Image();
    hq.decoding = "async";
    hq.src = hqSrc;
    hq.onload = () => {
      img.src = hqSrc;
      if (img.dataset.hqWidth) img.width = Number(img.dataset.hqWidth);
      if (img.dataset.hqHeight) img.height = Number(img.dataset.hqHeight);
      img.dataset.hqLoaded = "1";
      img.classList.add("is-hq");
    };
  }

  function upgradeAllFigures() {
    document.querySelectorAll("img.figure-upgrade[data-hq-src]").forEach(upgradeFigure);
  }

  window.addEventListener(INTRO_EVENT, upgradeAllFigures, { once: true });
})();
