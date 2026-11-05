/** Day 6 Talk — append-only unit attempt record (Try again).
 *  One record per unit page id ("ba_u1"), attempts never overwritten.
 *  Best score and pass survive a lower retry.
 */
(function (root) {
  "use strict";

  var KEY = "day6-unit-attempts-v1";
  var PASS_PCT = 60;

  function storage() {
    try {
      return root.localStorage || null;
    } catch (_) {
      return null;
    }
  }

  function loadAll() {
    var s = storage();
    if (!s) return {};
    try {
      var raw = s.getItem(KEY);
      var data = raw ? JSON.parse(raw) : {};
      return data && typeof data === "object" ? data : {};
    } catch (_) {
      return {};
    }
  }

  function saveAll(data) {
    var s = storage();
    if (!s) return;
    try {
      s.setItem(KEY, JSON.stringify(data));
    } catch (_) {}
  }

  function normalize(row, index) {
    var score = Number(row && row.score);
    return {
      n: Number(row && row.n) || index + 1,
      startedAt: String((row && row.startedAt) || ""),
      endedAt: String((row && row.endedAt) || ""),
      score: isFinite(score) ? Math.round(score) : 0,
      pass: !!(row && row.pass),
      correct: Number((row && row.correct) || 0),
      total: Number((row && row.total) || 0),
      source: String((row && row.source) || "student"),
    };
  }

  function recordFor(pageId, data) {
    var all = data || loadAll();
    var rec = all[pageId];
    if (!rec || !Array.isArray(rec.attempts)) {
      rec = { attempts: [], firstDoneAt: "", lastAttemptAt: "", bestScore: null, pass: false };
    }
    rec.attempts = rec.attempts.map(normalize);
    return rec;
  }

  function list(pageId) {
    return recordFor(pageId).attempts;
  }

  function best(pageId) {
    var rec = recordFor(pageId);
    if (rec.bestScore != null) return rec.bestScore;
    if (!rec.attempts.length) return null;
    return rec.attempts.reduce(function (m, a) {
      return a.score > m.score ? a : m;
    }).score;
  }

  function nextNumber(pageId) {
    var rows = list(pageId);
    return rows.length ? Math.max.apply(null, rows.map(function (a) { return a.n; })) + 1 : 1;
  }

  /** Append one finished try. Never edits or removes an earlier one. */
  function add(pageId, attempt) {
    var data = loadAll();
    var rec = recordFor(pageId, data);
    var now = new Date().toISOString();
    var row = normalize(
      Object.assign(
        {
          n: rec.attempts.length ? Math.max.apply(null, rec.attempts.map(function (a) { return a.n; })) + 1 : 1,
          startedAt: now,
          endedAt: now,
          score: 0,
          correct: 0,
          total: 0,
          source: "student",
        },
        attempt || {}
      ),
      rec.attempts.length
    );
    row.pass = !!row.pass || row.score >= PASS_PCT;
    rec.attempts.push(row);
    if (!rec.firstDoneAt) rec.firstDoneAt = row.endedAt || now;
    rec.lastAttemptAt = row.endedAt || now;
    rec.bestScore = Math.max.apply(
      null,
      rec.attempts.map(function (a) { return a.score; })
    );
    rec.pass = rec.attempts.some(function (a) { return a.pass; });
    data[pageId] = rec;
    saveAll(data);
    return { row: row, record: rec };
  }

  root.MRJ_DAY6_ATTEMPTS = {
    KEY: KEY,
    PASS_PCT: PASS_PCT,
    list: list,
    best: best,
    nextNumber: nextNumber,
    add: add,
  };
})(typeof window !== "undefined" ? window : this);
