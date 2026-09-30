(function () {
  "use strict";

  // --- touch/no-hover device detection, for the phrase-link/word-link tap
  // behavior below (there's no hover to reveal connections with on a
  // touchscreen, so tapping has to do double duty: first tap previews,
  // a fast second tap on the same target navigates). ---
  var isTouchLikeDevice = (function () {
    try { return window.matchMedia && window.matchMedia("(hover: none), (pointer: coarse)").matches; }
    catch (e) { return false; }
  })();

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

  // --- scripture-reference toggle: off by default. When on, a hymn shows
  // the real Bible passage(s) its OWN text actually alludes to - found by
  // reading the hymn itself, not a blanket "every hymn in this Ode-slot
  // cites the same generic canticle" rule. Classical Armenian (Zohrab, via
  // arak29.org) alongside the RSV. A hymn can have several real connected
  // passages (a hymn is rarely built on just one allusion); when it does,
  // a small tab strip lets you switch between them. This is currently
  // authored only for section 0 (the one fully-translated sample section) -
  // data/stanza-refs.json is keyed {sectionId: {stanzaIndex: [passage,...]}},
  // and a stanza/section with no entry simply shows nothing. The data
  // behind this is tiny and loaded lazily, only once the toggle is on. ---
  var scriptureToggle = document.getElementById("scriptureToggle");
  var SCRIPTURE_KEY = "sharaganScripture";
  var scriptureRefs = null;
  var scriptureRefsPromise = null;
  var scriptureActiveTab = 0; // which passage tab is showing, reset per stanza
  var lastScriptureStanzaKey = null; // "sectionId:stanzaIdx" - detects a genuine stanza change
  function loadScriptureRefs() {
    if (scriptureRefsPromise) return scriptureRefsPromise;
    scriptureRefsPromise = fetch("data/stanza-refs.json")
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

  // The real, content-based passage(s) this specific hymn (section+stanza)
  // has been researched against - not a genre lookup. Returns [] until the
  // data has finished loading, or for any section/stanza not yet authored.
  function scripturePassagesForStanza(sectionId, stanzaIdx) {
    if (!scriptureRefs) return [];
    var forSection = scriptureRefs[String(sectionId)];
    if (!forSection) return [];
    return forSection[String(stanzaIdx)] || [];
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

  // Armenian syllable-boundary hyphenation, so a long heading that has to
  // break mid-word on a narrow screen breaks with a real hyphen at a
  // sensible point (e.g. "Աստուածայայտնու-թիւն") instead of just an
  // arbitrary cut with no hyphen at all. This is a heuristic syllabifier
  // (maximal-onset rule: a single consonant between two vowels joins the
  // following vowel; a cluster of two or more splits after the first),
  // not a verified hyphenation dictionary - it inserts an ordinary Unicode
  // soft hyphen (­) at each syllable boundary it finds, which every
  // browser already renders as a hyphen only if a break actually happens
  // there, and as nothing otherwise - so a wrong guess here is silent
  // unless the word actually needs to wrap.
  var ARM_VOWELS = "աեէըիոօԱԵԷԸԻՈՕ";
  function armenianVowelNuclei(word) {
    // Each entry is [startIndex, endIndex] (inclusive), covering either a
    // single vowel letter or one of the two vowel digraphs "ու"/"իւ"
    // (their second letter, ւ, is never a break point of its own).
    var nuclei = [];
    for (var i = 0; i < word.length; i++) {
      var ch = word.charAt(i);
      if (ARM_VOWELS.indexOf(ch) === -1) continue;
      var next = word.charAt(i + 1);
      if ((ch === "ո" || ch === "Ո" || ch === "ի" || ch === "Ի") && (next === "ւ" || next === "Ւ")) {
        nuclei.push([i, i + 1]);
        i += 1;
      } else {
        nuclei.push([i, i]);
      }
    }
    return nuclei;
  }
  function hyphenateArmenianWord(word) {
    if (word.length < 9) return word; // short words never need mid-word breaking
    var nuclei = armenianVowelNuclei(word);
    if (nuclei.length < 2) return word;
    var breaks = [];
    for (var k = 0; k < nuclei.length - 1; k++) {
      var gapStart = nuclei[k][1] + 1;
      var gapEnd = nuclei[k + 1][0] - 1; // inclusive indices of consonants between nuclei
      var consonantCount = gapEnd - gapStart + 1;
      if (consonantCount <= 0) continue; // adjacent vowels - don't split a hiatus
      // A single consonant joins the following vowel (break right before
      // it); a cluster of two or more splits right before its LAST
      // consonant, so the rest of the cluster stays with the preceding
      // syllable (e.g. -յայտ-նու-, not -յա-յտնու-).
      var breakAt = consonantCount === 1 ? gapStart : gapEnd;
      if (breakAt >= 2 && word.length - breakAt >= 2) breaks.push(breakAt);
    }
    if (!breaks.length) return word;
    var out = "";
    var cursor = 0;
    breaks.forEach(function (b) {
      out += word.slice(cursor, b) + "­";
      cursor = b;
    });
    out += word.slice(cursor);
    return out;
  }
  function hyphenateArmenian(text) {
    return String(text).replace(/[Ա-Ֆա-և]+/g, function (word) {
      return hyphenateArmenianWord(word);
    });
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
      html += '<div class="heading-eyebrow script-original">' + escapeHtml(hyphenateArmenian(parts[0])) + '</div>';
      html += '<div class="heading-eyebrow script-translit">' + escapeHtml(translit(parts[0])) + '</div>';
      rest = parts.slice(1);
    }
    rest.forEach(function (line) {
      html += '<div class="' + mainClass + ' script-original">' + escapeHtml(hyphenateArmenian(line)) + '</div>';
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
      matches.push({ start: idx, end: idx + phraseText.length, id: i, text: phraseText, kind: pair.kind || "phrase", tabIdx: pair.tabIdx });
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

  // Groups consecutive items sharing the same key (compared by ===, so a
  // shared span object or a shared null both count as "the same group") -
  // a small run-length encoding used to keep adjacent same-key pieces as
  // ONE wrapper instead of a new element per minimal cut segment.
  function groupConsecutive(items, getKey) {
    var groups = [];
    items.forEach(function (item) {
      var k = getKey(item);
      var last = groups[groups.length - 1];
      if (last && last.key === k) {
        last.items.push(item);
      } else {
        groups.push({ key: k, items: [item] });
      }
    });
    return groups;
  }

  // Phrase-link spans and scripture spans are located INDEPENDENTLY over
  // the same full text (each against the whole verse, never against a
  // remainder left by the other), then cut into minimal segments at every
  // boundary either layer introduces. This is what lets a stretch of text
  // be simultaneously a phrase-link pair AND a scripture connection - a
  // reader hovering the phrase sees its gold highlight layer INSIDE the
  // scripture span's own wine-colored highlight, rather than one silently
  // pre-empting the other.
  function partitionLayeredText(text, scriptureSpans, phraseSpans) {
    var cuts = { 0: true };
    cuts[text.length] = true;
    scriptureSpans.concat(phraseSpans).forEach(function (s) {
      cuts[s.start] = true;
      cuts[s.end] = true;
    });
    var points = Object.keys(cuts).map(Number).sort(function (a, b) { return a - b; });
    function spanContaining(spans, start, end) {
      for (var i = 0; i < spans.length; i++) {
        if (spans[i].start <= start && end <= spans[i].end) return spans[i];
      }
      return null;
    }
    var segments = [];
    for (var i = 0; i < points.length - 1; i++) {
      var segStart = points[i], segEnd = points[i + 1];
      if (segStart >= segEnd) continue;
      segments.push({
        text: text.slice(segStart, segEnd),
        scripture: spanContaining(scriptureSpans, segStart, segEnd),
        phrase: spanContaining(phraseSpans, segStart, segEnd),
      });
    }
    return segments;
  }

  // Renders the merged scripture/phrase-link layers for one verse's text.
  // Scripture wrappers stay ONE contiguous element per connected stretch
  // (grouped across any phrase-link boundaries that fall inside it, so
  // there's no visible seam from the padding/rounded corners repeating);
  // phrase-link wrappers are grouped the same way but only WITHIN each
  // scripture group, so a phrase that straddles a scripture boundary still
  // renders as two elements sharing one data-phrase-group id (already
  // handled by the hover wiring, which queries by that shared id, not by
  // DOM adjacency).
  function renderLayeredText(text, scriptureSpans, phraseSpans, groupPrefix, activeScriptureTab, renderChunk) {
    var segments = partitionLayeredText(text, scriptureSpans, phraseSpans);
    var html = "";
    groupConsecutive(segments, function (s) { return s.scripture; }).forEach(function (sg) {
      var inner = "";
      groupConsecutive(sg.items, function (s) { return s.phrase; }).forEach(function (pg) {
        var chunkText = pg.items.map(function (s) { return s.text; }).join("");
        var rendered = renderChunk(chunkText);
        inner += pg.key ? '<span class="phrase" data-phrase-group="' + groupPrefix + "-" + pg.key.id + '">' + rendered + "</span>" : rendered;
      });
      html += sg.key ? scriptureWrapperHtml(sg.key, inner, activeScriptureTab) : inner;
    });
    return html;
  }

  // A phrase-pair-like entry (same {arm,en} shape locatePhraseSpans already
  // expects) for every scripture passage in this stanza whose own hymnRef
  // points at this specific verse - not just the currently active tab, so
  // any connected phrase stays clickable even while a different tab is
  // showing. Marked kind:"scripture" so the render loop gives it its own
  // class/attributes instead of the phrase-link toggle's ".phrase".
  function scriptureLinkPairsForVerse(passages, localVerseIdx) {
    if (!passages || !passages.length) return [];
    var out = [];
    passages.forEach(function (p, tabIdx) {
      if (p.hymnRef && p.hymnRef.verseIdx === localVerseIdx) {
        out.push({ arm: p.hymnRef.arm, en: p.hymnRef.en, kind: "scripture", tabIdx: tabIdx });
      }
    });
    return out;
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

  function scriptureWrapperHtml(scriptureSpan, inner, activeScriptureTab) {
    var isActive = scriptureSpan.tabIdx === activeScriptureTab;
    return '<span class="scripture-hymn-link' + (isActive ? " active" : "") + '" data-scripture-hymn-tab="' + scriptureSpan.tabIdx + '">' + inner + "</span>";
  }

  function renderArmenianVerseHtml(rawText, phrasePairs, groupPrefix, highlightWord, scripturePairs, activeScriptureTab) {
    // The ornament (when present) is its own small glyph up front - it has
    // no letter value of its own, so it does NOT count as "the drop cap has
    // already been applied": the real first letter that follows it still
    // needs to get the actual stylized drop cap.
    var dropCapState = { applied: false };
    var html = "";
    var workText = rawText;
    if (rawText.charAt(0) === ORNAMENT) {
      html += '<span class="dropcap dropcap-ornament">' + ORNAMENT + "</span>";
      var restStart = 1;
      while (restStart < rawText.length && /\s/.test(rawText.charAt(restStart))) restStart++;
      workText = rawText.slice(restStart);
    }
    var scriptureSpans = locatePhraseSpans(workText, scripturePairs, "arm");
    var phraseSpans = locatePhraseSpans(workText, phrasePairs, "arm");
    html += renderLayeredText(workText, scriptureSpans, phraseSpans, groupPrefix, activeScriptureTab, function (chunk) {
      return armenianSegmentHtml(chunk, dropCapState, highlightWord);
    });
    return html;
  }

  function renderEnglishVerseHtml(armenianText, englishText, phrasePairs, groupPrefix, scripturePairs, activeScriptureTab) {
    // As above: the ornament glyph (shown here only to visually pair with
    // the Armenian side) never counts as "the drop cap is already used" -
    // the real first letter of the English/transliterated text still gets
    // its own stylized drop cap right after it.
    var hasOrnament = armenianText.charAt(0) === ORNAMENT;
    var dropApplied = false;
    var html = hasOrnament ? '<span class="dropcap dropcap-ornament">' + ORNAMENT + "</span>" : "";
    function withDrop(text) {
      if (dropApplied || !text.length) return escapeHtml(text);
      var m = text.match(/^(\s*)([^\s])([\s\S]*)$/);
      if (!m) return escapeHtml(text);
      dropApplied = true;
      return escapeHtml(m[1]) + '<span class="dropcap">' + escapeHtml(m[2]) + "</span>" + escapeHtml(m[3]);
    }
    var scriptureSpans = locatePhraseSpans(englishText, scripturePairs, "en");
    var phraseSpans = locatePhraseSpans(englishText, phrasePairs, "en");
    html += renderLayeredText(englishText, scriptureSpans, phraseSpans, groupPrefix, activeScriptureTab, withDrop);
    return html;
  }

  // On a touchscreen there's no hover to reveal a phrase-link connection
  // with, so a tap has to stand in for it - but a bare tap is also how you
  // jump to the word search below. Resolved the same way a map app resolves
  // "tap a pin" vs "tap it again": the first tap on a connected word/phrase
  // just previews the connection (lights up its group, same as hover would);
  // a second tap on that same group within DOUBLE_TAP_MS counts as a
  // deliberate double-tap and falls through to whatever the first tap would
  // have done on a device with real hover. Words with no phrase-group at all
  // have nothing to preview, so they still jump straight to search on one
  // tap, same as before - only connected words gain the extra step.
  var DOUBLE_TAP_MS = 450;
  var lastTapGroupKey = null;
  var lastTapGroupTime = 0;

  function setActivePhraseGroup(container, group) {
    container.querySelectorAll(".phrase.phrase-active").forEach(function (s) {
      s.classList.remove("phrase-active");
    });
    if (!group) return;
    container.querySelectorAll('.phrase[data-phrase-group="' + group + '"]').forEach(function (s) {
      s.classList.add("phrase-active");
    });
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

        if (isTouchLikeDevice) {
          var phraseAncestor = span.closest(".phrase[data-phrase-group]");
          if (phraseAncestor) {
            var group = phraseAncestor.getAttribute("data-phrase-group");
            var now = Date.now();
            var isDoubleTap = lastTapGroupKey === group && (now - lastTapGroupTime) < DOUBLE_TAP_MS;
            lastTapGroupKey = group;
            lastTapGroupTime = now;
            setActivePhraseGroup(container, group);
            if (!isDoubleTap) return;
          }
        }

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
  // phrase-link toggle is on (guarded in CSS by body.phrase-link). On a
  // touch-like device, a tap does the same thing (see wireWordLinks above
  // for the Armenian/word-link side of this - this covers phrase spans with
  // no word-link inside them, e.g. the English half of the connection).
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
      if (isTouchLikeDevice) {
        span.addEventListener("click", function (ev) {
          if (ev.target.closest(".word-link[data-word]")) return; // handled above
          var sel = window.getSelection();
          if (sel && String(sel).length > 0) return;
          setActivePhraseGroup(container, group);
        });
      }
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
    if (section.titleEn) html += '<div class="result-loc-en">' + escapeHtml(section.titleEn) + '</div>';
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
    html += '<div class="section-heading script-original" style="font-size:19px;">' + escapeHtml(hyphenateArmenian(heading)) + '</div>';
    html += '<div class="section-heading script-translit" style="font-size:19px;">' + escapeHtml(translit(heading)) + '</div>';
    if (section.titleEn) html += '<div class="section-heading-en">' + escapeHtml(section.titleEn) + '</div>';
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

  // --- scripture-reference panel: the real, content-based Bible passage(s)
  // the Sharagan currently open actually alludes to, shown beside it when
  // the toggle is on. A hymn can have several genuine connected passages;
  // when it does, a small tab strip switches between them (one at a time
  // shown, so the panel never turns into an unreadable wall of text). ---
  // Bolds the exact phrase(s) (keyPhrases - one string, or an array when a
  // multi-verse citation has a separate key phrase in each verse) the hymn
  // is actually drawing on, wherever they appear in this verse's text - so
  // a long Bible verse (or a whole chapter of them) doesn't leave the
  // reader hunting for the two or three words that are the actual point of
  // the connection. Each phrase must be an exact substring of the verse
  // text; one that isn't found (or wasn't given at all) is silently
  // skipped, same as before.
  function verseTextHtml(text, keyPhrases) {
    var phrases = Array.isArray(keyPhrases) ? keyPhrases : (keyPhrases ? [keyPhrases] : []);
    var matches = [];
    phrases.forEach(function (phrase) {
      if (!phrase) return;
      var idx = text.indexOf(phrase);
      if (idx !== -1) matches.push([idx, idx + phrase.length]);
    });
    if (!matches.length) return escapeHtml(text);
    matches.sort(function (a, b) { return a[0] - b[0]; });
    var html = "";
    var cursor = 0;
    matches.forEach(function (m) {
      if (m[0] < cursor) return; // overlapping with an earlier match - skip
      html += escapeHtml(text.slice(cursor, m[0]));
      html += "<strong>" + escapeHtml(text.slice(m[0], m[1])) + "</strong>";
      cursor = m[1];
    });
    html += escapeHtml(text.slice(cursor));
    return html;
  }

  function scriptureVerseListHtml(list, scriptClass, highlightVerses, keyPhrase) {
    var html = "";
    (list || []).forEach(function (item) {
      var isHighlighted = Boolean(highlightVerses && item.v && highlightVerses.indexOf(item.v) !== -1);
      html += '<p class="scripture-verse ' + scriptClass + (isHighlighted ? " scripture-verse-highlighted" : "") + '"'
        + (isHighlighted ? ' data-scripture-highlighted="1"' : "") + '>';
      if (item.v) html += '<span class="scripture-verse-num">' + item.v + '</span>';
      html += verseTextHtml(item.t, keyPhrase) + "</p>";
    });
    return html;
  }

  // The passage list currently on screen, so the chapter-dialog button
  // (which only ever needs "whichever tab is active right now") doesn't
  // need its own separate lookup/keying scheme.
  var currentScripturePassages = [];

  function scripturePanelHtml(passages) {
    if (!passages.length) return "";
    currentScripturePassages = passages;
    if (scriptureActiveTab >= passages.length) scriptureActiveTab = 0;
    var active = passages[scriptureActiveTab];
    var html = '<aside class="scripture-panel" aria-label="Connected scripture passages">';
    if (passages.length > 1) {
      html += '<div class="scripture-tabs" role="tablist" aria-label="Connected passages">';
      passages.forEach(function (p, idx) {
        html += '<button type="button" role="tab" aria-selected="' + (idx === scriptureActiveTab ? "true" : "false") + '" class="scripture-tab' + (idx === scriptureActiveTab ? " active" : "") + '" data-scripture-tab="' + idx + '">' + escapeHtml(p.ref) + '</button>';
      });
      html += '</div>';
    }
    html += '<div class="scripture-entry">';
    html += '<div class="scripture-entry-head">';
    html += '<div class="scripture-entry-citation">' + escapeHtml(active.ref) + '</div>';
    if (active.note) html += '<div class="scripture-entry-note">' + escapeHtml(active.note) + '</div>';
    html += '</div>';
    html += '<div class="scripture-columns">';
    html += '<div class="scripture-column scripture-column-arm">' + scriptureVerseListHtml(active.armenian, "scripture-arm", null, active.armKey) + '</div>';
    html += '<div class="scripture-column scripture-column-en">' + scriptureVerseListHtml(active.english, "scripture-en", null, active.enKey) + '</div>';
    html += '</div>';
    if (active.chapterArmenian) {
      html += '<button class="scripture-chapter-btn" data-scripture-chapter="' + scriptureActiveTab + '" type="button">View the whole chapter &rarr;</button>';
    }
    html += '</div>';
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

  // The excerpt already shown in the side panel (entry.armenian/english)
  // carries the real chapter verse number(s) it was drawn from - the two
  // sides can even differ (Armenian and English verse divisions don't
  // always match up exactly) - so each column highlights against its own
  // list rather than assuming they're the same numbers.
  function verseNumbersOf(list) {
    return (list || []).map(function (item) { return item.v; }).filter(Boolean);
  }

  function openScriptureDialog(tabIdx, triggerEl) {
    var entry = currentScripturePassages[tabIdx];
    if (!entry || !entry.chapterArmenian) return;
    scriptureDialogReturnFocus = triggerEl || null;
    var overlay = document.createElement("div");
    overlay.id = "scriptureDialogOverlay";
    overlay.className = "scripture-dialog-overlay";
    var html = '<div class="scripture-dialog" role="dialog" aria-modal="true" aria-label="' + escapeHtml(entry.chapterLabel || entry.ref) + '">';
    html += '<div class="scripture-dialog-head">';
    html += '<div class="scripture-dialog-title">' + escapeHtml(entry.chapterLabel || entry.ref) + '</div>';
    html += '<button class="scripture-dialog-close" type="button" aria-label="Close">&times;</button>';
    html += '</div>';
    html += '<div class="scripture-dialog-body">';
    html += '<div class="scripture-columns">';
    html += '<div class="scripture-column scripture-column-arm">' + scriptureVerseListHtml(entry.chapterArmenian, "scripture-arm", verseNumbersOf(entry.armenian), entry.armKey) + '</div>';
    html += '<div class="scripture-column scripture-column-en">' + scriptureVerseListHtml(entry.chapterEnglish, "scripture-en", verseNumbersOf(entry.english), entry.enKey) + '</div>';
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
    var firstHighlighted = overlay.querySelector("[data-scripture-highlighted]");
    if (firstHighlighted && firstHighlighted.scrollIntoView) {
      firstHighlighted.scrollIntoView({ block: "center" });
    }
  }

  function wireScripturePanel(container, rerender) {
    container.querySelectorAll("[data-scripture-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        scriptureActiveTab = parseInt(btn.getAttribute("data-scripture-tab"), 10) || 0;
        rerender();
      });
    });
    container.querySelectorAll("[data-scripture-chapter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openScriptureDialog(parseInt(btn.getAttribute("data-scripture-chapter"), 10) || 0, btn);
      });
    });
    // The hymn side of the connection: a word/phrase actually inside the
    // Sharagan text that a scripture passage was drawn from. Clicking it
    // (same as clicking its tab pill) switches the panel to that passage -
    // a real, clickable link both ways, not just a one-way "here's a
    // citation" note. Guarded against a text-selection drag, same as the
    // word-link click-to-search handler.
    container.querySelectorAll("[data-scripture-hymn-tab]").forEach(function (span) {
      span.addEventListener("click", function () {
        var sel = window.getSelection();
        if (sel && sel.toString().length) return;
        scriptureActiveTab = parseInt(span.getAttribute("data-scripture-hymn-tab"), 10) || 0;
        rerender();
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
    if (section.titleEn) html += '<div class="reading-heading-en">' + escapeHtml(section.titleEn) + '</div>';
    html += '<div class="ornament">֍</div>';

    html += genreBadgeHtml(stanza);
    html += '<div class="verse-progress">Sharagan ' + (stanzaIdx + 1) + ' of ' + section.stanzas.length + '</div>';
    html += renderSharaganNav(section, stanzaIdx);

    var scriptureOn = document.body.classList.contains("show-scripture");
    var scriptureStanzaKey = section.id + ":" + stanzaIdx;
    if (scriptureStanzaKey !== lastScriptureStanzaKey) {
      scriptureActiveTab = 0;
      lastScriptureStanzaKey = scriptureStanzaKey;
    }
    var scriptureEntries = scriptureOn ? scripturePassagesForStanza(section.id, stanzaIdx) : [];
    var hasScripture = scriptureEntries.length > 0;
    document.body.classList.toggle("wide-reading", hasScripture);

    if (hasScripture) html += '<div class="reading-body-grid"><div class="reading-hymn-col">';

    stanza.verses.forEach(function (verse, vi) {
      var highlighted = highlightIdx !== null && vi === highlightIdx;
      var translitText = translit(verse.text);
      var globalVi = flatVerseIndex(section, stanzaIdx, vi);
      var pairs = alignmentFor(section.id, globalVi);
      var groupPrefix = "p" + section.id + "-" + globalVi;
      // Only the real Armenian original and the real English translation
      // get scripture-hymn links wired in - not the transliteration line,
      // which is a display variant of the same Armenian, not a second
      // language a scripture passage could meaningfully connect to.
      var scripturePairs = hasScripture ? scriptureLinkPairsForVerse(scriptureEntries, vi) : [];
      html += '<div class="sharagan-verse' + (highlighted ? " highlighted" : "") + '"' + (highlighted ? ' id="highlighted-verse"' : "") + '>';
      html += '<div class="verse-armenian script-original">' + renderArmenianVerseHtml(verse.text, pairs, groupPrefix, highlighted ? state.highlightWord : null, scripturePairs, scriptureActiveTab) + '</div>';
      html += '<div class="verse-armenian script-translit">' + renderEnglishVerseHtml(verse.text, translitText, null, groupPrefix) + '</div>';
      html += '<div class="verse-divider">&#10022;</div>';
      if (verse.en) {
        html += '<div class="verse-english">' + renderEnglishVerseHtml(verse.text, verse.en, pairs, groupPrefix, scripturePairs, scriptureActiveTab) + '</div>';
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
    if (hasScripture) wireScripturePanel(el.resultsArea, function () { renderMain(); });

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
    if (section.titleEn) html += '<div class="reading-heading-en">' + escapeHtml(section.titleEn) + '</div>';
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
