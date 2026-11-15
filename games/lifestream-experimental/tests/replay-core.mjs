// Test/development code only. Actions are applied before step `tick`, in file order.
export const ENERGY_TOLERANCE = 1e-8;

export function checkEnergy(model) {
  const totals = model.totals();
  for (const [name, value] of Object.entries(totals)) {
    if (!Number.isFinite(value)) throw new Error(`Non-finite ${name} at ${model.t}`);
    if (name !== 'error' && value < -ENERGY_TOLERANCE) throw new Error(`Negative ${name} at ${model.t}`);
  }
  if (Math.abs(totals.error) > ENERGY_TOLERANCE) throw new Error(`Conservation error ${totals.error} at ${model.t}`);
  for (const energy of model.q) {
    if (!Number.isFinite(energy) || energy < -ENERGY_TOLERANCE) throw new Error(`Invalid cell at ${model.t}: ${energy}`);
  }
  for (const life of model.lives) {
    if (!Number.isFinite(life.soul) || life.soul < -ENERGY_TOLERANCE) throw new Error(`Invalid soul at ${model.t}`);
  }
  return totals;
}

export function snapshot(model, tick) {
  const rows = [];
  for (let offset = 0; offset < model.q.length; offset += 144) {
    const row = model.q.slice(offset, offset + 144);
    rows.push({energy: row.reduce((a, b) => a + b, 0), min: Math.min(...row), max: Math.max(...row)});
  }
  return {
    tick, t: model.t, phase: model.phase(), totals: model.totals(), rows,
    rng: model.rng, hazardRng: model.hazardRng,
    born: model.born, completed: model.completed, deaths: model.deaths,
    embryoDeaths: model.embryoDeaths, gathered: model.gathered, gatheredEnergy: model.gatheredEnergy,
    earned: model.sanctuaryEarned(), available: model.sanctuaryAvailable(),
    sanctuaries: model.sanctuaries.map(s => ({...s})),
    sinks: model.sinks.map(s => ({id: s.id, neutralized: !!s.neutralized, destroyed: s.destroyed})),
    lives: model.lives.map(life => ({...life})),
    endingAt: model.endingAt, finished: model.finished,
    canPlant: model.canPlant(), canDeploy: model.canDeploySanctuary(),
  };
}

// Complete deterministic state for exact comparisons within one JS engine.
// Non-enumerable, derived sink physics is deliberately excluded.
export function state(model) {
  return JSON.parse(JSON.stringify(model));
}

export function applyAction(model, action) {
  const result = action.type === 'plant' ? model.plant(action.theta)
    : action.type === 'sanctuary' ? model.deploySanctuary(action.theta)
    : (() => { throw new Error(`Unknown action ${action.type}`); })();
  return {tick: action.tick, type: action.type, theta: action.theta, accepted: result !== null};
}

export function replay(Model, trace, {onCheckpoint = () => {}} = {}) {
  if (trace.dt !== 1 / 60) throw new Error('Trace must use the current fixed step');
  let previousTick = -1;
  for (const action of trace.actions) {
    if (!Number.isInteger(action.tick) || action.tick < previousTick || action.tick < 0 || !Number.isFinite(action.theta)) {
      throw new Error('Actions must have ordered integer ticks and finite angles');
    }
    previousTick = action.tick;
  }
  const model = new Model(trace.seed, trace.initial, trace.params);
  const checkpoints = new Set(trace.checkpoints);
  const snapshots = [], outcomes = [], events = [];
  let actionIndex = 0, tick = 0, maxError = 0, previousSinks = '';
  function capture() {
    if (checkpoints.has(tick)) {
      snapshots.push(snapshot(model, tick));
      onCheckpoint(model, tick);
    }
  }
  checkEnergy(model);
  capture();
  while (!model.finished && tick < trace.maxTicks) {
    while (trace.actions[actionIndex]?.tick === tick) outcomes.push(applyAction(model, trace.actions[actionIndex++]));
    const before = new Map(model.lives.map(l => [l.id, l.state]));
    model.step(trace.dt);
    tick++;
    const totals = checkEnergy(model);
    maxError = Math.max(maxError, Math.abs(totals.error));
    const after = new Map(model.lives.map(l => [l.id, l.state]));
    for (const [id, status] of after) if (before.get(id) !== status) events.push({tick, id, state: status});
    for (const [id] of before) if (!after.has(id)) events.push({tick, id, state: model.endingAt === null ? 'removed' : 'gathered'});
    const sinks = model.sinks.map(s => `${s.id}:${!!s.neutralized}`).join(',');
    if (sinks !== previousSinks) { events.push({tick, sinks}); previousSinks = sinks; }
    capture();
  }
  if (!model.finished) throw new Error('Replay did not finish');
  if (actionIndex !== trace.actions.length) throw new Error('Trace contains unexecuted actions');
  return {model, snapshots, outcomes, events, maxError, finalTick: tick};
}

// Discrete fields compare exactly; only non-integer numbers get a tolerance.
export function compare(actual, expected, path = 'baseline') {
  if (typeof expected === 'number' && typeof actual === 'number') {
    const tolerance = Number.isInteger(expected) ? 0 : 1e-9 + Math.abs(expected) * 1e-12;
    if (Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance) return;
  } else if (expected && typeof expected === 'object' && actual && typeof actual === 'object') {
    const aKeys = Object.keys(actual), eKeys = Object.keys(expected);
    if (JSON.stringify(aKeys) !== JSON.stringify(eKeys)) throw new Error(`Keys differ at ${path}`);
    for (const key of eKeys) compare(actual[key], expected[key], `${path}.${key}`);
    return;
  } else if (actual === expected) return;
  throw new Error(`${path}: expected ${expected}, received ${actual}`);
}
