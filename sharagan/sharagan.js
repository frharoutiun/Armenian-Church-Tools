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

  // --- phrase-link toggle: off by default, hovering an Armenian phrase
  // highlights its English equivalent (and vice versa) only while this is on ---
  var phraseLinkToggle = document.getElementById("phraseLinkToggle");
  var PHRASE_LINK_KEY = "sharaganPhraseLink";
  function applyPhraseLinkState(on) {
    document.body.classList.toggle("phrase-link", on);
    if (phraseLinkToggle) phraseLinkToggle.checked = on;
  }
  var savedPhraseLink = false;
  try { savedPhraseLink = localStorage.getItem(PHRASE_LINK_KEY) === "1"; } catch (e) {}
  applyPhraseLinkState(savedPhraseLink);
  if (phraseLinkToggle) {
    phraseLinkToggle.addEventListener("change", function () {
      applyPhraseLinkState(phraseLinkToggle.checked);
      try { localStorage.setItem(PHRASE_LINK_KEY, phraseLinkToggle.checked ? "1" : "0"); } catch (e) {}
    });
  }

  // --- scripture-reference toggle: off by default. When on, a hymn whose
  // genre is one of the fixed canticles (Song of Moses, the Magnificat,
  // certain psalms...) shows the connected Bible passage - Classical
  // Armenian (Zohrab, via arak29.org) and the RSV - alongside the hymn
  // itself. The data behind this is tiny and loaded lazily, only once the
  // toggle is actually turned on. ---
  var scriptureToggle = document.getElementById("scriptureToggle");
  var SCRIPTURE_KEY = "sharaganScripture";
  var scriptureRefs = null;
  var scriptureRefsPromise = null;
  function loadScriptureRefs() {
    if (scriptureRefsPromise) return scriptureRefsPromise;
    scriptureRefsPromise = fetch("data/scripture-refs.json")
      .then(function (r) { return r.json(); })
      .then(function (data) { scriptureRefs = data; return data; })
      .catch(function () { scriptureRefs = {}; return scriptureRefs; });
    return scriptureRefsPromise;
  }
  function applyScriptureState(on) {
    document.body.classList.toggle("show-scripture", on);
    if (scriptureToggle) scriptureToggle.checked = on;
    if (on) {
      loadScriptureRefs().then(function () {
        if (state.openSection !== null && !state.wholeCanon) renderMain();
      });
    }
  }
  var savedScripture = false;
  try { savedScripture = localStorage.getItem(SCRIPTURE_KEY) === "1"; } catch (e) {}
  applyScriptureState(savedScripture);
  if (scriptureToggle) {
    scriptureToggle.addEventListener("change", function () {
      applyScriptureState(scriptureToggle.checked);
      try { localStorage.setItem(SCRIPTURE_KEY, scriptureToggle.checked ? "1" : "0"); } catch (e) {}
      if (state.openSection !== null && !state.wholeCanon) renderMain();
    });
  }

  // Every real (non-generic) genre this stanza carries that also has a
  // connected-passage entry, in the stanza's own listed order, never
  // duplicated. Returns [] until the data has actually finished loading.
  function scriptureEntriesForStanza(stanza) {
    if (!scriptureRefs || !stanza || !stanza.hymnTypes) return [];
    var out = [];
    var seen = {};
    stanza.hymnTypes.forEach(function (g) {
      if (seen[g]) return;
      var entry = scriptureRefs[g];
      if (!entry) return;
      seen[g] = true;
      var info = facets.genreInfo && facets.genreInfo[g];
      out.push({ key: g, info: info, entry: entry });
    });
    return out;
  }

  // TR's own decodeChar has a real bug on shouting-case input: Armenian
  // upper/lowercase are distinct codepoints, and several letters map to a
  // two-letter Latin unit (Ձ->"Dz", Ղ->"Gh"...) - decodeChar capitalizes
  // each Latin letter of that unit independently when fed genuine ALL-CAPS
  // Armenian, since ordinary prose never has two consecutive capitals to
  // trigger it. TR itself is never exposed to this, since nobody types
  // ALL-CAPS Armenian into it - our corpus's own structural headers/type
  // labels are the one place it comes up. Same workaround as feeding TR by
  // hand: lowercase the Armenian first, transliterate, then uppercase the
  // Latin result.
  var ORNAMENT = "֍";

  function isShoutingArmenian(s) {
    var letters = s.replace(/[^Ա-և]/g, "");
    return Boolean(letters) && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
  }
  function translit(armenianText) {
    // The ornament mark has no phonetic value - decodeChar just passes it
    // through untranslated, which shows up as a stray glyph in the
    // transliteration line. Drop it (and any space right after it) first.
    var s = armenianText.trim().charAt(0) === ORNAMENT
      ? armenianText.trim().slice(1).replace(/^\s+/, "")
      : armenianText;
    try {
      if (isShoutingArmenian(s)) {
        return window.decodeChar(s.toLowerCase()).toUpperCase();
      }
      return window.decodeChar(s);
    } catch (e) { return s; }
  }

  // --- data ---
  var corpus = null, searchIndex = null, wordForms = null, facets = null, alignments = null;

  var state = {
    query: "",
    category: null,
    hymnType: null,
    mode: null,
    openSection: null,
    openStanzaIdx: 0,
    highlightVerseIdx: null, // local index within the open stanza, from a search jump
    highlightWord: null, // the specific matched surface form, bolded within that verse
    lastResultKey: null, // "sectionId:verseIdx" of the result last opened, so going back marks it
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
  // Headings are stored as one string with " / " marking real logical
  // breaks (a leading generic label like "ԿԱՆՈՆ", the feast name, an
  // optional "from X and Y" qualifier) - never a literal newline. Splitting
  // on "\n" (the original, wrong assumption) never did anything; every
  // heading rendered as one run-on line with a stray "/" character in it.
  function headingParts(heading) {
    return heading.split(" / ").map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function firstLine(heading) { return headingParts(heading)[0] || heading; }

  // A single-line summary for compact contexts (result cards, the browse
  // list) - skips the generic leading label (Ganon/Sharakan/Erg/...) when
  // there's real descriptive text after it, so the feast name itself leads.
  function compactHeading(heading) {
    var parts = headingParts(heading);
    var shown = parts.length > 1 ? parts.slice(1) : parts;
    return shown.join(", ");
  }

  // Renders a heading as a small gold eyebrow (the generic leading label,
  // when there's more than one real part) followed by the substantive
  // part(s) at full size - instead of one run-on line with slashes in it.
  function renderHeadingBlock(heading, mainClass) {
    var parts = headingParts(heading);
    var html = "";
    var rest = parts;
    if (parts.length > 1) {
      html += '<div class="heading-eyebrow script-original">' + escapeHtml(parts[0]) + '</div>';
      html += '<div class="heading-eyebrow script-translit">' + escapeHtml(translit(parts[0])) + '</div>';
      rest = parts.slice(1);
    }
    rest.forEach(function (line) {
      html += '<div class="' + mainClass + ' script-original">' + escapeHtml(line) + '</div>';
      html += '<div class="' + mainClass + ' script-translit">' + escapeHtml(translit(line)) + '</div>';
    });
    return html;
  }

  // --- Armenian word click-to-search, and Armenian/English phrase-hover
  // linking, in the main reading view. Both wrap spans around ranges of the
  // verse text; they compose (a phrase span can contain several word-link
  // spans) rather than conflicting, and the verse-opening drop cap is
  // applied to whichever segment actually holds the first letter, so it
  // stays part of that first word/phrase rather than sitting on its own.
  var ARMENIAN_WORD_RE = /[Ա-Ֆա-և]+/g;

  function flatVerseIndex(section, stanzaIdx, localVerseIdx) {
    var flat = 0;
    for (var i = 0; i < stanzaIdx; i++) flat += section.stanzas[i].verses.length;
    return flat + localVerseIdx;
  }

  function alignmentFor(sectionId, globalVerseIdx) {
    var bySection = alignments && alignments[String(sectionId)];
    return (bySection && bySection[String(globalVerseIdx)]) || null;
  }

  // Finds each phrase's own position independently (not a shared moving
  // cursor) so the two languages can list phrases in whichever order their
  // own word order happens to put them - Classical Armenian word order
  // doesn't have to match the English translation's order.
  function locatePhraseSpans(text, phrases, key) {
    var matches = [];
    (phrases || []).forEach(function (pair, i) {
      var phraseText = pair[key];
      if (!phraseText) return;
      var idx = text.indexOf(phraseText);
      if (idx === -1) return;
      matches.push({ start: idx, end: idx + phraseText.length, id: i, text: phraseText });
    });
    matches.sort(function (a, b) { return a.start - b.start; });
    var accepted = [];
    var cursor = 0;
    matches.forEach(function (m) {
      if (m.start < cursor) return;
      accepted.push(m);
      cursor = m.end;
    });
    return accepted;
  }

  function textSegments(text, spans) {
    var segments = [];
    var pos = 0;
    spans.forEach(function (m) {
      if (m.start > pos) segments.push({ text: text.slice(pos, m.start), id: null });
      segments.push({ text: m.text, id: m.id });
      pos = m.end;
    });
    if (pos < text.length) segments.push({ text: text.slice(pos), id: null });
    return segments;
  }

  // Renders one segment's worth of Armenian text: every Armenian word gets
  // a click-to-search span, and the very first letter overall (tracked via
  // dropCapState across all segments/calls for one verse) gets the drop cap.
  function armenianSegmentHtml(text, dropCapState, highlightWord) {
    var html = "";
    var last = 0;
    text.replace(ARMENIAN_WORD_RE, function (word, offset) {
      html += escapeHtml(text.slice(last, offset));
      var inner;
      if (!dropCapState.applied) {
        inner = '<span class="dropcap">' + escapeHtml(word.charAt(0)) + "</span>" + escapeHtml(word.slice(1));
        dropCapState.applied = true;
      } else {
        inner = escapeHtml(word);
      }
      var cls = "word-link" + (highlightWord && word === highlightWord ? " word-match" : "");
      html += '<span class="' + cls + '" data-word="' + escapeHtml(word) + '">' + inner + "</span>";
      last = offset + word.length;
      return word;
    });
    html += escapeHtml(text.slice(last));
    return html;
  }

  function renderArmenianVerseHtml(rawText, phrasePairs, groupPrefix, highlightWord) {
    var dropCapState = { applied: false };
    var html = "";
    var workText = rawText;
    if (rawText.charAt(0) === ORNAMENT) {
      html += '<span class="dropcap dropcap-ornament">' + ORNAMENT + "</span>";
      dropCapState.applied = true;
      var restStart = 1;
      while (restStart < rawText.length && /\s/.test(rawText.charAt(restStart))) restStart++;
      workText = rawText.slice(restStart);
    }
    var spans = locatePhraseSpans(workText, phrasePairs, "arm");
    textSegments(workText, spans).forEach(function (seg) {
      var inner = armenianSegmentHtml(seg.text, dropCapState, highlightWord);
      html += seg.id === null ? inner : '<span class="phrase" data-phrase-group="' + groupPrefix + "-" + seg.id + '">' + inner + "</span>";
    });
    return html;
  }

  function renderEnglishVerseHtml(armenianText, englishText, phrasePairs, groupPrefix) {
    var dropApplied = armenianText.charAt(0) === ORNAMENT;
    var html = dropApplied ? '<span class="dropcap dropcap-ornament">' + ORNAMENT + "</span>" : "";
    function withDrop(text) {
      if (dropApplied || !text.length) return escapeHtml(text);
      var m = text.match(/^(\s*)([^\s])([\s\S]*)$/);
      if (!m) return escapeHtml(text);
      dropApplied = true;
      return escapeHtml(m[1]) + '<span class="dropcap">' + escapeHtml(m[2]) + "</span>" + escapeHtml(m[3]);
    }
    var spans = locatePhraseSpans(englishText, phrasePairs, "en");
    textSegments(englishText, spans).forEach(function (seg) {
      var inner = withDrop(seg.text);
      html += seg.id === null ? inner : '<span class="phrase" data-phrase-group="' + groupPrefix + "-" + seg.id + '">' + inner + "</span>";
    });
    return html;
  }

  // Click a word -> jump to the root-word search for it (every declined
  // form of that word's dictionary root, corpus-wide) - like arak29. A
  // click that follows a text-drag (the user was selecting/copying, not
  // clicking) is ignored, so normal copy/paste still works.
  function wireWordLinks(container) {
    container.querySelectorAll(".word-link[data-word]").forEach(function (span) {
      span.addEventListener("click", function () {
        var sel = window.getSelection();
        if (sel && String(sel).length > 0) return;
        var word = span.getAttribute("data-word");
        state.openSection = null;
        state.query = word;
        if (el.searchInput) el.searchInput.value = word;
        renderFacets();
        renderMain();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
  }

  // Hovering any phrase span highlights every span sharing its group (its
  // Armenian half and its English half together), only while the
  // phrase-link toggle is on (guarded in CSS by body.phrase-link).
  function wirePhraseHover(container) {
    container.querySelectorAll(".phrase[data-phrase-group]").forEach(function (span) {
      var group = span.getAttribute("data-phrase-group");
      var siblings = container.querySelectorAll('.phrase[data-phrase-group="' + group + '"]');
      span.addEventListener("mouseenter", function () {
        siblings.forEach(function (s) { s.classList.add("phrase-active"); });
      });
      span.addEventListener("mouseleave", function () {
        siblings.forEach(function (s) { s.classList.remove("phrase-active"); });
      });
    });
  }

  function loadAll() {
    return Promise.all([
      fetch("data/corpus.json").then(function (r) { return r.json(); }),
      fetch("data/search-index.json").then(function (r) { return r.json(); }),
      fetch("data/word-forms.json").then(function (r) { return r.json(); }),
      fetch("data/facets.json").then(function (r) { return r.json(); }),
      fetch("data/alignments.json").then(function (r) { return r.json(); }).catch(function () { return {}; }),
    ]).then(function (results) {
      corpus = results[0];
      searchIndex = results[1];
      wordForms = results[2];
      facets = results[3];
      alignments = results[4];
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

  // The category facet is surfaced as the big table-of-contents tiles in
  // the results area, not as a chip row - so the chip row here only ever
  // narrows further (hymn type / mode), and only once that narrowing is
  // actually relevant: inside a chosen category, or while searching.
  function facetsRelevant() {
    return state.category !== null || state.query.trim().length > 0;
  }

  function renderFacets() {
    if (!facets) return;
    if (!facetsRelevant()) { el.facetRow.innerHTML = ""; return; }
    var html = "";
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

  // A Sharagan (an individual hymn) is one stanza - a whole group of verses
  // sharing one genre/mode, meant to be read together - not a single verse.
  // Converts a flat, section-wide verse index (as search results carry) into
  // {stanzaIdx, localVerseIdx} so a search hit opens the right Sharagan with
  // the actual matched verse highlighted within it.
  function locateStanza(section, globalVerseIdx) {
    var remaining = globalVerseIdx;
    for (var si = 0; si < section.stanzas.length; si++) {
      var count = section.stanzas[si].verses.length;
      if (remaining < count) return { stanzaIdx: si, localVerseIdx: remaining };
      remaining -= count;
    }
    return { stanzaIdx: 0, localVerseIdx: 0 };
  }

  function stanzaLabel(stanza, idx) {
    var g = (stanza.hymnTypes || [])[0];
    var info = g && facets.genreInfo && facets.genreInfo[g];
    var name = info ? info.name : (stanza.type || null);
    return (idx + 1) + ". " + (name || "Sharagan");
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

  function renderResultItem(section, verse, verseIdx, matchedWord) {
    var heading = compactHeading(section.heading);
    var key = section.id + ":" + verseIdx;
    var openedCls = state.lastResultKey === key ? " opened" : "";
    var html = '<div class="result-item' + openedCls + '" data-jump-section="' + section.id + '" data-jump-verse="' + verseIdx
      + '" data-jump-word="' + escapeHtml(matchedWord || "") + '">';
    html += '<div class="result-loc script-original">' + escapeHtml(heading) + '</div>';
    html += '<div class="result-loc script-translit">' + escapeHtml(translit(heading)) + '</div>';
    html += '<div class="result-text script-original">' + escapeHtml(verse.text) + '</div>';
    html += '<div class="result-text script-translit">' + escapeHtml(translit(verse.text)) + '</div>';
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
          html += renderResultItem(r.section, r.verse, r.verseIdx, r.form);
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
        var sectionId = parseInt(item.getAttribute("data-jump-section"), 10);
        var globalVerseIdx = parseInt(item.getAttribute("data-jump-verse"), 10);
        var loc = locateStanza(corpus[sectionId], globalVerseIdx);
        // Mark which result this was against the search-results page itself
        // (still the current history entry) before navigating away from it,
        // so going back shows exactly that page again, with this one marked.
        state.lastResultKey = sectionId + ":" + globalVerseIdx;
        syncHistory();
        state.query = "";
        el.searchInput.value = "";
        state.openSection = sectionId;
        state.openStanzaIdx = loc.stanzaIdx;
        state.highlightVerseIdx = loc.localVerseIdx;
        state.highlightWord = item.getAttribute("data-jump-word") || null;
        state.wholeCanon = false;
        renderMain();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
  }

  // --- browse (section list) ---
  function renderSectionSummary(section) {
    var heading = compactHeading(section.heading);
    var html = '<div class="section-item" data-section="' + section.id + '">';
    html += '<div class="section-cat">' + escapeHtml(section.category) + '</div>';
    html += '<div class="section-heading script-original" style="font-size:19px;">' + escapeHtml(heading) + '</div>';
    html += '<div class="section-heading script-translit" style="font-size:19px;">' + escapeHtml(translit(heading)) + '</div>';
    html += '</div>';
    return html;
  }

  // The landing page of the hymnal: a table-of-contents of the feast/
  // commemoration categories (in real liturgical order, see CATEGORY_ORDER
  // in the build script), not all 116 canons dumped in one long list. This
  // is the "macro organization" layer above the individual Ganon list.
  function renderCategoryTiles() {
    var html = '<div class="results-summary">Choose a feast or commemoration to browse its hymns, or search the corpus above.</div>';
    html += '<div class="category-tile-grid">';
    (facets.categories || []).forEach(function (pair) {
      var name = pair[0], count = pair[1];
      html += '<div class="category-tile" data-category="' + escapeHtml(name) + '">'
        + '<div class="category-tile-name">' + escapeHtml(name) + '</div>'
        + '<div class="category-tile-count">' + count + (count === 1 ? " canon" : " canons") + '</div>'
        + '</div>';
    });
    html += '</div>';
    el.resultsArea.innerHTML = html;
    el.resultsArea.querySelectorAll(".category-tile[data-category]").forEach(function (tile) {
      tile.addEventListener("click", function () {
        state.category = tile.getAttribute("data-category");
        renderFacets();
        renderMain();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
  }

  function renderBrowseList() {
    if (state.category === null) { renderCategoryTiles(); return; }

    var visible = corpus.filter(sectionPassesFacets);
    var html = '<div class="category-breadcrumb"><button data-all-categories="1">&larr; All categories</button>'
      + ' <span class="category-breadcrumb-current">' + escapeHtml(state.category) + '</span></div>';
    html += '<div class="results-summary">' + visible.length + ' of ' + corpus.length + ' sections shown. Click one to begin reading.</div>';
    if (visible.length === 0) {
      html += '<div class="empty-state">No sections match the selected filters.</div>';
    } else {
      visible.forEach(function (section) { html += renderSectionSummary(section); });
    }
    el.resultsArea.innerHTML = html;
    el.resultsArea.querySelectorAll("[data-all-categories]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.category = null;
        state.hymnType = null;
        state.mode = null;
        renderFacets();
        renderMain();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
    el.resultsArea.querySelectorAll(".section-item[data-section]").forEach(function (item) {
      item.addEventListener("click", function () {
        state.openSection = parseInt(item.getAttribute("data-section"), 10);
        state.openStanzaIdx = 0;
        state.highlightVerseIdx = null; state.highlightWord = null;
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

  // A quick "jump to a different Sharagan (hymn)" strip - every stanza in
  // the open Ganon, labeled by its genre, current one marked active.
  function renderSharaganNav(section, activeIdx) {
    var html = '<div class="sharagan-nav">';
    section.stanzas.forEach(function (stanza, idx) {
      html += '<span class="sharagan-nav-chip' + (idx === activeIdx ? " active" : "") + '" data-jump-stanza="' + idx + '">'
        + escapeHtml(stanzaLabel(stanza, idx)) + '</span>';
    });
    html += '</div>';
    return html;
  }

  function wireSharaganNav(container) {
    container.querySelectorAll("[data-jump-stanza]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        state.openStanzaIdx = parseInt(chip.getAttribute("data-jump-stanza"), 10);
        state.highlightVerseIdx = null; state.highlightWord = null;
        renderMain();
      });
    });
  }

  // --- scripture-reference panel: the connected Bible passage(s) for the
  // Sharagan currently open, shown beside it when the toggle is on. ---
  function scriptureVerseListHtml(list, scriptClass) {
    var html = "";
    (list || []).forEach(function (item) {
      html += '<p class="scripture-verse ' + scriptClass + '">';
      if (item.v) html += '<span class="scripture-verse-num">' + item.v + '</span>';
      html += escapeHtml(item.t) + "</p>";
    });
    return html;
  }

  function scripturePanelHtml(entries) {
    if (!entries.length) return "";
    var html = '<aside class="scripture-panel" aria-label="Connected scripture passage">';
    entries.forEach(function (e, idx) {
      html += '<div class="scripture-entry"' + (idx > 0 ? ' style="margin-top:22px;border-top:1px solid var(--paper-line);padding-top:18px;"' : "") + '>';
      html += '<div class="scripture-entry-head">';
      html += '<div class="scripture-entry-gloss">' + escapeHtml((e.info && e.info.gloss) || (e.info && e.info.name) || "") + '</div>';
      html += '<div class="scripture-entry-citation">' + escapeHtml(e.entry.citation) + '</div>';
      html += '</div>';
      html += '<div class="scripture-columns">';
      html += '<div class="scripture-column scripture-column-arm">' + scriptureVerseListHtml(e.entry.armenian, "scripture-arm") + '</div>';
      html += '<div class="scripture-column scripture-column-en">' + scriptureVerseListHtml(e.entry.english, "scripture-en") + '</div>';
      html += '</div>';
      if (e.entry.chapterArmenian) {
        html += '<button class="scripture-chapter-btn" data-scripture-chapter="' + escapeHtml(e.key) + '" type="button">View the whole chapter &rarr;</button>';
      }
      html += '</div>';
    });
    html += '</aside>';
    return html;
  }

  var scriptureDialogReturnFocus = null;

  function closeScriptureDialog() {
    var overlay = document.getElementById("scriptureDialogOverlay");
    if (overlay) overlay.remove();
    document.removeEventListener("keydown", scriptureDialogKeydown, true);
    if (scriptureDialogReturnFocus && scriptureDialogReturnFocus.focus) {
      scriptureDialogReturnFocus.focus();
    }
    scriptureDialogReturnFocus = null;
  }

  function scriptureDialogKeydown(ev) {
    if (ev.key === "Escape") closeScriptureDialog();
  }

  function openScriptureDialog(key, triggerEl) {
    var entry = scriptureRefs && scriptureRefs[key];
    if (!entry || !entry.chapterArmenian) return;
    scriptureDialogReturnFocus = triggerEl || null;
    var overlay = document.createElement("div");
    overlay.id = "scriptureDialogOverlay";
    overlay.className = "scripture-dialog-overlay";
    var html = '<div class="scripture-dialog" role="dialog" aria-modal="true" aria-label="' + escapeHtml(entry.chapterLabel || entry.citation) + '">';
    html += '<div class="scripture-dialog-head">';
    html += '<div class="scripture-dialog-title">' + escapeHtml(entry.chapterLabel || entry.citation) + '</div>';
    html += '<button class="scripture-dialog-close" type="button" aria-label="Close">&times;</button>';
    html += '</div>';
    html += '<div class="scripture-dialog-body">';
    html += '<div class="scripture-columns">';
    html += '<div class="scripture-column scripture-column-arm">' + scriptureVerseListHtml(entry.chapterArmenian, "scripture-arm") + '</div>';
    html += '<div class="scripture-column scripture-column-en">' + scriptureVerseListHtml(entry.chapterEnglish, "scripture-en") + '</div>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    overlay.addEventListener("mousedown", function (ev) {
      if (ev.target === overlay) closeScriptureDialog();
    });
    overlay.querySelector(".scripture-dialog-close").addEventListener("click", closeScriptureDialog);
    document.addEventListener("keydown", scriptureDialogKeydown, true);
    var closeBtn = overlay.querySelector(".scripture-dialog-close");
    if (closeBtn && closeBtn.focus) closeBtn.focus();
  }

  function wireScripturePanel(container) {
    container.querySelectorAll("[data-scripture-chapter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openScriptureDialog(btn.getAttribute("data-scripture-chapter"), btn);
      });
    });
  }

  // --- reading mode: one Sharagan (hymn = a whole stanza's verses) at a time ---
  function renderReadingMode(section, stanzaIdx) {
    stanzaIdx = Math.max(0, Math.min(stanzaIdx, section.stanzas.length - 1));
    var stanza = section.stanzas[stanzaIdx];
    var highlightIdx = state.highlightVerseIdx;

    var html = '<div class="reading-card">';
    html += '<div class="reading-topline">';
    html += '<button class="back-link" data-back="1">&larr; Back to list</button>';
    html += '<button class="view-mode-toggle" data-whole="1">View entire canon &#9776;</button>';
    html += '</div>';

    html += '<div class="reading-category">' + escapeHtml(section.category) + '</div>';
    html += renderHeadingBlock(section.heading, "reading-heading");
    html += '<div class="ornament">֍</div>';

    html += genreBadgeHtml(stanza);
    html += '<div class="verse-progress">Sharagan ' + (stanzaIdx + 1) + ' of ' + section.stanzas.length + '</div>';
    html += renderSharaganNav(section, stanzaIdx);

    var scriptureOn = document.body.classList.contains("show-scripture");
    var scriptureEntries = scriptureOn ? scriptureEntriesForStanza(stanza) : [];
    var hasScripture = scriptureEntries.length > 0;
    document.body.classList.toggle("wide-reading", hasScripture);

    if (hasScripture) html += '<div class="reading-body-grid"><div class="reading-hymn-col">';

    stanza.verses.forEach(function (verse, vi) {
      var highlighted = highlightIdx !== null && vi === highlightIdx;
      var translitText = translit(verse.text);
      var globalVi = flatVerseIndex(section, stanzaIdx, vi);
      var pairs = alignmentFor(section.id, globalVi);
      var groupPrefix = "p" + section.id + "-" + globalVi;
      html += '<div class="sharagan-verse' + (highlighted ? " highlighted" : "") + '"' + (highlighted ? ' id="highlighted-verse"' : "") + '>';
      html += '<div class="verse-armenian script-original">' + renderArmenianVerseHtml(verse.text, pairs, groupPrefix, highlighted ? state.highlightWord : null) + '</div>';
      html += '<div class="verse-armenian script-translit">' + renderEnglishVerseHtml(verse.text, translitText, null, groupPrefix) + '</div>';
      html += '<div class="verse-divider">&#10022;</div>';
      if (verse.en) {
        html += '<div class="verse-english">' + renderEnglishVerseHtml(verse.text, verse.en, pairs, groupPrefix) + '</div>';
      } else {
        html += '<div class="verse-english pending">English translation not yet available for this verse.</div>';
      }
      html += '</div>';
    });

    if (hasScripture) {
      html += '</div>'; // .reading-hymn-col
      html += scripturePanelHtml(scriptureEntries);
      html += '</div>'; // .reading-body-grid
    }

    html += '<div class="reading-nav">';
    html += '<button class="nav-btn" data-nav="prev"' + (stanzaIdx === 0 ? " disabled" : "") + '>&larr; Previous Sharagan</button>';
    html += '<button class="nav-btn" data-nav="next"' + (stanzaIdx === section.stanzas.length - 1 ? " disabled" : "") + '>Next Sharagan &rarr;</button>';
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
    if (prevBtn) prevBtn.addEventListener("click", function () { state.openStanzaIdx = stanzaIdx - 1; state.highlightVerseIdx = null; state.highlightWord = null; renderMain(); });
    if (nextBtn) nextBtn.addEventListener("click", function () { state.openStanzaIdx = stanzaIdx + 1; state.highlightVerseIdx = null; state.highlightWord = null; renderMain(); });
    wireSharaganNav(el.resultsArea);
    wireWordLinks(el.resultsArea);
    wirePhraseHover(el.resultsArea);
    if (hasScripture) wireScripturePanel(el.resultsArea);

    if (highlightIdx !== null) {
      var target = document.getElementById("highlighted-verse");
      if (target && target.scrollIntoView) target.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    // keyboard navigation between Sharagans
    document.onkeydown = function (ev) {
      if (state.openSection === null || state.wholeCanon) return;
      if (document.getElementById("scriptureDialogOverlay")) return;
      if (ev.target && (ev.target.tagName === "INPUT" || ev.target.tagName === "TEXTAREA")) return;
      if (ev.key === "ArrowRight" && stanzaIdx < section.stanzas.length - 1) { state.openStanzaIdx = stanzaIdx + 1; state.highlightVerseIdx = null; state.highlightWord = null; renderMain(); }
      if (ev.key === "ArrowLeft" && stanzaIdx > 0) { state.openStanzaIdx = stanzaIdx - 1; state.highlightVerseIdx = null; state.highlightWord = null; renderMain(); }
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
    html += renderHeadingBlock(section.heading, "reading-heading-sm");
    html += '<div class="ornament">֍</div>';
    html += renderSharaganNav(section, -1);

    section.stanzas.forEach(function (stanza, stanzaIdx) {
      html += '<div class="stanza-block" data-stanza-block="' + stanzaIdx + '">';
      html += '<div class="stanza-type-label">Sharagan ' + (stanzaIdx + 1) + (stanza.type ? " &middot; " + escapeHtml(stanza.type) : "") + '</div>';
      var badge = genreBadgeHtml(stanza);
      if (badge) html += badge;
      stanza.verses.forEach(function (verse, vi) {
        html += '<div class="whole-verse-line script-original" data-jump-stanza-verse="' + stanzaIdx + '"><span class="verse-num">' + (vi + 1) + '</span>' + escapeHtml(verse.text) + '</div>';
        html += '<div class="whole-verse-line script-translit" data-jump-stanza-verse="' + stanzaIdx + '"><span class="verse-num">' + (vi + 1) + '</span>' + escapeHtml(translit(verse.text)) + '</div>';
        if (verse.en) {
          html += '<div class="whole-verse-en">' + escapeHtml(verse.en) + '</div>';
        } else {
          html += '<div class="whole-verse-en pending">Translation not yet available.</div>';
        }
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
    wireSharaganNav(el.resultsArea);
    el.resultsArea.querySelectorAll("[data-jump-stanza-verse]").forEach(function (line) {
      line.addEventListener("click", function () {
        state.openStanzaIdx = parseInt(line.getAttribute("data-jump-stanza-verse"), 10);
        state.highlightVerseIdx = null; state.highlightWord = null;
        state.wholeCanon = false;
        renderMain();
      });
    });
  }

  // --- browser back/forward: move through the site's own views, not away
  // from the site entirely. Each distinct "page" (a category list, a
  // section reading at a given Sharagan, a whole-canon view, a search) gets
  // its own history entry via the URL hash; switching between two pages of
  // the same kind (e.g. paging Sharagan-to-Sharagan, or editing a search
  // query) replaces the current entry instead of piling up one per click.
  function computeHash() {
    if (state.openSection !== null) {
      if (state.wholeCanon) return "s=" + state.openSection + "&whole=1";
      var hash = "s=" + state.openSection + "&st=" + state.openStanzaIdx;
      if (state.highlightVerseIdx !== null) hash += "&hv=" + state.highlightVerseIdx;
      if (state.highlightWord) hash += "&hw=" + encodeURIComponent(state.highlightWord);
      return hash;
    }
    if (state.query.trim().length > 0) {
      var qhash = "q=" + encodeURIComponent(state.query.trim());
      if (state.lastResultKey) qhash += "&r=" + encodeURIComponent(state.lastResultKey);
      return qhash;
    }
    if (state.category !== null) return "c=" + encodeURIComponent(state.category);
    return "";
  }
  function hashKind(hash) {
    if (hash.indexOf("s=") === 0) return "s";
    if (hash.indexOf("q=") === 0) return "q";
    if (hash.indexOf("c=") === 0) return "c";
    return "";
  }
  function parseHashParams(hash) {
    var out = {};
    hash.split("&").forEach(function (pair) {
      if (!pair) return;
      var eq = pair.indexOf("=");
      var key = eq === -1 ? pair : pair.slice(0, eq);
      var value = eq === -1 ? "" : decodeURIComponent(pair.slice(eq + 1));
      out[key] = value;
    });
    return out;
  }
  function applyHashState(hash) {
    var params = parseHashParams(hash);
    state.openSection = null;
    state.category = null;
    state.query = "";
    state.wholeCanon = false;
    state.openStanzaIdx = 0;
    state.highlightVerseIdx = null; state.highlightWord = null;
    state.lastResultKey = null;
    if (params.s !== undefined) {
      var sid = parseInt(params.s, 10);
      state.openSection = (corpus && sid >= 0 && sid < corpus.length) ? sid : null;
      if (params.whole === "1") state.wholeCanon = true;
      else state.openStanzaIdx = parseInt(params.st || "0", 10) || 0;
      if (params.hv !== undefined) state.highlightVerseIdx = parseInt(params.hv, 10);
      if (params.hw !== undefined) state.highlightWord = params.hw;
    } else if (params.q !== undefined) {
      state.query = params.q;
      if (el.searchInput) el.searchInput.value = state.query;
      if (params.r !== undefined) state.lastResultKey = params.r;
    } else if (params.c !== undefined) {
      state.category = params.c;
    }
  }
  var suppressHistoryPush = false;
  function syncHistory() {
    if (suppressHistoryPush) return;
    var hash = computeHash();
    var current = location.hash.replace(/^#/, "");
    if (hash === current) return;
    var method = hashKind(hash) === hashKind(current) ? "replaceState" : "pushState";
    history[method](null, "", hash ? "#" + hash : location.pathname + location.search);
  }
  window.addEventListener("popstate", function () {
    suppressHistoryPush = true;
    applyHashState(location.hash.replace(/^#/, ""));
    renderFacets();
    renderMain();
    suppressHistoryPush = false;
  });

  function renderMain() {
    updateSearchPanelVisibility();
    document.body.classList.remove("wide-reading");
    if (state.openSection !== null) {
      var section = corpus[state.openSection];
      if (state.wholeCanon) renderWholeCanon(section);
      else renderReadingMode(section, state.openStanzaIdx);
    } else if (state.query.trim().length > 0) {
      document.onkeydown = null;
      renderSearchResults();
    } else {
      document.onkeydown = null;
      renderBrowseList();
    }
    syncHistory();
  }

  var searchDebounce = null;
  if (el.searchInput) {
    el.searchInput.addEventListener("input", function () {
      state.query = el.searchInput.value;
      state.openSection = null;
      state.lastResultKey = null;
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(function () { renderFacets(); renderMain(); }, 120);
    });
  }

  // --- boot ---
  el.resultsArea.innerHTML = '<div class="empty-state">Loading the corpus&hellip;</div>';
  loadAll().then(function () {
    suppressHistoryPush = true;
    applyHashState(location.hash.replace(/^#/, ""));
    renderFacets();
    renderMain();
    suppressHistoryPush = false;
  }).catch(function (err) {
    el.resultsArea.innerHTML = '<div class="empty-state">Could not load the corpus data. ('
      + escapeHtml(err && err.message ? err.message : String(err)) + ')</div>';
  });
}());
