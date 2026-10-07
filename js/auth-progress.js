/** Day 6 Talk — merge server progress rows (tested via scripts/test_auth_progress.mjs). */
(function (root) {
  "use strict";

  var PROGRAM = "day6-talk";

  function itemIdFromRow(row) {
    if (!row) return "";
    return String(row.item || row.itemId || "").trim();
  }

  function scoreFromRow(row) {
    if (!row) return null;
    var raw =
      row.score != null
        ? row.score
        : row.scorePct != null
          ? row.scorePct
          : row.scoreValue;
    if (raw == null || raw === "") return null;
    var text = String(raw);
    var slash = text.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
    if (slash) {
      var value = Number(slash[1]);
      var max = Number(slash[2]);
      if (max) return Math.round((value / max) * 100);
      return Math.round(value);
    }
    var pct = text.match(/(\d+(?:\.\d+)?)/);
    if (!pct) return null;
    return Math.round(Number(pct[1]));
  }

  function rowPassed(row) {
    var score = scoreFromRow(row);
    if (score == null) return true;
    if (score >= 70) return true;
    return String(row.correctness || "") === "correct";
  }

  function pickBetterRow(a, b) {
    if (!a) return b;
    if (!b) return a;
    var sa = scoreFromRow(a);
    var sb = scoreFromRow(b);
    if (sa == null && sb == null) return a;
    if (sa == null) return b;
    if (sb == null) return a;
    if (sb > sa) return b;
    if (sa > sb) return a;
    if (rowPassed(b) && !rowPassed(a)) return b;
    return a;
  }

  function filterProgramRows(rows, program) {
    program = program || PROGRAM;
    return (rows || []).filter(function (row) {
      return row && String(row.program || "") === program;
    });
  }

  function cloneSet(set) {
    return set instanceof Set ? new Set(set) : new Set(set || []);
  }

  function cloneMap(map) {
    var out = new Map();
    if (map instanceof Map) {
      map.forEach(function (v, k) {
        out.set(k, v);
      });
    }
    return out;
  }

  function mergeAuthProgress(doneIds, doneRows, rows, program) {
    program = program || PROGRAM;
    var ids = cloneSet(doneIds);
    var map = cloneMap(doneRows);
    filterProgramRows(rows, program).forEach(function (row) {
      var id = itemIdFromRow(row);
      if (!id) return;
      ids.add(id);
      map.set(id, pickBetterRow(map.get(id), row));
    });
    return { doneIds: ids, doneRows: map };
  }

  function mergeRowLists(existing, incoming, program) {
    program = program || PROGRAM;
    var byId = new Map();
    filterProgramRows(existing, program).forEach(function (row) {
      var id = itemIdFromRow(row);
      if (!id) return;
      byId.set(id, row);
    });
    filterProgramRows(incoming, program).forEach(function (row) {
      var id = itemIdFromRow(row);
      if (!id) return;
      byId.set(id, pickBetterRow(byId.get(id), row));
    });
    return Array.from(byId.values());
  }

  var api = {
    PROGRAM: PROGRAM,
    itemIdFromRow: itemIdFromRow,
    scoreFromRow: scoreFromRow,
    pickBetterRow: pickBetterRow,
    filterProgramRows: filterProgramRows,
    mergeAuthProgress: mergeAuthProgress,
    mergeRowLists: mergeRowLists,
  };

  root.MRJ_DAY6_AUTH_PROGRESS = api;
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
