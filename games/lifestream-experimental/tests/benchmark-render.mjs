import {Model, CONFIG, BOSS_START} from '../model.mjs';
import {createRenderer} from '../render.mjs';
import {createRenderer as createBeforeRenderer} from './fixtures/render-before-optimization.mjs';
import {replay, compare} from './replay-core.mjs';

const report = document.getElementById('report');
try {
  const trace = await fetch('./fixtures/seed-73.trace.json').then(r => r.json());
  let game;
  const options = {getState: () => ({game, selected: .45, artMode: false, sanctuaryArmed: false, paused: true}), isOverlayOpen: () => false};
  const before = createBeforeRenderer(options);
  const beforeCanvases = ['world', 'omens'].map(id => document.getElementById(id));
  // Independent canvases avoid shared drawing state and readback/backend transitions.
  for (const canvas of beforeCanvases) {
    const id = canvas.id; canvas.id += '-before';
    const replacement = document.createElement('canvas'); replacement.id = id;
    document.getElementById('stage').append(replacement);
  }
  const after = createRenderer(options);
  before.resize(); after.resize();
  const timings = {before: [], after: [], bossBefore: [], bossAfter: []};
  let pixelChecks = 0, intentionalVisualChanges = 0;
  function pixels(canvases) {
    return canvases.map(canvas => {
      return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    });
  }
  const run = replay(Model, trace, {onCheckpoint: (model, tick) => {
    game = model;
    before.render(); const reference = pixels(beforeCanvases);
    const warning = document.getElementById('bossWarning').style.cssText;
    const drain = document.body.style.getPropertyValue('--drain');
    after.render(); const actual = pixels(['world', 'omens'].map(id => document.getElementById(id)));
    // The later boss-entrance fix intentionally changes this brief interval.
    // Its draw counts/timing are covered by browser.mjs; all other pixels stay exact.
    const sequencing = model.t >= BOSS_START && model.t < BOSS_START + (CONFIG.bossCount - 1) * CONFIG.bossInterval + CONFIG.sinkActivationGrow;
    if (sequencing) intentionalVisualChanges++;
    else {
      for (let c = 0; c < reference.length; c++) for (let i = 0; i < reference[c].length; i++) {
        if (reference[c][i] !== actual[c][i]) throw new Error(`Pixel mismatch at tick ${tick}, canvas ${c}, byte ${i}: ${reference[c][i]} vs ${actual[c][i]}`);
      }
      pixelChecks++;
    }
    if (warning !== document.getElementById('bossWarning').style.cssText || drain !== document.body.style.getPropertyValue('--drain')) throw new Error(`Warning mismatch at tick ${tick}`);
    for (let warm = 0; warm < 8; warm++) { before.render(); after.render(); }
    for (let i = 0; i < 30; i++) {
      // Alternate order to avoid systematically favouring a warm cache or a GC phase.
      for (const name of i % 2 ? ['after', 'before'] : ['before', 'after']) {
        const renderer = name === 'before' ? before : after;
        const start = performance.now(); renderer.render(); const duration = performance.now() - start;
        timings[name].push(duration);
        if (tick >= 10199 && tick <= 10620) timings[name === 'before' ? 'bossBefore' : 'bossAfter'].push(duration);
      }
    }
  }});
  const baseline = await fetch('./fixtures/seed-73.baseline.json').then(r => r.json());
  compare(run.snapshots, baseline.snapshots);
  const summary = values => {
    const sorted = [...values].sort((a, b) => a - b);
    return {count: values.length, medianMs: sorted[Math.ceil(values.length * .5) - 1], p95Ms: sorted[Math.ceil(values.length * .95) - 1], p99Ms: sorted[Math.ceil(values.length * .99) - 1]};
  };
  const result = {pixelChecks, intentionalVisualChanges, context: {userAgent: navigator.userAgent, dpr: devicePixelRatio, stage: [714, 648]}, methodology: 'Alternating synchronous draws on the same seeded scenes; warmup excluded; no vsync/presentation measurement.', timings: Object.fromEntries(Object.entries(timings).map(([key, values]) => [key, summary(values)]))};
  report.textContent = JSON.stringify(result, null, 2);
  document.title = 'PASS — Lifestream renderer benchmark';
} catch (error) {
  report.textContent = String(error.stack || error);
  document.title = 'FAIL — Lifestream renderer benchmark';
}
