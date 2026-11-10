// Daily Words – flashcards, dictation, listening and printable sheets with spaced review.
// Word data comes from data.json, which scripts/build.mjs builds from words/*.json.
(function () {
  "use strict";

  // ---------- helpers ----------
  function el(tag, attrs) {
    var e = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === false || v == null) return;
      if (k === "class") e.className = v;
      else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), v);
      else if (k === "value") e.value = v;
      else if (k === "checked") e.checked = !!v;
      else e.setAttribute(k, v === true ? "" : v);
    });
    for (var i = 2; i < arguments.length; i++) add(e, arguments[i]);
    return e;
  }
  function add(e, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(e, x); }); return; }
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem("dw." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("dw." + k, JSON.stringify(v)); } catch (e) {} }
  };
  function norm(s) { return String(s).trim().toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, " "); }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function today() { return ymd(new Date()); }
  function addDays(s, n) { var p = s.split("-").map(Number); return ymd(new Date(p[0], p[1] - 1, p[2] + n)); }
  function key(w) { return w.en.trim().toLowerCase(); }

  // Split the example sentence around the word so it can be blanked or bolded.
  function splitSentence(w) {
    if (!w.sentence) return null;
    var m = new RegExp("\\b" + escRe(w.en) + "\\w*", "i").exec(w.sentence);
    if (!m) return null;
    return [w.sentence.slice(0, m.index), m[0], w.sentence.slice(m.index + m[0].length)];
  }
  function blank(w) { return "_".repeat(Math.max(6, w.en.length + 2)); }
  function hintText(w) {
    return w.en.split("").map(function (c, i) { return c === " " ? "  " : (i === 0 || w.en[i - 1] === " " ? c : "_"); }).join(" ");
  }

  // ---------- speech ----------
  var canSpeak = "speechSynthesis" in window;
  function speak(text) {
    if (!canSpeak) return;
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    var voices = speechSynthesis.getVoices().filter(function (v) { return /^en[-_]/i.test(v.lang); });
    var v = voices.find(function (x) { return /en[-_]GB/i.test(x.lang); }) || voices.find(function (x) { return /en[-_]US/i.test(x.lang); }) || voices[0];
    if (v) u.voice = v;
    u.lang = v ? v.lang : "en-GB";
    u.rate = 0.85;
    speechSynthesis.speak(u);
  }
  if (canSpeak) speechSynthesis.getVoices();

  // ---------- spaced review (Leitner boxes) ----------
  // box 0 = wrong (review again today); box n = next review after INTERVALS[n] days.
  var INTERVALS = [0, 1, 2, 4, 7, 15, 30];
  var MAX_BOX = INTERVALS.length - 1;
  var srs = store.get("srs", {});
  // info = { mode: "write"|"listen"|"cards", answer: what was typed }
  function grade(w, result, info) {
    var k = key(w), cur = srs[k] || { box: 0 }, box, due, t = today();
    if (result === "good") { box = Math.min(MAX_BOX, (cur.box || 0) + 1); due = addDays(t, INTERVALS[box]); }
    else if (result === "unsure") { box = Math.max(1, cur.box || 0); due = addDays(t, 1); }
    else { box = 0; due = t; }
    srs[k] = { box: box, due: due, last: t, first: cur.first || t };
    store.set("srs", srs);
    logEvent(k, result, info || {});
  }
  function isDue(w) { var s = srs[key(w)]; return !!s && s.due <= today(); }

  // ---------- practice history (for summaries) ----------
  // log[date] = { m: {write: n, listen: n, cards: n},
  //               w: { word: {o: spelled right, x: spelled wrong, c: knew (cards), f: forgot, u: unsure, a: [wrong spellings]} } }
  var log = store.get("log", {});
  function logEvent(k, result, info) {
    var t = today(), m = info.mode || "write";
    var day = log[t] || (log[t] = { m: {}, w: {} });
    day.m[m] = (day.m[m] || 0) + 1;
    var e = day.w[k] || (day.w[k] = {});
    var f = m === "cards" ? (result === "good" ? "c" : result === "unsure" ? "u" : "f") : (result === "good" ? "o" : "x");
    e[f] = (e[f] || 0) + 1;
    if (f === "x" && info.answer != null) { e.a = (e.a || []).concat(norm(info.answer)).slice(-5); }
    var cutoff = addDays(t, -400);
    Object.keys(log).forEach(function (d) { if (d < cutoff) delete log[d]; });
    store.set("log", log);
  }

  // ---------- favourites ----------
  var fav = store.get("fav", {});
  function isFav(w) { return !!fav[key(w)]; }
  function toggleFav(w) {
    if (isFav(w)) delete fav[key(w)]; else fav[key(w)] = today();
    store.set("fav", fav);
  }
  function favBtn(w, compact) {
    function label() { return isFav(w) ? (compact ? "⭐" : "⭐ Saved 已收藏") : (compact ? "☆" : "☆ Save 收藏"); }
    var b = el("button", { class: "btn" + (compact ? " icon" : "") + " fav", type: "button", title: "Favourite 收藏",
      "aria-pressed": String(isFav(w)), onclick: function () {
        toggleFav(w);
        b.textContent = label(); b.setAttribute("aria-pressed", String(isFav(w)));
        refreshHeader();
        var i = document.getElementById("answer"); if (i && !i.readOnly) i.focus();
      } }, label());
    return b;
  }

  // ---------- state ----------
  var days = [], allWords = [];
  var app = document.getElementById("app");
  var setSel = document.getElementById("set");
  var statsEl = document.getElementById("stats");
  var footer = document.getElementById("footer");
  var mode = store.get("mode", "write");
  var MODE_HELP = {
    write: "✍️ 默写：看中文，打出英文单词，按回车检查。不会可以点「提示」或「例句」。",
    listen: "🎧 听写：听发音，打出英文单词。可以点「播放」再听一次。",
    cards: "🃏 认词：第一次学新词时用。先看英文想意思，再看答案。",
    print: "🖨 打印：打印成 A4 纸，用笔默写，答案折到背面。",
    stats: "📊 总结：看今天 / 本周 / 本月练得怎么样，哪些词常错、错在哪里，以及下一步建议。"
  };
  var opts = { shuffle: store.get("shuffle", true), withSentence: store.get("withSentence", false) };
  var selected = null; // "review" | "fav" | "all" | day id
  var quiz = null;

  function wordsOf(sel) {
    if (sel === "review") return allWords.filter(isDue);
    if (sel === "fav") return allWords.filter(isFav);
    if (sel === "all") return allWords.slice();
    var d = days.find(function (x) { return x.id === sel; });
    return d ? d.words.slice() : [];
  }

  function refreshHeader() {
    var due = allWords.filter(isDue).length;
    var learned = allWords.filter(function (w) { return srs[key(w)]; }).length;
    var mastered = allWords.filter(function (w) { var s = srs[key(w)]; return s && s.box >= 5; }).length;
    statsEl.textContent = "Learned 已学 " + learned + " / " + allWords.length +
      "  ·  Due today 今日待复习 " + due + "  ·  Mastered 已掌握 " + mastered;
    setSel.textContent = "";
    setSel.append(el("option", { value: "review" }, "📅 Today's review 今日复习 (" + due + ")"));
    setSel.append(el("option", { value: "fav" }, "⭐ Favourites 我的收藏 (" + allWords.filter(isFav).length + ")"));
    days.forEach(function (d) {
      setSel.append(el("option", { value: d.id }, d.date + (d.title ? " · " + d.title : "") + " (" + d.words.length + ")"));
    });
    setSel.append(el("option", { value: "all" }, "All words 全部单词 (" + allWords.length + ")"));
    setSel.value = selected;
  }

  // ---------- quiz flow ----------
  function startQuiz(list) {
    var words = list || wordsOf(selected);
    // pos = the word being worked on; back = how many finished words we are looking back at;
    // done[i] = result of finished word i ({answer, ok} or {rating}).
    quiz = { words: opts.shuffle ? shuffle(words) : words, pos: 0, right: 0, wrong: [], done: [], back: 0,
             revealed: false, checked: false, ok: false, hint: false, sentence: false, answer: "" };
    render();
    autoSpeak();
  }
  function current() { return quiz.words[quiz.pos]; }
  function autoSpeak() {
    if (!quiz || quiz.pos >= quiz.words.length) return;
    if (mode === "cards" || mode === "listen") setTimeout(function () { speak(current().en); }, 250);
  }
  function next() {
    quiz.pos++;
    quiz.revealed = quiz.checked = quiz.hint = quiz.sentence = false;
    quiz.answer = "";
    render();
    autoSpeak();
  }
  function rate(result) {
    var w = current();
    grade(w, result, { mode: "cards" });
    quiz.done[quiz.pos] = { rating: result };
    if (result === "good") quiz.right++; else quiz.wrong.push(w);
    refreshHeader();
    next();
  }
  function check(value) {
    var w = current();
    quiz.answer = value;
    quiz.checked = true;
    quiz.ok = norm(value) === norm(w.en);
    quiz.done[quiz.pos] = { answer: value, ok: quiz.ok };
    grade(w, quiz.ok ? "good" : "bad", { mode: mode, answer: value });
    if (quiz.ok) quiz.right++; else quiz.wrong.push(w);
    refreshHeader();
    render();
    speak(w.en);
  }

  // ---------- going back to finished words ----------
  function canGoBack() { return quiz.pos - quiz.back > 0; }
  function goBack() {
    if (!canGoBack()) return;
    var i = document.getElementById("answer");
    if (quiz.back === 0 && i && !quiz.checked) quiz.answer = i.value; // keep what was typed
    quiz.back++;
    render();
  }
  function goForward() { if (quiz.back > 0) { quiz.back--; render(); } }
  function prevBtn() {
    return canGoBack() ? el("button", { class: "btn", type: "button", onclick: goBack }, "← Previous 上一个") : null;
  }
  var RATING = { bad: "😕 Forgot 不认识", unsure: "🤔 Not sure 模糊", good: "😀 Knew it 认识" };

  function renderPast() {
    var idx = quiz.pos - quiz.back;
    var w = quiz.words[idx], r = quiz.done[idx] || {};
    var total = quiz.words.length;
    add(app, el("section", { class: "card" },
      el("div", { class: "progress" }, el("span", null, (idx + 1) + " / " + total + "  ·  Looking back 回看"),
        el("span", null, "✓ " + quiz.right + "   ✗ " + quiz.wrong.length)),
      el("div", { class: "meter" }, el("i", { style: "width:" + (idx / total * 100) + "%" })),
      el("div", { class: "word" }, w.en, speakBtn(w)),
      w.phonetic ? el("div", { class: "phon" }, w.phonetic) : null,
      el("div", { class: "meaning" }, w.pos ? el("span", { class: "pos" }, w.pos) : null, w.zh),
      sentenceBox(w, true),
      r.rating ? el("p", null, "You chose 你选了: " + RATING[r.rating])
        : "answer" in r ? el("div", { class: "feedback " + (r.ok ? "ok" : "no") },
            (r.ok ? "✓ Correct 正确 — you wrote 你写的: " : "✗ You wrote 你写的: "), el("b", null, r.answer)) : null,
      el("div", { class: "tools" }, prevBtn(), favBtn(w),
        el("button", { class: "btn primary", type: "button", id: "forward", onclick: goForward },
          quiz.back > 1 ? "Next 下一个 →" : "Back to where I was 回到当前 →")),
      el("p", { class: "muted" }, "← → keys also work. 也可以用键盘左右方向键。")));
    setTimeout(function () { var b = document.getElementById("forward"); if (b) b.focus(); }, 0);
  }

  // ---------- views ----------
  function progressBar() {
    var total = quiz.words.length;
    return [
      el("div", { class: "progress" }, el("span", null, (quiz.pos + 1) + " / " + total),
        el("span", null, "✓ " + quiz.right + "   ✗ " + quiz.wrong.length)),
      el("div", { class: "meter" }, el("i", { style: "width:" + (quiz.pos / total * 100) + "%" }))
    ];
  }
  function speakBtn(w) {
    return canSpeak ? el("button", { class: "btn icon", type: "button", title: "Listen 发音", "aria-label": "Listen 发音",
      onclick: function () { speak(w.en); } }, "🔊") : null;
  }
  function sentenceBox(w, showWord) {
    var parts = splitSentence(w);
    if (!w.sentence) return null;
    return el("div", { class: "sentence" },
      el("div", null, parts ? [parts[0], showWord ? el("b", null, parts[1]) : blank(w), parts[2]] : (showWord ? w.sentence : null)),
      w.sentence_zh ? el("div", { class: "zh" }, w.sentence_zh) : null);
  }

  function renderCards() {
    var w = current();
    var body = [progressBar(),
      el("div", { class: "word" }, w.en, speakBtn(w)),
      w.phonetic ? el("div", { class: "phon" }, w.phonetic) : null];
    if (!quiz.revealed) {
      body.push(el("p", { class: "muted" }, "Do you know this word? Think first, then check. 先想一想意思，再看答案。"),
        el("div", { class: "tools" }, el("button", { class: "btn primary big", type: "button", id: "reveal",
          onclick: function () { quiz.revealed = true; render(); } }, "Show meaning 看意思", el("small", null, "Space"))));
    } else {
      body.push(el("div", { class: "meaning" }, w.pos ? el("span", { class: "pos" }, w.pos) : null, w.zh),
        sentenceBox(w, true),
        el("div", { class: "rate" },
          el("button", { class: "btn bad", type: "button", onclick: function () { rate("bad"); } }, "😕 Forgot 不认识", el("kbd", null, "1")),
          el("button", { class: "btn mid", type: "button", onclick: function () { rate("unsure"); } }, "🤔 Not sure 模糊", el("kbd", null, "2")),
          el("button", { class: "btn good", type: "button", onclick: function () { rate("good"); } }, "😀 Knew it 认识", el("kbd", null, "3"))));
    }
    body.push(el("div", { class: "tools" }, prevBtn(), favBtn(w)));
    add(app, el("section", { class: "card" }, body));
  }

  function renderWrite() {
    var w = current();
    var listen = mode === "listen";
    var parts = splitSentence(w);
    var showPrompt = !listen || quiz.checked;

    var input = el("input", { type: "text", id: "answer", autocomplete: "off", autocapitalize: "off", autocorrect: "off",
      spellcheck: "false", placeholder: "输入英文 Type…", value: quiz.answer,
      readonly: quiz.checked, class: quiz.checked ? (quiz.ok ? "ok" : "no") : "" });
    var form = el("form", { onsubmit: function (e) {
        e.preventDefault();
        if (quiz.checked) return next();
        if (!input.value.trim()) return;
        check(input.value);
      } }, input,
      el("button", { class: "btn primary", type: "submit" }, quiz.checked ? "Next 下一个 →" : "Check 检查"));

    function toggle(name) { return function () { quiz[name] = !quiz[name]; quiz.answer = input.value; render(); }; }

    add(app, el("section", { class: "card" },
      progressBar(),
      listen ? el("div", { class: "tools" },
        el("button", { class: "btn primary big", type: "button", onclick: function () { speak(w.en); input.focus(); } }, "🔊 Play 播放"),
        canSpeak ? null : el("p", { class: "muted" }, "This browser cannot speak. 这个浏览器不能朗读，请用 Write 模式。")) : null,
      showPrompt ? el("div", { class: "prompt" }, w.zh, w.pos ? el("span", { class: "pos" }, w.pos) : null) : null,
      quiz.checked ? null : el("div", { class: "tools" },
        el("button", { class: "btn", type: "button", "aria-pressed": String(quiz.hint), onclick: toggle("hint") }, "💡 Hint 提示"),
        parts ? el("button", { class: "btn", type: "button", "aria-pressed": String(quiz.sentence), onclick: toggle("sentence") }, "📝 Sentence 例句") : null),
      quiz.hint && !quiz.checked ? el("div", { class: "hint" }, hintText(w),
        el("div", { class: "muted" }, w.en.replace(/ /g, "").length + " letters 个字母")) : null,
      (quiz.sentence && parts) || quiz.checked ? sentenceBox(w, quiz.checked) : null,
      form,
      quiz.checked ? el("div", { class: "feedback " + (quiz.ok ? "ok" : "no") },
        quiz.ok ? "✓ Correct! 正确！ " : "✗ Answer 答案: ",
        el("span", { class: "ans" }, w.en), " ", w.phonetic ? el("span", { class: "phon" }, w.phonetic) : null, speakBtn(w)) : null,
      el("div", { class: "tools" }, prevBtn(), favBtn(w)),
      el("p",{ class: "muted" }, quiz.checked ? "Press Enter for the next word. 按回车到下一个。" : "Press Enter to check. 按回车检查。")));
    setTimeout(function () { var i = document.getElementById("answer"); if (i) i.focus(); }, 0);
  }

  function renderResult() {
    var wrong = quiz.words.length ? quiz.wrong : [];
    var total = quiz.words.length;
    var wasCards = mode === "cards";
    add(app, el("section", { class: "card" },
      el("div", { class: "muted" }, "Finished! 完成了！"),
      el("div", { class: "score" }, quiz.right + " / " + total),
      wrong.length === 0 ? el("p", null, "🎉 All correct! 全部正确！")
        : [el("p", null, "Practise these again 这些词再练一次:"),
           el("ul", { class: "list" }, wrong.map(function (w) { return el("li", null, el("b", null, w.en), " — " + w.zh, favBtn(w, true)); }))],
      el("div", { class: "tools" },
        prevBtn(),
        wrong.length ? el("button", { class: "btn primary", type: "button", onclick: function () { startQuiz(wrong.slice()); } }, "↻ Only these 只练这些") : null,
        wasCards ? el("button", { class: wrong.length ? "btn" : "btn primary", type: "button",
          onclick: function () { setMode("write", quiz.words.slice()); } }, "✍ Now write them 现在默写") : null,
        el("button", { class: "btn", type: "button", onclick: function () { startQuiz(); } }, "Start again 全部重来"),
        el("button", { class: "btn", type: "button", onclick: function () { statsPeriod = "day"; setMode("stats"); } }, "📊 Today's summary 今日总结")),
      el("p", { class: "muted" }, "Your progress is saved. Words come back in Today's review: 1, 2, 4, 7, 15, 30 days later. " +
        "进度已保存，单词会在 1、2、4、7、15、30 天后回到「今日复习」。")));
  }

  function renderEmpty() {
    var isReview = selected === "review", isFavSel = selected === "fav";
    add(app, el("section", { class: "card empty" },
      el("div", { class: "big" }, isReview ? "🎉" : isFavSel ? "⭐" : "📭"),
      el("p", null, isReview ? "Nothing to review right now. 现在没有要复习的词。"
        : isFavSel ? "No favourites yet. While practising, tap ☆ Save 收藏 and the word appears here. 还没有收藏。练习时点「☆ 收藏」，单词就会出现在这里。"
        : "No words here yet. 这里还没有单词。"),
      isReview && days.length ? el("button", { class: "btn primary", type: "button",
        onclick: function () { selected = days[0].id; quiz = null; refreshHeader(); render(); } }, "Learn the newest set 学最新一组") : null));
  }

  function renderPrint() {
    var words = wordsOf(selected);
    var withS = opts.withSentence;
    var d = days.find(function (x) { return x.id === selected; });
    var title = selected === "review" ? "Today's review 今日复习" : selected === "fav" ? "Favourites 我的收藏" : selected === "all" ? "All words 全部单词" : (d.title || "Dictation");
    add(app, el("section", { class: "card" },
      el("div", { class: "noprint tools" },
        el("button", { class: "btn primary", type: "button", onclick: function () { window.print(); } }, "🖨 Print 打印"),
        el("label", { class: "check" }, el("input", { type: "checkbox", checked: withS, onchange: function (e) {
          opts.withSentence = e.target.checked; store.set("withSentence", opts.withSentence); render(); } }), "Sentence version 句子填空版")),
      el("p", { class: "noprint muted" }, "Fold the answer column back along the dashed line. 沿虚线把答案折到背面再默写。"),
      el("div", { class: "sheet-head" }, el("strong", null, title),
        el("span", { class: "muted" }, (d ? d.date : today()) + "   Score 分数: ____ / " + words.length)),
      el("table", { class: "sheet" },
        el("thead", null, el("tr", null, el("th", null, "#"), el("th", null, withS ? "Sentence 句子" : "Chinese 中文"),
          withS ? null : el("th", null, "Write 默写"), el("th", { class: "fold" }, "✂ Answer 答案"))),
        el("tbody", null, words.map(function (w, i) {
          var parts = splitSentence(w);
          return el("tr", null, el("td", { class: "n" }, i + 1),
            withS && parts ? el("td", { class: "s" }, parts[0], blank(w), parts[2], el("span", { class: "muted" }, "  (" + w.zh + ")"))
              : el("td", null, w.pos ? el("span", { class: "pos" }, w.pos) : null, w.zh),
            withS ? null : el("td", { class: "write" }),
            el("td", { class: "fold" }, w.en, w.phonetic ? el("span", { class: "phon" }, w.phonetic) : null));
        })))));
  }

  function renderFooter() {
    footer.textContent = "";
    var fileInput = el("input", { type: "file", accept: ".json,application/json", style: "display:none", onchange: function (e) {
      var f = e.target.files[0]; if (!f) return;
      f.text().then(function (t) {
        var data = JSON.parse(t);
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("bad file");
        if (!confirm("Replace progress on this device with the file? 用这个文件替换本设备的进度？")) return;
        if (data.srs) { srs = data.srs || {}; fav = data.fav || {}; log = data.log || {}; } else { srs = data; } // old files = srs only
        store.set("srs", srs); store.set("fav", fav); store.set("log", log); quiz = null; refreshHeader(); render();
      }).catch(function () { alert("This is not a progress file. 不是进度文件。"); });
    } });
    add(footer, el("details", { class: "progress-box" },
      el("summary", null, "⚙ Progress 学习进度"),
      el("p", null, "Progress is saved in this browser only (phone and computer are separate). Use Export / Import to move it. " +
        "进度只保存在这个浏览器里（手机和电脑分开）。可以导出 / 导入来转移。"),
      el("div", { class: "tools" },
        el("button", { class: "btn", type: "button", onclick: function () {
          var a = el("a", { href: URL.createObjectURL(new Blob([JSON.stringify({ version: 2, srs: srs, fav: fav, log: log })], { type: "application/json" })),
            download: "daily-words-progress-" + today() + ".json" });
          document.body.append(a); a.click(); a.remove();
        } }, "⬇ Export 导出"),
        el("button", { class: "btn", type: "button", onclick: function () { fileInput.click(); } }, "⬆ Import 导入"),
        el("button", { class: "btn", type: "button", onclick: function () {
          if (!confirm("Delete all progress, favourites and history on this device? 删除本设备的全部进度、收藏和记录？")) return;
          srs = {}; fav = {}; log = {}; store.set("srs", srs); store.set("fav", fav); store.set("log", log); quiz = null; refreshHeader(); render();
        } }, "Reset 清空"), fileInput)));
  }

  function render() {
    app.textContent = "";
    document.querySelectorAll(".tabs button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.mode === mode)); });
    document.getElementById("mode-help").textContent = MODE_HELP[mode] || "";
    setSel.style.display = mode === "stats" ? "none" : "";
    if (mode === "stats") return renderStats();
    if (mode === "print") return wordsOf(selected).length ? renderPrint() : renderEmpty();
    if (!quiz) { startQuiz(); return; }
    if (!quiz.words.length) return renderEmpty();
    add(app, el("div", { class: "options noprint" },
      el("label", { class: "check" }, el("input", { type: "checkbox", checked: opts.shuffle, onchange: function (e) {
        opts.shuffle = e.target.checked; store.set("shuffle", opts.shuffle); startQuiz(); } }), "Shuffle 打乱顺序")));
    if (quiz.back > 0) return renderPast();
    if (quiz.pos >= quiz.words.length) return renderResult();
    if (mode === "cards") renderCards(); else renderWrite();
  }

  function setMode(m, list) {
    mode = m; store.set("mode", m); quiz = null;
    if (list && m !== "print") startQuiz(list); else render();
  }

  // ---------- keyboard (cards) ----------
  document.addEventListener("keydown", function (e) {
    if (!quiz || mode === "print" || mode === "stats") return;
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === "ArrowLeft" && canGoBack()) { e.preventDefault(); goBack(); return; }
    if (quiz.back > 0) {
      if (e.key === "ArrowRight") { e.preventDefault(); goForward(); }
      return; // Enter/Space go to the focused "next" button
    }
    if (mode !== "cards" || quiz.pos >= quiz.words.length) return;
    if (!quiz.revealed && (e.key === " " || e.key === "Enter")) { e.preventDefault(); quiz.revealed = true; render(); }
    else if (quiz.revealed && (e.key === "1" || e.key === "2" || e.key === "3")) {
      e.preventDefault(); rate(e.key === "1" ? "bad" : e.key === "2" ? "unsure" : "good");
    }
  });

  // ---------- summaries (day / week / month) ----------
  var statsPeriod = store.get("statsPeriod", "day");
  var PERIODS = { day: "今天 Day", week: "本周 Week", month: "本月 Month" };
  var UNIT = { day: "天", week: "周", month: "月" };

  // offset 0 = this day/week/month, -1 = the one before. Weeks start on Monday.
  function periodRange(p, offset) {
    var t = today(), n = t.split("-").map(Number);
    if (p === "day") { var d = addDays(t, offset); return [d, d]; }
    if (p === "week") {
      var dow = (new Date(n[0], n[1] - 1, n[2]).getDay() + 6) % 7;
      var start = addDays(t, -dow + 7 * offset);
      return [start, addDays(start, 6)];
    }
    return [ymd(new Date(n[0], n[1] - 1 + offset, 1)), ymd(new Date(n[0], n[1] + offset, 0))];
  }
  function datesIn(r) { var out = [], d = r[0]; while (d <= r[1]) { out.push(d); d = addDays(d, 1); } return out; }
  function aggregate(r) {
    var res = { words: {}, o: 0, x: 0, c: 0, f: 0, u: 0, active: [], modes: {}, perDay: {} };
    datesIn(r).forEach(function (d) {
      var day = log[d]; if (!day) return;
      res.active.push(d);
      var pd = res.perDay[d] = { o: 0, x: 0, n: 0 };
      Object.keys(day.m || {}).forEach(function (m) { res.modes[m] = (res.modes[m] || 0) + day.m[m]; pd.n += day.m[m]; });
      Object.keys(day.w || {}).forEach(function (k) {
        var e = day.w[k], t = res.words[k] || (res.words[k] = { o: 0, x: 0, c: 0, f: 0, u: 0, a: [] });
        ["o", "x", "c", "f", "u"].forEach(function (f) { t[f] += e[f] || 0; res[f] += e[f] || 0; });
        pd.o += e.o || 0; pd.x += e.x || 0;
        if (e.a) t.a = t.a.concat(e.a);
      });
    });
    return res;
  }
  function pct(a, b) { return b ? Math.round(a / b * 100) : null; }
  function streak() {
    var n = 0, d = today();
    if (!log[d]) d = addDays(d, -1);
    while (log[d]) { n++; d = addDays(d, -1); }
    return n;
  }

  // ----- spelling error patterns -----
  function lev(a, b) {
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  function isSubseq(s, t) { var i = 0; for (var j = 0; j < t.length && i < s.length; j++) if (s[i] === t[j]) i++; return i === s.length; }
  function isVowel(ch) { return "aeiou".indexOf(ch) >= 0; }
  function classify(ans, correct) {
    var a = norm(ans), c = norm(correct), i;
    if (!a || lev(a, c) > Math.max(2, Math.floor(c.length / 2))) return "forgot";
    if (a.length === c.length - 1 && isSubseq(a, c)) {
      for (i = 0; i < c.length && a[i] === c[i]; i++);
      return c[i] === c[i - 1] || c[i] === c[i + 1] ? "double" : "missing";
    }
    if (a.length === c.length + 1 && isSubseq(c, a)) {
      for (i = 0; i < a.length && a[i] === c[i]; i++);
      return a[i] === a[i - 1] || a[i] === a[i + 1] ? "double" : "extra";
    }
    if (a.length === c.length) {
      var diff = [];
      for (i = 0; i < a.length; i++) if (a[i] !== c[i]) diff.push(i);
      if (diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === c[diff[1]] && a[diff[1]] === c[diff[0]]) return "swap";
      if (diff.every(function (k) { return isVowel(a[k]) && isVowel(c[k]); })) return "vowel";
    }
    var pre = 0;
    while (pre < a.length && pre < c.length && a[pre] === c[pre]) pre++;
    if (pre >= 3 && pre >= c.length - 4) return "ending";
    if (a.replace(/[aeiou]/g, "") === c.replace(/[aeiou]/g, "")) return "vowel";
    return "letter";
  }
  var PATTERNS = {
    double: ["双写字母", "Double letters", "按音节读出来再写，注意哪里双写：ef-fi-cien-cy、ac-com-mo-date。"],
    missing: ["漏写字母", "Missing letter", "写完对着音标慢慢读一遍，每个音都要有字母。不发音的字母要单独记。"],
    extra: ["多写字母", "Extra letter", "找出多写的那个字母，用笔圈出来，再正确地写 3 遍。"],
    swap: ["字母顺序颠倒", "Swapped letters", "写得太快了。放慢速度，按音节一节一节写：in-flu-ence。"],
    vowel: ["元音写错", "Wrong vowel", "弱读音 /ə/ 可能是 a、e、i、o、u，光听分不出来，要看着单词记住那个元音。"],
    ending: ["词尾写错", "Wrong ending", "易错词尾单独记：-ence/-ance、-ent/-ant、-ible/-able、-tion/-sion、-ly。"],
    letter: ["个别字母写错", "Wrong letter", "对比你写的和正确的，圈出不一样的字母，再写 3 遍。"],
    forgot: ["完全没想起来", "Couldn't recall", "这些词还没记住：回到「🃏 认词」重新学一遍，收藏后每天练。"]
  };

  function kpi(value, label, sub) {
    return el("div", { class: "kpi" }, el("div", { class: "v" }, value), el("div", { class: "l" }, label),
      sub ? el("div", { class: "d " + sub.cls }, sub.text) : null);
  }

  function renderStats() {
    var p = statsPeriod, r = periodRange(p, 0), A = aggregate(r), B = aggregate(periodRange(p, -1));
    var spelled = A.o + A.x, acc = pct(A.o, spelled), accPrev = pct(B.o, B.o + B.x);
    var attempts = spelled + A.c + A.f + A.u;
    var byKey = {};
    allWords.forEach(function (w) { byKey[key(w)] = w; });
    var newWords = Object.keys(srs).filter(function (k) { var f = srs[k].first; return byKey[k] && f && f >= r[0] && f <= r[1]; }).length;

    // most missed words + error types
    var pat = {}, patTotal = 0;
    var missed = Object.keys(A.words).map(function (k) {
      var e = A.words[k];
      return { w: byKey[k], e: e, miss: e.x + e.f, total: e.o + e.x + e.c + e.f + e.u };
    }).filter(function (m) { return m.w && m.miss > 0; })
      .sort(function (a, b) { return b.miss - a.miss || a.total - b.total; });
    missed.forEach(function (m) {
      m.spell = {};
      m.e.a.forEach(function (ans) {
        var t = classify(ans, m.w.en);
        pat[t] = (pat[t] || 0) + 1; patTotal++;
        m.spell[ans] = t;
      });
    });
    var patKeys = Object.keys(pat).sort(function (a, b) { return pat[b] - pat[a]; });

    // suggestions
    var tips = [], due = allWords.filter(isDue).length, unit = UNIT[p];
    if (!attempts) tips.push(p === "day" ? "今天还没有练习。先做「📅 今日复习」，再学新词，10 分钟就够。"
      : "这个" + unit + "还没有练习记录。每天练 10 分钟，比一次练 1 小时更容易记住。");
    if (due > 30) tips.push("现在有 " + due + " 个词等着复习。先做完复习再学新词，不然会越积越多。");
    if (spelled >= 10 && acc < 60) tips.push("默写正确率 " + acc + "%，有点低。新词放慢一点，每天 10–15 个，多用「💡 提示」和「📝 例句」。");
    else if (spelled >= 10 && acc >= 90) tips.push("默写正确率 " + acc + "%，很棒 👍 可以多加一些新词，或者多用「🎧 听写」提高难度。");
    if (acc != null && accPrev != null && spelled >= 5) {
      if (acc - accPrev >= 5) tips.push("正确率比上一" + unit + "提高了 " + (acc - accPrev) + "% 👏 继续保持。");
      else if (accPrev - acc >= 10) tips.push("正确率比上一" + unit + "下降了 " + (accPrev - acc) + "%。可能新词太多了，先巩固旧词。");
    }
    if (patKeys.length && pat[patKeys[0]] >= 2) tips.push("最常见的错误是「" + PATTERNS[patKeys[0]][0] + "」：" + PATTERNS[patKeys[0]][2]);
    var hard = missed.filter(function (m) { return m.miss >= 3; }).map(function (m) { return m.w.en; });
    if (hard.length) tips.push("这些词错了 3 次以上：" + hard.slice(0, 8).join("、") + "。建议收藏 ⭐，再用每个词造一个和自己生活有关的句子。");
    if (A.modes.write && !A.modes.listen) tips.push("还没用过「🎧 听写」。听写能同时练听力和拼写，试试看。");
    if (p === "week" && A.active.length && A.active.length < 4) tips.push("这周练了 " + A.active.length + " 天。少量多次更好记，争取每周 5 天以上。");
    if (p === "month" && A.active.length && A.active.length < 15) tips.push("这个月练了 " + A.active.length + " 天。争取每月 20 天以上，每次不用很久。");
    var favN = allWords.filter(isFav).length;
    if (favN) tips.push("你收藏了 " + favN + " 个词。在上面的下拉菜单选「⭐ 我的收藏」，可以专门练这些词。");

    var delta = acc != null && accPrev != null
      ? { cls: acc >= accPrev ? "up" : "down", text: (acc >= accPrev ? "▲ " : "▼ ") + Math.abs(acc - accPrev) + "% vs 上一" + unit }
      : null;

    var strip = p === "day" ? null : el("div", { class: "strip" }, datesIn(r).map(function (d) {
      var pd = A.perDay[d], a = pd ? pct(pd.o, pd.o + pd.x) : null;
      var cls = !pd ? "none" : a == null ? "mid" : a >= 85 ? "high" : a >= 60 ? "mid" : "low";
      return el("div", { class: "cell " + cls + (d === today() ? " today" : ""),
        title: d + (pd ? "：练习 " + pd.n + " 次" + (a != null ? "，正确率 " + a + "%" : "") : "：没有练习") }, Number(d.slice(8)));
    }));

    function copyText() {
      var lines = ["Daily Words 学习总结 · " + PERIODS[p] + " · " + (r[0] === r[1] ? r[0] : r[0] + " ~ " + r[1]),
        "练习天数 " + A.active.length + "/" + datesIn(r).length + "，练习次数 " + attempts + "，默写正确率 " +
          (acc == null ? "—" : acc + "%") + (accPrev != null ? "（上一" + unit + " " + accPrev + "%）" : "") + "，新学单词 " + newWords,
        "常错单词："];
      missed.slice(0, 15).forEach(function (m) {
        var sp = Object.keys(m.spell);
        lines.push("- " + m.w.en + "（" + m.w.zh + "）错 " + m.miss + "/" + m.total + (sp.length ? "，写成 " + sp.join(", ") : ""));
      });
      if (patKeys.length) lines.push("错误类型：" + patKeys.map(function (k) { return PATTERNS[k][0] + " " + pat[k]; }).join("，"));
      lines.push("", "请帮我分析我的拼写弱点，找出规律，并给我下一" + unit + "的复习计划和记忆方法。");
      return lines.join("\n");
    }
    var copyBtn = el("button", { class: "btn", type: "button", onclick: function () {
      var text = copyText();
      var done = function () { copyBtn.textContent = "✓ Copied 已复制"; setTimeout(function () { copyBtn.textContent = "📋 Copy for AI 复制给 AI 分析"; }, 2000); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { prompt("Copy 复制:", text); });
      else prompt("Copy 复制:", text);
    } }, "📋 Copy for AI 复制给 AI 分析");

    add(app, el("section", { class: "card" },
      el("div", { class: "tools seg" }, Object.keys(PERIODS).map(function (k) {
        return el("button", { class: "btn", type: "button", "aria-pressed": String(k === p),
          onclick: function () { statsPeriod = k; store.set("statsPeriod", k); render(); } }, PERIODS[k]);
      })),
      el("div", { class: "muted" }, r[0] === r[1] ? r[0] : r[0] + " ~ " + r[1]),
      el("div", { class: "kpis" },
        kpi(acc == null ? "—" : acc + "%", "默写正确率 Spelling", delta),
        kpi(attempts, "练习次数 Practice"),
        kpi(newWords, "新学单词 New words"),
        p === "day" ? kpi(streak() + " 天", "连续打卡 Streak") : kpi(A.active.length + " / " + datesIn(r).length, "练习天数 Days")),
      strip,

      el("h3", null, "💡 建议 Suggestions"),
      el("ul", { class: "list tips" }, tips.map(function (t) { return el("li", null, t); })),

      el("h3", null, "❌ 常错单词 Most missed"),
      missed.length === 0 ? el("p", { class: "muted" }, attempts ? "没有错词 🎉 No mistakes." : "还没有记录。No records yet.")
        : [el("ul", { class: "list missed" }, missed.slice(0, 15).map(function (m) {
            var sp = Object.keys(m.spell);
            return el("li", null, favBtn(m.w, true), " ", el("b", null, m.w.en), " — " + m.w.zh, " ",
              el("span", { class: "muted" }, "错 " + m.miss + " / " + m.total),
              sp.length ? el("div", { class: "spell" }, "你写成 You wrote: ", sp.map(function (s) {
                return el("span", { class: "tag" }, s, el("small", null, PATTERNS[m.spell[s]][0]));
              })) : null);
          })),
          el("div", { class: "tools" },
            el("button", { class: "btn primary", type: "button", onclick: function () {
              setMode("write", missed.slice(0, 30).map(function (m) { return m.w; })); } }, "✍️ Practise these 练这些错词"),
            el("button", { class: "btn", type: "button", onclick: function () {
              missed.forEach(function (m) { if (!isFav(m.w)) toggleFav(m.w); }); refreshHeader(); render(); } }, "⭐ Save all 全部收藏"))],

      patTotal ? [el("h3", null, "🔍 错误类型 Error types"),
        el("div", { class: "pats" }, patKeys.map(function (k) {
          return el("div", { class: "pat" },
            el("div", { class: "pat-head" }, el("b", null, PATTERNS[k][0]), el("span", { class: "muted" }, " " + PATTERNS[k][1]),
              el("span", { class: "pat-n" }, pat[k] + " 次")),
            el("div", { class: "bar" }, el("i", { style: "width:" + Math.round(pat[k] / pat[patKeys[0]] * 100) + "%" })),
            el("div", { class: "muted" }, PATTERNS[k][2]));
        }))] : null,

      el("div", { class: "tools" }, copyBtn),
      el("p", { class: "muted" }, "Copy the summary and paste it into any AI chat for a deeper analysis. 复制后粘贴给任何 AI，可以得到更详细的分析。")));
  }

  // ---------- start ----------
  function init(data) {
    days = (data.days || []).slice().sort(function (a, b) { return a.id < b.id ? 1 : -1; }); // newest first
    var seen = {};
    days.forEach(function (d) { d.words.forEach(function (w) { var k = key(w); if (!seen[k]) { seen[k] = 1; allWords.push(w); } }); });
    // Newest set if it has unlearned words, else today's review if anything is due, else newest set.
    var newest = days[0];
    var newestHasNew = newest && newest.words.some(function (w) { return !srs[key(w)]; });
    selected = newestHasNew ? newest.id : (allWords.some(isDue) ? "review" : (newest ? newest.id : "all"));
    refreshHeader();
    setSel.addEventListener("change", function () { selected = setSel.value; quiz = null; render(); });
    document.querySelectorAll(".tabs button").forEach(function (b) {
      b.addEventListener("click", function () { setMode(b.dataset.mode); });
    });
    renderFooter();
    render();
  }

  fetch("data.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(init)
    .catch(function () {
      app.textContent = "";
      add(app, el("section", { class: "card empty" }, el("p", null, "Could not load the words. 单词加载失败，请刷新页面。")));
    });
})();
