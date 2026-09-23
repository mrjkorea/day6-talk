/** Day 6 Talk — classroom flow (port of MRJ-Day6-Talk-0.3.2) */
(function () {
  const MAX_TRIES = 5;
  const $ = (id) => document.getElementById(id);

  const state = {
    qa: null,
    audioIndex: null,
    level: null,
    unit: null,
    pairs: [],
    cursor: 0,
    tries: 0,
    rows: [], // { question, status: 'success'|'skipped', heardReply?, teacherWrite? }
    listening: false,
    player: null,
  };

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

  function studentSrc(pair) {
    const say = pair.student || pair.say || "";
    const map = state.audioIndex?.studentFiles || {};
    const hit =
      map[say] ||
      map["[happy] " + say] ||
      (pair.audio ? "say/" + pair.audio : "");
    return audioUrl(hit);
  }

  function teacherSrc(pair) {
    const reply = pair.reply || "";
    const map = state.audioIndex?.teacherFiles || {};
    const hit =
      map[reply] ||
      map[stripTag(reply)] ||
      map["[happy] " + stripTag(reply)] ||
      pair.audio ||
      "";
    return audioUrl(hit);
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

  function playStudent() {
    const pair = state.pairs[state.cursor];
    if (!pair) return;
    return playUrl(studentSrc(pair));
  }

  function playTeacher(pair) {
    return playUrl(teacherSrc(pair));
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
    $("btnNext").hidden = true;
    $("btnSkip").hidden = false;
    $("btnMic").disabled = false;
    $("micStatus").textContent = "Tap Speak and say the line";
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
    $("replyText").textContent = stripTag(pair.reply || "");
    $("micStatus").textContent = "Nice! Listening to Mr Jay…";
    $("btnMic").disabled = true;
    $("btnSkip").hidden = true;
    await playTeacher(pair);
    $("btnNext").hidden = false;
    $("micStatus").textContent = "Tap Next";
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
      const replyShown = ok
        ? row.heardReply || ""
        : row.teacherWrite || row.unlockedReply || "";
      let body = `<span class="tag">${ok ? "Success" : "Missed"}</span>`;
      body += `<p class="q">${escapeHtml(row.question)}</p>`;
      if (replyShown) {
        body += `<p class="a">Mr Jay: ${escapeHtml(replyShown)}</p>`;
      } else {
        body += `<p class="a muted">Reply hidden — write what you remember, or use Teacher mic</p>`;
      }
      if (!ok) {
        body += `<div class="miss-actions print-hide">
          <button type="button" class="secondary btn-play-q" data-i="${idx}">▶ Student line</button>
          <button type="button" class="primary btn-teacher-mic" data-i="${idx}">🎙 Teacher mic</button>
          ${row.unlockedReply ? `<button type="button" class="secondary btn-play-r" data-i="${idx}">▶ Reply</button>` : ""}
        </div>`;
      } else {
        body += `<div class="miss-actions print-hide">
          <button type="button" class="secondary btn-play-r-ok" data-i="${idx}">▶ Hear reply again</button>
        </div>`;
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

  async function gradeAgainst(target, blob) {
    if (!blob || blob.size < 800) {
      return { pass: false, score: 0, band: "invalid", reason: "too_short" };
    }
    if (!window.MRJPronounce.isReady()) {
      $("micStatus").textContent = "Pronunciation checker is still loading…";
    } else {
      $("micStatus").textContent = "Checking your line…";
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

  /* ---------- Events ---------- */
  $("btnHome").onclick = () => {
    stopAudio();
    renderHome();
  };
  $("btnHear").onclick = () => playStudent();
  $("btnCue").onclick = () => playStudent();
  $("btnSkip").onclick = () => {
    const pair = state.pairs[state.cursor];
    if (pair) recordSkip(pair);
    advance();
  };
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
      if (!graded.pass) {
        state.tries += 1;
        updateTryDots();
        const why = graded.reason === "too_quiet" || graded.reason === "too_short"
          ? "I didn’t hear a clear line."
          : "Not the line.";
        $("micStatus").textContent = `${why} Try again (${graded.score}% · need 65%)`;
        if (state.tries >= MAX_TRIES) {
          recordSkip(pair);
          $("micStatus").textContent = "5 tries — skipping…";
          setTimeout(advance, 1100);
        }
        return;
      }
      await onPass(pair, "matched");
    } catch (e) {
      $("micStatus").textContent = (e && e.message) || "Mic error";
    } finally {
      stopListeningUI();
    }
  };

  /* ---------- Boot ---------- */
  Promise.all([
    fetch("data/day6-qa.json").then((r) => r.json()),
    fetch("data/audio-index.json").then((r) => r.json()),
  ])
    .then(([qa, audioIndex]) => {
      state.qa = qa;
      state.audioIndex = audioIndex;
      renderHome();
    })
    .catch((err) => {
      document.body.innerHTML =
        "<p style='padding:2rem;font-family:sans-serif'>Failed to load Day 6 data: " +
        escapeHtml(String(err)) +
        "</p>";
    });
})();
