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
 *   npm run test:dates -- 30 1 storyClock   # 30 days, one file
 *
 * It is deliberately NOT part of `npm test` — it runs the full suite once per
 * sampled date and takes minutes. Run it after touching anything that reads
 * the calendar, the expiry ladder, or `dayKey()`.
 *
 * The clock is pinned through vitest.frozen-clock.config.ts, not a CLI flag.
 * This script used to pass `--setupFiles scripts/freeze-clock.mjs`, which is
 * not a vitest option: every run died with "Unknown option `--setupFiles`"
 * before a single test executed. The output then contained no "Tests N failed"
 * line, the check below read that as green, and the sweep printed
 * `0 red / 121 dates sampled` — a clean bill of health from a run that never
 * happened. A vitest exit code is now treated as evidence in its own right.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const days = Number(process.argv[2] ?? 121);
const step = Number(process.argv[3] ?? 1);
/** Optional vitest filename filters, so a suspect file can be swept on its own. */
const filters = process.argv.slice(4);

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
  let ok = true;
  try {
    out = execFileSync(
      'npx',
      ['vitest', 'run', ...filters, '--config', 'vitest.frozen-clock.config.ts', '--reporter', 'basic'],
      { cwd: root, encoding: 'utf8', env: { ...process.env, SWEEP_DATE: `${iso}T15:00:00` }, stdio: 'pipe' },
    );
  } catch (err) {
    out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    ok = false;
  }

  // A non-zero exit counts on its own. Matching only on "Tests N failed" meant
  // a run that never started — a bad flag, a config error, a crash — read as
  // green, which is how this sweep once reported 0 red across 121 dates while
  // executing no tests at all.
  const failed = !ok || /Tests\s+\d+ failed/.test(out);
  if (failed) {
    const files = [...new Set([...out.matchAll(/^\s*FAIL\s+(\S+)/gm)].map(m => m[1]))];
    red.push({ iso, files });
    console.log(`RED  ${iso}  ${files.length ? files.join(', ') : '(vitest did not run — see output)'}`);
  } else if (process.stdout.isTTY) {
    // Overwrite in place on a terminal; stay silent when piped, so a CI log
    // shows the red dates and the tally rather than one line per green day.
    process.stdout.write(`ok   ${iso}\r`);
  }
}

console.log(`\n${red.length} red / ${sampled} dates sampled (step ${step}d)`);
process.exit(red.length === 0 ? 0 : 1);
