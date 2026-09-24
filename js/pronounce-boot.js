// Day 6 Talk — same browser grader as MRJ Pronounce (wav2vec2 + forced GOP).
// Noise / wrong words must fail. Never fall back to Web Speech string match.
import { loadG2P, expectedPhoneSequence, forcedAlignGop, aggregate } from './engine.js';
import { decodeAudioToMono, audioStats, normalizeForModel, trimSilence, capSpeechWindow } from './audio.js';

const MODEL_ID = 'wav2vec2-lv-60-espeak-cv-ft-onnx-int8';
const PASS_SCORE = 0.70;
const DB_NAME = 'mrj-day6-checker';
const DB_STORE = 'parts';

let session = null;
let readyP = null;
let readyFlag = false;
let sharedCtx = null;
let sharedResume = Promise.resolve();

function setChecker(text) {
  const el = document.getElementById('checkerStatus');
  if (el) el.textContent = text;
}

function setLoad(pct, text, creep) {
  setChecker(text);
  const fill = document.getElementById('loadFill');
  const track = document.getElementById('loadTrack');
  if (track) track.hidden = false;
  if (!fill) return;
  fill.classList.toggle('creep', !!creep);
  if (!creep) fill.style.width = Math.max(6, Math.min(100, pct)) + '%';
}

function hideLoad() {
  const track = document.getElementById('loadTrack');
  if (track) track.hidden = true;
  setChecker('Offline pronunciation ready');
}

async function readTracked(res, expected, onBytes) {
  if (!res.body || typeof res.body.getReader !== 'function') {
    const buf = new Uint8Array(await res.arrayBuffer());
    onBytes(buf.byteLength);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.byteLength;
    onBytes(got);
  }
  if (expected && got !== expected) throw new Error('pronunciation checker file is the wrong size');
  const out = new Uint8Array(got);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function isReady() {
  return readyFlag;
}

// Must run inside the Speak tap, before any await. Android Chrome only
// shows the mic prompt and only resumes audio for that gesture.
function unlockMic() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (
    !Ctor ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== 'function' ||
    typeof MediaRecorder === 'undefined'
  ) {
    throw new Error('This browser has no microphone. Open in Chrome.');
  }
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new Ctor();
  }
  try {
    sharedResume = sharedCtx.resume();
  } catch (_) {
    sharedResume = Promise.resolve();
  }
  return sharedCtx;
}

function armMic() {
  unlockMic();
  return navigator.mediaDevices.getUserMedia({ audio: true });
}

function decide(result) {
  if (!result || !result.overall) return false;
  const audio = result.audio || {};
  if (audio.too_quiet) return false;
  if ((audio.duration_ms || 0) < 250) return false;
  return (result.overall.score || 0) >= PASS_SCORE;
}

function openCheckerDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DB_STORE)) {
        req.result.createObjectStore(DB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

function idbGet(db, key) {
  return new Promise((resolve) => {
    try {
      const req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
}

function idbPut(db, key, value) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch (_) {
      resolve(false);
    }
  });
}

async function loadModelBytes(onProgress) {
  const manRes = await fetch('models/wav2vec2/manifest.json');
  if (!manRes.ok) throw new Error('pronunciation checker list missing');
  const man = await manRes.json();
  const db = await openCheckerDb();
  const chunks = [];
  let got = 0;
  let downloaded = 0;
  for (const part of man.parts) {
    let buf = null;
    if (db) buf = await idbGet(db, part.name);
    if (buf && buf.byteLength === part.bytes) {
      chunks.push(buf);
      got += buf.byteLength;
      if (onProgress) onProgress(got, man.bytes, false);
      continue;
    }
    downloaded += 1;
    const res = await fetch('models/wav2vec2/' + part.name);
    if (!res.ok) throw new Error('pronunciation checker file missing');
    buf = await readTracked(res, part.bytes, (partGot) => {
      if (onProgress) onProgress(got + partGot, man.bytes, true);
    });
    chunks.push(buf);
    got += buf.byteLength;
    if (db) await idbPut(db, part.name, buf);
    if (onProgress) onProgress(got, man.bytes, true);
  }
  if (got !== man.bytes) throw new Error('pronunciation checker did not finish');
  const out = new Uint8Array(got);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes: out, fromPhone: downloaded === 0 };
}

function ensureReady(onProgress) {
  if (session) return Promise.resolve(session);
  if (readyP) return readyP;
  readyP = (async () => {
    const ort = window.ort;
    if (!ort) throw new Error('pronunciation engine missing');
    if (ort.env && ort.env.wasm) {
      const ortBase = new URL('js/ort/', window.location.href).href;
      ort.env.wasm.wasmPaths = {
        mjs: new URL('ort-wasm-simd-threaded.jsep.mjs', ortBase).href,
        wasm: new URL('ort-wasm-simd-threaded.jsep.wasm', ortBase).href,
      };
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
    }
    setLoad(4, 'Checking this phone for the saved pronunciation…', true);
    await loadG2P('');
    const loaded = await loadModelBytes((got, total, fetching) => {
      const pct = Math.min(88, Math.max(6, Math.round((got / total) * 88)));
      const text = fetching
        ? 'Saving offline pronunciation on this phone… ' + pct + '%. Next open will not download it.'
        : 'Found it on this phone… ' + pct + '%';
      setLoad(pct, text, false);
    });
    const bytes = loaded.bytes;
    setLoad(
      90,
      loaded.fromPhone
        ? 'Already on this phone. Starting offline pronunciation.'
        : 'Starting offline pronunciation. Next open will use the saved copy.',
      true
    );
    session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
    try {
      const warm = new Float32Array(1600);
      await session.run({ input_values: new ort.Tensor('float32', warm, [1, 1600]) });
    } catch (_) { /* warm-up is best-effort */ }
    readyFlag = true;
    setLoad(100, 'Offline pronunciation ready', false);
    setTimeout(hideLoad, 900);
    return session;
  })().catch((err) => {
    readyP = null;
    session = null;
    readyFlag = false;
    setLoad(0, 'Pronunciation checker failed. Refresh and try again.', false);
    throw err;
  });
  return readyP;
}

async function gradeBlob(blob, text) {
  const t0 = performance.now();
  const live = await ensureReady();
  const samples = await decodeAudioToMono(blob, 16000);
  const stats = audioStats(samples, 16000);
  if (stats.durationMs < 80) {
    return { pass: false, score: 0, band: 'invalid', reason: 'too_short' };
  }
  const trimmed = capSpeechWindow(trimSilence(samples, 16000, 0.006, 80), 16000, 4500);
  const trimmedStats = audioStats(trimmed, 16000);
  if (trimmedStats.tooQuiet || trimmedStats.durationMs < 250) {
    return { pass: false, score: 0, band: 'invalid', reason: 'too_quiet' };
  }
  const input = normalizeForModel(trimmed);
  const out = await live.run({ input_values: new ort.Tensor('float32', input, [1, input.length]) });
  const logitsArr = out.logits.data;
  const dims = out.logits.dims || [];
  const T = Number(dims[1]);
  const V = Number(dims[2]);
  if (!T || !V || logitsArr.length !== T * V) throw new Error('checker shape mismatch');
  const logits = new Array(T);
  for (let t = 0; t < T; t++) logits[t] = logitsArr.subarray(t * V, (t + 1) * V);
  const { phones, words } = expectedPhoneSequence(text);
  const phoneScores = forcedAlignGop(logits, phones, 0);
  const result = aggregate(
    text,
    words,
    phoneScores,
    trimmedStats.durationMs,
    16000,
    MODEL_ID,
    performance.now() - t0,
    {
      clipping: stats.clipping,
      too_quiet: false,
      snr_est: stats.snrEst,
      warnings: [],
    }
  );
  const pct = Math.round((result.overall.score || 0) * 100);
  return {
    pass: decide(result),
    score: pct,
    band: result.overall.band,
    reason: decide(result) ? 'pass' : 'needs_work',
    result,
  };
}

function openRecorder(stream) {
  const types = ['audio/webm;codecs=opus', 'audio/mp4'];
  for (const mime of types) {
    try {
      if (typeof MediaRecorder.isTypeSupported === 'function' && !MediaRecorder.isTypeSupported(mime)) {
        continue;
      }
      return new MediaRecorder(stream, { mimeType: mime });
    } catch (_) { /* try the next container */ }
  }
  try {
    return new MediaRecorder(stream);
  } catch (_) {
    throw new Error('This browser has no microphone. Open in Chrome.');
  }
}

async function recordOnce(stream) {
  if (!stream || typeof MediaRecorder === 'undefined') {
    throw new Error('This browser has no microphone. Open in Chrome.');
  }
  const ctx = sharedCtx;
  if (!ctx || ctx.state === 'closed') {
    throw new Error('This browser has no microphone. Open in Chrome.');
  }
  try {
    await sharedResume;
  } catch (_) { /* same context; a suspended graph fails the short-audio gate */ }
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch (_) { /* shared context only */ }
  }
  const rec = openRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (ev) => {
    if (ev.data && ev.data.size) chunks.push(ev.data);
  };
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  src.connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  const stopped = new Promise((resolve) => {
    rec.onstop = resolve;
  });
  try {
    rec.start();
    const started = performance.now();
    let heard = false;
    let silentSince = null;
    await new Promise((resolve) => {
      const tick = () => {
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        const now = performance.now();
        if (rms > 0.02) {
          heard = true;
          silentSince = null;
        } else if (heard) {
          if (silentSince == null) silentSince = now;
          if (now - silentSince > 700) {
            resolve();
            return;
          }
        }
        if (now - started > 4500) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
    if (rec.state !== 'inactive') rec.stop();
    await stopped;
    return new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
  } finally {
    try { src.disconnect(); } catch (_) {}
    try { stream.getTracks().forEach((track) => track.stop()); } catch (_) {}
  }
}

window.MRJPronounce = { ensureReady, gradeBlob, recordOnce, decide, armMic, unlockMic, isReady };
ensureReady().catch(() => {});
