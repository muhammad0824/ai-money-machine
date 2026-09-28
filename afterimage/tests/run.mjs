// Runs the checks listed in afterimage/TESTS.md in headless Chromium.
//
//   node afterimage/tests/run.mjs [photo-dir]
//
// photo-dir defaults to afterimage/test/ and should hold the three owner photographs
// (JPG, PNG or WebP). Each photo is used once as the base, with the others stacked as
// layers. Without photos only the settings checks run.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appFile = path.resolve(here, '..', 'index.html');
const photoDir = path.resolve(process.argv[2] || path.join(here, '..', 'test'));

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try { return require('playwright'); }
  catch { return require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }
}
const { chromium } = loadPlaywright();

const photos = fs.existsSync(photoDir)
  ? fs.readdirSync(photoDir).filter(f => /\.(jpe?g|png|webp)$/i.test(f)).sort().map(f => path.join(photoDir, f))
  : [];

const results = [];
function record(id, name, ok, detail = '') {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(4)} ${name}${detail ? `  (${detail})` : ''}`);
}

const browser = await chromium.launch();
async function openApp() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e)));
  await page.goto(pathToFileURL(appFile).href);
  await page.waitForFunction(() => window.__afterimageTest);
  return page;
}

/* ---------- settings checks: ground rules and row 1 ---------- */
{
  const page = await openApp();
  const rows = await page.evaluate(() => {
    const T = window.__afterimageTest, out = [];

    const V1 = ['adjust', 'expose', 'solar', 'poster', 'gmap', 'streak', 'corrupt', 'glitch', 'finish'];
    const keys = T.FX.map(f => f.key), missing = V1.filter(k => !keys.includes(k));
    const poster = T.FX.find(f => f.key === 'poster');
    out.push(['G3', 'Nothing from v1 is deleted; the lattice posterize is renamed and kept',
      !missing.length && !!poster && poster.name === 'Posterize (RGB lattice)',
      missing.length ? `missing: ${missing.join(', ')}` : `named "${poster && poster.name}"`]);

    const d = T.defaults();
    out.push(['1.1', 'Effect defaults: vignette 0, grain 0, slices 0',
      d.finish.vignette === 0 && d.finish.grain === 0 && d.glitch.slices === 0,
      `vignette ${d.finish.vignette}, grain ${d.finish.grain}, slices ${d.glitch.slices}`]);

    const bad = [];
    for (const pr of T.PRESETS) {
      const s = T.withPreset(pr.p);
      if (s.finish.on && s.finish.vignette > 0) bad.push(`${pr.name}: vignette`);
      if (s.finish.on && s.finish.grain > 0) bad.push(`${pr.name}: grain`);
      if (s.glitch.on && s.glitch.slices > 0) bad.push(`${pr.name}: slices`);
    }
    out.push(['1.2', `No recipe ships a vignette, grain or slice slip (${T.PRESETS.length} recipes)`, !bad.length, bad.join('; ')]);

    const RUNS = 60, seen = new Set();
    for (let i = 0; i < RUNS; i++) {
      T.surprise();
      const s = T.getState();
      if (s.finish.on && (s.finish.vignette > 0 || s.finish.grain > 0)) seen.add('vignette or grain');
      if (s.glitch.on && s.glitch.slices > 0) seen.add('slice slip');
      if (s.poster.on) seen.add('lattice posterize');
    }
    out.push(['1.3', `Surprise me, ${RUNS} runs: no vignette, grain, slice slip or lattice posterize`, !seen.size, [...seen].join(', ')]);
    return out;
  });
  rows.forEach(r => record(...r));
  if (page.errors.length) record('G2', 'No script errors during settings checks', false, page.errors.join('; '));
  await page.close();
}

/* ---------- pixel checks on the owner photographs ---------- */
if (!photos.length) {
  console.log(`\nNo photos in ${photoDir}: skipped G1 and G2. Put the three owner photographs there, or pass a folder.`);
}
for (const photo of photos) {
  const page = await openApp();
  const name = path.basename(photo);
  const before = await page.evaluate(() => window.__afterimageTest.photoId());
  await page.setInputFiles('#file1', photo);
  await page.waitForFunction(id => window.__afterimageTest.photoId() > id, before);
  const others = photos.filter(p => p !== photo);
  if (others.length) {
    await page.setInputFiles('#file2', others);
    await page.waitForFunction(n => {
      const L = window.__afterimageTest.getState().layers;
      return L.length === n && L.every(l => !l.sample);
    }, others.length);
  }
  const run = await page.evaluate(async () => {
    const T = window.__afterimageTest, [W, H] = T.workSize();
    const hash = img => { let h = 2166136261; const d = img.data; for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619); return h >>> 0; };
    const range = img => {
      const d = img.data; let lo = 255, hi = 0;
      for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; if (l < lo) lo = l; if (l > hi) hi = l; }
      return hi - lo;
    };
    const out = [];
    for (const pr of T.PRESETS) {
      try {
        const a = await T.render(T.withPreset(pr.p), W, H);
        const b = await T.render(T.withPreset(pr.p), W, H);
        out.push({ name: pr.name, same: hash(a) === hash(b), range: range(a) });
      } catch (e) { out.push({ name: pr.name, error: String(e) }); }
    }
    return { W, H, out };
  });
  const differs = run.out.filter(r => !r.error && !r.same).map(r => r.name);
  record('G1', `Deterministic on ${name}: ${run.out.length} recipes rendered twice at ${run.W}×${run.H}`, !differs.length, differs.join(', '));
  const broken = run.out.filter(r => r.error || r.range < 8).map(r => r.error ? `${r.name}: ${r.error}` : `${r.name}: flat frame`);
  broken.push(...page.errors);
  record('G2', `Every recipe renders on ${name}, base plus ${others.length} photo layers`, !broken.length, broken.join('; '));
  await page.close();
}

await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
