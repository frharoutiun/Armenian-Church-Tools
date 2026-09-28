(function () {
  "use strict";

  // --- theme ---
  var THEME_KEY = "sharaganTheme";
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
    if (themeSelect) themeSelect.value = selected;
  }
  function readSavedTheme() {
    try { return localStorage.getItem(THEME_KEY) || "system"; } catch (e) { return "system"; }
  }
  function saveTheme(choice) {
    try { localStorage.setItem(THEME_KEY, choice); } catch (e) {}
  }
  applyTheme(readSavedTheme());
  if (themeSelect) {
    themeSelect.addEventListener("change", function () {
      saveTheme(themeSelect.value);
      applyTheme(themeSelect.value);
    });
  }
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var onchg = function () { if (readSavedTheme() === "system") applyTheme("system"); };
    if (mq.addEventListener) mq.addEventListener("change", onchg);
    else if (mq.addListener) mq.addListener(onchg);
  }

  // --- transliteration toggle ---
  var translitToggle = document.getElementById("translitToggle");
  var TRANSLIT_KEY = "sharaganTranslit";
  function applyTranslitState(on) {
    document.body.classList.toggle("show-translit", on);
    if (translitToggle) translitToggle.checked = on;
  }
  var savedTranslit = false;
  try { savedTranslit = localStorage.getItem(TRANSLIT_KEY) === "1"; } catch (e) {}
  applyTranslitState(savedTranslit);
  if (translitToggle) {
    translitToggle.addEventListener("change", function () {
      applyTranslitState(translitToggle.checked);
      try { localStorage.setItem(TRANSLIT_KEY, translitToggle.checked ? "1" : "0"); } catch (e) {}
    });
  }

  function translit(armenianText) {
    try { return window.decodeChar(armenianText); } catch (e) { return armenianText; }
  }

  // --- data ---
  var corpus = null, searchIndex = null, wordForms = null, facets = null;

  var state = {
    query: "",
    category: null,
    hymnType: null,
    mode: null,
    openSection: null,
    openVerseIdx: 0,
    wholeCanon: false,
  };

  var el = {
    searchInput: document.getElementById("searchInput"),
    facetRow: document.getElementById("facetRow"),
    resultsArea: document.getElementById("resultsArea"),
    searchPanel: document.getElementById("searchPanel"),
    searchToggle: document.getElementById("searchToggle"),
  };

  if (el.searchToggle) {
    el.searchToggle.addEventListener("click", function () {
      el.searchPanel.hidden = false;
      el.searchToggle.hidden = true;
      el.searchInput.focus();
    });
  }

  // While reading (or viewing the whole canon), the search/filter panel is
  // tucked away behind a small pill so the page reads like an open hymnal,
  // not a search app. It reappears automatically once you leave a section.
  function updateSearchPanelVisibility() {
    var reading = state.openSection !== null;
    if (el.searchPanel) el.searchPanel.hidden = reading;
    if (el.searchToggle) el.searchToggle.hidden = !reading;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function firstLine(heading) { return heading.split("\n")[0]; }
  function headingLines(heading) { return heading.split("\n"); }

  // Wraps the first Armenian/Latin letter of a string in a drop-cap span.
  function withDropCap(text) {
    var s = escapeHtml(text);
    var m = s.match(/^([^\s])/);
    if (!m) return s;
    return '<span class="dropcap">' + m[1] + "</span>" + s.slice(1);
  }

  function loadAll() {
    return Promise.all([
      fetch("data/corpus.json").then(function (r) { return r.json(); }),
      fetch("data/search-index.json").then(function (r) { return r.json(); }),
      fetch("data/word-forms.json").then(function (r) { return r.json(); }),
      fetch("data/facets.json").then(function (r) { return r.json(); }),
    ]).then(function (results) {
      corpus = results[0];
      searchIndex = results[1];
      wordForms = results[2];
      facets = results[3];
    });
  }

  // --- facet chips ---
  var MAX_CHIPS_SHOWN = 9;
  var expandedGroups = {};

  function renderFacetGroup(label, items, key, expanded) {
    var activeVal = state[key];
    var shown = expanded ? items : items.slice(0, MAX_CHIPS_SHOWN);
    var html = '<div class="facet-group-label">' + escapeHtml(label) + "</div>";
    html += '<div class="facet-row">';
    html += '<span class="facet-chip' + (activeVal === null ? " active" : "") + '" data-facet="' + key + '" data-value="">All</span>';
    shown.forEach(function (pair) {
      var value = pair[0], count = pair[1];
      var active = activeVal === value;
      var label2 = value;
      if (key === "hymnType" && facets.genreInfo && facets.genreInfo[value]) {
        label2 = value + " — " + facets.genreInfo[value].name;
      }
      html += '<span class="facet-chip' + (active ? " active" : "") + '" data-facet="' + key + '" data-value="' + escapeHtml(value) + '" title="' + escapeHtml(label2) + '">'
        + escapeHtml(value) + ' <span class="count">' + count + "</span></span>";
    });
    if (!expanded && items.length > MAX_CHIPS_SHOWN) {
      html += '<button class="facet-more-toggle" data-more="' + key + '">+' + (items.length - MAX_CHIPS_SHOWN) + " more</button>";
    }
    html += "</div>";
    return html;
  }

  function renderFacets() {
    if (!facets) return;
    var html = "";
    html += renderFacetGroup("Feast / commemoration category", facets.categories, "category", expandedGroups.category);
    html += renderFacetGroup("Hymn type (Sharakan genre)", facets.hymnTypes, "hymnType", expandedGroups.hymnType);
    html += renderFacetGroup("Mode", facets.modes, "mode", expandedGroups.mode);
    el.facetRow.innerHTML = html;

    el.facetRow.querySelectorAll(".facet-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var key = chip.getAttribute("data-facet");
        var value = chip.getAttribute("data-value") || null;
        state[key] = (state[key] === value) ? null : value;
        if (state[key] === "") state[key] = null;
        state.openSection = null;
        renderFacets();
        renderMain();
      });
    });
    el.facetRow.querySelectorAll(".facet-more-toggle").forEach(function (btn) {
      btn.addEventListener("click", function () {
        expandedGroups[btn.getAttribute("data-more")] = true;
        renderFacets();
      });
    });
  }

  function sectionPassesFacets(section) {
    if (state.category && section.category !== state.category) return false;
    if (state.hymnType && section.hymnTypes.indexOf(state.hymnType) === -1) return false;
    if (state.mode && section.modes.indexOf(state.mode) === -1) return false;
    return true;
  }

  // --- search ---
  function isArmenianQuery(q) { return /[Ա-և]/.test(q); }

  function flattenVerses(section) {
    var out = [];
    section.stanzas.forEach(function (stanza) {
      stanza.verses.forEach(function (verse) {
        out.push({ stanza: stanza, verse: verse });
      });
    });
    return out;
  }

  function searchArmenian(query) {
    var q = query.trim();
    var qLower = q.toLowerCase();
    var matchedLemmas = [];
    if (Object.prototype.hasOwnProperty.call(searchIndex, q)) {
      matchedLemmas.push(q);
    } else {
      Object.keys(wordForms).forEach(function (lemma) {
        if (matchedLemmas.indexOf(lemma) !== -1) return;
        if (wordForms[lemma].indexOf(q) !== -1) matchedLemmas.push(lemma);
      });
    }
    if (matchedLemmas.length === 0) {
      Object.keys(searchIndex).forEach(function (lemma) {
        if (lemma.indexOf(qLower) !== -1) { matchedLemmas.push(lemma); return; }
        var forms = wordForms[lemma] || [];
        for (var i = 0; i < forms.length; i++) {
          if (forms[i].indexOf(qLower) !== -1) { matchedLemmas.push(lemma); return; }
        }
      });
    }
    var results = [];
    matchedLemmas.forEach(function (lemma) {
      (searchIndex[lemma] || []).forEach(function (occ) {
        var section = corpus[occ.s];
        if (!section || !sectionPassesFacets(section)) return;
        var flat = flattenVerses(section);
        var entry = flat[occ.v];
        if (!entry) return;
        results.push({ section: section, verse: entry.verse, stanza: entry.stanza, lemma: lemma, form: occ.f, verseIdx: occ.v });
      });
    });
    return { lemmas: matchedLemmas, results: results };
  }

  function searchEnglish(query) {
    var qLower = query.trim().toLowerCase();
    var results = [];
    corpus.forEach(function (section) {
      if (!sectionPassesFacets(section)) return;
      var flat = flattenVerses(section);
      flat.forEach(function (entry, vi) {
        if (entry.verse.en && entry.verse.en.toLowerCase().indexOf(qLower) !== -1) {
          results.push({ section: section, verse: entry.verse, stanza: entry.stanza, verseIdx: vi });
        }
      });
    });
    return results;
  }

  function renderResultItem(section, verse, verseIdx) {
    var html = '<div class="result-item" data-jump-section="' + section.id + '" data-jump-verse="' + verseIdx + '">';
    html += '<div class="result-loc">' + escapeHtml(firstLine(section.heading)) + '</div><br>';
    html += '<div class="translit-line" style="display:inline-block;margin-bottom:6px;">' + escapeHtml(translit(firstLine(section.heading))) + '</div>';
    html += '<div class="result-text">' + escapeHtml(verse.text) + '</div>';
    html += '<div class="translit-line">' + escapeHtml(translit(verse.text)) + '</div>';
    if (verse.en) html += '<div class="result-en">' + escapeHtml(verse.en) + '</div>';
    html += '<div class="jump-link">Open this hymn &rarr;</div>';
    html += '</div>';
    return html;
  }

  function renderSearchResults() {
    var q = state.query.trim();
    var html = "";
    if (isArmenianQuery(q)) {
      var out = searchArmenian(q);
      var sectionCount = Array.from(new Set(out.results.map(function (r) { return r.section.id; }))).length;
      html += '<div class="results-summary">' + out.results.length + ' occurrence(s) across ' + sectionCount + ' section(s)'
        + (out.lemmas.length ? ' &mdash; root(s): ' + out.lemmas.map(function (l) {
            return '<strong>' + escapeHtml(l) + '</strong> (' + (wordForms[l] || []).map(escapeHtml).join(', ') + ')';
          }).join('; ') : '')
        + '</div>';
      if (out.results.length === 0) {
        html += '<div class="empty-state">No matches found for this word or root in the corpus.</div>';
      } else {
        out.results.slice(0, 300).forEach(function (r) {
          html += renderResultItem(r.section, r.verse, r.verseIdx);
        });
        if (out.results.length > 300) {
          html += '<div class="results-summary">Showing the first 300 of ' + out.results.length + ' matches.</div>';
        }
      }
    } else {
      var enResults = searchEnglish(q);
      html += '<div class="results-summary">' + enResults.length + ' match(es) in the English translation '
        + '(only one section is translated so far &mdash; more will appear as translation continues).</div>';
      if (enResults.length === 0) {
        html += '<div class="empty-state">No English matches yet. Try an Armenian word instead.</div>';
      } else {
        enResults.forEach(function (r) { html += renderResultItem(r.section, r.verse, r.verseIdx); });
      }
    }
    el.resultsArea.innerHTML = html;
    el.resultsArea.querySelectorAll("[data-jump-section]").forEach(function (item) {
      item.addEventListener("click", function () {
        state.query = "";
        el.searchInput.value = "";
        state.openSection = parseInt(item.getAttribute("data-jump-section"), 10);
        state.openVerseIdx = parseInt(item.getAttribute("data-jump-verse"), 10);
        state.wholeCanon = false;
        renderMain();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
  }

  // --- browse (section list) ---
  function renderSectionSummary(section) {
    var html = '<div class="section-item" data-section="' + section.id + '">';
    html += '<div class="section-cat">' + escapeHtml(section.category) + '</div><br>';
    html += '<div class="section-heading" style="font-size:19px;">' + escapeHtml(firstLine(section.heading)) + '</div>';
    html += '<div class="translit-line">' + escapeHtml(translit(firstLine(section.heading))) + '</div>';
    html += '</div>';
    return html;
  }

  function renderBrowseList() {
    var visible = corpus.filter(sectionPassesFacets);
    var html = '<div class="results-summary">' + visible.length + ' of ' + corpus.length + ' sections shown. Click one to begin reading.</div>';
    if (visible.length === 0) {
      html += '<div class="empty-state">No sections match the selected filters.</div>';
    } else {
      visible.forEach(function (section) { html += renderSectionSummary(section); });
    }
    el.resultsArea.innerHTML = html;
    el.resultsArea.querySelectorAll(".section-item[data-section]").forEach(function (item) {
      item.addEventListener("click", function () {
        state.openSection = parseInt(item.getAttribute("data-section"), 10);
        state.openVerseIdx = 0;
        state.wholeCanon = false;
        renderMain();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
  }

  // --- reading mode: one hymn (verse) at a time ---
  function genreBadgeHtml(stanza) {
    if (!stanza) return "";
    var parts = [];
    (stanza.hymnTypes || []).forEach(function (g) {
      var info = facets.genreInfo && facets.genreInfo[g];
      if (info) {
        parts.push('<span class="genre-name">' + escapeHtml(info.name) + '</span> — ' + escapeHtml(info.gloss)
          + ' (' + escapeHtml(info.ref) + ', ' + escapeHtml(info.office) + ')');
      } else {
        parts.push('<span class="genre-name">' + escapeHtml(g) + '</span>');
      }
    });
    var modeText = (stanza.modes || []).length ? ' &middot; Mode ' + stanza.modes.map(escapeHtml).join(", ") : "";
    if (parts.length === 0 && !modeText) return "";
    return '<div class="genre-badge">' + parts.join(" &nbsp;/&nbsp; ") + modeText + '</div>';
  }

  function renderReadingMode(section, verseIdx) {
    var flat = flattenVerses(section);
    verseIdx = Math.max(0, Math.min(verseIdx, flat.length - 1));
    var entry = flat[verseIdx];

    var html = '<div class="reading-card">';
    html += '<div class="reading-topline">';
    html += '<button class="back-link" data-back="1">&larr; Back to list</button>';
    html += '<button class="view-mode-toggle" data-whole="1">View entire canon &#9776;</button>';
    html += '</div>';

    html += '<div class="reading-category">' + escapeHtml(section.category) + '</div>';
    headingLines(section.heading).forEach(function (line) {
      html += '<div class="reading-heading">' + escapeHtml(line) + '<div class="translit-line">' + escapeHtml(translit(line)) + '</div></div>';
    });
    html += '<div class="ornament">֍</div>';

    html += genreBadgeHtml(entry.stanza);
    html += '<div class="verse-progress">Verse ' + (verseIdx + 1) + ' of ' + flat.length + '</div>';

    html += '<div class="verse-armenian">' + withDropCap(entry.verse.text) + '</div>';
    html += '<div class="verse-translit">' + escapeHtml(translit(entry.verse.text)) + '</div>';

    if (entry.verse.en) {
      html += '<div class="verse-divider">&#10022;</div>';
      html += '<div class="verse-english">' + withDropCap(entry.verse.en) + '</div>';
    } else {
      html += '<div class="verse-divider">&#10022;</div>';
      html += '<div class="verse-english pending">English translation not yet available for this verse.</div>';
    }

    html += '<div class="reading-nav">';
    html += '<button class="nav-btn" data-nav="prev"' + (verseIdx === 0 ? " disabled" : "") + '>&larr; Previous</button>';
    html += '<form class="jump-form" data-jump-form="1">Verse <input type="number" min="1" max="' + flat.length + '" value="' + (verseIdx + 1) + '" data-jump-input="1"> of ' + flat.length + '</form>';
    html += '<button class="nav-btn" data-nav="next"' + (verseIdx === flat.length - 1 ? " disabled" : "") + '>Next &rarr;</button>';
    html += '</div>';
    html += '</div>';

    el.resultsArea.innerHTML = html;

    el.resultsArea.querySelector("[data-back]").addEventListener("click", function () {
      state.openSection = null;
      renderMain();
    });
    el.resultsArea.querySelector("[data-whole]").addEventListener("click", function () {
      state.wholeCanon = true;
      renderMain();
    });
    var prevBtn = el.resultsArea.querySelector('[data-nav="prev"]');
    var nextBtn = el.resultsArea.querySelector('[data-nav="next"]');
    if (prevBtn) prevBtn.addEventListener("click", function () { state.openVerseIdx = verseIdx - 1; renderMain(); });
    if (nextBtn) nextBtn.addEventListener("click", function () { state.openVerseIdx = verseIdx + 1; renderMain(); });
    var jumpForm = el.resultsArea.querySelector("[data-jump-form]");
    if (jumpForm) {
      jumpForm.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var input = jumpForm.querySelector("[data-jump-input]");
        var n = parseInt(input.value, 10);
        if (!isNaN(n)) { state.openVerseIdx = n - 1; renderMain(); }
      });
    }

    // keyboard navigation
    document.onkeydown = function (ev) {
      if (state.openSection === null || state.wholeCanon) return;
      if (ev.key === "ArrowRight" && verseIdx < flat.length - 1) { state.openVerseIdx = verseIdx + 1; renderMain(); }
      if (ev.key === "ArrowLeft" && verseIdx > 0) { state.openVerseIdx = verseIdx - 1; renderMain(); }
    };
  }

  // --- whole-canon (secondary) view ---
  function renderWholeCanon(section) {
    var html = '<div class="reading-card">';
    html += '<div class="reading-topline">';
    html += '<button class="back-link" data-back="1">&larr; Back to list</button>';
    html += '<button class="view-mode-toggle" data-reading="1">Read one hymn at a time &#8594;</button>';
    html += '</div>';
    html += '<div class="reading-category">' + escapeHtml(section.category) + '</div>';
    headingLines(section.heading).forEach(function (line) {
      html += '<div class="reading-heading" style="font-size:20px;">' + escapeHtml(line) + '<div class="translit-line">' + escapeHtml(translit(line)) + '</div></div>';
    });
    html += '<div class="ornament">֍</div>';

    var globalIdx = 0;
    section.stanzas.forEach(function (stanza) {
      html += '<div class="stanza-block">';
      if (stanza.type) {
        var badge = genreBadgeHtml(stanza);
        html += '<div class="stanza-type-label">' + escapeHtml(stanza.type) + '</div>';
        if (badge) html += badge;
      }
      stanza.verses.forEach(function (verse) {
        var idx = globalIdx;
        html += '<div class="whole-verse-line" data-verse-jump="' + idx + '"><span class="verse-num">' + (idx + 1) + '</span>' + escapeHtml(verse.text) + '</div>';
        html += '<div class="translit-line">' + escapeHtml(translit(verse.text)) + '</div>';
        if (verse.en) {
          html += '<div class="whole-verse-en">' + escapeHtml(verse.en) + '</div>';
        } else {
          html += '<div class="whole-verse-en pending">Translation not yet available.</div>';
        }
        globalIdx++;
      });
      html += '</div>';
    });
    html += '</div>';

    el.resultsArea.innerHTML = html;
    el.resultsArea.querySelector("[data-back]").addEventListener("click", function () {
      state.openSection = null;
      renderMain();
    });
    el.resultsArea.querySelector("[data-reading]").addEventListener("click", function () {
      state.wholeCanon = false;
      renderMain();
    });
    el.resultsArea.querySelectorAll("[data-verse-jump]").forEach(function (line) {
      line.addEventListener("click", function () {
        state.openVerseIdx = parseInt(line.getAttribute("data-verse-jump"), 10);
        state.wholeCanon = false;
        renderMain();
      });
    });
  }

  function renderMain() {
    updateSearchPanelVisibility();
    if (state.openSection !== null) {
      var section = corpus[state.openSection];
      if (state.wholeCanon) renderWholeCanon(section);
      else renderReadingMode(section, state.openVerseIdx);
    } else if (state.query.trim().length > 0) {
      document.onkeydown = null;
      renderSearchResults();
    } else {
      document.onkeydown = null;
      renderBrowseList();
    }
  }

  var searchDebounce = null;
  if (el.searchInput) {
    el.searchInput.addEventListener("input", function () {
      state.query = el.searchInput.value;
      state.openSection = null;
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(renderMain, 120);
    });
  }

  // --- boot ---
  el.resultsArea.innerHTML = '<div class="empty-state">Loading the corpus&hellip;</div>';
  loadAll().then(function () {
    renderFacets();
    renderMain();
  }).catch(function (err) {
    el.resultsArea.innerHTML = '<div class="empty-state">Could not load the corpus data. ('
      + escapeHtml(err && err.message ? err.message : String(err)) + ')</div>';
  });
}());
