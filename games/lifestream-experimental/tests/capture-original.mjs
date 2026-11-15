// Deliberate, one-off baseline capture from an unmodified monolith. Never run by tests.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {replay, snapshot, state} from './replay-core.mjs';

const [sourcePath, tracePath, outputPath, sourceCommit] = process.argv.slice(2);
if (!sourcePath || !tracePath || !outputPath || !sourceCommit) throw new Error('Usage: node capture-original.mjs ORIGINAL_HTML TRACE_JSON OUTPUT_JSON SOURCE_COMMIT');
const source = await readFile(sourcePath, 'utf8');
const start = source.indexOf('const TAU=');
const end = source.indexOf('window.LifestreamGame=');
if (start < 0 || end < start || source.includes('type="module"')) throw new Error('Expected the original inline model');
// Evaluate the original declarations unchanged, in the same Node engine as module tests.
const {Model, CONFIG} = new Function(`${source.slice(start, end)}\nreturn {Model, CONFIG};`)();
const trace = JSON.parse(await readFile(tracePath, 'utf8'));
const hashes = [];
const hash = model => createHash('sha256').update(JSON.stringify(state(model))).digest('hex');
const run = replay(Model, trace, {onCheckpoint: (model, tick) => hashes.push({tick, sha256: hash(model)})});
const baseline = {
  provenance: {sourceCommit, sourceSha256: createHash('sha256').update(source).digest('hex'), modelSha256: createHash('sha256').update(source.slice(start, end)).digest('hex'), node: process.version, config: CONFIG},
  snapshots: run.snapshots, outcomes: run.outcomes, events: run.events,
  hashes, final: snapshot(run.model, run.finalTick), finalSha256: hash(run.model), maxError: run.maxError,
};
await writeFile(outputPath, JSON.stringify(baseline, null, 2) + '\n');
console.log(JSON.stringify({outputPath, energy: run.model.created, completed: run.model.completed, maxError: run.maxError, checkpoints: hashes.length}));
