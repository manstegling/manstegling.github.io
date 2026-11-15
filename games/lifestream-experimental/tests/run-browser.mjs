// Optional dependency-free Chrome driver. Start a static server separately.
// Node 24+ supplies WebSocket; CHROME_BIN overrides the executable path.
import {spawn} from 'node:child_process';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const executable = process.env.CHROME_BIN || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'google-chrome');
const profileMode = process.argv.includes('--profile');
const cssProfileMode = process.argv.includes('--css-profile');
const cpuProfilePath = process.argv.find(arg => arg.startsWith('--cpu='))?.slice(6);
const tracePath = process.argv.find(arg => arg.startsWith('--trace='))?.slice(8);
const screenshotPath = process.argv.find(arg => arg.startsWith('--screenshot='))?.slice(13);
const size = process.argv.find(arg => arg.startsWith('--size='))?.slice(7).split('x').map(Number);
const scene = process.argv.find(arg => arg.startsWith('--scene='))?.slice(8);
const url = cssProfileMode ? 'http://127.0.0.1:8000/games/lifestream-experimental/tests/profile-css.html'
  : profileMode ? 'http://127.0.0.1:8000/games/lifestream-experimental/tests/profile.html?autorun=1'
  : process.argv.slice(2).find(arg => !arg.startsWith('--')) || 'http://127.0.0.1:8000/games/lifestream-experimental/tests/browser.html';
const profile = await mkdtemp(join(tmpdir(), 'lifestream-browser-'));
let socket, browser, timeout;
const pending = new Map();
try {
  browser = spawn(executable, ['--headless', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], {stdio: ['ignore', 'ignore', 'pipe']});
  const endpoint = await new Promise((resolve, reject) => {
    let log = '';
    timeout = setTimeout(() => reject(new Error(`Chrome did not start: ${log}`)), 15000);
    browser.once('error', reject);
    browser.once('exit', code => reject(new Error(`Chrome exited early: ${code}\n${log}`)));
    browser.stderr.on('data', chunk => {
      log += chunk;
      const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, {once: true}); socket.addEventListener('error', reject, {once: true}); });
  let nextId = 0;
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id); clearTimeout(entry.timeout);
    if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
    else entry.resolve(message.result);
  });
  function send(method, params = {}, sessionId) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
      pending.set(id, {resolve, reject, timeout});
      socket.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
    });
  }
  const {targetId} = await send('Target.createTarget', {url: 'about:blank'});
  const {sessionId} = await send('Target.attachToTarget', {targetId, flatten: true});
  await send('Page.enable', {}, sessionId);
  if (size) await send('Emulation.setDeviceMetricsOverride', {width: size[0], height: size[1], deviceScaleFactor: 2, mobile: false}, sessionId);
  if (cssProfileMode) {
    await send('Emulation.setDeviceMetricsOverride', {width: 390, height: 844, deviceScaleFactor: 2, mobile: false}, sessionId);
    const {gpu} = await send('SystemInfo.getInfo');
    console.error(JSON.stringify({gpu: {devices: gpu.devices, featureStatus: gpu.featureStatus, glRenderer: gpu.auxAttributes?.glRenderer}}));
  }
  let traceComplete;
  if (tracePath) {
    traceComplete = new Promise(resolve => socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Tracing.tracingComplete') resolve(message.params.stream);
    }));
    await send('Tracing.start', {categories: 'devtools.timeline,blink.user_timing,cc,gpu', transferMode: 'ReturnAsStream'});
  }
  if (cpuProfilePath) {
    await send('Profiler.enable', {}, sessionId);
    await send('Profiler.start', {}, sessionId);
  }
  await send('Page.navigate', {url}, sessionId);
  const deadline = Date.now() + (profileMode ? 300000 : 45000);
  let result;
  while (Date.now() < deadline) {
    const expression = screenshotPath
      ? "({title:window.lifestream&&document.readyState==='complete'?'PASS':'LOADING',report:JSON.stringify({viewport:[innerWidth,innerHeight],geometry:window.lifestream?.geometry})})"
      : "({title:document.title,report:document.getElementById('report')?.textContent})";
    const response = await send('Runtime.evaluate', {expression, returnByValue: true}, sessionId);
    result = response.result.value;
    if (/^(PASS|FAIL)/.test(result?.title)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  console.log(result?.report || JSON.stringify(result));
  if (screenshotPath && result?.title?.startsWith('PASS')) {
    if (scene) {
      const expression = `(async()=>{
        const api=window.lifestream;
        const trace=await fetch('./tests/fixtures/seed-73.trace.json').then(r=>r.json());
        api.begin(trace.seed);document.getElementById('plant').click();api.pause();
        let index=1;
        for(let tick=0;tick<${scene === 'ending' ? 11460 : 7200};tick++){
          while(trace.actions[index]?.tick===tick){const a=trace.actions[index++];if(a.type==='plant')api.model.plant(a.theta);else api.model.deploySanctuary(a.theta);}
          api.model.step();
        }
        api.step(${scene === 'ending' ? 1.5 : 0});
        ${scene === 'menu' ? "document.getElementById('help').click();" : scene === 'playing' ? "document.getElementById('pause').click();" : ''}
      })()`;
      await send('Runtime.evaluate', {expression, awaitPromise: true}, sessionId);
    }
    await send('Runtime.evaluate', {expression: 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))', awaitPromise: true}, sessionId);
    const {data} = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}, sessionId);
    await writeFile(screenshotPath, Buffer.from(data, 'base64'));
  }
  if (tracePath) {
    await send('Tracing.end');
    const handle = await traceComplete;
    const chunks = [];
    for (;;) {
      const chunk = await send('IO.read', {handle});
      chunks.push(chunk.base64Encoded ? Buffer.from(chunk.data, 'base64') : Buffer.from(chunk.data));
      if (chunk.eof) break;
    }
    await send('IO.close', {handle});
    await writeFile(tracePath, Buffer.concat(chunks));
  }
  if (cpuProfilePath) {
    const {profile} = await send('Profiler.stop', {}, sessionId);
    await writeFile(cpuProfilePath, JSON.stringify(profile));
  }
  if (!result?.title?.startsWith('PASS')) process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  for (const entry of pending.values()) clearTimeout(entry.timeout);
  socket?.close();
  if (browser?.pid && browser.exitCode === null) {
    const exited = new Promise(resolve => browser.once('exit', resolve));
    browser.kill('SIGTERM');
    const force = setTimeout(() => browser.kill('SIGKILL'), 3000);
    await exited;
    clearTimeout(force);
  }
  await rm(profile, {recursive: true, force: true});
}
