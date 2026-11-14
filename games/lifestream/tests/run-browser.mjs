// Optional dependency-free Chrome driver. Start a static server separately.
// Node 24+ supplies WebSocket; CHROME_BIN overrides the executable path.
import {spawn} from 'node:child_process';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const executable = process.env.CHROME_BIN || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'google-chrome');
const profileMode = process.argv.includes('--profile');
const url = profileMode ? 'http://127.0.0.1:8000/games/lifestream/tests/profile.html?autorun=1'
  : process.argv[2] || 'http://127.0.0.1:8000/games/lifestream/tests/browser.html';
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
  await send('Page.navigate', {url}, sessionId);
  const deadline = Date.now() + (profileMode ? 300000 : 45000);
  let result;
  while (Date.now() < deadline) {
    const response = await send('Runtime.evaluate', {expression: "({title:document.title,report:document.getElementById('report')?.textContent})", returnByValue: true}, sessionId);
    result = response.result.value;
    if (/^(PASS|FAIL)/.test(result?.title)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  console.log(result?.report || JSON.stringify(result));
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
