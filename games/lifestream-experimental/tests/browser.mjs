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
    const clear=CanvasRenderingContext2D.prototype.clearRect;
    window.__draws=0;
    CanvasRenderingContext2D.prototype.clearRect=function(...args){if(this.canvas.id==='world')window.__draws++;return clear.apply(this,args);};
    const fillText=CanvasRenderingContext2D.prototype.fillText;
    window.__tapDraws=[];
    CanvasRenderingContext2D.prototype.fillText=function(value,x,y,...args){if(value==='Tap')window.__tapDraws.push({x,y});return fillText.call(this,value,x,y,...args);};
    const text=Object.getOwnPropertyDescriptor(Node.prototype,'textContent');
    window.__hudUpdates=0;
    Object.defineProperty(Node.prototype,'textContent',{...text,set(value){if(this.id==='energy')window.__hudUpdates++;text.set.call(this,value);}});
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
  assert($('welcome').hidden && $('helpOverlay').hidden, 'The game must open directly to the world');
  assert(!doc.querySelector('.sidebar') && !doc.querySelector('.stage-center'), 'Simulation panels and opening prose must be removed');
  passed('static entry, CSS and native modules load under /games/lifestream-experimental/');

  const recordKey = 'lifestream-v4-records';
  const previousRecords = win.localStorage.getItem(recordKey);
  try {
    api.begin(73);
    win.__frame(1000); win.__frame(1100);
    assert(api.model.t === 0, 'Time must wait for first planting');
    const tap = win.__tapDraws.at(-1), startGeometry = api.geometry;
    assert(tap && tap.x === startGeometry.cx && Math.abs(tap.y - (startGeometry.cy - (startGeometry.inner + startGeometry.outer) / 2)) < 1e-9, 'Plain Tap cue must sit in the upper middle of the band');
    const tapsBeforeStart = win.__tapDraws.length;
    $('plant').click();
    assert(api.model.lives.length === 1 && api.model.t === 0, 'First planting starts at time zero');
    win.__frame(1200); win.__frame(1250);
    assert(win.__tapDraws.length === tapsBeforeStart, 'Tap cue must disappear after first planting');
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
    assert($('pause').getAttribute('aria-label') === 'Resume', 'Backgrounding must require explicit resume');
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
    const {cx,cy,inner}=api.geometry;
    const point = {clientX: rect.left + cx, clientY: rect.top + cy - inner};
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
    api.model.created=450; api.pause(); $('pause').click();
    const sanctuary=$('sanctuaryButton'),capture=sanctuary.setPointerCapture;
    sanctuary.setPointerCapture=()=>{}; // Synthetic events have no native active pointer.
    try {
      const button=sanctuary.getBoundingClientRect();
      sanctuary.dispatchEvent(new win.PointerEvent('pointerdown',{pointerId:11,button:0,clientX:button.left+20,clientY:button.top+20}));
      sanctuary.dispatchEvent(new win.PointerEvent('pointermove',{pointerId:11,...point,cancelable:true}));
      sanctuary.dispatchEvent(new win.PointerEvent('pointerup',{pointerId:11,...point,cancelable:true}));
      sanctuary.click();
      assert(api.model.sanctuaries.length===3 && sanctuary.getAttribute('aria-pressed')==='false', 'Dock drag must deploy once and suppress its follow-up click');
      api.model.created=600; api.pause(); $('pause').click();
      sanctuary.dispatchEvent(new win.PointerEvent('pointerdown',{pointerId:12,button:0,clientX:button.left+20,clientY:button.top+20}));
      sanctuary.dispatchEvent(new win.PointerEvent('pointermove',{pointerId:12,...point,cancelable:true}));
      sanctuary.dispatchEvent(new win.PointerEvent('pointercancel',{pointerId:12}));
      assert(api.model.sanctuaries.length===3 && sanctuary.getAttribute('aria-pressed')==='false', 'Cancelled dock drag must not deploy');
    } finally { sanctuary.setPointerCapture=capture; }
    // Avoid requesting native fullscreen in an automated test; test the viewport fallback.
    $('stage').requestFullscreen = () => Promise.reject(new Error('Test viewport fallback'));
    $('help').click(); $('art').click();
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

    api.begin(73); api.pause(); win.__frame(10000);
    const beforeBurst = win.__draws, beforeTime = api.model.t;
    const portrait = canvas.getBoundingClientRect();
    const geometry=api.geometry;
    const hover = {clientX: portrait.left + geometry.cx + geometry.inner, clientY: portrait.top + geometry.cy};
    for (let i = 0; i < 100; i++) canvas.dispatchEvent(new win.PointerEvent('pointermove', {...hover, bubbles: true}));
    assert(Math.abs(api.selection - Math.PI / 2) < 1e-9, 'Selection must update immediately during input bursts');
    assert(win.__draws === beforeBurst, 'Pointer events must not draw synchronously');
    win.__frame(10010);
    assert(win.__draws === beforeBurst, 'Dirty input must respect draw cadence');
    win.__frame(10040);
    assert(win.__draws === beforeBurst + 1, 'Input burst must coalesce into one draw');
    const idleHud = win.__hudUpdates;
    win.__frame(10080);
    assert(win.__draws === beforeBurst + 1 && api.model.t === beforeTime, 'Idle paused frames must neither draw nor simulate');
    win.__frame(10200);
    assert(win.__hudUpdates === idleHud && win.__draws === beforeBurst + 1, 'Idle paused frames must not repeatedly rewrite the HUD or draw');
    canvas.dispatchEvent(new win.PointerEvent('pointermove', {...hover, bubbles: true}));
    win.__hidden(true); win.__frame(10240);
    assert(win.__draws === beforeBurst + 1, 'Hidden pages must not draw dirty input');
    win.__hidden(false); win.__frame(10300);
    assert(win.__draws === beforeBurst + 2, 'Dirty state must draw once after foregrounding');
    passed('100 pointer events coalesce into one draw; paused idle and hidden frames skip drawing');

    for (const [width,height] of [[320,568],[390,844],[768,1024],[1440,900],[2560,1440],[3840,2160],[844,390],[390,844]]) {
      frame.style.width=width+'px'; frame.style.height=height+'px';
      await new Promise(resolve=>setTimeout(resolve,0)); win.dispatchEvent(new win.Event('resize'));
      const stage=$('stage').getBoundingClientRect(),hud=$('gameHud').getBoundingClientRect(),controls=$('gameControls').getBoundingClientRect(),g=api.geometry;
      assert(Math.abs(stage.height-height)<1 && Math.abs(stage.width-width)<1, `Playfield must fill ${width}x${height}`);
      assert(doc.documentElement.scrollWidth<=width+1 && doc.documentElement.scrollHeight<=height+1, `Game must not scroll at ${width}x${height}`);
      assert(g.cy-g.outer>=hud.bottom-stage.top && g.cy+g.outer<=controls.top-stage.top, `Ring must clear HUD and controls at ${width}x${height}`);
      assert(Math.abs(g.inner/g.outer-.60)<1e-9, `World plane must keep its smaller display ratio at ${width}x${height}`);
      const left=Math.max(hud.left,controls.left)-stage.left,right=Math.min(hud.right,controls.right)-stage.left;
      assert(g.cx-g.outer-10>=left && g.cx+g.outer+10<=right, `World and current traces must stay inside the HUD column at ${width}x${height}`);
      assert(Math.abs(g.cx-(left+right)/2)<1, `World must align with the HUD center at ${width}x${height}`);
      assert(Math.abs(canvas.getBoundingClientRect().width-width)<1, `Background canvas must still span ${width}px`);
      for (const button of $('gameControls').querySelectorAll('button')) {
        const b=button.getBoundingClientRect();
        assert(b.width>=44 && b.height>=44 && b.left>=0 && b.right<=width && b.bottom<=height, `Controls must fit with touch targets at ${width}x${height}`);
      }
    }
    passed('full-screen layout has no scrolling or ring/control overlap across phone, tablet, landscape and desktop');

    api.begin(73); $('plant').click(); api.pause();
    $('help').click();
    assert($('stage').inert && !$('helpOverlay').hidden, 'Menu must isolate the paused game from focus');
    $('worldDetails').open=true;
    await new Promise(resolve=>setTimeout(resolve,0));
    assert($('population').textContent.includes('seed'), 'Detailed readouts must remain available on demand');
    $('chooseWorld').click();
    assert(!$('welcome').hidden && $('helpOverlay').hidden, 'World selection must be reachable from the menu');
    $('cancelWorld').click();
    assert($('welcome').hidden && !$('stage').inert && $('pause').getAttribute('aria-label')==='Resume', 'Cancel must restore a previously paused world');
    $('help').click(); $('chooseWorld').click(); $('worldSeed').value='81'; $('begin').click();
    assert(api.model.t===0 && api.model.actions.length===0 && $('runSeed').textContent==='World 81', 'World selection must reset to a fresh unstarted world');
    $('plant').click(); api.pause();
    for (const [time,text] of [[182,'3'],[183,'2'],[184,'1'],[185,'Planting complete']]) {
      api.model.t=time; api.step(0); $('pause').click();
      assert($('stageStatus').textContent===text, `Cutoff cue must use simulation time at ${time}`);
    }
    assert($('plant').disabled, 'Plant control must close at the model cutoff');
    passed('menu details, world picker/cancel and planting cutoff stay usable without changing game rules');
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
  // Count actual sink disks/outlines drawn, including the stagger's last arrivals.
  scene = new win.LifestreamGame.Model(73);
  const context = doc.getElementById('world').getContext('2d');
  const omenContext = doc.getElementById('omens').getContext('2d');
  const originalFill = context.fill, originalStroke = omenContext.stroke;
  let disks = 0, outlines = 0;
  context.fill = function(...args) {
    if (this.fillStyle === '#030208' || this.fillStyle === '#313a3a') disks++;
    return originalFill.apply(this, args);
  };
  omenContext.stroke = function(...args) { outlines++; return originalStroke.apply(this, args); };
  const {CONFIG} = win.LifestreamGame;
  const bossStart = CONFIG.sunrise + CONFIG.disturbance - CONFIG.bossDuration;
  const firstWarning = bossStart - CONFIG.bossWarningLead;
  const checkAppearance = (time, expected, expectedOutlines) => {
    scene.t = time; scene.updateSinks(); disks = 0; outlines = 0;
    renderer.render();
    assert(disks === expected, `Expected ${expected} boss disks at ${time}, got ${disks}`);
    if (expectedOutlines !== undefined) assert(outlines === expectedOutlines, `Expected ${expectedOutlines} activation outlines at ${time}, got ${outlines}`);
  };
  try {
    checkAppearance(firstWarning, 0);
    assert(doc.getElementById('bossWarning').style.visibility === 'visible', 'Boss must retain the single shared warning');
    checkAppearance(bossStart - .001, 0);
    checkAppearance(bossStart, 1, 1);
    checkAppearance(bossStart + CONFIG.bossInterval - 1e-6, 1);
    checkAppearance(bossStart + CONFIG.bossInterval, 2);
    checkAppearance(bossStart + 7.5 * CONFIG.bossInterval, 8);
    checkAppearance(bossStart + 15 * CONFIG.bossInterval - 1e-6, 15);
    checkAppearance(bossStart + 15 * CONFIG.bossInterval, 16);
    checkAppearance(bossStart + .71, 16, 5);
    checkAppearance(bossStart + 1, 16, 0);
    checkAppearance(CONFIG.sunrise + CONFIG.disturbance - .001, 16);
    checkAppearance(CONFIG.sunrise + CONFIG.disturbance, 0, 0);
    const matchMedia = win.matchMedia;
    try {
      win.matchMedia = () => ({matches: true});
      checkAppearance(bossStart, 1);
      checkAppearance(bossStart + 7.5 * CONFIG.bossInterval, 8);
      checkAppearance(CONFIG.sunrise + CONFIG.disturbance, 0);
    } finally { win.matchMedia = matchMedia; }
  } finally { context.fill = originalFill; omenContext.stroke = originalStroke; }
  passed('boss disks enter every 30 ms with shared warning/expiry, including reduced motion and late activation outlines');
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
