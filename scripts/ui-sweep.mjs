/*
  BROWSER SWEEP for the Terrain desk and the phone's Pulse. Runs against a
  built `dist/` served on :4319 (see `npm run test:ui`).

  Everything here was a scratch script first. Three things had to change before
  any of it belonged in the repo, and each one was a way for this file to be
  decorative rather than load-bearing:

  1. THEY ALL EXITED 0. Every scratch probe printed "N failing" and then
     `process.exit(0)`. They worked because a person read the output. Wired
     into CI unchanged, they could never fail a build. This one exits 1.

  2. THE BROWSER HAS TO BE ABLE TO PAINT. Playwright's default resolves to
     `chromium_headless_shell`, and under that shell lightweight-charts never
     sizes its bitmaps: a plot canvas stays 300px wide inside a 1400px box and
     draws nothing. Every geometry assertion still passes, and — worse — the
     "no level capsule in the price gutter" assertion passes BECAUSE THE
     GUTTER IS EMPTY. A sweep that reports green for that reason is worse than
     no sweep, so `assertCanPaint` refuses to run at all unless the bitmaps
     are really being sized and there is really ink on them.

  3. COST. Cold-loading a page per cell took six minutes for one matrix.
     Driving the desk WARM — one load, then the layout button and
     setViewportSize — reproduces the cold numbers exactly at about a tenth of
     the time. The cold loads that remain are the ones that are ABOUT loading:
     migration and persistence.
*/
import { existsSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.SWEEP_URL || 'http://localhost:4319';
const BOOT_MS = 8000; // the splash; measured to settle well under this

let fails = 0;
const ok = m => console.log(`  ok   ${m}`);
const bad = m => {
  fails++;
  console.log(`  FAIL ${m}`);
};
const head = t => console.log(`\n${t}`);

/* Constants the desk's own source says are "asserted in the sweep". They are
   asserted below; if these drift the comment stops being true. */
const TIME_AXIS_PX = 26;
const PRICE_GUTTER_PX = 56;

/*
  A REAL chromium, not the headless shell — see note 2 above.

  Tried in order, first one that launches wins: an explicit binary, whatever
  full chromium is unpacked in a browsers directory, then Playwright's
  `channel: 'chromium'` (which asks for the full build by name rather than the
  shell), then the plain default. On a CI runner only the last two exist, and
  the default is the shell — which is why the order matters and why the paint
  guard below is the real backstop rather than this list.
*/
function candidates() {
  const out = [];
  const explicit = process.env.SWEEP_CHROMIUM;
  if (explicit && existsSync(explicit)) out.push({ executablePath: explicit });
  for (const root of ['/opt/pw-browsers', process.env.PLAYWRIGHT_BROWSERS_PATH]) {
    if (!root || !existsSync(root)) continue;
    for (const dir of readdirSync(root)) {
      if (!dir.startsWith('chromium-')) continue; // NOT chromium_headless_shell-*
      const p = `${root}/${dir}/chrome-linux/chrome`;
      if (existsSync(p)) out.push({ executablePath: p });
    }
  }
  out.push({ channel: 'chromium' });
  out.push({});
  return out;
}

async function launch() {
  const tried = [];
  for (const opts of candidates()) {
    try {
      return await chromium.launch(opts);
    } catch (e) {
      tried.push(`${JSON.stringify(opts)}: ${String(e).split('\n')[0]}`);
    }
  }
  console.error(`No chromium would launch.\n${tried.join('\n')}`);
  process.exit(1);
}

const seed = (layout, panes) =>
  JSON.stringify({
    layout,
    panes: panes.map(t => ({
      ticker: t,
      timeframe: '15m',
      overlays: { trails: true, levels: true, darkpool: false, volume: true },
      indicators: { ema9: false, ema21: false, ema50: false, vwap: false },
      chartStyle: 'candles',
      compares: [],
      ladder: true,
    })),
    setups: {},
  });

const TICKERS = ['SPY', 'QQQ', 'AAPL', 'NVDA'];

const browser = await launch();

async function openDesk(width, height, layout) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.addInitScript(
    `localStorage.setItem('slayer_terrain_v1', ${JSON.stringify(seed(layout, TICKERS))})`
  );
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(`${BASE}/terrain`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(BOOT_MS);
  return { ctx, page, errs };
}

/* ─────────────────────────────────────────────────────────────────────────
   0. CAN THIS BROWSER PAINT AT ALL?
   ───────────────────────────────────────────────────────────────────────── */
head('the browser is one that actually draws');
{
  const { ctx, page } = await openDesk(1600, 1000, 1);
  const paint = await page.evaluate(() => {
    const plot = [...document.querySelectorAll('canvas')].find(c => c.getBoundingClientRect().height > 200);
    if (!plot) return { plot: false };
    const box = Math.round(plot.getBoundingClientRect().width);
    const d = plot.getContext('2d').getImageData(0, 0, plot.width, plot.height).data;
    let ink = 0;
    for (let k = 3; k < d.length; k += 4) if (d[k] > 8) ink++;
    return { plot: true, box, bitmap: plot.width, ink };
  });
  const sized = paint.plot && Math.abs(paint.bitmap - paint.box) <= 2 && paint.ink > 500;
  if (!sized) {
    console.log(
      `  FAIL the chart canvas is ${paint.bitmap}px for a ${paint.box}px box with ${paint.ink} pixels of ink.\n` +
        '       This is the headless shell, which never sizes lightweight-charts bitmaps.\n' +
        '       Every geometry check below would pass, and the "nothing in the price\n' +
        '       gutter" check would pass because the gutter is empty. Refusing to run.\n' +
        '       Set SWEEP_CHROMIUM to a full chromium binary.'
    );
    await ctx.close();
    await browser.close();
    process.exit(1);
  }
  ok(`canvas ${paint.bitmap}px for a ${paint.box}px box, ${paint.ink} pixels of ink`);
  await ctx.close();
}

/* ─────────────────────────────────────────────────────────────────────────
   1. GEOMETRY — every layout at every width, driven WARM.
   ───────────────────────────────────────────────────────────────────────── */
const WIDTHS = [390, 768, 1024, 1280, 1440, 1535, 1536, 1920];

head('nothing spills sideways and no pane collapses');
{
  const { ctx, page, errs } = await openDesk(1920, 1000, 1);
  for (const layout of [1, 2, 3, 4]) {
    /* The arrangement buttons carry the key in their tooltip, so match on the
       prefix rather than the whole string. */
    await page.locator(`[title^="${layout} chart"]`).first().click();
    await page.waitForTimeout(500);
    const row = [];
    let clean = true;
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(650);
      const m = await page.evaluate(() => {
        const de = document.documentElement;
        const plots = [...document.querySelectorAll('canvas')]
          .map(c => c.getBoundingClientRect())
          .filter(r => r.height > 100);
        return {
          sideways: Math.max(0, de.scrollWidth - de.clientWidth),
          shortest: plots.length ? Math.round(Math.min(...plots.map(r => r.height))) : 0,
        };
      });
      row.push(`${width}:${m.sideways}/${m.shortest}`);
      /* 150px is not a threshold, it is the shape of the bug this catches: a
         pane that lands in an implicit grid row is sized to its content and
         comes out at ~174px next to neighbours at 900. */
      if (m.sideways > 0 || m.shortest < 150) clean = false;
    }
    clean
      ? ok(`layout ${layout} — width:sideways/shortest-plot — ${row.join('  ')}`)
      : bad(`layout ${layout} — ${row.join('  ')}`);
  }
  errs.length === 0 ? ok('no uncaught exception across the matrix') : bad(`${errs.length}: ${errs[0]}`);
  await ctx.close();
}

/* ─────────────────────────────────────────────────────────────────────────
   2. THE TWO CONSTANTS the desk's source says are asserted here.
   ───────────────────────────────────────────────────────────────────────── */
head('the measured constants still measure');
{
  const { ctx, page } = await openDesk(1600, 1000, 1);
  const m = await page.evaluate(() => {
    const cs = [...document.querySelectorAll('canvas')].map(c => c.getBoundingClientRect());
    const plot = cs.filter(r => r.height > 200 && r.width > 200);
    const gutter = cs.filter(r => r.height > 200 && r.width > 30 && r.width < 90);
    const axis = cs.filter(r => r.height > 10 && r.height < 60 && r.width > 200);
    return {
      gutter: gutter.length ? Math.round(gutter[0].width) : null,
      axis: axis.length ? Math.round(axis[0].height) : null,
      plots: plot.length,
    };
  });
  /* Both constants are CLEARANCES, so the assertion is the relationship, not
     the number: at least as wide as the thing being cleared, and not so much
     wider that the desk is giving away chart for nothing. Asserting equality
     would fail on a 2px margin that is doing its job. */
  const clears = (name, want, got, slack = 6) => {
    if (got == null) return bad(`${name}: could not measure it`);
    if (got > want) return bad(`${name} is ${got}px but the desk only clears ${want}px — chrome will land on it`);
    if (want - got > slack) return bad(`${name} is ${got}px and the desk clears ${want}px — ${want - got}px of chart thrown away`);
    ok(`${name} is ${got}px and the desk clears ${want}px`);
  };
  clears('the time axis', TIME_AXIS_PX, m.axis);
  clears('the price gutter', PRICE_GUTTER_PX, m.gutter);
  await ctx.close();
}

/* ─────────────────────────────────────────────────────────────────────────
   3. THE RAIL IS ON THE CHART'S PRICE SCALE.
   The defect this replaces: two number columns 54px apart disagreeing by $11.
   ───────────────────────────────────────────────────────────────────────── */
head('the strike rail and the chart agree about where a price is');
{
  const { ctx, page } = await openDesk(1600, 1000, 1);
  for (const layout of [1, 2, 4]) {
    await page.locator(`[title^="${layout} chart"]`).first().click();
    await page.waitForTimeout(900);
    const rails = await page.evaluate(() => {
      return [...document.querySelectorAll('[aria-label$="exposure by strike"]')].map(rail => {
        const rows = [...rail.querySelectorAll('[data-strike]')]
          .filter(el => el.style.display !== 'none')
          .map(el => {
            const r = el.getBoundingClientRect();
            return { k: Number(el.dataset.strike), y: r.y + r.height / 2 };
          });
        const card = [...rail.parentElement.querySelectorAll('div[aria-hidden]')].find(
          d => getComputedStyle(d).backgroundColor === 'rgba(72, 78, 98, 0.92)'
        );
        const spotRule = [...rail.querySelectorAll('[data-rule="spot"]')].find(el => el.style.display !== 'none');
        const cr = card?.getBoundingClientRect();
        const sr = spotRule?.getBoundingClientRect();
        return {
          rows,
          cardText: (card?.firstElementChild?.textContent || '').trim(),
          cardY: cr ? cr.y + cr.height / 2 : null,
          ruleText: (spotRule?.querySelector('span:last-child')?.textContent || '').trim(),
          ruleY: sr ? sr.y + sr.height / 2 : null,
        };
      });
    });
    if (rails.length !== layout) {
      bad(`layout ${layout}: expected ${layout} rail(s), found ${rails.length}`);
      continue;
    }
    let worst = 0;
    let thin = 0;
    for (const r of rails) {
      if (r.rows.length < 3) {
        thin++;
        continue;
      }
      /* Straight-line fit of y against price. Placed by price, the residual is
         nil; placed by index it is not, the moment any strike is culled. */
      const n = r.rows.length;
      const mx = r.rows.reduce((s, x) => s + x.k, 0) / n;
      const my = r.rows.reduce((s, x) => s + x.y, 0) / n;
      let sxy = 0;
      let sxx = 0;
      for (const x of r.rows) {
        sxy += (x.k - mx) * (x.y - my);
        sxx += (x.k - mx) ** 2;
      }
      const slope = sxy / sxx;
      const c = my - slope * mx;
      for (const x of r.rows) worst = Math.max(worst, Math.abs(x.y - (slope * x.k + c)));
    }
    thin === 0
      ? ok(`layout ${layout}: every rail drew enough rows to check`)
      : bad(`layout ${layout}: ${thin} rail(s) drew fewer than 3 rows`);
    worst <= 1.5
      ? ok(`layout ${layout}: every row within ${worst.toFixed(2)}px of its own price`)
      : bad(`layout ${layout}: a row sits ${worst.toFixed(1)}px from its price — the rail is off the scale`);

    /* The decisive one: two elements placed by two different loops in two
       different files, printing the same number, must be at the same height. */
    for (const r of rails) {
      if (!r.cardText || r.cardText !== r.ruleText) continue;
      const dy = Math.abs(r.cardY - r.ruleY);
      dy <= 2
        ? ok(`layout ${layout}: both columns print ${r.cardText} at the same height (${dy.toFixed(2)}px)`)
        : bad(`layout ${layout}: both print ${r.cardText} but ${dy.toFixed(0)}px apart`);
    }
  }
  await ctx.close();
}

/* ─────────────────────────────────────────────────────────────────────────
   4. CROSSHAIR SYNC — the moment crosses panes, the price does not.
   ───────────────────────────────────────────────────────────────────────── */
head('hovering one pane marks the moment on the others');
{
  const { ctx, page } = await openDesk(1920, 1000, 2);
  /* Read the TOP canvas of each stacked pair — the crosshair has it to itself,
     so the live tape cannot pollute the measurement. The arms are DASHED, at a
     measured ~50% duty, which is why the threshold is 30% and not 80%. */
  const readArms = () =>
    page.evaluate(() => {
      const plots = [...document.querySelectorAll('canvas')].filter(c => {
        const r = c.getBoundingClientRect();
        return r.height > 200 && r.width > 200;
      });
      const out = [];
      for (let i = 1; i < plots.length; i += 2) {
        const c = plots[i];
        const r = c.getBoundingClientRect();
        const W = c.width;
        const H = c.height;
        const d = c.getContext('2d').getImageData(0, 0, W, H).data;
        const col = new Array(W).fill(0);
        const row = new Array(H).fill(0);
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            if (d[(y * W + x) * 4 + 3] > 8) {
              col[x]++;
              row[y]++;
            }
          }
        }
        out.push({
          cols: col.filter(v => v > H * 0.3).length,
          rows: row.filter(v => v > W * 0.3).length,
          left: Math.round(r.x),
          top: Math.round(r.y),
          W,
          H,
        });
      }
      return out;
    });

  await page.mouse.move(960, 8);
  await page.waitForTimeout(600);
  let arms = await readArms();
  arms.length === 2 ? ok('two panes to compare') : bad(`found ${arms.length} panes`);
  arms.every(a => !a.cols && !a.rows) ? ok('no crosshair anywhere at rest') : bad('a crosshair is drawn at rest');

  const a = arms[0];
  const hx = a.left + Math.round(a.W * 0.45);
  const hy = a.top + Math.round(a.H * 0.5);
  await page.mouse.move(hx - 5, hy);
  await page.mouse.move(hx, hy);
  await page.waitForTimeout(450);
  arms = await readArms();
  arms[0].cols && arms[0].rows ? ok('the hovered pane draws both arms') : bad('the hovered pane is missing an arm');
  arms[1].cols ? ok('the other pane is marked') : bad('the moment did not cross');
  arms[1].rows === 0
    ? ok('and it draws no horizontal arm — the moment crossed, the price did not')
    : bad('a foreign price is on the other pane');

  await page.mouse.move(960, 8);
  await page.waitForTimeout(500);
  arms = await readArms();
  arms.every(x => !x.cols && !x.rows) ? ok('both clear when the pointer leaves') : bad('ink survived the leave');

  /* The loop this feature can have: every series update re-fires the library's
     crosshair event, and each pane updates four series a tick. */
  await page.waitForTimeout(6500);
  arms = await readArms();
  arms.every(x => !x.cols && !x.rows)
    ? ok('still clear across four live ticks — a tick does not look like a hover')
    : bad('a tick raised a crosshair by itself');
  await ctx.close();
}

/* ─────────────────────────────────────────────────────────────────────────
   5. COLD, because these are about loading.
   ───────────────────────────────────────────────────────────────────────── */
head('what a browser is already holding');
{
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  /* The flat pre-pane shape: one desk-wide interval and a list of tickers. */
  await ctx.addInitScript(
    `localStorage.setItem('slayer_terrain_v1', ${JSON.stringify(
      JSON.stringify({ layout: 2, tickers: ['NVDA', 'TSLA'], timeframe: '1h', chartStyle: 'line' })
    )})`
  );
  const page = await ctx.newPage();
  await page.goto(`${BASE}/terrain`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(BOOT_MS);
  const c = await page.evaluate(() => JSON.parse(localStorage.getItem('slayer_terrain_v1')));
  c.panes?.[0]?.ticker === 'NVDA' && c.panes?.[1]?.ticker === 'TSLA'
    ? ok('the old shape kept its symbols — NVDA, TSLA')
    : bad(`symbols came back as ${c.panes?.map(p => p.ticker).join(', ')}`);
  c.panes?.[0]?.timeframe === '1h' && c.panes?.[1]?.timeframe === '1h'
    ? ok('the one desk-wide interval became every pane\'s interval')
    : bad(`intervals are ${c.panes?.map(p => p.timeframe).join(', ')}`);
  c.panes?.length === 4 && !('tickers' in c)
    ? ok('and it was written back in the new shape, with no stale keys')
    : bad(`rewritten as ${Object.keys(c).join(', ')} with ${c.panes?.length} panes`);
  Object.keys(c.setups || {}).length > 0
    ? ok(`the migration seeded ${Object.keys(c.setups).join(', ')} from rows the reader had configured`)
    : bad('the migration seeded no symbol setups');
  await ctx.close();
}

head('one pane at a time, and it survives a reload');
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1000 } });
  await ctx.addInitScript(
    `if (!localStorage.getItem('slayer_terrain_v1')) localStorage.setItem('slayer_terrain_v1', ${JSON.stringify(
      seed(3, TICKERS)
    )})`
  );
  const page = await ctx.newPage();
  await page.goto(`${BASE}/terrain`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(BOOT_MS);
  const tfs = () => page.evaluate(() => JSON.parse(localStorage.getItem('slayer_terrain_v1')).panes.map(p => p.timeframe));
  const before = await tfs();
  before.slice(0, 3).every(t => t === '15m') ? ok(`three panes on ${before[0]}`) : bad(`started at ${before}`);
  /* `=` steps the ACTIVE pane's interval — pane one from first paint. */
  await page.keyboard.press('=');
  await page.waitForTimeout(500);
  const after = await tfs();
  after[0] !== before[0] && after[1] === before[1] && after[2] === before[2]
    ? ok(`one pane moved to ${after[0]}, the others untouched — ${JSON.stringify(after.slice(0, 3))}`)
    : bad(`the keypress changed ${JSON.stringify(after)}`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(BOOT_MS);
  const back = await tfs();
  JSON.stringify(back) === JSON.stringify(after)
    ? ok('and it is still there after a reload')
    : bad(`after a reload it reads ${JSON.stringify(back)}`);
  await ctx.close();
}

/* ─────────────────────────────────────────────────────────────────────────
   6. THE PHONE'S PULSE — one chart, and the desk not built at all.

   Every assertion here exists because the FIRST version of this layout passed
   the obvious ones. It had a full-height chart, a correctly sized canvas with
   22,625 pixels of ink, and no sideways page scroll — and it was unusable: the
   control strip had wrapped into a ~600px column down the right edge, sitting
   on the price axis and covering most of the tape. Nothing that measures the
   chart can see that, so the checks below measure the STRIP, and where it sits
   relative to the tape.
   ───────────────────────────────────────────────────────────────────────── */
head('the phone gets one chart, not a crushed desk');
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(`${BASE}/pulse`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(BOOT_MS);

  const g = await page.evaluate(() => {
    const strip = [...document.querySelectorAll('div')].find(d => {
      const c = d.className;
      return typeof c === 'string' && c.includes('backdrop-blur-md') && c.includes('backdrop-saturate-150');
    });
    const canvas = [...document.querySelectorAll('canvas')].sort(
      (a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height
    )[0];
    const cr = canvas?.getBoundingClientRect();
    const sr = strip?.getBoundingClientRect();
    let ink = 0;
    if (canvas) {
      const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      for (let k = 3; k < d.length; k += 4) if (d[k] > 8) ink++;
    }
    return {
      innerH: window.innerHeight,
      grid: !!document.querySelector('.react-grid-layout'),
      chartH: cr ? Math.round(cr.height) : 0,
      chartBottom: cr ? Math.round(cr.bottom) : 0,
      bitmap: canvas?.width ?? 0,
      box: cr ? Math.round(cr.width) : 0,
      ink,
      stripTop: sr ? Math.round(sr.top) : null,
      stripH: sr ? Math.round(sr.height) : null,
      hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      triggers: strip
        ? [...strip.querySelectorAll('button')].map(bt => ({
            name: (bt.getAttribute('title') || bt.getAttribute('aria-label') || '').trim(),
            h: Math.round(bt.getBoundingClientRect().height),
          }))
        : [],
    };
  });

  /* The desk must not merely be hidden — it must never have been built. Ten
     live panels mounting behind a `md:hidden` is the cost this branch exists
     to avoid, and only the DOM can tell the two apart. */
  !g.grid ? ok('the widget desk was not mounted at all') : bad('react-grid-layout is in the DOM at 390px');

  g.chartH > g.innerH * 0.6
    ? ok(`the chart is ${g.chartH}px of an ${g.innerH}px window`)
    : bad(`the chart is only ${g.chartH}px of ${g.innerH}px`);

  /* Really painted, at THIS width — a chart in a container that collapsed to
     zero width still reports a height. */
  Math.abs(g.bitmap - g.box) <= 2 && g.ink > 500
    ? ok(`its canvas is ${g.bitmap}px for a ${g.box}px box, ${g.ink} pixels of ink`)
    : bad(`canvas ${g.bitmap}px for a ${g.box}px box with ${g.ink} pixels of ink`);

  /* THE ONE THAT CATCHES THE COLLAPSE. A strip that has wrapped into a column
     is tall; a strip laid over the tape starts above the tape's bottom. */
  g.stripH !== null && g.stripH <= 140
    ? ok(`the control strip is ${g.stripH}px`)
    : bad(`the control strip is ${g.stripH}px — it has wrapped`);

  g.stripTop !== null && g.stripTop >= g.chartBottom - 2
    ? ok('and it sits below the tape rather than over it')
    : bad(`the strip starts at ${g.stripTop}px, above the tape's bottom at ${g.chartBottom}px`);

  /* Reachable by a finger, not just by a cursor. */
  const small = g.triggers.filter(t => t.h < 40);
  g.triggers.length >= 6 && small.length === 0
    ? ok(`${g.triggers.length} controls, every one at least 40px tall`)
    : bad(
        `${g.triggers.length} controls, ${small.length} under 40px: ` +
          JSON.stringify(small.map(t => `${t.name} ${t.h}px`))
      );

  /* The symbol is changeable — the desk header that normally carries the
     picker does not exist here, so the chart has to carry it itself. */
  g.triggers.some(t => /ticker|symbol/i.test(t.name))
    ? ok('the symbol can be changed from the strip')
    : bad('no symbol picker on the strip — the chart is stuck on one name');

  g.hscroll === 0 ? ok('nothing scrolls sideways') : bad(`${g.hscroll}px of sideways scroll`);
  errs.length === 0 ? ok('no page errors') : bad(`page errors: ${errs.slice(0, 2).join(' | ')}`);

  /* Every menu opens UPWARD off a strip on the bottom edge, and lands on
     screen. Downward would put it past the bottom of a page that does not
     scroll — present in the DOM, and unreachable. */
  for (const name of ['Timeframe', 'Overlays']) {
    const trigger = page.locator(`button[title="${name}"]`).first();
    if (!(await trigger.count())) {
      bad(`no ${name} control on the phone strip`);
      continue;
    }
    await trigger.click();
    await page.waitForTimeout(400);
    const panel = await page.evaluate(() => {
      const p = [...document.querySelectorAll('div')].find(d => {
        const c = d.className;
        return typeof c === 'string' && c.includes('z-40') && c.includes('min-w-[210px]');
      });
      if (!p) return null;
      const r = p.getBoundingClientRect();
      return { inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth };
    });
    panel?.inView ? ok(`the ${name} menu opens fully on screen`) : bad(`the ${name} menu opens off screen`);
    await page.keyboard.press('Escape');
    await page.mouse.click(195, 300);
    await page.waitForTimeout(300);
  }
  await ctx.close();
}

/* And the other half: the desk is still THERE on a desk-sized window. A branch
   that simply deleted it would pass every check above. */
head('the desk survives above the phone line');
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/pulse`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(BOOT_MS);
  const d = await page.evaluate(() => {
    const grid = document.querySelector('.react-grid-layout');
    return {
      grid: !!grid,
      panels: grid ? grid.children.length : 0,
      hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  d.grid && d.panels >= 2
    ? ok(`the widget desk is mounted with ${d.panels} panels at 1280px`)
    : bad(`at 1280px the desk has ${d.panels} panels (grid: ${d.grid})`);
  d.hscroll === 0 ? ok('and nothing scrolls sideways') : bad(`${d.hscroll}px of sideways scroll`);
  await ctx.close();
}

console.log(`\n${fails} failing`);
await browser.close();
process.exit(fails ? 1 : 0);
