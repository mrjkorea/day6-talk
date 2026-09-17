/** Day 6 Talk scoring — normalize + word/char similarity. Length-aware pass (APK-aligned). */
(function (global) {
  function stripTag(s) {
    return String(s || "").replace(/^\[[^\]]+\]\s*/, "").trim();
  }

  function normalize(s) {
    return stripTag(s)
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .replace(/[^a-z0-9'\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokens(s) {
    return normalize(s).split(" ").filter(Boolean);
  }

  function levenshtein(a, b) {
    a = normalize(a); b = normalize(b);
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    const dp = new Array(n + 1);
    for (let j = 0; j <= n; j++) dp[j] = j;
    for (let i = 1; i <= m; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= n; j++) {
        const tmp = dp[j];
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
        prev = tmp;
      }
    }
    return dp[n];
  }

  function similarity(a, b) {
    a = normalize(a); b = normalize(b);
    if (!a && !b) return 100;
    if (!a || !b) return 0;
    if (a === b) return 100;
    const maxLen = Math.max(a.length, b.length);
    const charScore = (1 - levenshtein(a, b) / maxLen) * 100;
    const ta = tokens(a), tb = tokens(b);
    const setB = new Set(tb);
    let hit = 0;
    for (const t of ta) if (setB.has(t)) hit++;
    const wordScore = ta.length ? (hit / Math.max(ta.length, tb.length)) * 100 : 0;
    return Math.round(Math.max(charScore, wordScore));
  }

  /** APK K0 thresholds on basic length */
  function passThreshold(target) {
    const basic = normalize(target).replace(/'/g, "");
    const len = basic.length;
    if (len <= 3) return 72;
    if (len <= 5) return 80;
    if (len <= 10) return 78;
    return 75;
  }

  function bestScore(transcript, target, alts) {
    const candidates = [target].concat(alts || []);
    let best = 0, matched = target;
    for (const c of candidates) {
      const s = similarity(transcript, c);
      if (s > best) { best = s; matched = c; }
    }
    const need = passThreshold(matched);
    return { score: best, matched, need, pass: best >= need };
  }

  global.Day6Score = { normalize, stripTag, similarity, bestScore, passThreshold };
})(window);
