/**
 * Run the whole suite across N consecutive simulated dates.
 *
 * This exists because the gate went from 654 green to 1 red overnight with no
 * commit between. The cause was an assertion that had encoded one day's
 * generated option ladder as an invariant, and it was not alone: measured
 * across 121 consecutive dates, 45 of them were red. A suite that fails on
 * roughly a third of Tuesdays is not a gate, and the failures look like real
 * regressions, so they cost a debugging round each time.
 *
 * The fix was to correct the assertions, not to freeze the clock. Freezing
 * would have made the suite reproducible AND blind: a future date-fragile
 * assertion would sail through every run. So the clock stays real, and this
 * script is how the class stays checked.
 *
 *   npm run test:dates              # 121 days from today
 *   npm run test:dates -- 60 3      # 60 days, every 3rd day
 *
 * It is deliberately NOT part of `npm test` — it runs the full suite once per
 * sampled date and takes minutes. Run it after touching anything that reads
 * the calendar, the expiry ladder, or `dayKey()`.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const days = Number(process.argv[2] ?? 121);
const step = Number(process.argv[3] ?? 1);

const start = new Date();
start.setHours(0, 0, 0, 0);

const red = [];
let sampled = 0;

for (let i = 0; i < days; i += step) {
  const d = new Date(start);
  d.setDate(d.getDate() + i);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  sampled++;

  let out;
  try {
    out = execFileSync(
      'npx',
      ['vitest', 'run', '--setupFiles', 'scripts/freeze-clock.mjs', '--reporter', 'basic'],
      { cwd: root, encoding: 'utf8', env: { ...process.env, SWEEP_DATE: `${iso}T15:00:00` }, stdio: 'pipe' },
    );
  } catch (err) {
    out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  }

  const failed = /Tests\s+\d+ failed/.test(out);
  if (failed) {
    const files = [...new Set([...out.matchAll(/^\s*FAIL\s+(\S+)/gm)].map(m => m[1]))];
    red.push({ iso, files });
    console.log(`RED  ${iso}  ${files.join(', ')}`);
  } else if (process.stdout.isTTY) {
    // Overwrite in place on a terminal; stay silent when piped, so a CI log
    // shows the red dates and the tally rather than one line per green day.
    process.stdout.write(`ok   ${iso}\r`);
  }
}

console.log(`\n${red.length} red / ${sampled} dates sampled (step ${step}d)`);
process.exit(red.length === 0 ? 0 : 1);
