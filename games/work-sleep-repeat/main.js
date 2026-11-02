import { EnergyRushGame, LEVELS, PERIODS, POWERUPS } from './engine.js';

const $ = (id) => document.getElementById(id);
const ui = {
  menu: $('menuOverlay'), pause: $('pauseOverlay'), end: $('endOverlay'),
  levelOptions: $('levelOptions'), selectedLevelInfo: $('selectedLevelInfo'),
  bank: $('bankValue'), best: $('bestValue'), time: $('timeValue'), level: $('levelName'), stage: $('stageValue'), tempo: $('tempoValue'),
  energy: $('energyValue'), energyFill: $('energyFill'), energyProgress: $('energyProgress'), energyDot: $('energyDot'),
  focus: $('focusValue'), focusPips: $('focusPips'), powerTitle: $('powerTitle'), powerDescription: $('powerDescription'),
  status: $('liveStatus'), statusText: $('liveStatusText'), work: $('workButton'), workText: $('workButtonText'), mode: $('modeIndicator'),
  activate: $('activateButton'), activateText: $('activateText'), missionList: $('missionList'), missionCount: $('missionCount'),
  seed: $('seedLabel'), toast: $('toast'), timeline: $('timelineCanvas'),
};

const STORAGE_KEY = 'energy-rush-v1';
function readSave() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}
let saved = readSave();
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { /* Private browsing may block storage. */ }
}
function levelProgress(id) {
  if (!saved[id]) saved[id] = { best: 0, stars: [] };
  return saved[id];
}
function money(n) { return '$' + Math.floor(Math.max(0, n)).toLocaleString('en-US'); }
function clock(seconds) { const s = Math.max(0, Math.ceil(seconds)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function newSeed() {
  if (globalThis.crypto?.getRandomValues) {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0];
  }
  return (Math.random() * 2 ** 32) >>> 0;
}

let game = null;
let selected = 0;
let keyHeld = false;
let pointerHeld = false;
let lastFrame = performance.now();
let lastMissionRender = -Infinity;
let readNotifications = 0;
let toastTimeout = 0;
let muted = true;
let audioContext = null;

function sound(kind) {
  if (muted) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    const now = audioContext.currentTime;
    const notes = kind === 'stage' ? [540, 760, 960] : kind === 'success' ? [510, 680] : kind === 'warn' ? [220, 155] : [690];
    notes.forEach((freq, i) => {
      const osc = audioContext.createOscillator();
      const amp = audioContext.createGain();
      osc.type = kind === 'warn' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now + i * .08);
      amp.gain.setValueAtTime(.0001, now + i * .08);
      amp.gain.exponentialRampToValueAtTime(.075, now + i * .08 + .014);
      amp.gain.exponentialRampToValueAtTime(.0001, now + i * .08 + .16);
      osc.connect(amp); amp.connect(audioContext.destination);
      osc.start(now + i * .08); osc.stop(now + i * .08 + .18);
    });
  } catch { /* Sound is optional. */ }
}
function toast(message, kind = 'info') {
  ui.toast.textContent = message;
  ui.toast.className = 'toast visible' + (kind === 'warn' ? ' warn' : kind === 'stage' ? ' stage' : '');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => ui.toast.classList.remove('visible'), 2300);
}
function showMenu() {
  keyHeld = pointerHeld = false;
  if (game?.status === 'running') game.status = 'paused';
  game = null;
  ui.menu.classList.remove('hidden');
  ui.pause.classList.add('hidden');
  ui.end.classList.add('hidden');
  renderLevelOptions();
}
function renderLevelOptions() {
  ui.levelOptions.innerHTML = '';
  LEVELS.forEach((level, i) => {
    const progress = levelProgress(level.id);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'level-option' + (selected === i ? ' active' : '');
    card.setAttribute('aria-pressed', String(selected === i));
    const stars = level.challenges.map((challenge) => progress.stars.includes(challenge.id) ? '★' : '☆').join(' ');
    card.innerHTML = `<div class="level-index">${level.eyebrow.split('/')[0]}</div><div class="level-title">${level.name}</div><div class="level-duration">${clock(level.duration)} MAX</div><div class="level-stars">${stars}</div>`;
    card.addEventListener('click', () => { selected = i; renderLevelOptions(); });
    ui.levelOptions.append(card);
  });
  const level = LEVELS[selected];
  const best = levelProgress(level.id).best;
  ui.selectedLevelInfo.innerHTML = `<b>${level.name}:</b> ${level.description}<br><span style="color:#76abbb">BEST: ${money(best)} · ${level.challenges.length} missions available</span>`;
}
function startRun(seed = newSeed()) {
  const level = LEVELS[selected];
  game = new EnergyRushGame(level, seed);
  keyHeld = pointerHeld = false;
  readNotifications = 0;
  lastMissionRender = -Infinity;
  lastFrame = performance.now();
  ui.menu.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.end.classList.add('hidden');
  ui.level.textContent = level.name.toUpperCase();
  ui.seed.textContent = 'RUN ' + seed.toString(16).padStart(8, '0').toUpperCase();
  renderMissions();
  render();
  sound('start');
}
function pauseRun() {
  if (!game || game.status !== 'running') return;
  game.status = 'paused';
  keyHeld = pointerHeld = false;
  game.workHeld = false;
  ui.pause.classList.remove('hidden');
  ui.work.classList.remove('pressed');
}
function resumeRun() {
  if (!game || game.status !== 'paused') return;
  game.status = 'running';
  lastFrame = performance.now();
  ui.pause.classList.add('hidden');
}
function endRun() {
  if (!game) return;
  const level = game.level;
  const progress = levelProgress(level.id);
  const final = Math.floor(game.bank);
  const record = final > progress.best;
  progress.best = Math.max(progress.best, final);
  for (const id of game.challengeDone) if (!progress.stars.includes(id)) progress.stars.push(id);
  persist();
  $('resultEyebrow').textContent = game.endReason === 'Time complete' ? 'SHIFT COMPLETE' : 'END OF SHIFT';
  $('resultTitle').innerHTML = game.endReason === 'Time complete' ? 'CLOCKED OUT<span>.</span>' : 'GAME OVER<span>.</span>';
  $('resultReason').textContent = game.endReason === 'Time complete' ? 'You made it to the end of the shift.' : game.endReason + '. Try a different rhythm.';
  $('resultScore').textContent = money(final);
  $('resultTime').textContent = `${clock(game.realTime)} / ${clock(level.duration)}`;
  $('resultBest').textContent = money(progress.best) + (record ? ' ★' : '');
  $('resultMissions').textContent = `${game.challengeDone.size} / ${level.challenges.length}`;
  $('resultChallengeList').innerHTML = level.challenges.map((c) => `<div class="result-challenge ${game.challengeDone.has(c.id) ? 'complete' : ''}"><span>${game.challengeDone.has(c.id) ? '✓' : '○'} ${c.label}</span><strong>${game.challengeDone.has(c.id) ? 'COMPLETE' : 'NOT YET'}</strong></div>`).join('');
  $('resultSeed').textContent = `LAYOUT SEED ${game.seed.toString(16).padStart(8, '0').toUpperCase()} · Replay to practice the same events`;
  ui.end.classList.remove('hidden');
  sound(game.endReason === 'Time complete' ? 'success' : 'warn');
  renderLevelOptions();
}

function activate() {
  if (!game) return;
  const result = game.activatePowerup();
  if (!result.ok) { toast(result.message, 'warn'); sound('warn'); }
  else sound('success');
  render();
}

$('startButton').addEventListener('click', () => startRun());
$('newRunButton').addEventListener('click', () => startRun());
$('sameRunButton').addEventListener('click', () => { if (game) startRun(game.seed); });
$('chooseLevelButton').addEventListener('click', showMenu);
$('resumeButton').addEventListener('click', resumeRun);
$('pauseQuitButton').addEventListener('click', showMenu);
$('pauseButton').addEventListener('click', () => { if (game?.status === 'paused') resumeRun(); else pauseRun(); });
$('activateButton').addEventListener('click', activate);
$('soundButton').addEventListener('click', () => {
  muted = !muted;
  $('soundButton').textContent = muted ? '♪' : '♫';
  $('soundButton').setAttribute('aria-label', muted ? 'Enable sound' : 'Mute sound');
  if (!muted) sound('success');
});

ui.work.addEventListener('pointerdown', (event) => {
  if (game?.status !== 'running') return;
  if (event.button !== undefined && event.button !== 0 && event.pointerType === 'mouse') return;
  event.preventDefault();
  pointerHeld = true;
  try { ui.work.setPointerCapture(event.pointerId); } catch { /* Capture is best effort. */ }
});
function releasePointer(event) {
  pointerHeld = false;
  if (event?.cancelable && event.type === 'pointerup') event.preventDefault();
}
ui.work.addEventListener('pointerup', releasePointer);
ui.work.addEventListener('pointercancel', releasePointer);
ui.work.addEventListener('lostpointercapture', releasePointer);
ui.work.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (['Space', 'KeyE', 'KeyP', 'Escape'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (e.repeat) return;
    if (game?.status === 'running') pauseRun(); else if (game?.status === 'paused') resumeRun();
    return;
  }
  if (game?.status !== 'running') return;
  if (e.code === 'Space') keyHeld = true;
  if (e.code === 'KeyE' && !e.repeat) activate();
});
window.addEventListener('keyup', (e) => { if (e.code === 'Space') { e.preventDefault(); keyHeld = false; } });
window.addEventListener('blur', () => pauseRun());
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseRun(); });

function renderMissions() {
  if (!game) return;
  const level = game.level;
  ui.missionCount.textContent = `${game.challengeDone.size}/${level.challenges.length}`;
  ui.missionList.innerHTML = '';
  for (const c of level.challenges) {
    const done = game.challengeDone.has(c.id);
    const val = Math.min(c.target, game.metrics[c.metric]);
    const percent = Math.min(100, Math.round(val / c.target * 100));
    const row = document.createElement('div');
    row.className = 'mission-row' + (done ? ' done' : '');
    const progress = c.metric === 'cleanFinish' ? (game.metrics.exhausted ? 'FAILED' : 'IN PROGRESS') : `${Math.floor(val).toLocaleString('en-US')}/${c.target.toLocaleString('en-US')}`;
    row.innerHTML = `<div class="mission-check">${done ? '✓' : '○'}</div><div><div class="mission-label"><span>${c.label}</span><span class="mission-progress">${done ? 'DONE' : progress}</span></div><div class="mission-meter"><div style="width:${percent}%"></div></div></div>`;
    ui.missionList.append(row);
  }
}

function render() {
  if (!game) { renderTimeline(null); return; }
  ui.bank.textContent = money(game.bank);
  ui.best.textContent = money(Math.max(levelProgress(game.level.id).best, game.bank));
  ui.time.textContent = clock(game.remaining);
  ui.stage.textContent = String(game.stage).padStart(2, '0');
  ui.tempo.textContent = `${game.speed.toFixed(2)}× SPEED`;
  ui.energy.textContent = Math.ceil(game.energy).toString();
  ui.energyFill.style.width = `${game.energy.toFixed(2)}%`;
  ui.energyProgress.setAttribute('aria-valuenow', Math.round(game.energy));
  ui.energyFill.classList.toggle('low', game.energy < 20);
  ui.energyDot.classList.toggle('low', game.energy < 20);
  ui.focus.textContent = String(game.focus);
  ui.focusPips.textContent = Array.from({ length: 5 }, (_, i) => game.focus >= (i + 1) * 6 ? '◆' : '◇').join(' ');
  if (game.inventory) {
    const p = POWERUPS[game.inventory];
    ui.powerTitle.textContent = p.label.toUpperCase();
    ui.powerTitle.classList.add('filled');
    ui.powerDescription.textContent = `${p.description} · ${p.cost} focus`;
    ui.activateText.textContent = `ACTIVATE · ${p.cost} FOCUS`;
    ui.activate.disabled = game.status !== 'running' || game.focus < p.cost;
  } else {
    ui.powerTitle.textContent = 'EMPTY SLOT';
    ui.powerTitle.classList.remove('filled');
    ui.powerDescription.textContent = 'Work through a diamond to collect.';
    ui.activateText.textContent = 'USE POWERUP';
    ui.activate.disabled = true;
  }
  const held = game.working;
  ui.work.classList.toggle('pressed', held);
  ui.workText.textContent = held ? 'WORKING!' : 'HOLD TO WORK';
  ui.mode.textContent = held ? 'EARNING DOLLARS' : 'RECOVERING';
  ui.mode.classList.toggle('work', held);
  const duty = game.currentDuty;
  const active = new Set(game.activePeriods.map((p) => p.type));
  let status = 'Plan ahead: work, rest, and protect your energy.';
  let className = 'live-status';
  let symbol = '◎';
  if (duty) { status = 'MANDATORY SHIFT — KEEP HOLDING!'; className += ' urgent'; symbol = '!'; }
  else if (game.energy < 20) { status = 'EXHAUSTED — rest before your next shift!'; className += ' urgent'; symbol = '!'; }
  else if (active.has('night')) { status = 'NIGHT — resting restores energy 2.35× faster.'; className += ' night'; symbol = '☾'; }
  else if (active.has('hazard')) { status = 'OVERHEAT — working uses extra energy.'; className += ' urgent'; symbol = '▲'; }
  else if (active.has('golden')) { status = 'PAYDAY — earn double dollars while working!'; symbol = '$'; }
  else if (active.has('focus')) { status = 'FLOW — working generates bonus focus.'; symbol = '✦'; }
  else if (active.has('quiet')) { status = 'QUIET — reduced pay; extra recovery when resting.'; symbol = '☁'; }
  if (game.activeEffect) status += `  ${POWERUPS[game.activeEffect.type].label}: ${Math.ceil(game.activeEffect.remaining)}s left.`;
  ui.status.className = className;
  ui.status.firstElementChild.textContent = symbol;
  ui.statusText.textContent = status;
  renderTimeline(game);
}

const canvas = ui.timeline;
const ctx = canvas.getContext('2d');
function renderTimeline(g) {
  if (!ctx) return;
  const r = canvas.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const actualWidth = Math.max(1, Math.round(r.width * dpr));
  const actualHeight = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== actualWidth || canvas.height !== actualHeight) { canvas.width = actualWidth; canvas.height = actualHeight; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = r.width; const h = r.height;
  const x0 = 32; const x1 = w - 12; const width = x1 - x0;
  ctx.clearRect(0, 0, w, h);
  const laneY = [24, h * .44, h * .69];
  const laneH = [27, 25, 23];
  const titles = ['PERIODS', 'BOOSTS', 'DROPS'];
  laneY.forEach((y, i) => {
    ctx.fillStyle = 'rgba(106,150,188,.085)';
    ctx.fillRect(x0, y, width, laneH[i]);
    ctx.fillStyle = '#627d9c'; ctx.textAlign = 'left'; ctx.font = 'bold 9px system-ui';
    ctx.fillText(titles[i], x0 + 4, y - 6);
  });
  ctx.strokeStyle = 'rgba(162,185,215,.14)'; ctx.lineWidth = 1;
  for (let t = 1; t <= 10; t++) {
    const x = x0 + t * width / 10;
    ctx.beginPath(); ctx.moveTo(x, 18); ctx.lineTo(x, h - 14); ctx.stroke();
    if (t % 2 === 0 && t < 10) { ctx.fillStyle = '#6c84a1'; ctx.textAlign = 'center'; ctx.font = '9px system-ui'; ctx.fillText(`${t}s`, x, h - 6); }
  }
  if (g) {
    const toX = (worldTime) => x0 + (worldTime - g.clock) / (10 * g.speed) * width;
    const farFuture = g.clock + 10 * g.speed;
    ctx.save(); ctx.beginPath(); ctx.rect(x0, 18, width, h - 31); ctx.clip();
    for (const p of g.periods) {
      if (p.end <= g.clock || p.start > farFuture) continue;
      const config = PERIODS[p.type];
      const a = Math.max(x0, toX(p.start)); const b = Math.min(x1, toX(p.end));
      const y = laneY[config.lane] + 1;
      if (b <= a) continue;
      ctx.globalAlpha = p.type === 'night' ? .73 : .9;
      ctx.fillStyle = config.color; ctx.fillRect(a, y, Math.max(1, b - a - 1), laneH[config.lane] - 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.type === 'golden' || p.type === 'focus' ? '#10202a' : '#ffffff';
      ctx.textAlign = 'left'; ctx.font = '800 10px system-ui';
      const text = config.short;
      if (b - a > ctx.measureText(text).width + 8) ctx.fillText(text, a + 5, y + laneH[config.lane] / 2 + 3);
    }
    for (const p of g.pickups) {
      if (p.state !== 'upcoming' || p.at <= g.clock || p.at > farFuture) continue;
      const x = toX(p.at);
      const y = laneY[2] + 11;
      ctx.fillStyle = '#7cf2d9';
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillRect(-8, -8, 16, 16); ctx.restore();
      ctx.fillStyle = '#123c42'; ctx.textAlign = 'center'; ctx.font = '900 12px system-ui';
      ctx.fillText(POWERUPS[p.type].symbol, x, y + 4);
    }
    ctx.restore();
  }
  ctx.strokeStyle = '#75e7ce'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0, 17); ctx.lineTo(x0, h - 14); ctx.stroke();
  ctx.fillStyle = '#75e7ce'; ctx.beginPath(); ctx.moveTo(x0 - 4, 17); ctx.lineTo(x0 + 4, 17); ctx.lineTo(x0, 23); ctx.closePath(); ctx.fill();
}

function loop(now) {
  const dt = Math.min(.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (game?.status === 'running') {
    game.workHeld = keyHeld || pointerHeld;
    game.update(dt);
    for (; readNotifications < game.notifications.length; readNotifications++) {
      const item = game.notifications[readNotifications];
      toast(item.message, item.kind);
      sound(item.kind === 'stage' ? 'stage' : 'success');
    }
    if (game.status === 'ended') endRun();
  }
  if (game) {
    render();
    if (now - lastMissionRender >= 140) { renderMissions(); lastMissionRender = now; }
  } else renderTimeline(null);
  requestAnimationFrame(loop);
}

renderLevelOptions();
renderTimeline(null);
requestAnimationFrame(loop);
