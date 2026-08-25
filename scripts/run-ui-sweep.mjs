/*
  Serves the built `dist/` and runs the browser sweep against it, then tears
  the server down whatever happened.

  A separate file rather than a shell one-liner in package.json, because the
  server has to die even when the sweep fails — otherwise a red run leaves a
  process holding the port and the NEXT run fails for a reason that has
  nothing to do with the code.
*/
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.SWEEP_PORT || 4319);
const ORIGIN = `http://localhost:${PORT}`;

if (!existsSync(fileURLToPath(new URL('../dist/index.html', import.meta.url)))) {
  console.error('No dist/ to sweep. Run `npm run build` first.');
  process.exit(1);
}

const preview = spawn(
  process.execPath,
  [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'] }
);
let previewLog = '';
preview.stdout.on('data', d => (previewLog += d));
preview.stderr.on('data', d => (previewLog += d));

const stop = () => {
  if (!preview.killed) preview.kill('SIGTERM');
};
process.on('exit', stop);
process.on('SIGINT', () => {
  stop();
  process.exit(130);
});

/* Poll rather than sleep — the server is ready when it answers, and a fixed
   wait is either too long every run or too short on a slow one. */
const ready = await (async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${ORIGIN}/terrain`);
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
})();

if (!ready) {
  console.error(`The preview server never answered on ${ORIGIN}:\n${previewLog}`);
  stop();
  process.exit(1);
}

const sweep = spawn(process.execPath, [fileURLToPath(new URL('./ui-sweep.mjs', import.meta.url))], {
  stdio: 'inherit',
  env: { ...process.env, SWEEP_URL: ORIGIN },
});
sweep.on('exit', code => {
  stop();
  process.exit(code ?? 1);
});
