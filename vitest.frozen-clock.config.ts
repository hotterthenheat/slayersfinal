import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config';

/*
  The ordinary config, plus one setup file that pins the wall clock to
  $SWEEP_DATE. Used only by scripts/date-sweep.mjs.

  It exists as a config rather than a CLI flag because `--setupFiles` is not a
  vitest CLI option — the sweep passed it anyway and vitest exited with
  "Unknown option `--setupFiles`" on every sampled date. The script read that as
  output containing no "Tests N failed", concluded the date was green, and
  reported `0 red / 121 dates sampled`. A date-fragility sweep that cannot fail
  is worse than no sweep: it answers the question with a confident wrong number.

  The real clock stays real for `npm test`, which is the whole point of keeping
  this out of vitest.config.ts — a date-fragile assertion needs somewhere to
  show itself.
*/
export default mergeConfig(
  base,
  defineConfig({
    test: {
      setupFiles: ['scripts/freeze-clock.mjs'],
    },
  })
);
