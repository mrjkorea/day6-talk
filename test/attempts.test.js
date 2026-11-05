const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadAttempts() {
  const store = new Map();
  const win = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    },
  };
  const code = fs.readFileSync(path.join(__dirname, "..", "js", "attempts.js"), "utf8");
  vm.runInNewContext(code, { window: win, Date, Math, JSON, Number, String, Array, Object, isFinite });
  return { api: win.MRJ_DAY6_ATTEMPTS, store };
}

test("every try is appended and none is lost", () => {
  const { api } = loadAttempts();
  const pid = "ba_u1";
  api.add(pid, { score: 30, pass: false, correct: 3, total: 10 });
  api.add(pid, { score: 90, pass: true, correct: 9, total: 10 });
  const rows = api.list(pid);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.score), [30, 90]);
  assert.deepEqual(rows.map((r) => r.n), [1, 2]);
  assert.equal(api.best(pid), 90);
});

test("a lower retry never lowers the best", () => {
  const { api } = loadAttempts();
  const pid = "ba_u2";
  api.add(pid, { score: 90, pass: true, correct: 9, total: 10 });
  api.add(pid, { score: 40, pass: false, correct: 4, total: 10 });
  assert.equal(api.best(pid), 90);
  assert.equal(api.list(pid).length, 2);
});

test("numbering continues after reload and pass survives", () => {
  const { api, store } = loadAttempts();
  const pid = "i3c_u7";
  api.add(pid, { score: 100, pass: true, correct: 8, total: 8 });
  const win = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "js", "attempts.js"), "utf8"), {
    window: win,
    Date,
    Math,
    JSON,
    Number,
    String,
    Array,
    Object,
    isFinite,
  });
  const again = win.MRJ_DAY6_ATTEMPTS;
  assert.equal(again.nextNumber(pid), 2);
  again.add(pid, { score: 50, pass: false });
  const rows = again.list(pid);
  assert.deepEqual(rows.map((r) => r.score), [100, 50]);
  assert.equal(again.best(pid), 100);
  assert.equal(rows[0].pass, true);
});
