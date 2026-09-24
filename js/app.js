/** Day 6 Talk — classroom flow (port of MRJ-Day6-Talk-0.3.2) */
(function () {
  const MAX_TRIES = 3;
  const $ = (id) => document.getElementById(id);

  const state = {
    qa: null,
    audioIndex: null,
    replyPaths: null,
    replyReady: false,
    level: null,
    unit: null,
    pairs: [],
    cursor: 0,
    tries: 0,
    rows: [], // { question, status: 'success'|'skipped', heardReply?, teacherWrite? }
    listening: false,
    player: null,
    listenVoice: localStorage.getItem("day6ListenVoice") || "texan",
    replyVoice: localStorage.getItem("day6ReplyVoice") || "jay35",
  };

  const LISTEN_VOICES = [
    { id: "texan", label: "Texan woman" },
    { id: "grandpa", label: "Grandfather" },
    { id: "american", label: "American man" },
  ];
  const REPLY_VOICES = [
    { id: "jay35", label: "Mr Jay age 35" },
    { id: "jay15", label: "Teenager" },
    { id: "jay7", label: "Mr Jay age 7" },
  ];

  const views = {
    home: $("viewHome"),
    unit: $("viewUnit"),
    speak: $("viewSpeak"),
    end: $("viewEnd"),
    results: $("viewResults"),
  };

  function show(name) {
    Object.entries(views).forEach(([k, el]) => {
      el.hidden = k !== name;
    });
    $("btnHome").hidden = name === "home";
    $("tryBadge").hidden = name !== "speak";
  }

  function stripTag(s) {
    return String(s || "").replace(/^\[[^\]]+\]\s*/, "").trim();
  }

  function audioUrl(rel) {
    if (!rel) return "";
    return "audio/" + String(rel).replace(/^audio\//, "").replace(/^\//, "");
  }

  function voiceRel(rel, voiceId) {
    if (!rel) return "";
    if (voiceId === "texan" || voiceId === "jay35") return rel;
    return "voices/" + voiceId + "/" + String(rel).replace(/^\/+/, "");
  }

  function studentRel(pair) {
    const say = pair.student || pair.say || "";
    const map = state.audioIndex?.studentFiles || {};
    return (
      map[say] ||
      map["[happy] " + say] ||
      (pair.audio ? "say/" + pair.audio : "")
    );
  }

  function teacherRel(pair, voiceId) {
    const reply = pair.reply || "";
    const map = state.audioIndex?.teacherFiles || {};
    const indexed = map[reply] || map[stripTag(reply)] || map["[happy] " + stripTag(reply)] || "";
    const baked = (state.replyPaths && state.replyPaths[reply]) || "";
    if (voiceId && voiceId !== "jay35") return baked || pair.audio || indexed;
    return pair.audio || indexed || baked;
  }

  function studentSrc(pair) {
    return audioUrl(voiceRel(studentRel(pair), state.listenVoice));
  }

  function teacherSrc(pair) {
    return audioUrl(voiceRel(teacherRel(pair, state.replyVoice), state.replyVoice));
  }

  function stopAudio() {
    if (state.player) {
      try { state.player.pause(); } catch (_) {}
      state.player = null;
    }
  }

  function playUrl(url) {
    stopAudio();
    if (!url) return Promise.resolve("missing");
    return new Promise((resolve) => {
      const a = new Audio(url);
      state.player = a;
      a.onended = () => resolve("played");
      a.onerror = () => resolve("error");
      a.play().catch(() => resolve("error"));
    });
  }

  function replyIsShowing() {
    return !!state.replyReady;
  }

  function markReplyVoices() {
    document.querySelectorAll("#replyVoices button").forEach((btn) => {
      btn.classList.toggle("on", btn.dataset.voice === state.replyVoice);
    });
    const reply = $("replyVoice");
    if (reply && reply.value !== state.replyVoice) reply.value = state.replyVoice;
  }

  function chooseReplyVoice(voiceId, playNow) {
    state.replyVoice = voiceId;
    localStorage.setItem("day6ReplyVoice", voiceId);
    markReplyVoices();
    if (playNow && replyIsShowing()) return replayReply();
  }

  function replayReply() {
    const pair = state.pairs[state.cursor];
    if (!pair) return;
    $("micStatus").textContent = "Playing the reply…";
    return playTeacher(pair);
  }

  function playStudent() {
    const pair = state.pairs[state.cursor];
    if (!pair) return;
    const rel = studentRel(pair);
    const chosen = voiceRel(rel, state.listenVoice);
    return playUrl(audioUrl(chosen)).then((result) => {
      if (result === "played" || state.listenVoice === "texan") return result;
      $("micStatus").textContent = "That voice is still saving. Playing Texan woman.";
      return playUrl(audioUrl(rel));
    });
  }

  function playTeacher(pair) {
    const rel = teacherRel(pair, state.replyVoice);
    const chosen = voiceRel(rel, state.replyVoice);
    const label = (REPLY_VOICES.find((v) => v.id === state.replyVoice) || {}).label || "that voice";
    return playUrl(audioUrl(chosen)).then((result) => {
      if (result === "played") {
        $("micStatus").textContent = "Playing " + label + ". Tap again to repeat.";
        return result;
      }
      $("micStatus").textContent = label + " file is missing for this line.";
      return result;
    });
  }

  /* ---------- Speech ---------- */
  function getRecognition() {
    const C = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!C) return null;
    const r = new C();
    r.lang = "en-US";
    r.interimResults = false;
    r.maxAlternatives = 3;
    r.continuous = false;
    return r;
  }

  function listenOnce() {
    return new Promise((resolve, reject) => {
      const rec = getRecognition();
      if (!rec) {
        reject(new Error("Web Speech API needs Chrome (or Edge)."));
        return;
      }
      let done = false;
      const finish = (fn) => (ev) => {
        if (done) return;
        done = true;
        fn(ev);
      };
      rec.onresult = finish((ev) => {
        const alts = [];
        for (let i = 0; i < ev.results[0].length; i++) {
          alts.push(ev.results[0][i].transcript);
        }
        resolve({ text: (alts[0] || "").trim(), alts });
      });
      rec.onerror = finish((ev) => {
        if (ev.error === "no-speech") resolve({ text: "", alts: [] });
        else if (ev.error === "not-allowed") reject(new Error("Allow the microphone, then tap Speak."));
        else reject(new Error(ev.error || "listen error"));
      });
      rec.onend = finish(() => resolve({ text: "", alts: [] }));
      try { rec.start(); } catch (e) { reject(e); }
    });
  }

  /* ---------- Navigation / render ---------- */
  function renderHome() {
    const list = $("bookList");
    list.innerHTML = "";
    state.qa.levels.forEach((lv) => {
      const n = lv.units.reduce((a, u) => a + u.pairs.length, 0);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "book-card";
      btn.innerHTML = `<h2>${escapeHtml(lv.label)}</h2><p>${lv.units.length} units · ${n} lines</p>`;
      btn.onclick = () => openLevel(lv);
      list.appendChild(btn);
    });
    $("title").textContent = "Day 6 Talk";
    show("home");
  }

  function openLevel(lv) {
    state.level = lv;
    $("title").textContent = lv.label;
    $("unitLead").textContent = lv.label + " · pick a unit";
    const grid = $("unitPicker");
    grid.innerHTML = "";
    lv.units.forEach((u) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "unit-card";
      btn.innerHTML = `<h3>Unit ${u.unit}. ${escapeHtml(u.title)}</h3><p>${u.pairs.length} lines</p>`;
      btn.onclick = () => startUnit(u);
      grid.appendChild(btn);
    });
    show("unit");
  }

  function startUnit(u) {
    state.unit = u;
    state.pairs = u.pairs.slice();
    state.cursor = 0;
    state.tries = 0;
    state.rows = [];
    $("title").textContent = `U${u.unit} · ${u.title}`;
    showPair();
    show("speak");
  }

  function showPair() {
    stopAudio();
    stopListeningUI();
    const pair = state.pairs[state.cursor];
    if (!pair) {
      showEnd();
      return;
    }
    state.tries = 0;
    $("sayLine").textContent = stripTag(pair.student || pair.say || "");
    $("heardLine").hidden = true;
    $("replyBanner").hidden = true;
    $("replyVoices").hidden = true;
    state.replyReady = false;
    $("btnNext").hidden = true;
    $("btnMic").disabled = false;
    if ($("cueHint")) $("cueHint").textContent = "Say this · tap to hear first";
    $("micStatus").textContent = "Tap Speak and say the line";
    clearWords();
    hideGradeBar();
    updateProgress();
    updateTryDots();
  }

  function updateProgress() {
    const total = state.pairs.length;
    const cur = Math.min(state.cursor + 1, total);
    $("progressText").textContent = `${cur} / ${total}`;
    $("progressBar").style.setProperty("--pct", `${(state.cursor / total) * 100}%`);
  }

  function updateTryDots() {
    const el = $("tryDots");
    el.innerHTML = "";
    for (let i = 0; i < MAX_TRIES; i++) {
      const s = document.createElement("span");
      if (i < state.tries) s.classList.add("used");
      el.appendChild(s);
    }
    $("tryBadge").hidden = false;
    $("tryBadge").textContent = `${state.tries}/${MAX_TRIES}`;
  }

  function recordSuccess(pair) {
    const q = stripTag(pair.student || pair.say || "");
    const reply = stripTag(pair.reply || "");
    if (!state.rows.some((r) => r.question === q)) {
      state.rows.push({ question: q, status: "success", heardReply: reply });
    }
  }

  function recordSkip(pair) {
    const q = stripTag(pair.student || pair.say || "");
    if (!state.rows.some((r) => r.question === q)) {
      state.rows.push({ question: q, status: "skipped" });
    }
  }

  async function onPass(pair, heard) {
    recordSuccess(pair);
    $("heardLine").hidden = true;
    $("replyBanner").hidden = false;
    $("replyVoices").hidden = false;
    state.replyReady = true;
    markReplyVoices();
    $("replyText").textContent = stripTag(pair.reply || "");
    if ($("cueHint")) $("cueHint").textContent = "Tap the sentence to hear the reply again";
    $("micStatus").textContent = "Nice! Listening to the reply…";
    $("btnMic").disabled = true;
    await playTeacher(pair);
    $("btnNext").hidden = false;
    $("micStatus").textContent = "Tap the reply to hear it again";
  }

  function advance() {
    state.cursor += 1;
    if (state.cursor >= state.pairs.length) showEnd();
    else showPair();
  }

  function showEnd() {
    stopAudio();
    const ok = state.rows.filter((r) => r.status === "success").length;
    const miss = state.rows.filter((r) => r.status === "skipped").length;
    $("endSummary").textContent = `${ok} heard · ${miss} missed`;
    $("endDetail").textContent = `${state.level.label} · Unit ${state.unit.unit} · ${state.pairs.length} lines`;
    show("end");
  }

  function renderResults() {
    $("resultsMeta").textContent =
      `${state.level.label} · Unit ${state.unit.unit} ${state.unit.title} · ` +
      `${state.rows.filter((r) => r.status === "success").length} success / ` +
      `${state.rows.filter((r) => r.status === "skipped").length} missed`;
    const list = $("resultsList");
    list.innerHTML = "";
    state.rows.forEach((row, idx) => {
      const card = document.createElement("div");
      const ok = row.status === "success";
      card.className = "result-card " + (ok ? "success" : "missed");
      let body = `<span class="tag">${ok ? "Got it" : "Needs help"}</span>`;
      body += `<p class="q">${escapeHtml(row.question)}</p>`;
      if (ok && row.heardReply) {
        body += `<p class="a">Mr Jay: ${escapeHtml(row.heardReply)}</p>`;
      }
      if (!ok) {
        body += `<p class="a">Simply ask your teacher for help with this.</p>`;
      }
      card.innerHTML = body;
      list.appendChild(card);
    });

    list.querySelectorAll(".btn-play-q").forEach((b) => {
      b.onclick = () => {
        const row = state.rows[+b.dataset.i];
        const pair = findPair(row.question);
        if (pair) playStudentPair(pair);
      };
    });
    list.querySelectorAll(".btn-play-r, .btn-play-r-ok").forEach((b) => {
      b.onclick = () => {
        const row = state.rows[+b.dataset.i];
        const pair = findPair(row.question);
        if (pair) playTeacher(pair);
      };
    });
    list.querySelectorAll(".btn-teacher-mic").forEach((b) => {
      b.onclick = () => teacherMic(+b.dataset.i);
    });

    show("results");
  }

  function findPair(question) {
    return state.pairs.find(
      (p) => stripTag(p.student || p.say || "") === question
    );
  }

  function playStudentPair(pair) {
    return playUrl(studentSrc(pair));
  }

  const MIC_BLOCKED = "Chrome blocked the microphone. Open this page in Chrome, not inside Telegram, and tap Allow.";
  const NO_MIC = "This browser has no microphone. Open in Chrome.";

  function waitForMic(micPromise, ms) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finishReject = () => {
        if (settled) return;
        settled = true;
        reject(new Error(MIC_BLOCKED));
      };
      const timer = setTimeout(() => {
        finishReject();
        micPromise.then((stream) => {
          try { stream.getTracks().forEach((track) => track.stop()); } catch (_) {}
        }).catch(() => {});
      }, ms);
      micPromise.then(
        (stream) => {
          if (settled) {
            try { stream.getTracks().forEach((track) => track.stop()); } catch (_) {}
            return;
          }
          settled = true;
          clearTimeout(timer);
          resolve(stream);
        },
        () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(new Error(MIC_BLOCKED));
        }
      );
    });
  }

  function armMicNow() {
    if (!window.MRJPronounce || typeof window.MRJPronounce.armMic !== "function") {
      throw new Error("Pronunciation checker is not loaded. Refresh the page.");
    }
    return window.MRJPronounce.armMic();
  }

  function showGradeBar(text) {
    const box = $("gradeBox");
    if (!box) return;
    box.hidden = false;
    $("gradeStatus").textContent = text;
  }

  function hideGradeBar() {
    const box = $("gradeBox");
    if (box) box.hidden = true;
  }

  function chipClass(score) {
    if (score >= 0.8) return "good";
    if (score >= 0.5) return "ok";
    return "bad";
  }

  function clearWords() {
    const box = $("wordBox");
    if (!box) return;
    box.hidden = true;
    box.innerHTML = "";
  }

  function renderWords(graded) {
    const box = $("wordBox");
    const words = graded && graded.result && graded.result.words;
    if (!box || !words || !words.length) {
      clearWords();
      return;
    }
    box.hidden = false;
    box.innerHTML = "";
    const hint = document.createElement("p");
    hint.className = "word-hint";
    hint.textContent = "Green is good. Tap a yellow or red word, then say just that word.";
    box.appendChild(hint);
    const row = document.createElement("div");
    row.className = "word-row";
    words.forEach((w) => {
      const btn = document.createElement("button");
      btn.type = "button";
      const score = w.score || 0;
      btn.className = "word-chip " + chipClass(score);
      btn.innerHTML =
        `<span class="w">${escapeHtml(w.word)}</span>` +
        `<span class="p">${Math.round(score * 100)}%</span>`;
      btn.onclick = () => practiceWord(w.word, btn);
      row.appendChild(btn);
    });
    box.appendChild(row);
  }

  async function practiceWord(word, btn) {
    if (state.listening) return;
    if (btn.classList.contains("good")) {
      $("micStatus").textContent = word + " is already good.";
      return;
    }
    stopAudio();
    let micPromise;
    try {
      micPromise = armMicNow();
    } catch (e) {
      $("micStatus").textContent = (e && e.message) || NO_MIC;
      return;
    }
    $("micStatus").textContent = "Allow the microphone…";
    state.listening = true;
    $("btnMic").classList.add("listening");
    window.MRJPronounce.ensureReady().catch(() => {});
    try {
      const stream = await waitForMic(micPromise, 8000);
      $("micStatus").textContent = "Say just: " + word;
      const blob = await window.MRJPronounce.recordOnce(stream);
      const graded = await gradeAgainst(word, blob);
      const score = (graded.score || 0) / 100;
      btn.className = "word-chip " + chipClass(score);
      const pct = btn.querySelector(".p");
      if (pct) pct.textContent = Math.round(score * 100) + "%";
      if (chipClass(score) === "good") {
        $("micStatus").textContent = word + " is good.";
        const chips = [...$("wordBox").querySelectorAll(".word-chip")];
        if (chips.length && chips.every((c) => c.classList.contains("good"))) {
          const pair = state.pairs[state.cursor];
          if (pair) await onPass(pair, "words");
        }
      } else {
        $("micStatus").textContent = "Not yet. Say " + word + " again.";
      }
    } catch (e) {
      $("micStatus").textContent = (e && e.message) || "Mic error";
    } finally {
      hideGradeBar();
      stopListeningUI();
    }
  }

  async function gradeAgainst(target, blob) {
    if (!blob || blob.size < 800) {
      return { pass: false, score: 0, band: "invalid", reason: "too_short" };
    }
    if (!window.MRJPronounce.isReady()) {
      $("micStatus").textContent = "Pronunciation checker is still loading…";
      showGradeBar("Still getting the pronunciation ready…");
    } else {
      $("micStatus").textContent = "Checking your line…";
      showGradeBar("Checking your line…");
    }
    try {
      await window.MRJPronounce.ensureReady();
    } catch (_) {
      throw new Error("Pronunciation checker failed. Refresh and try again.");
    }
    $("micStatus").textContent = "Checking your line…";
    return window.MRJPronounce.gradeBlob(blob, target);
  }

  async function teacherMic(idx) {
    const row = state.rows[idx];
    if (!row || row.status === "success") return;
    const pair = findPair(row.question);
    if (!pair) return;
    stopAudio();
    let micPromise;
    try {
      micPromise = armMicNow();
    } catch (e) {
      alert((e && e.message) || NO_MIC);
      return;
    }
    window.MRJPronounce.ensureReady().catch(() => {});
    try {
      const stream = await waitForMic(micPromise, 8000);
      const blob = await window.MRJPronounce.recordOnce(stream);
      const graded = await gradeAgainst(row.question, blob);
      if (!graded.pass) {
        const why = graded.reason === "too_quiet" || graded.reason === "too_short"
          ? "I didn’t hear a clear line."
          : "Not the line. Say the missed student line, then the reply will play.";
        alert(why);
        return;
      }
      const reply = stripTag(pair.reply || "");
      row.teacherWrite = reply;
      row.unlockedReply = reply;
      await playTeacher(pair);
      renderResults();
    } catch (e) {
      alert(e.message || "Teacher mic needs Chrome and the microphone.");
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function stopListeningUI() {
    state.listening = false;
    $("btnMic").classList.remove("listening");
  }

  function fillVoices() {
    const listen = $("listenVoice");
    const reply = $("replyVoice");
    LISTEN_VOICES.forEach((v) => {
      const o = document.createElement("option");
      o.value = v.id;
      o.textContent = v.label;
      listen.appendChild(o);
    });
    REPLY_VOICES.forEach((v) => {
      const o = document.createElement("option");
      o.value = v.id;
      o.textContent = v.label;
      reply.appendChild(o);
    });
    const box = $("replyVoices");
    box.innerHTML = "";
    REPLY_VOICES.forEach((v) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.voice = v.id;
      btn.textContent = v.label;
      btn.onclick = () => chooseReplyVoice(v.id, true);
      box.appendChild(btn);
    });
    if (!LISTEN_VOICES.some((v) => v.id === state.listenVoice)) state.listenVoice = "texan";
    if (!REPLY_VOICES.some((v) => v.id === state.replyVoice)) state.replyVoice = "jay35";
    listen.value = state.listenVoice;
    reply.value = state.replyVoice;
    listen.onchange = () => {
      state.listenVoice = listen.value;
      localStorage.setItem("day6ListenVoice", state.listenVoice);
      if (!replyIsShowing()) playStudent();
    };
    reply.onchange = () => chooseReplyVoice(reply.value, true);
  }

  /* ---------- Events ---------- */
  fillVoices();
  $("btnHome").onclick = () => {
    stopAudio();
    renderHome();
  };
  $("btnHear").onclick = () => playStudent();
  $("btnCue").onclick = () => {
    if (replyIsShowing()) replayReply();
    else playStudent();
  };
  $("replyBanner").onclick = () => replayReply();
  $("btnNext").onclick = () => advance();
  $("btnResults").onclick = () => renderResults();
  $("btnAgain").onclick = () => startUnit(state.unit);
  $("btnBackUnits").onclick = () => openLevel(state.level);
  $("btnPrint").onclick = () => window.print();
  $("btnResultsHome").onclick = () => renderHome();

  $("btnMic").onclick = async () => {
    if (state.listening) return;
    const pair = state.pairs[state.cursor];
    if (!pair) return;
    stopAudio();
    if (!window.MRJPronounce || typeof window.MRJPronounce.armMic !== "function") {
      $("micStatus").textContent = "Pronunciation checker is not loaded. Refresh the page.";
      return;
    }
    let micPromise;
    try {
      micPromise = window.MRJPronounce.armMic();
    } catch (err) {
      $("micStatus").textContent = (err && err.message) || NO_MIC;
      return;
    }
    $("micStatus").textContent = "Allow the microphone…";
    state.listening = true;
    $("btnMic").classList.add("listening");
    const target = stripTag(pair.student || pair.say || "");
    window.MRJPronounce.ensureReady().catch(() => {});
    try {
      const stream = await waitForMic(micPromise, 8000);
      $("micStatus").textContent = "Listening… say the line";
      const blob = await window.MRJPronounce.recordOnce(stream);
      const graded = await gradeAgainst(target, blob);
      hideGradeBar();
      renderWords(graded);
      if (!graded.pass) {
        state.tries += 1;
        updateTryDots();
        const why = graded.reason === "too_quiet" || graded.reason === "too_short"
          ? "I didn’t hear a clear line."
          : "Not the line.";
        $("micStatus").textContent = `${why} Try again (${graded.score}% · need 70%)`;
        if (state.tries >= MAX_TRIES) {
          recordSkip(pair);
          $("micStatus").textContent = "3 tries. Going on. Ask your teacher later.";
          setTimeout(advance, 1100);
        }
        return;
      }
      await onPass(pair, "matched");
    } catch (e) {
      $("micStatus").textContent = (e && e.message) || "Mic error";
    } finally {
      hideGradeBar();
      stopListeningUI();
    }
  };

  /* ---------- Boot ---------- */
  Promise.all([
    fetch("data/day6-qa.json").then((r) => r.json()),
    fetch("data/audio-index.json").then((r) => r.json()),
    fetch("data/reply-paths.json").then((r) => r.json()),
  ])
    .then(([qa, audioIndex, replyPaths]) => {
      state.qa = qa;
      state.audioIndex = audioIndex;
      state.replyPaths = replyPaths;
      renderHome();
    })
    .catch((err) => {
      document.body.innerHTML =
        "<p style='padding:2rem;font-family:sans-serif'>Failed to load Day 6 data: " +
        escapeHtml(String(err)) +
        "</p>";
    });
})();
