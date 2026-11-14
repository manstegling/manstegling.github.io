import {Model, DT, BOSS_START} from '../model.mjs';
import {createRenderer} from '../render.mjs';
import {applyAction, checkEnergy, compare, snapshot, state} from './replay-core.mjs';

const $ = id => document.getElementById(id);
const [trace, baseline] = await Promise.all(['seed-73.trace.json', 'seed-73.baseline.json'].map(name => fetch(`./fixtures/${name}`).then(r => r.json())));
const model = new Model(trace.seed, trace.initial, trace.params);
const renderer = createRenderer({getState: () => ({game: model, selected: .45, artMode: false, sanctuaryArmed: false, paused: false}), isOverlayOpen: () => false});
new ResizeObserver(renderer.resize).observe($('stage'));
renderer.resize(); renderer.render();

const samples = {step: [], draw: [], rafInterval: [], bossStep: [], bossDraw: [], bossRafInterval: []};
const actions = [], checkpoints = [];
const checkpointTicks = new Set(trace.checkpoints);
let tick = 0, actionIndex = 0, last = 0, lastDraw = 0, accumulator = 0, running = false, backgroundEvents = 0;
let results;

function summary(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = fraction => sorted.length ? sorted[Math.ceil(fraction * sorted.length) - 1] : null;
  return {count: values.length, medianMs: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), maxMs: sorted.at(-1) ?? null};
}
function finish() {
  let regression = 'PASS';
  try {
    compare(checkpoints, baseline.snapshots);
    compare(actions, baseline.outcomes);
    compare(snapshot(model, tick), baseline.final);
  } catch (error) { regression = error.message; }
  results = {
    context: {userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight], stage: [$('stage').clientWidth, $('stage').clientHeight], dpr: devicePixelRatio, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches},
    methodology: 'Visible-tab wall-clock replay; 60 Hz fixed simulation, 30 FPS draw target; boss window 169–178 simulation seconds; rAF intervals include display/vsync scheduling and are not draw duration.',
    regression, backgroundEvents, results: {energy: model.created, completed: model.completed, tick},
    timings: Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, summary(values)])),
    // Raw intervals allow analysis for the actual device refresh rate, without inventing a universal dropped-frame threshold.
    samples,
  };
  $('report').textContent = JSON.stringify({...results, samples: '(included in download)'}, null, 2);
  $('status').textContent = `Finished. Regression: ${regression}. Background events: ${backgroundEvents}.`;
  $('download').disabled = false;
  document.title = `${regression === 'PASS' ? 'PASS' : 'FAIL'} — Lifestream profile`;
}
function frame(now) {
  if (!running) return;
  if (document.hidden) { last = 0; requestAnimationFrame(frame); return; }
  const interval = last ? now - last : 0;
  last = now;
  const boss = model.t >= BOSS_START - 1 && model.t <= BOSS_START + 8;
  if (interval) { samples.rafInterval.push(interval); if (boss) samples.bossRafInterval.push(interval); }
  accumulator += Math.min(.1, interval / 1000);
  while (accumulator >= DT && !model.finished) {
    while (trace.actions[actionIndex]?.tick === tick) actions.push(applyAction(model, trace.actions[actionIndex++]));
    const inBoss = model.t >= BOSS_START - 1 && model.t <= BOSS_START + 8;
    const start = performance.now();
    model.step(DT);
    const duration = performance.now() - start;
    samples.step.push(duration); if (inBoss) samples.bossStep.push(duration);
    tick++; accumulator -= DT;
    // Invariant checking is outside the timed simulation section.
    checkEnergy(model);
    if (checkpointTicks.has(tick)) checkpoints.push(snapshot(model, tick));
  }
  if (now - lastDraw >= 1000 / 30 || model.finished) {
    const start = performance.now(); renderer.render(); const duration = performance.now() - start;
    samples.draw.push(duration); if (boss) samples.bossDraw.push(duration);
    lastDraw = now;
  }
  $('status').textContent = `Simulation ${model.t.toFixed(1)}s / 195.5s · ${model.phase()}`;
  if (model.finished) { running = false; finish(); }
  else requestAnimationFrame(frame);
}
$('start').addEventListener('click', () => {
  // Presentation must not mutate the simulation (also guards profiling validity).
  const before = JSON.stringify(state(model)); renderer.render();
  if (JSON.stringify(state(model)) !== before) throw new Error('Renderer mutated model');
  checkpoints.push(snapshot(model, 0));
  $('start').disabled = true; running = true; requestAnimationFrame(frame);
});
$('download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(results, null, 2)], {type: 'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = 'lifestream-profile.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
});
document.addEventListener('visibilitychange', () => { last = 0; accumulator = 0; if (running && document.hidden) backgroundEvents++; });
if (new URLSearchParams(location.search).has('autorun')) $('start').click();
