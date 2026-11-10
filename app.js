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
  function grade(w, result) {
    var k = key(w), cur = srs[k] || { box: 0 }, box, due, t = today();
    if (result === "good") { box = Math.min(MAX_BOX, (cur.box || 0) + 1); due = addDays(t, INTERVALS[box]); }
    else if (result === "unsure") { box = Math.max(1, cur.box || 0); due = addDays(t, 1); }
    else { box = 0; due = t; }
    srs[k] = { box: box, due: due, last: t };
    store.set("srs", srs);
  }
  function isDue(w) { var s = srs[key(w)]; return !!s && s.due <= today(); }

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
    print: "🖨 打印：打印成 A4 纸，用笔默写，答案折到背面。"
  };
  var opts = { shuffle: store.get("shuffle", true), withSentence: store.get("withSentence", false) };
  var selected = null; // "review" | "all" | day id
  var quiz = null;

  function wordsOf(sel) {
    if (sel === "review") return allWords.filter(isDue);
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
    grade(w, result);
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
    grade(w, quiz.ok ? "good" : "bad");
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
      el("div", { class: "tools" }, prevBtn(),
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
    body.push(el("div", { class: "tools" }, prevBtn()));
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
      el("div", { class: "tools" }, prevBtn()),
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
           el("ul", { class: "list" }, wrong.map(function (w) { return el("li", null, el("b", null, w.en), " — " + w.zh); }))],
      el("div", { class: "tools" },
        prevBtn(),
        wrong.length ? el("button", { class: "btn primary", type: "button", onclick: function () { startQuiz(wrong.slice()); } }, "↻ Only these 只练这些") : null,
        wasCards ? el("button", { class: wrong.length ? "btn" : "btn primary", type: "button",
          onclick: function () { setMode("write", quiz.words.slice()); } }, "✍ Now write them 现在默写") : null,
        el("button", { class: "btn", type: "button", onclick: function () { startQuiz(); } }, "Start again 全部重来")),
      el("p", { class: "muted" }, "Your progress is saved. Words come back in Today's review: 1, 2, 4, 7, 15, 30 days later. " +
        "进度已保存，单词会在 1、2、4、7、15、30 天后回到「今日复习」。")));
  }

  function renderEmpty() {
    var isReview = selected === "review";
    add(app, el("section", { class: "card empty" },
      el("div", { class: "big" }, isReview ? "🎉" : "📭"),
      el("p", null, isReview ? "Nothing to review right now. 现在没有要复习的词。" : "No words here yet. 这里还没有单词。"),
      isReview && days.length ? el("button", { class: "btn primary", type: "button",
        onclick: function () { selected = days[0].id; quiz = null; refreshHeader(); render(); } }, "Learn the newest set 学最新一组") : null));
  }

  function renderPrint() {
    var words = wordsOf(selected);
    var withS = opts.withSentence;
    var d = days.find(function (x) { return x.id === selected; });
    var title = selected === "review" ? "Today's review 今日复习" : selected === "all" ? "All words 全部单词" : (d.title || "Dictation");
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
        srs = data; store.set("srs", srs); quiz = null; refreshHeader(); render();
      }).catch(function () { alert("This is not a progress file. 不是进度文件。"); });
    } });
    add(footer, el("details", { class: "progress-box" },
      el("summary", null, "⚙ Progress 学习进度"),
      el("p", null, "Progress is saved in this browser only (phone and computer are separate). Use Export / Import to move it. " +
        "进度只保存在这个浏览器里（手机和电脑分开）。可以导出 / 导入来转移。"),
      el("div", { class: "tools" },
        el("button", { class: "btn", type: "button", onclick: function () {
          var a = el("a", { href: URL.createObjectURL(new Blob([JSON.stringify(srs)], { type: "application/json" })),
            download: "daily-words-progress-" + today() + ".json" });
          document.body.append(a); a.click(); a.remove();
        } }, "⬇ Export 导出"),
        el("button", { class: "btn", type: "button", onclick: function () { fileInput.click(); } }, "⬆ Import 导入"),
        el("button", { class: "btn", type: "button", onclick: function () {
          if (!confirm("Delete all progress on this device? 删除本设备的全部进度？")) return;
          srs = {}; store.set("srs", srs); quiz = null; refreshHeader(); render();
        } }, "Reset 清空"), fileInput)));
  }

  function render() {
    app.textContent = "";
    document.querySelectorAll(".tabs button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.mode === mode)); });
    document.getElementById("mode-help").textContent = MODE_HELP[mode] || "";
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
    if (!quiz || mode === "print") return;
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
