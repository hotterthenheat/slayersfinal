import { chromium } from 'playwright';
import { spawn } from 'child_process';
const PORT = process.env.P || 4321;
const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: process.cwd(), stdio: 'ignore' });
await new Promise(r => setTimeout(r, 4000));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const out = 'shots';
const shots = [
  ['live-tape-top', '/trace/live-tape', 1600, 1000, 0],
  ['live-tape-deep', '/trace/live-tape', 1600, 1000, 6],
  ['dark-pool', '/trace/dark-pool', 1600, 1100, 0],
  ['live-tape-1024', '/trace/live-tape', 1024, 820, 0],
];
for (const [name, route, w, h, jumps] of shots) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  for (let i = 0; i < jumps; i++) {
    await page.evaluate(() => { const m = document.querySelector('main'); m.scrollTop = m.scrollHeight; });
    await page.waitForTimeout(350);
  }
  if (jumps) await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
  await ctx.close();
}
await browser.close(); srv.kill(); process.exit(0);
