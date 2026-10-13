#!/usr/bin/env node
/**
 * Headless Chrome benchmark: Citrinet-only Day 6 checker.
 * Run from repo root: node tools/bench-trial.mjs
 */
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { bootCitrinetOnlyPaths } from '../js/trial.js';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wavDir = join(root, 'test', 'bench-wavs');
const TARGET = 'It is here.';
const CHECK_SENTENCE = TARGET;

const CLIPS = [
  { id: 'correct', file: 'correct-it-is-here.wav', target: TARGET },
  { id: 'wrong', file: 'wrong-what-time.wav', target: TARGET },
  { id: 'silence', file: 'silence.wav', target: TARGET },
  { id: 'mumbled', file: 'mumbled-it-is-here.wav', target: TARGET },
];

async function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: opts.quiet ? 'pipe' : 'inherit', ...opts });
    let out = '';
    if (opts.quiet) p.stdout.on('data', (d) => { out += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exit ${code}`))));
  });
}

async function ensureWavs() {
  await mkdir(wavDir, { recursive: true });
  for (const clip of CLIPS) {
    const out = join(wavDir, clip.file);
    try {
      await stat(out);
    } catch {
      throw new Error(`missing bench wav ${clip.file} — copy from pronounce test/bench-wavs`);
    }
  }
}

function startStaticServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const pathOnly = req.url.split('?')[0];
      const rel = pathOnly === '/' ? '/index.html' : pathOnly;
      const file = join(root, decodeURIComponent(rel));
      readFile(file).then((buf) => {
        const base = file.split('/').pop() || '';
        const ext = base.includes('.') ? base.split('.').pop() : '';
        const types = {
          html: 'text/html',
          js: 'text/javascript',
          mjs: 'text/javascript',
          css: 'text/css',
          json: 'application/json',
          onnx: 'application/octet-stream',
          wasm: 'application/wasm',
          wav: 'audio/wav',
          mp3: 'audio/mpeg',
          txt: 'text/plain',
        };
        res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
        res.end(buf);
      }).catch(() => {
        res.writeHead(404);
        res.end('not found');
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port, url: `http://127.0.0.1:${port}/` });
    });
  });
}

async function diskBytesForBoot() {
  const paths = bootCitrinetOnlyPaths().concat([
    'js/ort/ort.all.min.js',
    'js/ort/ort-wasm-simd-threaded.jsep.mjs',
    'js/ort/ort-wasm-simd-threaded.jsep.wasm',
  ]);
  let sum = 0;
  for (const rel of paths) {
    try {
      const st = await stat(join(root, rel));
      sum += st.size;
    } catch (_) {}
  }
  return sum;
}

function trackablePath(url) {
  const u = String(url);
  return u.includes('/models/') || u.includes('/js/ort/');
}

async function bench(baseUrl) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(300000);
  const bytesByUrl = new Map();
  let bootBytes = 0;
  page.on('response', async (res) => {
    const url = res.url();
    if (!trackablePath(url)) return;
    try {
      const body = await res.body();
      const prev = bytesByUrl.get(url) || 0;
      if (prev === 0) bootBytes += body.length;
      bytesByUrl.set(url, prev + body.length);
    } catch (_) {}
  });
  const t0 = Date.now();
  await page.goto(`${baseUrl}?bench=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.__mrjPronounceBench && window.MRJPronounce && window.MRJPronounce.isReady(),
    { timeout: 300000 },
  );
  const readyMs = Date.now() - t0;
  const boot = await page.evaluate(() => window.__mrjTrialBoot());

  const checkTimes = [];
  const correctUrl = `${baseUrl}test/bench-wavs/correct-it-is-here.wav`;
  for (let i = 0; i < 3; i++) {
    const ms = await page.evaluate(async ({ url, sentence }) => {
      const blob = await fetch(url).then((r) => r.blob());
      const t = performance.now();
      await window.__mrjPronounceBench(blob, sentence, { hints: false });
      return performance.now() - t;
    }, { url: correctUrl, sentence: CHECK_SENTENCE });
    checkTimes.push(Math.round(ms));
  }

  const accuracy = {};
  for (const passAt of [60, 50]) {
    accuracy[passAt] = {};
    for (const clip of CLIPS) {
      const clipUrl = `${baseUrl}test/bench-wavs/${clip.file}`;
      const out = await page.evaluate(async ({ url, target, passAt }) => {
        const blob = await fetch(url).then((r) => r.blob());
        const graded = await window.__mrjPronounceBench(blob, target, { hints: false, passAt });
        const words = (graded.result.words || []).map((w) => ({
          word: w.word,
          score: Math.round(w.score || 0),
          pass: (w.score || 0) >= passAt,
        }));
        return {
          doorFail: !!graded.result.doorFail,
          pass: !!graded.result.pass,
          words,
          perf: graded.perf,
        };
      }, { url: clipUrl, target: clip.target, passAt });
      accuracy[passAt][clip.id] = out;
    }
  }

  const samplePerf = accuracy[60].correct.perf || {};
  const diskBootBytes = await diskBytesForBoot();
  await browser.close();
  return {
    mode: 'citrinet-only',
    trialMode: boot.trialMode,
    readyMs,
    checkTimes,
    downloadBytes: bootBytes,
    downloadMb: Math.round((bootBytes / (1024 * 1024)) * 10) / 10,
    diskBootBytes,
    diskBootMb: Math.round((diskBootBytes / (1024 * 1024)) * 10) / 10,
    perfSample: samplePerf,
    accuracy,
    assets: [...bytesByUrl.entries()].map(([url, n]) => ({ url: url.replace(baseUrl, ''), bytes: n })),
  };
}

async function main() {
  await ensureWavs();
  const { server, url } = await startStaticServer();
  try {
    const citrinetOnly = await bench(url);
    const report = {
      generatedAt: new Date().toISOString(),
      checkSentence: CHECK_SENTENCE,
      citrinetOnly,
    };
    const outPath = join(root, 'test', 'bench-trial-report.json');
    await writeFile(outPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.error('\nWrote', outPath);
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
