(function () {
  var storageKey = "theme";

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem(storageKey, theme);
    } catch (e) {
      /* ignore */
    }
  }

  function updateToggleLabel(btn) {
    var theme = document.documentElement.getAttribute("data-theme");
    btn.setAttribute(
      "aria-label",
      theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
    );
  }

  function bindToggle() {
    var btn = document.getElementById("theme-toggle");
    if (!btn) return;

    updateToggleLabel(btn);

    btn.addEventListener("click", function () {
      var root = document.documentElement;
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";

      var animate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (animate) {
        root.classList.add("theme-transition");
      }
      applyTheme(next);
      saveTheme(next);
      updateToggleLabel(btn);

      if (animate) {
        window.setTimeout(function () {
          root.classList.remove("theme-transition");
        }, 280);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindToggle);
  } else {
    bindToggle();
  }
})();
