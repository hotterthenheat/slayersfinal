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
          THE FIRST SCREEN SHOULD NOT CARRY THE WHOLE DESK.

          One chunk held everything the app could ever need: 2,252 kB, 673
          gzipped, downloaded and parsed before the first panel drew. Vite
          had been warning about it on every build.

          These four are split on the same rule — a big library that a
          reader is not necessarily going to use today, and that changes on
          a different clock from our code. Splitting them means a change to
          a page no longer invalidates the cached copy of the charting
          engine, which matters more over a week of pushes than the first
          load does.

            charts     lightweight-charts, the whole Terrain/pane engine
            recharts   the drift and series charts on Pinpoint
            three      the News Room globe's renderer, the single heaviest
                       dependency in the build and needed on exactly one page
            vendor     react, react-dom, react-router

          GlobePane is already route-split, so `three` lands beside it
          rather than in the entry. What is left in the entry is our own
          code, which is the part that has to be there for anything to draw.
        */
        manualChunks: {
          charts: ['lightweight-charts'],
          recharts: ['recharts'],
          three: ['three'],
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
