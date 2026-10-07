import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

function loadProgressApi() {
  const sandbox = { globalThis: {} };
  sandbox.window = sandbox.globalThis;
  const code = readFileSync(new URL("../js/auth-progress.js", import.meta.url), "utf8");
  vm.runInNewContext(code, sandbox);
  return sandbox.globalThis.MRJ_DAY6_AUTH_PROGRESS;
}

const P = loadProgressApi();
const PROGRAM = "day6-talk";

test("ignores rows from other programs", () => {
  const merged = P.mergeAuthProgress(new Set(), new Map(), [
    { program: "day5-practice", item: "x", scorePct: 99 },
    { program: PROGRAM, item: "ba/u01/01", scorePct: 80 },
  ]);
  assert.equal(merged.doneIds.size, 1);
  assert.ok(merged.doneIds.has("ba/u01/01"));
});

test("union keeps all item ids and never shrinks the set", () => {
  const first = P.mergeAuthProgress(new Set(["local-line"]), new Map(), [
    { program: PROGRAM, item: "ba/u01/02", scorePct: 75 },
  ]);
  const second = P.mergeAuthProgress(first.doneIds, first.doneRows, [
    { program: PROGRAM, item: "ba/u01/03", scorePct: 60 },
  ]);
  assert.ok(second.doneIds.has("local-line"));
  assert.ok(second.doneIds.has("ba/u01/02"));
  assert.ok(second.doneIds.has("ba/u01/03"));
});

test("paged reload (>20 rows) merges with max score per item", () => {
  let state = P.mergeAuthProgress(new Set(), new Map(), [
    { program: PROGRAM, item: "ba/u01/01", scorePct: 55 },
    { program: PROGRAM, item: "ba/u01/02", scorePct: 72 },
  ]);
  const page = [];
  for (let i = 3; i <= 25; i++) {
    page.push({ program: PROGRAM, item: "ba/u01/" + String(i).padStart(2, "0"), scorePct: 80 });
  }
  page.push({ program: PROGRAM, item: "ba/u01/01", scorePct: 88 });
  state = P.mergeAuthProgress(state.doneIds, state.doneRows, page);
  assert.equal(state.doneIds.size, 25);
  assert.equal(P.scoreFromRow(state.doneRows.get("ba/u01/01")), 88);
  assert.equal(P.scoreFromRow(state.doneRows.get("ba/u01/02")), 72);
});

test("mergeRowLists keeps best row per item for resume anchor", () => {
  const rows = P.mergeRowLists(
    [{ program: PROGRAM, item: "bc/u02/01", scorePct: 40 }],
    [{ program: PROGRAM, item: "bc/u02/01", scorePct: 90 }],
    PROGRAM
  );
  assert.equal(rows.length, 1);
  assert.equal(P.scoreFromRow(rows[0]), 90);
});
