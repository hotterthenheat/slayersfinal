/**
 * Drive a real browser over every route against the production build, served
 * under the real Content-Security-Policy, and report anything the policy blocks.
 *
 * A CSP is the one piece of configuration whose failure mode is invisible to
 * every other gate here. It changes no test, no type and no build; it breaks
 * things only in a browser, only on the routes that happen to use the blocked
 * capability, and only once it is deployed. Writing one from memory and shipping
 * it is how a policy ends up either broken or decorative.
 *
 * So the policy is derived from what the app actually asks for:
 *   npm run build && npm run serve &   # server.ts sends the real headers
 *   node scripts/csp-check.mjs
 *
 * It listens for `securitypolicyviolation` on every page — the same event the
 * browser fires when it refuses a load — and also collects page errors and
 * failed requests, because a directive that is too tight usually shows up as a
 * broken feature before it shows up as a violation.
 */
import { chromium } from 'playwright';

const BASE = process.env.CSP_BASE ?? 'http://localhost:8099';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const ROUTES = [
  '/', '/terminal', '/pulse', '/compass', '/stocks', '/earnings', '/prove-it',
  '/tracker', '/trailer',
  '/guide/overview', '/guide/desks', '/guide/concepts', '/guide/faq', '/guide/shortcuts',
  '/pinpoint/gamma', '/pinpoint/levels', '/pinpoint/greeks', '/pinpoint/stress',
  '/pinpoint/history',
  '/trace/live-tape', '/trace/gamma-tape', '/trace/informed-flow', '/trace/dark-pool',
  '/trace/scanner', '/trace/reconstruction',
  '/community/ideas', '/community/requests', '/community/feedback',
  '/legal/disclaimer', '/legal/terms', '/legal/privacy',
  '/this-route-does-not-exist',
];

/*
  The sandbox cannot reach Google's font hosts, so the requests are answered
  locally rather than aborted. That distinction matters: CSP is evaluated when
  the fetch is initiated, before interception, so a blocked font stylesheet
  still fires a violation — but an aborted one produces a request failure that
  looks identical to a CSP block in the report. Fulfilling keeps the two apart.
*/
const FONT_CSS = `@font-face{font-family:Inter;src:local("Inter");font-display:swap}`;

/*
  --interact additionally drives the paths that inject a <style> element at
  RUNTIME, which a load-only sweep never reaches.

  This matters for one directive. Three of the four bundles that call
  `createElement('style')` fill it with inline content — react-draggable with
  `innerHTML`, lightweight-charts with `innerText`, and this app's own Pulse
  pop-out (src/pages/pulse/detach.ts) with `textContent` — and CSP refuses all
  three without `style-src 'unsafe-inline'`. Only framer-motion uses
  `sheet.insertRule`, which is CSSOM and exempt. All of them are behind a user
  action, which is exactly why loading every route reports nothing.

  The style-element count is reported alongside the violations on purpose. A run
  that drove nothing produces the same clean zero as a run that drove everything,
  and only one of those means anything.
*/
const INTERACT = process.argv.includes('--interact');

const violations = [];
const pageErrors = [];
const failedRequests = [];
const unobserved = [];
let styleElsAdded = 0;
let interactionsRun = 0;

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

await context.route('**://fonts.googleapis.com/**', r =>
  r.fulfill({ status: 200, contentType: 'text/css', body: FONT_CSS })
);
await context.route('**://fonts.gstatic.com/**', r =>
  r.fulfill({ status: 200, contentType: 'font/woff2', body: '' })
);

// Seeded before any document script runs, so the onboarding overlay and the
// boot animation do not sit on top of the routes being measured.
await context.addInitScript(() => {
  localStorage.setItem('slayer_onboarded_v1', '1');
  localStorage.setItem('slayer_booted_v1', '1');
  window.__cspViolations = [];
  document.addEventListener('securitypolicyviolation', e => {
    window.__cspViolations.push({
      directive: e.effectiveDirective || e.violatedDirective,
      blocked: e.blockedURI,
      sample: e.sample || '',
      line: e.lineNumber || 0,
    });
  });
});

const countStyleEls = page => page.evaluate(() => document.querySelectorAll('style').length);

/** Returns how many <style> elements the interactions caused to appear. */
async function interact(page, route) {
  const before = await countStyleEls(page);

  // Chart crosshairs — lightweight-charts and the SVG desks both build their
  // read-out on pointer move.
  for (const sel of ['canvas', 'svg']) {
    const el = page.locator(sel).first();
    if (await el.count()) {
      const box = await el.boundingBox().catch(() => null);
      if (box) {
        for (const f of [0.3, 0.5, 0.7]) {
          await page.mouse.move(box.x + box.width * f, box.y + box.height / 2);
          await page.waitForTimeout(120);
        }
        interactionsRun++;
      }
    }
  }

  // The command palette, which mounts an overlay and traps focus.
  await page.keyboard.press('Meta+k').catch(() => {});
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape').catch(() => {});

  // Pulse's workspace drag is the one that reaches react-draggable's
  // `innerHTML` injection. It only becomes draggable in edit mode, which the
  // desk binds to `E`.
  if (route === '/pulse') {
    await page.keyboard.press('e').catch(() => {});
    await page.waitForTimeout(600);
    const item = page.locator('.react-grid-item').first();
    if (await item.count()) {
      const box = await item.boundingBox().catch(() => null);
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + 12);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 140, box.y + 90, { steps: 12 });
        await page.waitForTimeout(300);
        await page.mouse.up();
        interactionsRun++;
      }
    }
    await page.waitForTimeout(400);
  }

  await page.waitForTimeout(300);
  return (await countStyleEls(page)) - before;
}

const page = await context.newPage();
page.on('pageerror', e => pageErrors.push({ route: page.url(), message: String(e).slice(0, 300) }));
page.on('requestfailed', r => {
  const url = r.url();
  if (url.startsWith(BASE)) failedRequests.push({ url, why: r.failure()?.errorText ?? '?' });
});

for (const route of ROUTES) {
  try {
    await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
  } catch {
    // networkidle never settles on the desks that tick; the load is what matters.
  }
  // The trailer is an autoplaying timeline and Prove It builds a WebGL scene —
  // both reach for more of the platform than a static desk does.
  await page.waitForTimeout(route === '/trailer' || route === '/prove-it' ? 6000 : 1500);

  if (INTERACT) styleElsAdded += await interact(page, route);

  /*
    `null` means the init script never ran — a navigation failure, or an error
    page. That has to be distinguishable from "listener ran, saw nothing",
    because the two produce the same empty array and only one of them is good
    news. Reporting zero violations from a page that never loaded is the exact
    way a checker like this lies.
  */
  const found = await page.evaluate(() =>
    Array.isArray(window.__cspViolations) ? window.__cspViolations.splice(0) : null
  );
  if (found === null) {
    unobserved.push(route);
    process.stdout.write(`DEAD ${route}  (no listener — page did not load)\n`);
    continue;
  }
  for (const v of found) violations.push({ route, ...v });
  process.stdout.write(`${found.length ? 'CSP ' : 'ok  '} ${route}${found.length ? ` (${found.length})` : ''}\n`);
}

await browser.close();

const key = v => `${v.directive} | ${v.blocked} | ${v.sample}`;
const grouped = new Map();
for (const v of violations) {
  if (!grouped.has(key(v))) grouped.set(key(v), []);
  grouped.get(key(v)).push(v.route);
}

console.log(`\n${'='.repeat(70)}`);
console.log(`CSP violations: ${violations.length} across ${ROUTES.length} routes`);
if (INTERACT) {
  console.log(`interactions driven: ${interactionsRun}; <style> elements they added: ${styleElsAdded}`);
  if (styleElsAdded === 0) {
    console.log('!! nothing injected a stylesheet — this run says nothing about runtime <style> paths');
  }
}
if (unobserved.length) {
  console.log(`\n!! ${unobserved.length} route(s) were never observed — treat the run as invalid:`);
  for (const r of unobserved) console.log(`     ${r}`);
}
for (const [k, routes] of grouped) {
  console.log(`\n  ${k}`);
  console.log(`    on ${routes.length} route(s): ${routes.slice(0, 6).join(', ')}${routes.length > 6 ? ' …' : ''}`);
}
if (pageErrors.length) {
  console.log(`\nPage errors: ${pageErrors.length}`);
  for (const e of pageErrors.slice(0, 10)) console.log(`  ${e.message}`);
}
if (failedRequests.length) {
  console.log(`\nFailed same-origin requests: ${failedRequests.length}`);
  for (const r of failedRequests.slice(0, 10)) console.log(`  ${r.why}  ${r.url}`);
}
console.log('='.repeat(70));

process.exit(violations.length || pageErrors.length || failedRequests.length || unobserved.length ? 1 : 0);
