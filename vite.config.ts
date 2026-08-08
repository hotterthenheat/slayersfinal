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
          nothing in common in the same cache entry. three.js and lightweight-
          charts are also left where Rollup already puts them — both are reached
          only from routes that are lazy-loaded, so hoisting them into a shared
          vendor chunk would pull them back into the initial download, which is
          the opposite of the point.
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
      Measured after the split: `index` fell from 2,037 KB to 1,035 KB (604 KB
      to 304 KB gzipped) and the two largest chunks are now that and the lazy
      Prove It route, which owns the WebGL stack on purpose, both at ~1,035 KB.

      1200 leaves those a little headroom and still speaks up if either grows by
      more than about a sixth — high enough that a healthy build is silent, low
      enough that the warning means something when it fires. It was firing on
      every single build before, which is the same as not having it.
    */
    chunkSizeWarningLimit: 1200,
  },
});
