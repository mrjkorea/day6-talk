// Day 6 Talk — same browser grader as MRJ Pronounce (wav2vec2 + forced GOP).
// Noise / wrong words must fail. Never fall back to Web Speech string match.
import { loadG2P, expectedPhoneSequence, forcedAlignGop, aggregate } from './engine.js';
import { decodeAudioToMono, audioStats, normalizeForModel, trimSilence, capSpeechWindow } from './audio.js';

const MODEL_ID = 'wav2vec2-lv-60-espeak-cv-ft-onnx-int8';
const PASS_BANDS = new Set(['good', 'ok']);

let session = null;
let readyP = null;

function setChecker(text) {
  const el = document.getElementById('checkerStatus');
  if (el) el.textContent = text;
}

function decide(result) {
  if (!result || !result.overall) return false;
  const audio = result.audio || {};
  if (audio.too_quiet) return false;
  if ((audio.duration_ms || 0) < 250) return false;
  return PASS_BANDS.has(result.overall.band);
}

async function loadModelBytes(onProgress) {
  const manRes = await fetch('models/wav2vec2/manifest.json');
  if (!manRes.ok) throw new Error('pronunciation checker list missing');
  const man = await manRes.json();
  const chunks = [];
  let got = 0;
  for (const part of man.parts) {
    const res = await fetch('models/wav2vec2/' + part.name);
    if (!res.ok) throw new Error('pronunciation checker file missing');
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength !== part.bytes) throw new Error('pronunciation checker file is the wrong size');
    chunks.push(buf);
    got += buf.byteLength;
    if (onProgress) onProgress(got, man.bytes);
  }
  if (got !== man.bytes) throw new Error('pronunciation checker did not finish');
  const out = new Uint8Array(got);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
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
    }
    setChecker('Loading pronunciation checker…');
    await loadG2P('');
    const bytes = await loadModelBytes((got, total) => {
      const pct = Math.min(99, Math.round((got / total) * 100));
      setChecker('Loading pronunciation checker… ' + pct + '%');
    });
    session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
    try {
      const warm = new Float32Array(1600);
      await session.run({ input_values: new ort.Tensor('float32', warm, [1, 1600]) });
    } catch (_) { /* warm-up is best-effort */ }
    setChecker('Pronunciation checker ready');
    return session;
  })().catch((err) => {
    readyP = null;
    session = null;
    setChecker('Pronunciation checker failed. Refresh and try again.');
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

async function recordOnce() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('This browser has no microphone. Use Chrome.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  let rec;
  try {
    rec = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      : new MediaRecorder(stream);
  } catch (_) {
    rec = new MediaRecorder(stream);
  }
  const chunks = [];
  rec.ondataavailable = (ev) => {
    if (ev.data && ev.data.size) chunks.push(ev.data);
  };
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  src.connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  const stopped = new Promise((resolve) => {
    rec.onstop = resolve;
  });
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
  stream.getTracks().forEach((track) => track.stop());
  ctx.close().catch(() => {});
  return new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
}

window.MRJPronounce = { ensureReady, gradeBlob, recordOnce, decide };
ensureReady().catch(() => {});
