import { defineConfig } from 'vitest/config';

// Pure-logic unit tests run in the node environment — the suite targets the
// deterministic data/engine layer (simulator, quant, universe), not the DOM.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
  },
});
