import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // One React, always — guards against mixed pre-bundle generations
    // ("Invalid hook call") when deps are installed mid-flight.
    dedupe: ['react', 'react-dom'],
  },
  define: {
    // react-draggable 4.7 (via react-grid-layout) reads process.env in the
    // browser and throws ReferenceError on every drag without this shim.
    'process.env': {},
  },
  build: {
    rollupOptions: {
      output: {
        /*
          Split the vendors that actually move the needle, and nothing else.

          Everything outside the two lazy routes was landing in ONE 2,037 KB
          chunk (604 KB gzipped) that the build warned about on every run. Two
          costs, both real: a reader downloads charting libraries before the
          landing page can paint, and changing a single line of our own code
          invalidates the whole thing, so every deploy re-ships React and
          recharts to people who already had them.

          Grouped by cache lifetime rather than by folder. These are pinned
          dependencies that change on upgrades — measured in months — while
          `index` changes on every commit. Keeping them apart means a deploy
          usually invalidates only the small half.

          Deliberately NOT a blanket `node_modules` → `vendor` rule: that
          rebuilds one large chunk on any dependency bump and puts modules with
          nothing in common in the same cache entry. three.js IS left where
          Rollup already puts it — it is reached only from the lazy Prove It
          route, so naming it here would pull it into the initial download.

          WHAT THIS COSTS, measured rather than asserted. Two real builds of the
          same tree, identical but for this block, summing every file the landing
          route actually fetches (index.html + its script + all six modulepreload
          chunks + the CSS), not just the index chunk:

            with manualChunks     raw 2,132,341   gzip 621,641
            without               raw 2,116,729   gzip 617,650
            delta                 raw   +15,612   gzip  +3,991   (+0.65%)

          So the split makes the FIRST visit marginally more expensive — the same
          modules arrive in seven files instead of two, each paying Rollup's
          wrapper. It is kept because the trade is caching, not first paint: a
          code-only deploy now re-invalidates the 1,036 KB index chunk instead of
          a 2,038 KB one, and that repeats on every deploy while the +4 KB gzip
          is paid once by a cold visitor.

          An earlier version of this comment claimed lightweight-charts was
          "left where Rollup already puts" it and "reached only from routes that
          are lazy-loaded". Both halves were false: it is named on the `tape`
          line below, and the LANDING page reaches it eagerly through
          LiveSections → StrikeChart. The sentence described an intention, not
          this config.
        */
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          motion: ['framer-motion'],
          tape: ['lightweight-charts'],
          grid: ['react-grid-layout'],
          icons: ['lucide-react'],
        },
      },
    },
    /*
      Measured after the split: the `index` CHUNK fell from 2,038 KB to 1,036 KB
      (605 KB to 304 KB gzipped) and the two largest chunks are now that and the
      lazy Prove It route, which owns the WebGL stack on purpose, both ~1,035 KB.
      That is a statement about one chunk, not about what a reader downloads —
      the landing route's total is above, and it went slightly UP.

      1200 leaves those a little headroom and still speaks up if either grows by
      more than about a sixth — high enough that a healthy build is silent, low
      enough that the warning means something when it fires. It was firing on
      every single build before, which is the same as not having it.
    */
    chunkSizeWarningLimit: 1200,
  },
});
