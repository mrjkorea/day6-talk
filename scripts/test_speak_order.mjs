import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const boot = readFileSync(new URL("../js/pronounce-boot.js", import.meta.url), "utf8");

function handler(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, "missing " + marker);
  return source.slice(start, source.indexOf("};", start));
}

test("Speak tap arms the mic before any await", () => {
  const fn = handler(app, '$("btnMic").onclick');
  const arm = fn.indexOf("armMic()");
  const firstAwait = fn.indexOf("await ");
  assert.ok(arm > 0, "btnMic must call armMic");
  assert.ok(firstAwait > arm, "armMic must run before the first await");
  assert.equal(fn.includes("SpeechRecognition"), false);
  assert.equal(fn.includes("getRecognition"), false);
});

test("checker load is not awaited before the mic is armed", () => {
  const fn = handler(app, '$("btnMic").onclick');
  const arm = fn.indexOf("armMic()");
  const ready = fn.indexOf("ensureReady()");
  assert.ok(ready > arm, "ensureReady must follow armMic");
  assert.equal(fn.slice(0, arm).includes("await "), false);
  assert.equal(fn.slice(arm, ready).includes("await "), false);
});

test("load bar and word colors are in the page", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /Loading offline pronunciation\. This only happens once\./);
  assert.match(html, /id="loadFill"/);
  assert.match(html, /id="wordBox"/);
  assert.match(app, /word-chip/);
  assert.match(app, /chipClass/);
  const practice = handler(app, "async function practiceWord");
  const arm = practice.indexOf("armMicNow()");
  const firstAwait = practice.indexOf("await ");
  assert.ok(arm > 0 && firstAwait > arm, "word practice must arm the mic before await");
});

test("recording uses the shared context, not a new one after getUserMedia", () => {
  const fn = handler(boot, "async function recordOnce");
  assert.equal(fn.includes("new AudioContext"), false);
  assert.equal(fn.includes("webkitAudioContext"), false);
  assert.equal(fn.includes("getUserMedia"), false);
  assert.match(fn, /sharedCtx/);
  assert.match(boot, /function armMic\(\)[\s\S]*getUserMedia/);
  assert.match(boot, /proxy = false/);
});
