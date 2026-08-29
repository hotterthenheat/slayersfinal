import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
==================================================
  SLAYER TERMINAL - SERVER

  Serves the built files. Nothing else.
==================================================

  This is a UI-only build: every number on screen comes from
  core/simulator.ts, running in the browser. There is no API, no vendor
  integration, no socket and no database — and this file is deliberately
  the evidence of that, so nobody reading the repo has to go looking for a
  backend that does not exist.

  A feed layer (key vault, cached proxy, socket fan-out) was written here
  and then removed once the project's scope was settled as frontend-only.
  It is in the history if it is ever wanted again; it is not in the build.
*/

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT ?? 8080);

// Serve the production build output
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback to index.html for undefined requests (SPA routing)
app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(` Slayer Terminal Server Running:`);
  console.log(` http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});
