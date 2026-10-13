import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const BUILD = "20261013-receiver";
const TEST_STUDENT = "zz_test_mrjmetrics";

function loadMrjScores(sandbox) {
  const code = readFileSync(new URL("../mrj-scores.js", import.meta.url), "utf8");
  vm.runInNewContext(code, sandbox);
  return sandbox.globalThis.MRJ_SCORES;
}

test("signed in as zz_test_mrjmetrics sets student_email and noteScore localDate", async () => {
  let postedBody = null;
  const noteScores = [];
  const sandbox = {
    globalThis: {},
    fetch(_url, init) {
      postedBody = init.body;
      return Promise.resolve({
        ok: true,
        json() {
          return Promise.resolve({ status: "ok" });
        },
      });
    },
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
    },
    addEventListener() {},
  };
  sandbox.window = sandbox.globalThis;
  sandbox.globalThis.MRJ_AUTH = {
    student() {
      return TEST_STUDENT;
    },
    noteScore(opts) {
      noteScores.push(opts);
    },
  };

  const scores = loadMrjScores(sandbox);
  await scores.post({
    program: "day6-talk",
    itemId: "i3c/u06/01.mp3",
    scoreValue: 70,
    scoreMax: 100,
  });

  const body = JSON.parse(postedBody);
  assert.equal(body.student_email, TEST_STUDENT);
  assert.equal(body.events[0].identity_method, "mrj_signin");
  assert.equal(noteScores.length, 1);
  assert.match(String(noteScores[0].localDate), /^\d{4}-\d{2}-\d{2}$/);
});

test("signed out sends nothing", async () => {
  let fetchCalls = 0;
  const noteScores = [];
  const sandbox = {
    globalThis: {},
    fetch() {
      fetchCalls += 1;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    },
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
    },
    addEventListener() {},
  };
  sandbox.window = sandbox.globalThis;
  sandbox.globalThis.MRJ_AUTH = {
    student() {
      return "";
    },
    noteScore(opts) {
      noteScores.push(opts);
    },
  };

  const scores = loadMrjScores(sandbox);
  const result = await scores.post({
    program: "day6-talk",
    itemId: "i3c/u06/01.mp3",
    scoreValue: 70,
    scoreMax: 100,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.error, "no student");
  assert.equal(fetchCalls, 0);
  assert.equal(noteScores.length, 0);
});

test("index.html loads mrj-scores.js with cache buster matching app build", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const appJs = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const buildMatch = appJs.match(/build\s+(\S+)\s+\*\//);
  assert.ok(buildMatch, "app.js build comment");
  assert.equal(buildMatch[1], BUILD);

  assert.match(html, new RegExp(`mrj-scores\\.js\\?v=${BUILD}`));
  assert.match(html, new RegExp(`js/app\\.js\\?v=${BUILD}`));
});
