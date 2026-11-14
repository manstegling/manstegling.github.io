import {replay, snapshot, compare, state} from './replay-core.mjs';

const report = document.getElementById('report');
const lines = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const passed = message => { lines.push(`PASS ${message}`); report.textContent = lines.join('\n'); };
const frame = document.getElementById('game');
const errors = [];

try {
  const html = await fetch('../index.html').then(r => { if (!r.ok) throw new Error(`Entry HTTP ${r.status}`); return r.text(); });
  // Control browser time without modifying production modules or sleeping through a run.
  // srcdoc inherits this origin; base preserves the real deployment path for imports/CSS.
  const prelude = `<base href="${new URL('../', location.href)}"><script>
    const callbacks=[];
    window.requestAnimationFrame=callback=>{callbacks.push(callback);return callbacks.length;};
    window.__frame=now=>{const callback=callbacks.shift();if(!callback)throw new Error('Missing animation callback');callback(now);};
    let hidden=false;
    Object.defineProperty(document,'hidden',{get:()=>hidden,configurable:true});
    window.__hidden=value=>{hidden=value;document.dispatchEvent(new Event('visibilitychange'));};
    window.addEventListener('error',event=>parent.postMessage({lifestreamTestError:event.message},location.origin));
    window.addEventListener('unhandledrejection',event=>parent.postMessage({lifestreamTestError:String(event.reason)},location.origin));
  <\/script>`;
  window.addEventListener('message', event => {
    if (event.source === frame.contentWindow && event.data?.lifestreamTestError) errors.push(event.data.lifestreamTestError);
  });
  const loaded = new Promise(resolve => frame.addEventListener('load', resolve, {once: true}));
  frame.srcdoc = html.replace('<head>', `<head>${prelude}`);
  await loaded;
  const win = frame.contentWindow, doc = win.document, api = win.lifestream;
  const $ = id => doc.getElementById(id);
  assert(api && win.LifestreamGame, 'Both compatibility APIs must load');
  assert($('world').width > 0 && $('world').height > 0, 'Canvas must be sized');
  assert(win.getComputedStyle($('stage')).position === 'relative', 'External CSS must load');
  passed('static entry, CSS and native modules load under /games/lifestream/');

  const recordKey = 'lifestream-v4-records';
  const previousRecords = win.localStorage.getItem(recordKey);
  try {
    api.begin(73);
    win.__frame(1000); win.__frame(1100);
    assert(api.model.t === 0, 'Time must wait for first planting');
    $('plant').click();
    assert(api.model.lives.length === 1 && api.model.t === 0, 'First planting starts at time zero');
    win.__frame(1200); win.__frame(1250);
    assert(Math.abs(api.model.t - .05) < 1e-9, 'Frame must advance three fixed ticks');
    win.__frame(2250);
    assert(api.model.t <= .15 + 1e-9, 'Large elapsed frames must retain the 100ms cap');
    passed('first-plant start, 60 Hz simulation and elapsed-frame cap');

    api.pause();
    const pausedTime = api.model.t;
    win.__frame(2300); win.__frame(2400);
    assert(api.model.t === pausedTime, 'Pause must freeze simulation');
    $('pause').click();
    win.__frame(3000);
    assert(api.model.t === pausedTime, 'Resume must clear previous elapsed time');
    win.__frame(3050);
    assert(api.model.t > pausedTime, 'Resume must advance on subsequent frames');
    const beforeBackground = api.model.t;
    win.__hidden(true); win.__frame(3100);
    win.__hidden(false); win.__frame(5000);
    assert(api.model.t === beforeBackground, 'Backgrounding must pause without automatic catch-up');
    assert($('pause').textContent === 'Resume', 'Backgrounding must require explicit resume');
    passed('pause/resume and background/foreground discard accumulated time');

    $('pause').click();
    $('help').click();
    const helpTime = api.model.t;
    win.__frame(5100);
    assert(api.model.t === helpTime, 'Help must pause');
    $('closeHelp').click();
    win.__frame(6000);
    assert(api.model.t === helpTime, 'Closing help clears elapsed time');
    const originalSelection = api.selection;
    doc.dispatchEvent(new win.KeyboardEvent('keydown', {code: 'ArrowRight', bubbles: true}));
    assert(api.selection !== originalSelection, 'Keyboard selection must rotate');
    passed('help pause/restoration and keyboard selection');

    // Actual canvas click uses the same geometric selection path as touch-generated clicks.
    api.begin(73);
    const canvas = $('world'), rect = canvas.getBoundingClientRect();
    const outer = Math.min(rect.width * .445, (rect.height - 90) * .5);
    const point = {clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 - outer * .65};
    canvas.dispatchEvent(new win.MouseEvent('click', {...point, bubbles: true}));
    assert(api.model.lives.length === 1, 'Canvas click must plant');
    api.model.created = 150; // Isolated UI eligibility setup, never used as a conservation fixture.
    api.pause(); $('pause').click();
    $('sanctuaryButton').click();
    assert($('sanctuaryButton').getAttribute('aria-pressed') === 'true', 'Sanctuary must arm');
    canvas.dispatchEvent(new win.MouseEvent('click', {...point, bubbles: true}));
    assert(api.model.sanctuaries.length === 1, 'Armed sanctuary click must deploy once');
    api.model.created = 300;
    canvas.dispatchEvent(new win.MouseEvent('contextmenu', {...point, bubbles: true, cancelable: true}));
    assert(api.model.sanctuaries.length === 2, 'Right-click must deploy');
    // Avoid requesting native fullscreen in an automated test; test the viewport fallback.
    $('stage').requestFullscreen = () => Promise.reject(new Error('Test viewport fallback'));
    $('art').click();
    assert(doc.body.classList.contains('art-mode'), 'Art view must enter');
    doc.dispatchEvent(new win.KeyboardEvent('keydown', {code: 'Escape', bubbles: true}));
    assert(!doc.body.classList.contains('art-mode'), 'Escape must exit art view');
    passed('canvas planting, sanctuary arm/deploy, right-click and Art view fallback');

    api.begin(74);
    assert(api.model.t === 0 && api.model.actions.length === 0 && api.model.sanctuaries.length === 0, 'Restart must reset model state');
    assert($('runSeed').textContent === 'World 74', 'Restart must update displayed seed');
    $('plant').click();
    api.pause();
    const preserved = JSON.stringify({lives: 999, energy: 99999});
    win.localStorage.setItem(recordKey, preserved);
    api.step(191);
    assert(api.model.endingAt === 191 && !api.model.finished && $('results').hidden, 'Gathering must precede results');
    api.step(4.5);
    assert(api.model.finished && !$('results').hidden, 'Results must follow the full ending');
    assert(win.localStorage.getItem(recordKey) === preserved, 'Existing higher records must survive');
    $('replay').click();
    assert(api.model.t === 0 && api.model.actions.length === 0 && $('results').hidden, 'Replay must reset after results');
    passed('restart, gathering, ending duration, records and replay');

    frame.style.width = '390px'; frame.style.height = '844px';
    // ResizeObserver is asynchronous; resize event exercises the same production function.
    await new Promise(resolve => setTimeout(resolve, 0));
    win.dispatchEvent(new win.Event('resize'));
    assert($('world').getBoundingClientRect().width < 400, 'Portrait canvas must resize');
    assert($('world').width > 0, 'Portrait backing canvas must remain valid');
    passed('portrait layout resizes with CSS and canvas assets intact');
  } finally {
    if (previousRecords === null) win.localStorage.removeItem(recordKey);
    else win.localStorage.setItem(recordKey, previousRecords);
  }

  const [trace, baseline] = await Promise.all(['seed-73.trace.json', 'seed-73.baseline.json'].map(name => fetch(`./fixtures/${name}`).then(r => r.json())));
  // Import in the frame's realm so the renderer uses the production game's document.
  const {createRenderer} = await win.eval(`import(${JSON.stringify(new URL('../render.mjs', location.href).href)})`);
  let scene;
  const renderer = createRenderer({getState: () => ({game: scene, selected: .45, artMode: false, sanctuaryArmed: false, paused: true}), isOverlayOpen: () => false});
  renderer.resize();
  const drawTimes = [], bossDrawTimes = [], stepTimes = [], bossStepTimes = [];
  class TimedModel extends win.LifestreamGame.Model {
    step(dt) {
      const boss = this.t >= 169 && this.t <= 178;
      const start = performance.now(); super.step(dt); const duration = performance.now() - start;
      stepTimes.push(duration); if (boss) bossStepTimes.push(duration);
    }
  }
  const run = replay(TimedModel, trace, {onCheckpoint: (model, tick) => {
    scene = model;
    const before = JSON.stringify(state(model));
    for (let i = 0; i < 10; i++) {
      const start = performance.now(); renderer.render(); const duration = performance.now() - start;
      drawTimes.push(duration);
      if (tick >= 10199 && tick <= 10620) bossDrawTimes.push(duration);
    }
    assert(JSON.stringify(state(model)) === before, `Rendering must not mutate model at tick ${tick}`);
  }});
  compare(run.snapshots, baseline.snapshots);
  compare(run.events, baseline.events);
  compare(run.outcomes, baseline.outcomes);
  compare(snapshot(run.model, run.finalTick), baseline.final);
  passed('browser replay matches original Node baseline within documented float tolerances');
  passed('renderer leaves complete simulation state unchanged at all 17 checkpoints');
  const summarize = values => {
    const sorted = [...values].sort((a, b) => a - b);
    return {count: values.length, medianMs: sorted[Math.ceil(sorted.length * .5) - 1], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], p99Ms: sorted[Math.ceil(sorted.length * .99) - 1]};
  };
  const timing = {method: 'Synchronous throughput, portrait canvas, no presentation/vsync timing. Virtual-clock runs cannot measure duration; zero timings are unusable. Use profile.html for sustained device measurements.', userAgent: navigator.userAgent, step: summarize(stepTimes), bossStep: summarize(bossStepTimes), draw: summarize(drawTimes), bossDraw: summarize(bossDrawTimes)};
  assert(errors.length === 0, errors.join('\n'));
  report.textContent = `ALL PASS (${lines.length} groups)\n${lines.join('\n')}\n${JSON.stringify(timing, null, 2)}`;
  document.title = 'PASS — Lifestream browser checks';
} catch (error) {
  report.textContent = `FAIL\n${lines.join('\n')}\n${error.stack || error}\n${errors.join('\n')}`;
  document.title = 'FAIL — Lifestream browser checks';
}
