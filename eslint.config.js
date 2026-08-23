import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // `.agents` is vendored agent skills — third-party docs and example
  // components installed by `npx skills add`. They are not this project's
  // source, they are not built or imported by it, and they are written against
  // their own conventions: linting them put 88 errors in the gate for code
  // nobody here wrote or ships.
  // The last two mirror .gitignore, and they became necessary the moment the
  // `**/*.mjs` block below started applying rules. ESLint's flat config does not
  // read .gitignore, so `eslint .` was reaching the throwaway Playwright probes
  // that .gitignore documents as the intended workflow ("they drive the preview
  // server, print a measurement, and get deleted") and failing the gate on them.
  // Verified: a `.probe.mjs` and a `_scratchtest/x.mjs` each put `no-undef`
  // errors into `npm run lint` before these entries existed.
  /*
    Root-level `.mjs` is scratch — a one-off Playwright probe, a measurement
    script — and it is ignored here for the same reason .gitignore ignores it.

    This used to read `.*.mjs`, which matches only a DOT-PREFIXED file. That is
    the identical mistake .gitignore carried until it was fixed to `/*.mjs`:
    every probe anyone actually writes is named `font-probe.mjs`, not
    `.font-probe.mjs`, so the rule matched nothing and `npm run lint` failed on
    scratch files that were never going to be committed. Fixing one copy and not
    the other is how two rules that mean the same thing stop agreeing.

    `./` anchors to this directory, which is what keeps `scripts/*.mjs` INSIDE
    the gate — see the note below on why those two files in particular must be
    linted.
  */
  { ignores: ['dist', 'coverage', 'node_modules', '.agents', './*.mjs', '_scratch*'] },
  // The .mjs tooling — scripts/ui-audit.mjs and scripts/date-sweep.mjs, about a
  // thousand lines between them — was outside the gate entirely. `npm run lint`
  // runs `eslint .`, which visits these files, but the only config block below
  // claims TypeScript, and a flat-config file that no block claims gets NO
  // RULES: linting scripts/ui-audit.mjs exited 0 on a probe containing an
  // undefined call, a duplicate object key and a loose equality. Silent, and
  // indistinguishable from clean.
  //
  // That matters more than it would for a throwaway. These two are the UI audit
  // harness and the date sweep — the things the rest of the gate is checked
  // WITH — and both had already shipped real bugs of exactly the kind no-undef
  // and no-unused-vars catch.
  //
  // Browser globals sit alongside Node's because the audit runs its probes
  // inside page.evaluate(...): document, window and getComputedStyle are free
  // identifiers in a file that Node executes.
  {
    files: ['**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
);
