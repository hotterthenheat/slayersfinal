/*
  PART 16 — the boot measurement, kept runnable.

  The checklist said the performance work "was started and never finished",
  and the reason it stalled is that nobody could say what the desk actually
  cost. This says it, per route, against a production build:

    · TTC        time to CONTENT, not to load — the splash has cleared and
                 there is real ink on the page. Waiting for `load` measures
                 the network and misses the thing a person waits through.
    · longest    the single worst main-thread task. This is the number that
                 decides whether a click feels attached to the cursor, and
                 the one that starved LaunchTransition's 1,350ms hold into
                 running 4–6.4s: the timer could not fire.
    · blocking   total time past the 50ms responsiveness budget.

  Run it against a preview server, not the dev server — the dev server's
  module graph dominates everything else and the numbers mean nothing:

      npm run build
      npx vite preview --port 4320 --strictPort &
      npm run perf

  BASELINE, 2026-09-05, before the seeding walk was profiled:
      mean TTC 6735ms · mean blocking 5425ms · worst task 4509ms
  After the gamma-only snapshot, the incremental RNG fold and the arithmetic
  strike grid (same numbers out — `gamma-fast-path-proof`):
      mean TTC 3666ms · mean blocking 2221ms · worst task 1361ms
  What remains is the four-name WATCHLIST seed that runs synchronously at
  module evaluation: ~325ms a name in the browser, before any route paints.
*/
import { chromium } from 'playwright';

const BASE = process.env.PERF_BASE ?? 'http://localhost:4320';
const CHROME = process.env.PERF_CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const routes = ['/pulse', '/terrain', '/compass', '/pinpoint/exposure-profile', '/trace/live-tape', '/stocks', '/news', '/earnings'];

const b = await chromium.launch({ executablePath: CHROME });
console.log('route                          entry_kB  TTC_ms  longest_task_ms  blocking_ms');
const rows = [];
for (const r of routes) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  let entryBytes = 0;
  p.on('response', async res => {
    if (/\/assets\/index-.*\.js$/.test(res.url())) {
      try { entryBytes = (await res.body()).length; } catch { /* body already consumed */ }
    }
  });
  await p.addInitScript(() => {
    window.__tasks = [];
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__tasks.push(e.duration); })
      .observe({ entryTypes: ['longtask'] });
  });
  const t0 = Date.now();
  await p.goto(BASE + r, { waitUntil: 'load' });
  await p.waitForFunction(() => {
    const t = document.body.innerText || '';
    return t.length > 400 && !/ENTERING TERMINAL/i.test(t);
  }, { timeout: 30000 }).catch(() => { /* record the timeout as the reading */ });
  const ttc = Date.now() - t0;
  const tasks = await p.evaluate(() => window.__tasks ?? []);
  const longest = tasks.length ? Math.max(...tasks) : 0;
  const blocking = tasks.reduce((a, d) => a + Math.max(0, d - 50), 0);
  rows.push({ r, kb: Math.round(entryBytes / 1024), ttc, longest: Math.round(longest), blocking: Math.round(blocking) });
  console.log(
    r.padEnd(30),
    String(Math.round(entryBytes / 1024)).padStart(8),
    String(ttc).padStart(8),
    String(Math.round(longest)).padStart(16),
    String(Math.round(blocking)).padStart(12)
  );
  await ctx.close();
}
const avg = k => Math.round(rows.reduce((a, x) => a + x[k], 0) / rows.length);
console.log(`\nmean TTC ${avg('ttc')}ms · mean blocking ${avg('blocking')}ms · worst task ${Math.max(...rows.map(x => x.longest))}ms`);
await b.close();
