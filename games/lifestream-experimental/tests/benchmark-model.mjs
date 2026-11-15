// Optional differential regression/benchmark against a supplied pre-optimization model.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Model, DT} from '../model.mjs';
import {state, checkEnergy} from './replay-core.mjs';

if (!process.argv[2]) throw new Error('Usage: node benchmark-model.mjs ORIGINAL_MODEL_MJS');
const {Model: BeforeModel} = await import(pathToFileURL(resolve(process.argv[2])));
const hash = model => createHash('sha256').update(JSON.stringify(state(model))).digest('hex');
const results = [];
for (const seed of [0, 1, 73, 4294967295]) {
  const before = new BeforeModel(seed), after = new Model(seed);
  const timings = {before: [], after: []};
  let checkpoints = 0;
  for (let tick = 0; tick < 11730; tick++) {
    for (const model of [before, after]) {
      if (tick % 90 === 0) model.plant(.45 + tick / 90 * 2.399963229728653);
      if (tick % 600 === 0) model.deploySanctuary(tick / 600);
    }
    const order = tick % 2 ? [['after', after], ['before', before]] : [['before', before], ['after', after]];
    for (const [name, model] of order) {
      const start = performance.now(); model.step(DT); timings[name].push(performance.now() - start);
      checkEnergy(model);
    }
    if (tick % 600 === 0 || tick === 11729) {
      assert.equal(hash(after), hash(before), `seed ${seed}, tick ${tick}`);
      checkpoints++;
    }
  }
  const summarize = values => {
    const sorted = [...values].sort((a, b) => a - b);
    return {medianMs: sorted[Math.ceil(values.length * .5) - 1], p95Ms: sorted[Math.ceil(values.length * .95) - 1], p99Ms: sorted[Math.ceil(values.length * .99) - 1], totalMs: values.reduce((a, b) => a + b, 0)};
  };
  results.push({seed, checkpoints, energy: after.created, completed: after.completed, before: summarize(timings.before), after: summarize(timings.after)});
}
console.log(JSON.stringify({node: process.version, methodology: 'Alternating fixed steps; 1.5-second plant cadence; sanctuary attempts every 10 seconds; exact complete-state hashes and conservation checks.', results}, null, 2));
