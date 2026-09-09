import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(project, 'output/visual-round2-20260909');
const url = 'http://localhost:5185/evidence/review.html';
async function available(address = url, expected = '场景焕新第二轮') {
  try {
    const response = await fetch(address, { signal: AbortSignal.timeout(1500) });
    return response.ok && (await response.text()).includes(expected);
  } catch { return false; }
}

async function ensureService(name, address, expected, args, env = {}) {
  if (await available(address, expected)) return;
  const out = openSync(path.join(folder, `${name}-launch.log`), 'a');
  const err = openSync(path.join(folder, `${name}-launch-errors.log`), 'a');
  let launchError;
  try {
    const child = spawn(process.execPath, args, {
      cwd: project, detached: true, windowsHide: true,
      env: { ...process.env, ...env }, stdio: ['ignore', out, err],
    });
    child.on('error', error => { launchError = error; });
    child.unref();
  } finally { closeSync(out); closeSync(err); }
  for (let attempt = 0; attempt < 40; attempt++) {
    if (launchError) throw launchError;
    if (await available(address, expected)) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`${name} 未能就绪：${address}。请查看 output/visual-round2-20260909/${name}-launch-errors.log。`);
}

try {
  await ensureService('preview', url, '场景焕新第二轮', [
    path.join(project, 'node_modules/vite/bin/vite.js'),
    '--config', path.join(folder, 'vite-review.config.ts'),
  ]);
  // The review's "进入游戏" link needs the live client and its local service.
  // Reuse each healthy process independently, including partially running setups.
  await ensureService('game-api', 'http://127.0.0.1:2567/api/health', '"ok":true',
    ['--import', 'tsx', path.join(project, 'server/index.ts')],
    { PORT: '2567', NODE_ENV: 'development' });
  await ensureService('game-client', 'http://localhost:5173/', '/client/main.ts', [
    path.join(project, 'node_modules/vite/bin/vite.js'),
    '--host', '127.0.0.1', '--port', '5173', '--strictPort',
  ], { NODE_ENV: 'development' });
  console.log(`场景预览已就绪：${url}`);
  console.log('游戏入口已就绪：http://localhost:5173/');
  if (process.argv.includes('--open') && process.platform === 'win32') {
    const browser = spawn('powershell.exe', ['-NoProfile', '-Command', `Start-Process '${url}'`], {
      detached: true, windowsHide: true, stdio: 'ignore',
    });
    browser.on('error', error => { console.error(error.message); process.exitCode = 1; });
    browser.unref();
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
