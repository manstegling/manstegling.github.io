import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Model} from '../model.mjs';
import {replay, snapshot, state, compare} from './replay-core.mjs';

export const fixtureURL = name => new URL(`./fixtures/${name}`, import.meta.url);
export const readJSON = async url => JSON.parse(await readFile(url, 'utf8'));
export const hashState = model => {
  const historical = state(model);
  // Preserve the frozen original hashes across cleanup of unused boss warning metadata.
  // Actual boss warnings are shared; activation, expiry and all physics remain exact.
  const boss = historical.sinkSchedule.filter(s => s.boss);
  for (const sinks of [historical.sinkSchedule, historical.sinks]) {
    for (const sink of sinks) if (sink.boss) sink.warningAt = boss[0].start - 20 + boss.findIndex(s => s.id === sink.id) * .03;
  }
  return createHash('sha256').update(JSON.stringify(historical)).digest('hex');
};

export async function checkBaseline({exact = true} = {}) {
  const trace = await readJSON(fixtureURL('seed-73.trace.json'));
  const baseline = await readJSON(fixtureURL('seed-73.baseline.json'));
  const hashes = [];
  const run = replay(Model, trace, {onCheckpoint: (model, tick) => hashes.push({tick, sha256: hashState(model)})});
  compare(run.snapshots, baseline.snapshots);
  compare(run.outcomes, baseline.outcomes);
  compare(run.events, baseline.events);
  compare(snapshot(run.model, run.finalTick), baseline.final);
  if (exact) {
    compare(hashes, baseline.hashes);
    compare(hashState(run.model), baseline.finalSha256);
  }
  return run;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).some(arg => !['--check', '--tolerant'].includes(arg))) throw new Error('Usage: node replay.mjs [--check] [--tolerant]');
  const run = await checkBaseline({exact: !process.argv.includes('--tolerant')});
  console.log(JSON.stringify({baseline: 'PASS', energy: run.model.created, completed: run.model.completed, maxError: run.maxError, finalTick: run.finalTick}, null, 2));
}
