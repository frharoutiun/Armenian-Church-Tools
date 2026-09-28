(function () {
  "use strict";

  // --- theme (same pattern as the homepage / TR app) ---
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
    document.documentElement.classList.toggle("theme-dark", effective === "dark");
    document.documentElement.classList.toggle("theme-light", effective === "light");
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
  var corpus = null;      // array of sections
  var searchIndex = null; // lemma -> [{s,v,f}]
  var wordForms = null;   // lemma -> [forms]
  var facets = null;      // {categories, hymnTypes, modes}

  var state = {
    query: "",
    category: null,
    hymnType: null,
    mode: null,
    openSection: null, // section id currently expanded in browse view
  };

  var el = {
    searchInput: document.getElementById("searchInput"),
    facetRow: document.getElementById("facetRow"),
    resultsArea: document.getElementById("resultsArea"),
  };

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function firstLine(heading) {
    return heading.split("\n")[0];
  }

  function headingLines(heading) {
    return heading.split("\n");
  }

  // --- loading ---
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
  var MAX_CHIPS_SHOWN = 8;

  function renderFacetGroup(label, items, key, expanded) {
    var activeVal = state[key];
    var shown = expanded ? items : items.slice(0, MAX_CHIPS_SHOWN);
    var html = '<div class="facet-group-label">' + escapeHtml(label) + "</div>";
    html += '<div class="facet-row">';
    html += '<span class="facet-chip' + (activeVal === null ? " active" : "") + '" data-facet="' + key + '" data-value="">All</span>';
    shown.forEach(function (pair) {
      var value = pair[0], count = pair[1];
      var active = activeVal === value;
      html += '<span class="facet-chip' + (active ? " active" : "") + '" data-facet="' + key + '" data-value="' + escapeHtml(value) + '">'
        + escapeHtml(value) + ' <span class="count">' + count + "</span></span>";
    });
    if (!expanded && items.length > MAX_CHIPS_SHOWN) {
      html += '<button class="facet-more-toggle" data-more="' + key + '">+' + (items.length - MAX_CHIPS_SHOWN) + " more</button>";
    }
    html += "</div>";
    return html;
  }

  var expandedGroups = {};

  function renderFacets() {
    if (!facets) return;
    var html = "";
    html += renderFacetGroup("Feast / commemoration category", facets.categories, "category", expandedGroups.category);
    html += renderFacetGroup("Hymn type", facets.hymnTypes, "hymnType", expandedGroups.hymnType);
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
  function isArmenianQuery(q) {
    return /[Ա-և]/.test(q);
  }

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
      // exact surface-form match against some other lemma's declensions
      Object.keys(wordForms).forEach(function (lemma) {
        if (matchedLemmas.indexOf(lemma) !== -1) return;
        if (wordForms[lemma].indexOf(q) !== -1) matchedLemmas.push(lemma);
      });
    }
    if (matchedLemmas.length === 0) {
      // fall back to substring match on lemma or any surface form (root-ish search)
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

  function renderResultItem(section, verse, jumpLabel) {
    var html = '<div class="result-item">';
    html += '<div class="result-loc">' + escapeHtml(firstLine(section.heading)) + '</div>';
    html += '<div class="translit-line">' + escapeHtml(translit(firstLine(section.heading))) + '</div>';
    html += '<div class="result-text">' + escapeHtml(verse.text) + '</div>';
    html += '<div class="translit-line">' + escapeHtml(translit(verse.text)) + '</div>';
    if (verse.en) {
      html += '<div class="result-en">' + escapeHtml(verse.en) + '</div>';
    }
    html += '<a class="jump-link" data-jump="' + section.id + '">Open full section &rarr;</a>';
    html += '</div>';
    return html;
  }

  function renderSearchResults() {
    var q = state.query.trim();
    var html = "";
    if (isArmenianQuery(q)) {
      var out = searchArmenian(q);
      html += '<div class="results-summary">' + out.results.length + ' occurrence(s) across '
        + Array.from(new Set(out.results.map(function (r) { return r.section.id; }))).length
        + ' section(s)'
        + (out.lemmas.length ? ' &mdash; matched root(s): ' + out.lemmas.map(function (l) {
            return escapeHtml(l) + ' <span style="color:var(--muted-text);font-weight:400;">('
              + (wordForms[l] || []).map(escapeHtml).join(', ') + ')</span>';
          }).join('; ') : '')
        + '</div>';
      if (out.results.length === 0) {
        html += '<div class="empty-state">No matches found for this word or root in the corpus.</div>';
      } else {
        out.results.slice(0, 300).forEach(function (r) {
          html += renderResultItem(r.section, r.verse);
        });
        if (out.results.length > 300) {
          html += '<div class="results-summary">Showing the first 300 of ' + out.results.length + ' matches.</div>';
        }
      }
    } else {
      var enResults = searchEnglish(q);
      html += '<div class="results-summary">' + enResults.length + ' match(es) in the English translation '
        + '(only section 0 is translated so far &mdash; more will appear here as translation work continues).</div>';
      if (enResults.length === 0) {
        html += '<div class="empty-state">No English matches yet. Try an Armenian word instead, or check back as more sections are translated.</div>';
      } else {
        enResults.forEach(function (r) {
          html += renderResultItem(r.section, r.verse);
        });
      }
    }
    el.resultsArea.innerHTML = html;
    wireJumpLinks();
  }

  function wireJumpLinks() {
    el.resultsArea.querySelectorAll("[data-jump]").forEach(function (a) {
      a.addEventListener("click", function (ev) {
        ev.preventDefault();
        var id = parseInt(a.getAttribute("data-jump"), 10);
        state.query = "";
        el.searchInput.value = "";
        state.openSection = id;
        renderMain();
        var target = document.getElementById("section-" + id);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  // --- browse ---
  function renderSectionSummary(section) {
    var html = '<div class="section-item" data-section="' + section.id + '" id="section-' + section.id + '">';
    html += '<div class="section-cat">' + escapeHtml(section.category) + '</div>';
    html += '<div class="section-heading">' + escapeHtml(firstLine(section.heading)) + '</div>';
    html += '<div class="translit-line">' + escapeHtml(translit(firstLine(section.heading))) + '</div>';
    html += '</div>';
    return html;
  }

  function renderSectionDetail(section) {
    var html = '<div class="section-item open" id="section-' + section.id + '">';
    html += '<button class="close-section-btn" data-close="1">&larr; Back to list</button>';
    html += '<div class="section-cat">' + escapeHtml(section.category) + '</div>';
    headingLines(section.heading).forEach(function (line) {
      html += '<div class="section-heading">' + escapeHtml(line) + '</div>';
      html += '<div class="translit-line">' + escapeHtml(translit(line)) + '</div>';
    });
    html += '<div class="section-detail">';
    section.stanzas.forEach(function (stanza) {
      html += '<div class="stanza-block">';
      if (stanza.type) {
        html += '<div class="stanza-type">' + escapeHtml(stanza.type) + '</div>';
      }
      stanza.verses.forEach(function (verse, i) {
        html += '<div class="verse-line"><span class="verse-num">' + (i + 1) + '</span>' + escapeHtml(verse.text) + '</div>';
        html += '<div class="translit-line">' + escapeHtml(translit(verse.text)) + '</div>';
        if (verse.en) {
          html += '<div class="verse-en">' + escapeHtml(verse.en) + '</div>';
        } else {
          html += '<div class="verse-en pending">English translation not yet available for this verse.</div>';
        }
      });
      html += '</div>';
    });
    html += '</div></div>';
    return html;
  }

  function renderBrowse() {
    var visible = corpus.filter(sectionPassesFacets);
    var html = '<div class="results-summary">' + visible.length + ' of ' + corpus.length + ' sections shown.</div>';
    if (state.openSection !== null) {
      var section = corpus[state.openSection];
      html += renderSectionDetail(section);
    } else if (visible.length === 0) {
      html += '<div class="empty-state">No sections match the selected filters.</div>';
    } else {
      visible.forEach(function (section) {
        html += renderSectionSummary(section);
      });
    }
    el.resultsArea.innerHTML = html;

    el.resultsArea.querySelectorAll(".section-item[data-section]").forEach(function (item) {
      item.addEventListener("click", function () {
        state.openSection = parseInt(item.getAttribute("data-section"), 10);
        renderMain();
        var target = document.getElementById("section-" + state.openSection);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    var closeBtn = el.resultsArea.querySelector("[data-close]");
    if (closeBtn) {
      closeBtn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        state.openSection = null;
        renderMain();
      });
    }
  }

  function renderMain() {
    if (state.query.trim().length > 0) {
      renderSearchResults();
    } else {
      renderBrowse();
    }
  }

  var searchDebounce = null;
  if (el.searchInput) {
    el.searchInput.addEventListener("input", function () {
      state.query = el.searchInput.value;
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
