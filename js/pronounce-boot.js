// Day 6 Talk — shared MRJ HuBERT phoneme checker loaded from the pronounce site
// (https://mrjkorea.github.io/pronounce/src/shared.js, model models/hubert/manifest.json),
// so the model is cached once per browser for every MRJ app.
// Colours: green 75+, yellow 50-74, red under 50. PASS = line average >= 60. 5-try rule in app.js.
import {
  bootShared,
  gradeTrialSamples,
  DOOR_FAIL_TEXT,
  PASS_PCT,
  audio as sharedAudio,
} from 'https://mrjkorea.github.io/pronounce/src/shared.js';

const { decodeAudioToMono, audioStats, trimSilence, capSpeechWindow } = sharedAudio;
const APP_ID = 'day6';

let trialReady = null;
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

function isReady() {
  return readyFlag;
}

function benchModeEnabled() {
  try {
    if (new URLSearchParams(location.search).get('bench') === '1') return true;
    const auth = window.MRJ_AUTH;
    const student = typeof auth?.student === 'function' ? auth.student() : auth;
    const id = student && (student.id || student.studentId || student.email || '');
    return String(id).toLowerCase().startsWith('zz_test');
  } catch (_) {
    return false;
  }
}

function exposeBenchHook() {
  if (!readyFlag || !benchModeEnabled()) return;
  window.__mrjPronounceBench = async (blob, english, gradeOpts) => {
    const opts = Object.assign({ hints: false }, gradeOpts || {});
    const passAt = typeof opts.passAt === 'number' ? opts.passAt : PASS_PCT;
    opts.appId = APP_ID;
    const samples = await decodeAudioToMono(blob, 16000);
    const graded = await gradeTrialSamples(samples, english, passAt, null, opts);
    return { result: graded.result, door: graded.door, perf: graded.perf, trialMode: 'hubert-phoneme' };
  };
  window.__mrjTrialBoot = () => ({
    trialMode: 'hubert-phoneme',
    grader: 'hubert-phoneme-shared',
    ready: readyFlag,
  });
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
  if (!result || result.doorFail) return false;
  const audio = result.audio || {};
  if (audio.too_quiet) return false;
  if (typeof audio.duration_ms === 'number' && audio.duration_ms < 250) return false;
  if (result.overall) return (result.overall.score || 0) * 100 >= PASS_PCT;
  const pct = typeof result.scorePct === 'number' ? result.scorePct : (result.score || 0);
  return pct >= PASS_PCT;
}

function ensureReady() {
  if (trialReady) return Promise.resolve(trialReady);
  if (readyP) return readyP;
  readyP = (async () => {
    setLoad(8, 'Saving offline pronunciation on this phone…', true);
    trialReady = await bootShared({
      onProgress: (f) => setLoad(Math.round((Number(f) || 0) * 100), 'Saving offline pronunciation on this phone…', false),
    });
    readyFlag = true;
    setLoad(100, 'Offline pronunciation ready', false);
    setTimeout(hideLoad, 900);
    exposeBenchHook();
    return trialReady;
  })().catch((err) => {
    readyP = null;
    trialReady = null;
    readyFlag = false;
    setLoad(0, 'Pronunciation checker failed. Refresh and try again.', false);
    throw err;
  });
  return readyP;
}

function pageWords(words) {
  return (words || []).map((w) => {
    const score = Math.max(0, Math.min(1, (Number(w.score) || 0) / 100));
    const red = w.band ? w.band === 'red' : score < 0.5;
    return {
      word: w.word,
      score,
      band: w.band || (score >= 0.75 ? 'green' : (score >= 0.5 ? 'yellow' : 'red')),
      hint: red ? (w.hint || '') : '',
    };
  });
}

function audioMiss(reason) {
  return {
    pass: false,
    score: 0,
    band: 'invalid',
    reason,
    doorFail: false,
    result: { words: [] },
  };
}

async function gradeBlob(blob, text) {
  await ensureReady();
  const samples = await decodeAudioToMono(blob, 16000);
  const stats = audioStats(samples, 16000);
  if (stats.durationMs < 80) return audioMiss('too_short');
  const trimmed = capSpeechWindow(trimSilence(samples, 16000, 0.006, 80), 16000, 4500);
  const trimmedStats = audioStats(trimmed, 16000);
  if (trimmedStats.tooQuiet || trimmedStats.durationMs < 250) return audioMiss('too_quiet');
  const graded = await gradeTrialSamples(trimmed, text, PASS_PCT, null, { hints: false, appId: APP_ID });
  const trial = graded.result;
  if (trial.doorFail) {
    return {
      pass: false,
      score: 0,
      band: 'fail',
      reason: DOOR_FAIL_TEXT,
      doorFail: true,
      result: { words: [] },
    };
  }
  const score = typeof trial.scorePct === 'number'
    ? trial.scorePct
    : Math.round((trial.score || 0) * 100);
  const words = pageWords(trial.words);
  const packed = {
    doorFail: false,
    score,
    scorePct: score,
    audio: { too_quiet: false, duration_ms: trimmedStats.durationMs },
  };
  const pass = decide(packed);
  return {
    pass,
    score,
    band: pass ? 'pass' : 'fail',
    reason: pass ? '' : DOOR_FAIL_TEXT,
    doorFail: false,
    result: { words },
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

let finishActive = null;

function stopActiveTake() {
  if (finishActive) finishActive();
}

async function recordOnce(stream, shouldStop) {
  if (!stream || typeof MediaRecorder === 'undefined') {
    throw new Error('This browser has no microphone. Open in Chrome.');
  }
  const ctx = sharedCtx;
  if (!ctx || ctx.state === 'closed') {
    throw new Error('This browser has no microphone. Open in Chrome.');
  }
  const stopNow = typeof shouldStop === 'function' ? shouldStop : () => false;
  let settled = false;
  let resolveWait = null;
  const ended = new Promise((resolve) => {
    resolveWait = resolve;
  });
  const finish = () => {
    if (settled) return;
    settled = true;
    if (finishActive === finish) finishActive = null;
    resolveWait();
  };
  finishActive = finish;
  if (stopNow()) finish();
  try {
    await sharedResume;
  } catch (_) { /* same context; a suspended graph fails the short-audio gate */ }
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch (_) { /* shared context only */ }
  }
  if (stopNow()) finish();
  let rec;
  try {
    rec = openRecorder(stream);
  } catch (err) {
    if (finishActive === finish) finishActive = null;
    throw err;
  }
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
    const tick = () => {
      if (settled) return;
      if (stopNow()) {
        finish();
        return;
      }
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
          finish();
          return;
        }
      }
      if (now - started > 4500) {
        finish();
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
    await ended;
    if (rec.state !== 'inactive') rec.stop();
    await stopped;
    return new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
  } finally {
    if (finishActive === finish) finishActive = null;
    try { src.disconnect(); } catch (_) {}
    try { stream.getTracks().forEach((track) => track.stop()); } catch (_) {}
  }
}

window.MRJPronounce = { ensureReady, gradeBlob, recordOnce, stopActiveTake, decide, armMic, unlockMic, isReady };
ensureReady().catch(() => {});
