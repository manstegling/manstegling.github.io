import test from 'node:test';
import assert from 'node:assert/strict';
import {Model, CONFIG, N, R, CAP, DT, TOTAL_TIME, BOSS_START, TAU} from '../model.mjs';
import {checkEnergy, replay, state, ENERGY_TOLERANCE} from './replay-core.mjs';
import {checkBaseline, readJSON, fixtureURL} from './replay.mjs';

const close = (actual, expected, tolerance = ENERGY_TOLERANCE) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const steps = (model, count) => { for (let i = 0; i < count; i++) { model.step(); checkEnergy(model); } };

// Build targeted energy-conserving arrangements without depending on a player strategy.
function emptyModel(seed = 73, params = {}) {
  return new Model(seed, 0, params);
}
function putEnergy(model, index, energy) {
  model.q[index] += energy;
  model.initial += energy;
}
function soul(model, life, energy = life.chunk) {
  life.soul = energy;
  model.initial += energy;
}

test('simulation configuration is unchanged; sink presentation settings are shared', async () => {
  const baseline = await readJSON(fixtureURL('seed-73.baseline.json'));
  const {bossInterval, sinkPopPeakTime, sinkPopSettleTime, sinkPopPeakScale, sinkWarningCountdown, ...simulation} = CONFIG;
  const {bossInterval: originalInterval, ...originalSimulation} = baseline.provenance.config;
  assert.deepEqual(simulation, originalSimulation);
  assert.ok(sinkPopPeakTime > 0 && sinkPopPeakTime < bossInterval);
  assert.ok(bossInterval < sinkPopSettleTime && sinkPopPeakScale > 1);
  assert.ok(sinkWarningCountdown > 0 && sinkWarningCountdown <= CONFIG.warning);
  const boss = new Model().sinkSchedule.filter(s => s.boss);
  for (const sink of boss) {
    assert.equal(sink.warningAt, BOSS_START - CONFIG.bossWarningLead);
    assert.equal(sink.start, BOSS_START);
    assert.equal(sink.end, CONFIG.sunrise + CONFIG.disturbance);
  }
});

test('full seed-73 replay matches original snapshots, events and complete-state hashes', async () => {
  const run = await checkBaseline();
  assert.equal(run.model.completed, 24);
  assert.equal(run.model.sanctuaries.length, 2);
  assert.ok(run.outcomes.some(a => a.type === 'sanctuary' && a.accepted));
  assert.ok(run.outcomes.some(a => a.type === 'plant' && !a.accepted));
  const trace = await readJSON(fixtureURL('seed-73.trace.json'));
  const second = replay(Model, trace);
  assert.deepEqual(state(run.model), state(second.model));
  assert.deepEqual(run.events, second.events);
  assert.deepEqual(run.outcomes, second.outcomes);
});

test('an idle world conserves energy through finish for another seed', () => {
  const model = new Model(0);
  steps(model, 11730);
  assert.equal(model.finished, true);
  assert.equal(model.created, 0);
  assert.equal(model.completed, 0);
});

test('hazard schedules are seed-specific and independent of player RNG/actions', () => {
  const a = new Model(73), b = new Model(73), other = new Model(74);
  const schedule = m => m.sinkSchedule.map(({physics, captureCells, ...s}) => s);
  const expected = schedule(a);
  for (let i = 0; i < 40; i++) a.plant(); // Consumes the life RNG; no hazard RNG.
  a.created = 150;
  a.deploySanctuary(.45);
  assert.deepEqual(a.sinkSchedule.map(s => [s.theta, s.warningAt, s.start, s.end]), b.sinkSchedule.map(s => [s.theta, s.warningAt, s.start, s.end]));
  assert.equal(a.hazardRng, b.hazardRng);
  assert.notDeepEqual(expected, schedule(other));
});

test('shared embryo intake is finite and independent of life array order', () => {
  const make = () => {
    const model = emptyModel();
    for (let i = 0; i < 12; i++) model.plant(0);
    putEnergy(model, 0, 1);
    return model;
  };
  const a = make(), b = make();
  b.lives.reverse();
  a.absorbEmbryos(DT); b.absorbEmbryos(DT);
  const absorbed = 1 - Math.exp(-CONFIG.absorptionRate * DT);
  close(a.totals().world, absorbed);
  close(a.q[0], 1 - absorbed);
  for (const life of a.lives) {
    close(life.soul, absorbed / 12);
    close(life.soul, b.lives.find(other => other.id === life.id).soul);
  }
  checkEnergy(a); checkEnergy(b);
});

test('an embryo may acquire its last energy on the maturity tick, then creates energy', () => {
  const model = emptyModel(73, {attraction: 0, gravity: 0, diffusion: 0});
  const life = model.plant(0);
  soul(model, life, life.chunk - .01);
  putEnergy(model, 0, 1);
  life.age = life.maturity - DT;
  model.step();
  assert.equal(life.state, 'person');
  assert.equal(model.born, 1);
  assert.ok(model.created > 0);
  checkEnergy(model);
});

test('failed embryos lose held energy at the deadline and never count as completed', () => {
  const model = emptyModel();
  const life = model.plant(0);
  soul(model, life, 2);
  life.age = life.maturity - DT;
  model.step();
  assert.equal(model.lives.length, 0);
  assert.equal(model.embryoDeaths, 1);
  assert.equal(model.completed, 0);
  close(model.failedEnergy, 2);
  checkEnergy(model);
});

test('a souled embryo still waits for maturity; natural death returns its remainder once', () => {
  const model = emptyModel();
  const life = model.plant(0);
  soul(model, life);
  life.state = 'souled';
  steps(model, 359);
  assert.equal(life.state, 'souled');
  steps(model, 1);
  assert.equal(life.state, 'person');
  // Isolate the final fraction of life without changing the energy ledger.
  model.deposit(life.theta, life.soul - .001);
  life.soul = .001;
  model.step();
  assert.equal(model.lives.length, 0);
  assert.equal(model.completed, 1);
  assert.equal(model.deaths, 1);
  const created = model.created;
  steps(model, 2);
  assert.equal(model.completed, 1);
  assert.equal(model.created, created);
  checkEnergy(model);
});

test('crowding lowers creation without increasing soul depletion; generation traits are fixed at planting', () => {
  const model = emptyModel();
  const a = model.plant(0);
  soul(model, a); a.state = 'person';
  const alone = model.growthAt(0, a.id, a.growthScale);
  const b = model.plant(0);
  soul(model, b); b.state = 'person';
  assert.ok(model.growthAt(0, a.id, a.growthScale) < alone);
  const depletion = a.depletionRate, initialSoul = a.soul, chunk = a.chunk;
  model.step();
  close(a.soul, initialSoul - depletion * DT);
  // Hypothetical progression used only to examine per-life traits.
  model.created = 1000;
  const advanced = model.plant(1);
  assert.ok(advanced.chunk > chunk);
  assert.equal(a.chunk, chunk);
  assert.equal(a.depletionRate, depletion);
});

test('ordinary warning/start/end and all 16 boss sinks obey exact boundaries', () => {
  const model = new Model();
  const first = model.sinkSchedule[0];
  model.t = first.warningAt;
  assert.ok(model.warnings().includes(first));
  model.t = first.start - DT; model.updateSinks();
  assert.ok(!model.sinks.includes(first));
  model.t = first.start; model.updateSinks();
  assert.ok(model.sinks.includes(first));
  assert.ok(!model.warnings().includes(first));
  model.t = first.end; model.updateSinks();
  assert.ok(!model.sinks.includes(first));
  model.t = BOSS_START - DT; model.updateSinks();
  assert.equal(model.sinks.filter(s => s.boss).length, 0);
  assert.ok(model.warnings().every(s => !s.boss));
  model.t = BOSS_START; model.updateSinks();
  assert.equal(model.sinks.filter(s => s.boss).length, 16);
  model.t = CONFIG.sunrise + CONFIG.disturbance; model.updateSinks();
  assert.equal(model.sinks.length, 0);
});

test('sanctuary angular overlap includes partial contact and wraparound; future sinks are neutralized', () => {
  const model = new Model();
  const sink = model.sinkSchedule[0];
  const angularRadius = Math.asin(CONFIG.sinkRadius / (.65 + .35 * sink.fraction));
  const boundary = CONFIG.sanctuaryHalfWidth + angularRadius;
  sink.theta = .1;
  assert.equal(model.sinkOverlapsSanctuary(sink, .1 + boundary - 1e-10), true);
  assert.equal(model.sinkOverlapsSanctuary(sink, .1 + boundary + 1e-10), false);
  assert.equal(model.sinkOverlapsSanctuary(sink, TAU - .01), true);
  model.created = 150;
  assert.ok(model.deploySanctuary(.1));
  assert.equal(sink.neutralized, true);
  assert.equal(model.sanctuaryAvailable(), 0);
  assert.equal(model.deploySanctuary(0), null);
});

test('overlapping sinks cannot destroy the same energy twice, and neutralized sinks do not consume', () => {
  const model = emptyModel();
  const sink = model.sinkSchedule[0];
  assert.ok(sink.captureCells.length > 0);
  const copy = {...sink, id: 999};
  model.prepareSink(copy);
  model.sinks = [sink, copy];
  putEnergy(model, sink.captureCells[0], 7);
  model.absorbSinks();
  close(model.destroyed, 7);
  close(sink.destroyed + copy.destroyed, 7);
  sink.neutralized = copy.neutralized = true;
  putEnergy(model, sink.captureCells[0], 2);
  model.absorbSinks();
  close(model.destroyed, 7);
  close(model.totals().cloud, 2);
  checkEnergy(model);
});

test('deploying over an active sink clears its forces and intake blockage, preserving the outer reservoir', () => {
  const model = emptyModel();
  const sink = model.sinkSchedule[0];
  model.t = sink.start;
  model.updateSinks();
  assert.ok(model.sinkAngular.some(value => value !== 0));
  const angleCell = Math.round(sink.theta / TAU * N) % N;
  const outerCell = (R - 1) * N + angleCell;
  assert.equal(model.blockedIntake(sink.theta, outerCell), true);
  putEnergy(model, outerCell, 4);
  model.absorbSinks();
  close(model.q[outerCell], 4);
  close(model.destroyed, 0);
  // Model a completed creation transfer to establish an earned sanctuary.
  model.created += 150;
  model.deposit(0, 150);
  assert.ok(model.deploySanctuary(sink.theta));
  assert.equal(sink.neutralized, true);
  assert.equal(model.blockedIntake(sink.theta, outerCell), false);
  assert.ok(model.sinkAngular.every(value => value === 0));
  assert.ok(model.sinkRadial.every(value => value === 0));
  checkEnergy(model);
});

test('plant cutoff, phase boundaries and the entity cap preserve eligibility', () => {
  const model = new Model();
  assert.equal(model.phase(), 'Sunrise');
  model.t = CONFIG.sunrise; assert.equal(model.phase(), 'Disturbance');
  model.t = CONFIG.sunrise + CONFIG.disturbance; assert.equal(model.phase(), 'Sunset');
  model.t = TOTAL_TIME - CONFIG.maturity - DT;
  assert.ok(model.plant(0));
  model.t = TOTAL_TIME - CONFIG.maturity;
  assert.equal(model.plant(0), null);
  model.t = TOTAL_TIME; assert.equal(model.phase(), 'Gathering');
  const capped = new Model();
  for (let i = 0; i < CAP; i++) assert.ok(capped.plant(i / CAP * TAU));
  assert.equal(capped.plant(0), null);
  assert.equal(capped.lives.length, CAP);
  checkEnergy(capped);
});

test('gathering returns people, loses unfinished embryo energy, and accounts only once', () => {
  const model = emptyModel();
  const person = model.plant(0), embryo = model.plant(1);
  soul(model, person, 10); person.state = 'person';
  soul(model, embryo, 2);
  model.gather();
  assert.equal(model.completed, 1);
  assert.equal(model.gathered, 1);
  close(model.gatheredEnergy, 10);
  close(model.failedEnergy, 2);
  close(model.totals().cloud, 10);
  assert.equal(model.created, 0);
  const ledger = model.totals();
  model.gather();
  steps(model, 270);
  assert.equal(model.finished, true);
  assert.equal(model.completed, 1);
  assert.deepEqual(model.totals(), ledger);
  const end = state(model);
  model.step();
  assert.deepEqual(state(model), end);
});
