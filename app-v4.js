(function () {
  "use strict";

  var STORAGE_KEY = "toolsTheme";
  var themeSelect = document.getElementById("themeSelect");

  function systemPrefersDark() {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  function effectiveTheme(choice) {
    return choice === "dark" || (choice === "system" && systemPrefersDark()) ? "dark" : "light";
  }

  function applyTheme(choice) {
    var selected = choice || "system";
    var effective = effectiveTheme(selected);
    document.documentElement.setAttribute("data-theme", selected);
    document.documentElement.setAttribute("data-effective-theme", effective);
    document.documentElement.classList.toggle("theme-dark", effective === "dark");
    document.documentElement.classList.toggle("theme-light", effective === "light");
    if (themeSelect) themeSelect.value = selected;
  }

  function readSavedTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY) || "system";
    } catch (error) {
      return "system";
    }
  }

  function saveTheme(choice) {
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch (error) {
      // Ignore storage failures.
    }
  }

  applyTheme(readSavedTheme());

  if (themeSelect) {
    themeSelect.addEventListener("change", function () {
      var choice = themeSelect.value || "system";
      saveTheme(choice);
      applyTheme(choice);
    });
  }

  if (window.matchMedia) {
    var mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    var listener = function () {
      if (readSavedTheme() === "system") applyTheme("system");
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", listener);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(listener);
    }
  }
}());
