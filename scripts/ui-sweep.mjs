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
/* Mirrors PRICE_SCALE_MIN_WIDTH + 2 in the source. A THIRD copy of the
   number would be the same bug this file just caught, so when it moves, it
   moves here too — and the assertion below is the relationship, not equality,
   so a small margin does not fail. */
const PRICE_GUTTER_PX = 76;

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
/*
  BOTH ORIENTATIONS, and the second one is here because the first shipped
  broken. The rule was width-only, so an iPhone in landscape — 844x390, WIDER
  than the md floor — took the desktop branch and got the full widget desk
  inside 390px of height: page header, desk rail, two buttons, and the charts
  starting below the fold. Every portrait assertion passed the whole time. A
  phone is small in its SHORT side whichever way it is held, so the desk test
  has to be held both ways too.
*/
for (const [orientation, viewport] of [
  ['portrait', { width: 390, height: 844 }],
  ['landscape', { width: 844, height: 390 }],
]) {
head(`the phone gets one chart, not a crushed desk — ${orientation}`);
{
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
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

  /* Landscape has 56px of top bar and a strip to pay for out of 390px, so it
     cannot reach portrait's share; what matters is that the tape is still the
     largest thing on the screen. */
  const floor = orientation === 'portrait' ? 0.6 : 0.5;
  g.chartH > g.innerH * floor
    ? ok(`the chart is ${g.chartH}px of an ${g.innerH}px window`)
    : bad(`the chart is only ${g.chartH}px of ${g.innerH}px`);

  /* Really painted, at THIS width — a chart in a container that collapsed to
     zero width still reports a height. */
  Math.abs(g.bitmap - g.box) <= 2 && g.ink > 500
    ? ok(`its canvas is ${g.bitmap}px for a ${g.box}px box, ${g.ink} pixels of ink`)
    : bad(`canvas ${g.bitmap}px for a ${g.box}px box with ${g.ink} pixels of ink`);

  /* THE ONE THAT CATCHES THE COLLAPSE. A strip that has wrapped into a column
     is tall; a strip laid over the tape starts above the tape's bottom. */
  /* Landscape is wider, so the same controls fit on ONE row — the cap is
     tighter there precisely because there is no excuse for a second line. */
  const stripCap = orientation === 'portrait' ? 140 : 90;
  g.stripH !== null && g.stripH <= stripCap
    ? ok(`the control strip is ${g.stripH}px`)
    : bad(`the control strip is ${g.stripH}px, over the ${stripCap}px cap — it has wrapped`);

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
      /*
        Found by its data attribute, not by its classes. The menu is a PORTAL
        now — it renders at the body so no clipping ancestor can cut it off —
        and the class-based selector this used went stale the moment that
        landed, which turned two real assertions into two that could only ever
        fail. A marker attribute is the contract; the classes are styling.
      */
      const p = document.querySelector('[data-toolbar-menu]');
      if (!p) return null;
      /*
        AND THE TEST IS PER-ROW AND SCROLL-AWARE.

        Three versions of this got it wrong in three different ways, which is
        worth writing down because each one LOOKED like a reachability test.

        v1 asked whether the PANEL's box was inside the window. A panel can be
        entirely on screen and still hold rows that are not — it scrolls.

        v2 hit-tested every row where it currently sat. That caught the real
        clipping bug and then failed on a menu that was working perfectly: on a
        390px-tall handset the eight-row Overlays menu is a 273px scroller, so
        its last two rows are legitimately below its own fold. "Not visible
        right now" is not "unreachable".

        v3, this one, scrolls each row into its menu's view and THEN hit-tests
        it. That is the actual question a user has: can I get to this row? It
        still catches the clipping bug — a row clipped by an ANCESTOR does not
        come into view when the menu scrolls, because the menu is not what is
        hiding it.
      */
      const rows = [...p.querySelectorAll('button')];
      let unreachable = 0;
      const missed = [];
      for (const b of rows) {
        b.scrollIntoView({ block: 'nearest' });
        const rr = b.getBoundingClientRect();
        const off = rr.bottom > innerHeight + 1 || rr.top < -1 || rr.left < -1 || rr.right > innerWidth + 1;
        const hit = off
          ? null
          : document.elementFromPoint(Math.round(rr.left + rr.width / 2), Math.round(rr.top + rr.height / 2));
        if (off || !(hit && (hit === b || b.contains(hit)))) {
          unreachable++;
          missed.push((b.textContent || '').trim().slice(0, 20));
        }
      }
      /* Re-measure the panel AFTER the scrolling above, or `inView` is a
         reading of where it was before the loop moved anything. */
      const r2 = p.getBoundingClientRect();
      return {
        inView: r2.top >= -1 && r2.bottom <= innerHeight + 1 && r2.left >= -1 && r2.right <= innerWidth + 1,
        rows: rows.length,
        unreachable,
        missed,
        scrolls: p.scrollHeight > p.clientHeight + 1,
      };
    });
    if (!panel) bad(`the ${name} menu did not open at all`);
    else if (!panel.inView) bad(`the ${name} menu opens off screen`);
    else if (panel.unreachable)
      bad(`${panel.unreachable} of ${panel.rows} ${name} rows cannot be tapped: ${panel.missed.join(', ')}`);
    else
      ok(
        `the ${name} menu opens on screen with all ${panel.rows} rows reachable${panel.scrolls ? ' (scrolling)' : ''}`
      );
    await page.keyboard.press('Escape');
    await page.mouse.click(Math.round(viewport.width / 2), Math.round(viewport.height / 2));
    await page.waitForTimeout(300);
  }
  await ctx.close();
}
}

/* And the other half: the desk is still THERE on a desk-sized window. A branch
   that simply deleted it would pass every check above. */
/*
  The other half, and it is not optional: a rule that simply returned true
  would pass every check above. A TABLET is the case that pins the boundary —
  it is touch, like a phone, and it is big enough for a desk, unlike a phone,
  so it is the one device that tells the two clauses apart. Held both ways,
  because the landscape clause is a height test and an iPad in landscape (820)
  is the closest any tablet gets to a phone's 440.
*/
head('the desk survives on everything that can hold it');
{
  for (const [label, viewport, touch] of [
    ['iPad portrait', { width: 820, height: 1180 }, true],
    ['iPad landscape', { width: 1180, height: 820 }, true],
    ['desktop', { width: 1280, height: 900 }, false],
  ]) {
    const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
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
      ? ok(`${label} keeps the desk — ${d.panels} panels at ${viewport.width}x${viewport.height}`)
      : bad(`${label} (${viewport.width}x${viewport.height}) has ${d.panels} panels (grid: ${d.grid})`);
    d.hscroll === 0 ? ok(`${label} scrolls nothing sideways`) : bad(`${label}: ${d.hscroll}px sideways`);
    await ctx.close();
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   A PANE'S OWN MENUS, INSIDE A BOX THAT CLIPS
   ───────────────────────────────────────────────────────────────────────── */
head('every toolbar menu is reachable inside a pane that clips its overflow');
{
  /*
    THE ONE THAT WOULD HAVE CAUGHT IT. A pane's box is `overflow-hidden` — it
    has to be, for its rounded corners and to contain the chart — and the
    toolbar floats inside it. While the menus were `position: absolute` they
    were cut off at the pane's bottom edge: measured at 1440x900 with four
    panes, the Overlays menu ran to y=696 against a pane clipping at y=475 and
    three of its eight rows were rendered, invisible and unclickable. The
    candle theme menu lost four of eleven.

    Nothing in this file could see it, because menus were only ever opened on
    the phone's Pulse, where the toolbar's ancestor does not clip. The desk is
    where panes are short and where the bug lived.
  */
  for (const [w, h, layout] of [
    [1440, 900, 4],
    [1920, 1080, 4],
    [1280, 800, 3],
  ]) {
    const { ctx, page, errs } = await openDesk(w, h, layout);
    /* The toolbar only appears on hover — it is deliberately not there until
       you reach for it. */
    const pane = page.locator('[role="group"], canvas').first();
    await pane.hover().catch(() => {});
    await page.waitForTimeout(500);

    let checked = 0;
    const broken = [];
    for (const name of ['Overlays', 'Indicators', 'Chart style', 'Candle theme']) {
      const trigger = page.locator(`button[title="${name}"], button[title^="${name} "]`).first();
      if (!(await trigger.count())) continue;
      await trigger.click({ force: true }).catch(() => {});
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => {
        const p = document.querySelector('[data-toolbar-menu]');
        if (!p) return null;
        const rows = [...p.querySelectorAll('button')];
        let bad = 0;
        for (const b of rows) {
          b.scrollIntoView({ block: 'nearest' });
          const rr = b.getBoundingClientRect();
          const off = rr.bottom > innerHeight + 1 || rr.top < -1 || rr.left < -1 || rr.right > innerWidth + 1;
          const hit = off
            ? null
            : document.elementFromPoint(Math.round(rr.left + rr.width / 2), Math.round(rr.top + rr.height / 2));
          if (off || !(hit && (hit === b || b.contains(hit)))) bad++;
        }
        return { rows: rows.length, bad };
      });
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(150);
      if (!r) continue;
      checked++;
      if (r.bad) broken.push(`${name} ${r.bad}/${r.rows}`);
    }

    checked >= 3
      ? ok(`${w}x${h} L${layout}: opened ${checked} pane menus`)
      : bad(`${w}x${h} L${layout}: only ${checked} pane menus opened — the check below proves little`);
    broken.length === 0
      ? ok(`${w}x${h} L${layout}: every row of every pane menu is reachable`)
      : bad(`${w}x${h} L${layout}: unreachable rows — ${broken.join(', ')}`);
    errs.length === 0 ? ok(`${w}x${h} L${layout}: no page errors opening menus`) : bad(`page errors: ${errs[0]}`);
    await ctx.close();
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   SHRINKING THE DESK PAST THE PANE YOU EXPANDED
   ───────────────────────────────────────────────────────────────────────── */
head('an expanded pane does not outlive the pane it points at');
{
  const { ctx, page } = await openDesk(1440, 900, 4);

  /* Expand the LAST pane, so shrinking the desk is guaranteed to remove it. */
  await page.keyboard.press(']');
  await page.keyboard.press(']');
  await page.keyboard.press(']');
  await page.keyboard.press('f');
  await page.waitForTimeout(700);

  const opened = await page.evaluate(() => ({
    dialog: !!document.querySelector('[role="dialog"][aria-modal="true"]'),
    locked: getComputedStyle(document.body).overflow,
  }));
  opened.dialog
    ? ok('f expands the active pane into a modal')
    : bad('f did not expand the fourth pane — the rest of this check proves nothing');
  opened.locked === 'hidden'
    ? ok('and the page is scroll-locked underneath it')
    : bad(`expected the body locked while expanded, got overflow:${opened.locked}`);

  /* Now shrink past it with the keyboard. This used to be the ONLY door —
     the layout buttons sat at z-30 under the expanded pane's `fixed inset-0
     z-[80]` overlay and could not be clicked. They can be now (section 13
     asserts it); the keyboard is kept here because this check is about the
     stale-index bug, and the key is the shortest path to reproducing it. */
  await page.keyboard.press('2');
  await page.waitForTimeout(700);

  const after = await page.evaluate(() => ({
    dialog: !!document.querySelector('[role="dialog"][aria-modal="true"]'),
    overflow: getComputedStyle(document.body).overflow,
    /* The floating chip that offers to close something. If it is still on
       screen with nothing expanded, it is offering to close nothing. */
    escChip: [...document.querySelectorAll('button')].some(b => (b.textContent || '').trim() === 'Esc'),
    panes: document.querySelectorAll('canvas').length,
  }));

  /*
    THE ONE THAT CATCHES THE BUG. `expanded` is an index and the pane count is
    separate state; nothing used to reconcile them. The overlay vanishing is
    NOT evidence the state was cleared — the pane simply stopped rendering —
    so the assertion has to be about what the stale index left behind.
  */
  after.overflow !== 'hidden'
    ? ok('shrinking past the expanded pane releases the scroll lock')
    : bad('the body is still scroll-locked with nothing expanded');
  !after.escChip
    ? ok('and takes the Esc chip with it')
    : bad('an Esc chip is still offering to close a pane that is not open');
  !after.dialog ? ok('no modal survives the shrink') : bad('a modal survived the shrink');

  /* And the desk is genuinely usable again rather than merely unlocked. */
  const usable = await page.evaluate(() => {
    const el = document.elementFromPoint(Math.round(innerWidth / 2), Math.round(innerHeight / 2));
    return !!el && !el.closest('[role="dialog"]');
  });
  usable ? ok('the desk takes clicks again') : bad('something invisible is still covering the desk');

  await ctx.close();
}

/* ─────────────────────────────────────────────────────────────────────────
   12. NO FLOATING CHROME PRINTS ON A PRICE AXIS.

   The defect this replaces, measured in the shipped build: at a 1024px
   viewport with the strike rail up, every layout from 2 up gives a 369px
   chart column, and the identity row needed 317px of the 287 it had. The 30px
   that did not fit was the EXPAND BUTTON, sitting on the right price ticks —
   on all four panes, with or without a second axis. With an "own scale"
   compare the identity row ALSO overprinted the left axis by 35-40px and the
   toolbar row by 40px, so both axes were covered at once.

   It asserts the GEOMETRY, not the tier constants in Terrain.tsx. The row's
   parts are not fixed width — `min-w-[112px]` on the symbol button is a floor
   a longer symbol grows past, and a four-figure price is wider than the one
   measured — so a threshold that stops being generous enough has to fail the
   build here rather than quietly print on the ticks again.

   TEXT NODES AND CONTROLS, never the row's box: the rows are
   `w-fit max-w-full` with `shrink-0` children, which caps the BOX at the
   column while the contents overflow it visibly. Measuring the box reports
   clean while the screen is wrong — that is how this shipped.
   ───────────────────────────────────────────────────────────────────────── */
head('no pane chrome lands on a price axis');
{
  const seedWith = (layout, compares) =>
    JSON.stringify({
      layout,
      panes: TICKERS.map(t => ({
        ticker: t,
        timeframe: '15m',
        overlays: { trails: true, levels: true, darkpool: false, volume: true },
        indicators: { ema9: false, ema21: false, ema50: false, vwap: false },
        chartStyle: 'candles',
        compares: compares ? [{ ticker: t === 'SPY' ? 'QQQ' : 'SPY', mode: 'scale', ink: '#8B5CF6' }] : [],
        ladder: true,
      })),
      setups: {},
    });

  const probe = async page =>
    page.evaluate(() => {
      /* Every text node and every control, by its own painted rect. */
      const parts = el => {
        const out = [];
        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = w.nextNode())) {
          if (!n.nodeValue.trim()) continue;
          const r = document.createRange();
          r.selectNodeContents(n);
          const b = r.getBoundingClientRect();
          if (b.width > 0) out.push({ t: n.nodeValue.trim().slice(0, 14), l: b.left, r: b.right });
        }
        for (const c of el.querySelectorAll('button,svg')) {
          const b = c.getBoundingClientRect();
          if (b.width > 0) out.push({ t: '<' + c.tagName.toLowerCase() + '>', l: b.left, r: b.right });
        }
        return out;
      };
      const rects = sel => [...document.querySelectorAll(sel)].map(c => c.getBoundingClientRect());
      const tall = rects('canvas').filter(r => r.height > 120);
      const axes = tall.filter(r => r.width > 25 && r.width < 95);
      const plots = tall.filter(r => r.width > 150);
      const strips = [...document.querySelectorAll('div')].filter(
        e => typeof e.className === 'string' && e.className.includes('inset-x-0') && e.className.includes('z-20')
      );

      const bad = [];
      for (const strip of strips) {
        const sr = strip.getBoundingClientRect();
        const mine = r => r.left >= sr.left - 3 && r.right <= sr.right + 3;
        const plot = plots.filter(mine).sort((a, b) => b.width - a.width)[0];
        if (!plot) continue;
        const cols = axes.filter(mine);
        const left = cols.filter(a => a.right <= plot.left + 3).sort((a, b) => b.right - a.right)[0];
        const right = cols.filter(a => a.left >= plot.right - 3).sort((a, b) => a.left - b.left)[0];
        for (const row of strip.children) {
          const cs = getComputedStyle(row);
          if (cs.display === 'none' || cs.opacity === '0' || cs.visibility === 'hidden') continue;
          for (const p of parts(row)) {
            if (right && p.r > right.left + 1) bad.push(`${p.t} runs ${Math.round(p.r - right.left)}px onto the RIGHT axis`);
            if (left && p.l < left.right - 1) bad.push(`${p.t} runs ${Math.round(left.right - p.l)}px onto the LEFT axis`);
          }
        }
      }
      return bad;
    });

  for (const own of [false, true]) {
    for (const layout of [1, 2, 3, 4]) {
      /* 1024 is the width that breaks it — with the rail up every layout from
         2 gives the same 369px column, which is why layout alone can never
         stand in for it. */
      for (const [w, h] of [[1024, 768], [1280, 800], [1440, 900]]) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h } });
        await ctx.addInitScript(
          `localStorage.setItem('slayer_terrain_v1', ${JSON.stringify(seedWith(layout, own))})`
        );
        const page = await ctx.newPage();
        await page.goto(`${BASE}/terrain`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(BOOT_MS);
        /* The toolbar and the heaviest read are opacity-0 until group-hover.
           Resting-state only would miss two of the three rows. */
        const at = await page.evaluate(() => {
          const s = [...document.querySelectorAll('div')].find(
            e => typeof e.className === 'string' && e.className.includes('inset-x-0') && e.className.includes('z-20')
          );
          if (!s) return null;
          const r = s.getBoundingClientRect();
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height + 60) };
        });
        if (at) {
          await page.mouse.move(at.x, at.y);
          await page.waitForTimeout(700);
        }
        const hits = await probe(page);
        const label = `layout ${layout} at ${w}x${h}${own ? ' with a left axis' : ''}`;
        hits.length === 0
          ? ok(`${label} — nothing on either axis`)
          : bad(`${label} — ${hits.length} collision(s): ${hits.slice(0, 3).join('; ')}`);
        await ctx.close();
      }
    }
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   13. THE ARRANGEMENT BAR WORKS WHILE A PANE IS EXPANDED.

   The defect this replaces: the expanded pane is `fixed inset-0 z-[80]` and
   this bar was `absolute z-30`, so its three controls stayed mounted with
   `opacity: 1` and `pointer-events: auto` while `elementFromPoint` at each
   one's own centre returned the expanded chart's canvas. Painted, and dead.

   The Esc chip is why it mattered: it renders ONLY while expanded, so a
   control whose whole job is the pointer way out of fullscreen shipped in the
   one state where it could never be clicked. The pane's own Collapse button
   is inside the modal and did work, so this was a dead duplicate rather than
   a trap — which is the reason to state what is asserted here precisely.

   Clickability is `elementFromPoint` at the control's own centre, never the
   presence of the node: every one of these was in the DOM, sized, and opaque
   the whole time it did not work.
   ───────────────────────────────────────────────────────────────────────── */
head('the arrangement bar is reachable while a pane is expanded');
{
  for (const [w, h] of [[1440, 900], [1024, 768]]) {
    const { ctx, page } = await openDesk(w, h, 1);
    await page.keyboard.press('f');
    await page.waitForTimeout(900);

    const r = await page.evaluate(() => {
      const hit = el => {
        if (!el) return { missing: true };
        const b = el.getBoundingClientRect();
        if (!b.width) return { missing: true };
        const t = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
        return { ok: !!t && (t === el || el.contains(t)), was: t ? t.tagName.toLowerCase() : 'none', box: b };
      };
      const esc = [...document.querySelectorAll('button')].find(b => (b.textContent || '').trim() === 'Esc');
      const grp = document.querySelector('[role=group][aria-label="How many charts"]');
      const out = {
        expanded: !!document.querySelector('[role="dialog"][aria-modal="true"]'),
        esc: hit(esc),
        strikes: hit(document.querySelector('[data-strikes-toggle]')),
        layout: hit(grp && grp.querySelector('button')),
      };
      /* And it must not have bought its clearance from the expanded pane's own
         price axis — the bar clears LADDER_WIDTH + the price gutter for
         exactly this reason, and while expanded the pane under it is the
         EXPANDED one, not the last one in the array. */
      const axes = [...document.querySelectorAll('canvas')]
        .map(c => c.getBoundingClientRect())
        .filter(b => b.height > 120 && b.width > 25 && b.width < 95);
      const bar = esc && esc.parentElement.getBoundingClientRect();
      out.onAxis = bar
        ? axes.filter(a => bar.right > a.left && bar.left < a.right && bar.bottom > a.top && bar.top < a.bottom).length
        : -1;
      return out;
    });

    const at = `${w}x${h}`;
    r.expanded ? ok(`${at} — f expands a pane`) : bad(`${at} — nothing expanded, the rest proves nothing`);
    for (const [name, v] of [['the Esc chip', r.esc], ['the Strikes toggle', r.strikes], ['the layout picker', r.layout]]) {
      if (v.missing) bad(`${at} — ${name} is not on screen while expanded`);
      else v.ok ? ok(`${at} — ${name} takes a click`) : bad(`${at} — ${name} is painted but ${v.was} takes its click`);
    }
    r.onAxis === 0
      ? ok(`${at} — and the bar clears the expanded pane's price axis`)
      : bad(`${at} — the bar overlaps ${r.onAxis} price axis canvas(es) of the expanded pane`);

    /* It is not decorative: clicking it actually leaves fullscreen. */
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === 'Esc');
      const r = b.getBoundingClientRect();
      document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)).click();
    });
    await page.waitForTimeout(700);
    const closed = await page.evaluate(() => !document.querySelector('[role="dialog"][aria-modal="true"]'));
    closed ? ok(`${at} — and clicking it leaves fullscreen`) : bad(`${at} — the Esc chip took the click and nothing happened`);
    await ctx.close();
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   14. THE SPOT AND FLIP BADGES DO NOT PRINT ON TOP OF EACH OTHER.

   The defect this replaces: both rules are placed independently by price and
   both badges are `ml-auto`, so they share one lane — and the flip spends most
   of its life near spot, because that is what a flip IS. Measured overlaps of
   4.3, 6.2, 6.9 and 9.2px of a 10px badge, worst case spot "513.45" underneath
   flip "513.50": two DIFFERENT prices inside the same 38 pixels.

   The rows already avoided each other through `anchors`; the two rules were
   the pair that never checked.

   THE CLASH COUNT IS LOGGED, NOT ASSERTED, and that is deliberate. In node the
   proofs pin `Math.random` so a fixture is reproducible; the browser runs the
   live unseeded tape, so whether any rail happens to hold spot and flip within
   a badge of each other is not something this run controls. Asserting "at
   least one clash occurred" would be a gate that fails on the tape being calm.
   So: the overlap assertion always runs, and the count says how much of it was
   actually exercised — a run reporting 0 exercised nothing and its green is
   worth what that is worth.
   ───────────────────────────────────────────────────────────────────────── */
head('the strike rail never prints two prices in the same pixels, and its stubs stay off the rows');
{
  let clashed = 0;
  let rails = 0;
  let closest = null;
  let stubs = 0;
  /* 1280x800 L4 and 1440x900 L1 are here because the three configs above did
     not exercise the stub check: against a build with the foot band removed
     they all reported clean. Where a row lands relative to the stub depends on
     the price and the row pitch, so coverage is a matter of sampling enough
     rails — these two are where the standalone probe actually caught it. */
  for (const [w, h, layout] of [[1024, 768, 4], [1024, 768, 2], [1440, 900, 3], [1280, 800, 4], [1440, 900, 1]]) {
    const { ctx, page } = await openDesk(w, h, layout);
    const found = await page.evaluate(() => {
      const out = [];
      /* The rail is the element that DIRECTLY holds the stub — climbing by
         class matched nested ancestors and counted one rail up to five times. */
      const hosts = [...document.querySelectorAll('[data-stub="down"]')]
        .map(s => s.parentElement)
        .filter(p => p && p.querySelector('[data-rule="spot"]'));
      for (const rail of hosts) {
        const badge = t => rail.querySelector(`[data-rule="${t}"] [data-badge]`);
        const yOf = t => {
          const el = rail.querySelector(`[data-rule="${t}"]`);
          const m = /translateY\(([-0-9.]+)px\)/.exec(el ? el.style.transform || '' : '');
          return m ? parseFloat(m[1]) : null;
        };
        const tx = el => {
          const m = /translateX\(([-0-9.]+)px\)/.exec(el.style.transform || '');
          return m ? parseFloat(m[1]) : 0;
        };
        const bs = badge('spot');
        const bf = badge('flip');
        if (!bs || !bf) continue;
        const a = bs.getBoundingClientRect();
        const b = bf.getBoundingClientRect();
        if (!a.width || !b.width) continue;
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        const ys = yOf('spot');
        const yf = yOf('flip');
        /* THE ▼ STUB, same idea one lane down. It sits at `bottom-0`; rows
           used to run to the plot floor, so the last one was placed under it
           and the stub took the click on its strike label. Measured before the
           foot band: 2 of 13 stubs returned THE STUB from elementFromPoint at
           a label's own centre. */
        /* ONE PASS, ONE SET OF RECTS. The rail re-places its rows on rAF from
           the chart's price projection, so a second pass over the same rows
           reads a LATER layout: the first version measured `covered` and the
           gap in two loops and they disagreed — clean rows, then a -6.8px
           intersection, on the same build in the same evaluate. Both were true
           when taken, which makes them useless together. Everything below
           comes off one read per row. */
        const stolen = [];
        const covered = [];
        let gap = null;
        const st = rail.querySelector('[data-stub="down"]');
        if (st && getComputedStyle(st).display !== 'none') {
          const sb = st.getBoundingClientRect();
          for (const row of rail.querySelectorAll('[data-strike]')) {
            const rb = row.getBoundingClientRect();
            if (!rb.width) continue;
            if (rb.right <= sb.left || rb.left >= sb.right) continue; // not in the stub's column
            /* Rows that START ABOVE the stub are the ones that can reach into
               its lane. One sitting entirely below it is not approaching
               anything, and counting it reported a phantom negative gap. */
            if (rb.top < sb.top) {
              const g = sb.top - rb.bottom;
              if (gap == null || g < gap) gap = +g.toFixed(1);
            }
            if (!(sb.bottom > rb.top && sb.top < rb.bottom)) continue;
            covered.push(row.getAttribute('data-strike'));
            const tn = [...row.querySelectorAll('span')].filter(x => /tnum/.test(x.className || ''));
            const lab = tn[tn.length - 1];
            if (!lab) continue;
            const lb = lab.getBoundingClientRect();
            if (!lb.width) continue;
            const who = document.elementFromPoint(Math.round(lb.left + lb.width / 2), Math.round(lb.top + lb.height / 2));
            if (st === who || st.contains(who)) stolen.push(row.getAttribute('data-strike'));
          }
        }
        out.push({
          gap,
          overlap: ox > 0 && oy > 0 ? `${ox.toFixed(1)}x${oy.toFixed(1)}` : null,
          spot: (bs.textContent || '').trim(),
          flip: (bf.textContent || '').trim(),
          dy: ys != null && yf != null ? +Math.abs(ys - yf).toFixed(1) : null,
          /* THE DISTANCE, NOT THE PRESENCE OF A translateX. Both badges now
             carry one at rest — they are homed left of the strike lane so
             neither prints on a strike — so "has a translateX" stopped telling
             these two apart. What the step-aside means is that the flip ends up
             FURTHER LEFT than spot, and that is what is read here. */
          spotX: tx(bs),
          flipX: tx(bf),
          covered,
          stolen,
        });
      }
      return out;
    });

    const at = `${w}x${h} layout ${layout}`;
    const hits = found.filter(r => r.overlap);
    rails += found.length;
    /* NO RAILS AT ALL IS A FAILURE, NOT A PASS. The desk is seeded with
       `ladder: true`, so every pane has one. This block reads the rail through
       `[data-badge]`, a hook that only exists once the step-aside shipped —
       run against a build without it, the loop found nothing and reported
       green three times over. A check that cannot see its subject has to say
       so, or "no badge lands on another" is true of an empty page. */
    if (found.length === 0) bad(`${at} — found no strike rail to measure; the desk is seeded with the rail up, so this check saw nothing`);
    const near = found.filter(r => r.dy != null && r.dy < 14);
    clashed += near.length;
    hits.length === 0
      ? ok(`${at} — ${found.length} rail(s), no badge lands on another`)
      : bad(`${at} — ${hits.length} rail(s) print two prices in the same pixels, e.g. spot ${hits[0].spot} under flip ${hits[0].flip} overlapping ${hits[0].overlap}px`);
    /* Where the two ARE within a badge of each other, the step-aside must have
       been applied — otherwise the clean result above is luck, not the fix. */
    /* 1px rather than 0: these are subpixel transforms and equality on a float
       is not a claim worth making. A real step is ~41px — the spot badge's own
       width plus its gap — so the margin is not close to load-bearing. */
    const missed = near.filter(r => !(r.flipX < r.spotX - 1));
    if (near.length) {
      missed.length === 0
        ? ok(`${at} — ${near.length} rail(s) had the rules within a badge, and every one stepped clear of spot`)
        : bad(`${at} — ${missed.length} rail(s) had the rules within a badge and the flip did not step past spot (e.g. flip ${missed[0].flipX}px vs spot ${missed[0].spotX}px)`);
    }
    /* ASSERT THE INVARIANT, NOT THE SYMPTOM. Whether the stub actually STEALS
       a click depends on where the last row lands against a live price —
       measured 2 of 13 stubs on the broken build. What FOOT_BAND guarantees is
       that no row is placed in the stub's lane at all, so a row whose box
       intersects the stub is the violation whether or not the theft lands.

       AND THIS GUARD IS PROBABILISTIC — said plainly rather than left to look
       stronger than it is. Against a build with the foot band removed it
       reported clean on all five configs below: whether any row falls in the
       bottom 14px depends on the price and the row pitch at that moment, and
       that varies run to run, not just config to config. A standalone probe
       caught 4 overlaps and 2 thefts across 13 stubs on the same broken build,
       so the defect is real and this does catch it — just not on demand. The
       gap line printed at the end says how close the run came, so a run that
       never went near the lane cannot be mistaken for one that cleared it. */
    for (const r of found) {
      if (r.gap == null) continue;
      stubs++;
      if (closest == null || r.gap < closest) closest = r.gap;
    }
    const covered = found.filter(r => r.covered && r.covered.length);
    const thieves = found.filter(r => r.stolen && r.stolen.length);
    covered.length === 0
      ? ok(`${at} — no strike row is placed under the down stub`)
      : bad(
          `${at} — the down stub sits on strike ${covered.flatMap(c => c.covered).join(', ')}` +
            (thieves.length ? ` and takes the click on ${thieves.flatMap(t => t.stolen).join(', ')}` : '')
        );

    await ctx.close();
  }
  console.log(
    `       (${stubs} visible down stub(s); closest a row came to the stub's lane was ${closest == null ? 'n/a' : closest + 'px'} — a large gap means the lane was never tested this run)`
  );
  console.log(`       (${clashed} of ${rails} rails held spot and flip within a badge this run — 0 would mean the check was not exercised)`);
}

/* ─────────────────────────────────────────────────────────────────────────
   15. EVERY MENU LANDS INSIDE THE WINDOW.

   The defect this replaces: `placeMenu` clamps a menu's FAR edge on screen and
   had to assume a width to do it. It assumed MENU_MIN_WIDTH (210) — true of
   the menus it was written for, false of several it later served. Measured at
   1024x768 and 1280x800 in a left-column pane: the Alerts menu (230px) sat at
   x = -12, and Indicators and Overlays sat flush at x = 0 instead of the 8px
   edge. The pattern was exactly what a 210 assumption predicts — 210 -> 8,
   218 -> 0, 230 -> -12 — which is what said the assumption was the fault.

   MEASURE AFTER THE MENU SETTLES. The width feeds back into the placement, so
   the first frame is placed from the assumption and corrected on the next.
   Reading in the same turn as the click reports the uncorrected frame — that
   is how an earlier version of this probe blamed the wrong menu.
   ───────────────────────────────────────────────────────────────────────── */
head('no menu hangs off the edge of the window');
{
  for (const [w, h, layout] of [[1024, 768, 4], [1280, 800, 3]]) {
    const { ctx, page } = await openDesk(w, h, layout);
    /* Pane 0 is the LEFT column, which is where a right-anchored menu runs out
       of room — the only place this can fail. */
    const at = await page.evaluate(() => {
      const s = [...document.querySelectorAll('div')].find(
        e => typeof e.className === 'string' && e.className.includes('inset-x-0') && e.className.includes('z-20')
      );
      if (!s) return null;
      const r = s.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height + 40) };
    });
    if (at) {
      await page.mouse.move(at.x, at.y);
      await page.waitForTimeout(700);
    }
    const count = await page.evaluate(() => {
      const s = [...document.querySelectorAll('div')].find(
        e => typeof e.className === 'string' && e.className.includes('inset-x-0') && e.className.includes('z-20')
      );
      return s ? s.querySelectorAll('button[aria-haspopup="menu"]').length : 0;
    });
    const offEdge = [];
    for (let i = 0; i < count; i++) {
      await page.evaluate(i => {
        const s = [...document.querySelectorAll('div')].find(
          e => typeof e.className === 'string' && e.className.includes('inset-x-0') && e.className.includes('z-20')
        );
        const bs = [...s.querySelectorAll('button[aria-haspopup="menu"]')];
        bs.forEach(b => { if (b.getAttribute('aria-expanded') === 'true') b.click(); });
        bs[i].click();
      }, i);
      await page.waitForTimeout(450); // let the width feed back into the placement
      const r = await page.evaluate(() => {
        const m =
          document.querySelector('[data-toolbar-menu]') ||
          [...document.body.children].find(d => getComputedStyle(d).position === 'fixed' && d.getBoundingClientRect().width > 150);
        if (!m) return null;
        const exp = document.querySelector('button[aria-haspopup="menu"][aria-expanded="true"]');
        const b = m.getBoundingClientRect();
        return {
          name: exp ? (exp.getAttribute('title') || exp.textContent || '').trim().slice(0, 18) : '?',
          left: Math.round(b.left),
          right: Math.round(b.right),
          width: Math.round(b.width),
          vw: window.innerWidth,
        };
      });
      if (!r) continue;
      if (r.left < 0 || r.right > r.vw) offEdge.push(`${r.name} (${r.width}px) at [${r.left},${r.right}] of ${r.vw}`);
    }
    const label = `${w}x${h} layout ${layout}`;
    count === 0
      ? bad(`${label} — found no menu triggers to open`)
      : offEdge.length === 0
        ? ok(`${label} — all ${count} menus land inside the window`)
        : bad(`${label} — ${offEdge.length} menu(s) off the window: ${offEdge.join('; ')}`);
    await ctx.close();
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   16. TERRAIN ON A PHONE — one chart, and the other three never built.

   Terrain ran on `useIsBelowLg` alone, which stacks the panes and scrolls the
   page: four charts at `min-h-[420px]` against a 334px landscape viewport.
   Held BOTH ways, because the rule that fixes it is `useIsPhone`, whose
   landscape clause exists precisely because a handset turned sideways is
   844x390 — wider than the md floor, and so invisible to a width test.
   ───────────────────────────────────────────────────────────────────────── */
for (const [orientation, viewport] of [
  ['portrait', { width: 390, height: 844 }],
  ['landscape', { width: 844, height: 390 }],
]) {
  head(`Terrain gives a phone one chart — ${orientation}`);
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
  await ctx.addInitScript(
    `localStorage.setItem('slayer_terrain_v1', ${JSON.stringify(seed(4, TICKERS))})`
  );
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(`${BASE}/terrain`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(BOOT_MS);

  const g = await page.evaluate(() => {
    const plots = [...document.querySelectorAll('canvas')]
      .map(c => ({ c, r: c.getBoundingClientRect() }))
      .filter(o => o.r.height > 120 && o.r.width > 100);
    const first = plots.sort((a, b) => a.r.left - b.r.left || a.r.top - b.r.top)[0];
    let ink = 0;
    if (first) {
      const d = first.c.getContext('2d').getImageData(0, 0, first.c.width, first.c.height).data;
      for (let k = 3; k < d.length; k += 4) if (d[k] > 8) ink++;
    }
    return {
      innerH: window.innerHeight,
      plots: plots.length,
      h: first ? Math.round(first.r.height) : 0,
      w: first ? Math.round(first.r.width) : 0,
      bitmap: first ? first.c.width : 0,
      ink,
      vscroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      /* Controls that cannot affect anything here: the arrangement picker sets
         a pane count a phone ignores, and Strikes toggles rails that are
         `hidden lg:flex`. Both must be absent, not merely invisible. */
      arrangement: !!document.querySelector('[aria-label="How many charts"]'),
      strikes: !!document.querySelector('[data-strikes-toggle]'),
    };
  });

  /* ONE chart. A pane draws a plot canvas and a volume canvas, so one chart is
     two; four charts would be eight. Counting canvases rather than panes is
     deliberate — a `hidden` pane still has both. */
  g.plots === 2
    ? ok(`one chart is mounted — ${g.plots} plot canvases`)
    : bad(`${g.plots} plot canvases — expected 2 (four charts would be 8)`);

  /* It fills the window rather than overflowing it. The 420px pane floor would
     push a pane past a 334px landscape viewport, so this is what catches the
     floor being left on. */
  g.vscroll === 0
    ? ok('the page does not scroll — the chart fits the window')
    : bad(`${g.vscroll}px of vertical scroll — the pane is taller than the viewport`);

  g.h > g.innerH * 0.55
    ? ok(`the chart is ${g.h}px of an ${g.innerH}px window`)
    : bad(`the chart is only ${g.h}px of ${g.innerH}px`);

  Math.abs(g.bitmap - g.w) <= 2 && g.ink > 500
    ? ok(`really painted — ${g.bitmap}px bitmap for a ${g.w}px box, ${g.ink} pixels of ink`)
    : bad(`canvas ${g.bitmap}px for a ${g.w}px box with ${g.ink} pixels of ink`);

  !g.arrangement && !g.strikes
    ? ok('the two controls that could not do anything here are gone')
    : bad(`inert chrome still rendered — arrangement:${g.arrangement} strikes:${g.strikes}`);

  g.hscroll === 0 ? ok('nothing scrolls sideways') : bad(`${g.hscroll}px sideways`);
  errs.length === 0 ? ok('no page errors') : bad(`page errors: ${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

/* And the boundary from the other side: a tablet is touch, like a phone, and
   roomy, unlike one. A rule that simply returned true would pass everything
   above. */
head('Terrain keeps its desk on a tablet');
{
  const ctx = await browser.newContext({
    viewport: { width: 820, height: 1180 },
    hasTouch: true,
    isMobile: true,
  });
  await ctx.addInitScript(
    `localStorage.setItem('slayer_terrain_v1', ${JSON.stringify(seed(4, TICKERS))})`
  );
  const page = await ctx.newPage();
  await page.goto(`${BASE}/terrain`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(BOOT_MS);
  const n = await page.evaluate(
    () =>
      [...document.querySelectorAll('canvas')].filter(c => {
        const r = c.getBoundingClientRect();
        return r.height > 120 && r.width > 100;
      }).length
  );
  n === 8
    ? ok(`an iPad still builds four charts — ${n} plot canvases`)
    : bad(`an iPad built ${n} plot canvases, expected 8`);
  await ctx.close();
}

/* ─────────────────────────────────────────────────────────────────────────
   NOTHING ACTS ON A RAIL THAT IS NOT ON SCREEN.

   PaneLadder renders `hidden lg:flex`, so from 768px (where `useIsPhone` stops
   taking over) to 1023.98px the rails are in the DOM at `display: none` while
   every pane's stored `ladder` flag is still true. Three things went on
   reading that flag as if it meant "visible":

     · the arrangement bar reserved `right: 216px` — LADDER_WIDTH_PX 132 plus
       the 76px price gutter plus 8 — for a rail 0px wide, which parked its
       Rows3 icon and its 1/2 buttons ON the volume histogram with 135px of
       empty runway between it and the price axis. Measured at 768, 900, 1023
       and a coarse-pointer 820x1180.
     · STRIKES rendered lit and `aria-pressed="true"`, titled "Hide every
       strike rail". A real mouse click at 1023x800 rewrote all four panes'
       flags to false in storage: 0 rails on screen before, 0 after.
     · `r` and `R` did the same silently, and announced a rail that never came.

   The premise is asserted first and separately. If the rails ever stop being
   `display: none` here, every line below is measuring nothing, and it should
   say so rather than going quiet.

   1024 is checked from the other side in the same loop, because a guard that
   just wants the chrome gone would pass by deleting it everywhere.
   ───────────────────────────────────────────────────────────────────────── */
head('below lg, nothing acts on the strike rail that is not drawn');
{
  /* `read` is the same measurement at every width — the point of the section
     is that one expression is right on both sides of 1024, not that two
     different ones each pass. */
  const read = () => {
    const rails = [...document.querySelectorAll('[aria-label$="exposure by strike"]')].map(el => ({
      display: getComputedStyle(el).display,
      w: Math.round(el.getBoundingClientRect().width),
    }));
    const btn = document.querySelector('[data-strikes-toggle]');
    const bar = btn ? btn.closest('div.chrome-hover') : document.querySelector('[aria-label="How many charts"]')?.closest('div.chrome-hover');
    const barBox = bar ? bar.getBoundingClientRect() : null;
    /* The right price axis is the RIGHTMOST tall narrow canvas. Below lg the
       panes stack into one column, so every pane's axis shares an x and any of
       them gives the same gap; above lg the last pane's is the rightmost. */
    const axis = [...document.querySelectorAll('canvas')]
      .map(c => c.getBoundingClientRect())
      .filter(b => b.height > 120 && b.width > 25 && b.width < 95)
      .sort((a, b) => b.left - a.left)[0];
    return {
      railsOnScreen: rails.filter(r => r.display !== 'none' && r.w > 0).length,
      railsInDom: rails.length,
      strikes: !!btn,
      /* The picker is NOT inert below lg — the panes stack and the page
         scrolls, so 4 really does draw four charts. It has to survive. */
      picker: !!document.querySelector('[aria-label="How many charts"]'),
      gap: barBox && axis ? Math.round(axis.left - barBox.right) : null,
      ladder: JSON.parse(localStorage.getItem('slayer_terrain_v1') || '{}').panes?.map(q => q.ladder),
    };
  };

  for (const [w, h, layout, coarse] of [
    [768, 900, 3, false],
    [900, 800, 3, false],
    [1023, 800, 1, false],
    [820, 1180, 3, true],
    [1024, 800, 1, false],
    [1280, 800, 4, false],
  ]) {
    const belowLg = w < 1024;
    const at = `${w}x${h} L${layout}${coarse ? ' coarse' : ''}`;
    const ctx = await browser.newContext({
      viewport: { width: w, height: h },
      ...(coarse ? { hasTouch: true, isMobile: true } : {}),
    });
    await ctx.addInitScript(
      `localStorage.setItem('slayer_terrain_v1', ${JSON.stringify(seed(layout, TICKERS))})`
    );
    const page = await ctx.newPage();
    await page.goto(`${BASE}/terrain`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(BOOT_MS);

    const g = await page.evaluate(read);

    /* THE PREMISE. Everything below is about a rail that is not on screen
       while its flag says it is, so prove that is the state first. */
    if (g.railsInDom === 0) {
      bad(`${at} — no rail in the DOM at all; the seed sets ladder:true on every pane`);
      await ctx.close();
      continue;
    }
    if (belowLg) {
      g.railsOnScreen === 0
        ? ok(`${at} — ${g.railsInDom} rails in the DOM, none drawn`)
        : bad(`${at} — ${g.railsOnScreen} rails ARE drawn below lg; this section is measuring the wrong thing`);
    } else {
      g.railsOnScreen > 0
        ? ok(`${at} — ${g.railsOnScreen} rails drawn`)
        : bad(`${at} — the rail is not drawn at ${w}px, where it should be`);
    }

    /* The button, from both sides of the breakpoint. */
    if (belowLg) {
      !g.strikes
        ? ok(`${at} — no STRIKES button over a rail nobody can see`)
        : bad(`${at} — STRIKES is rendered while ${g.railsOnScreen} rails are on screen`);
    } else {
      g.strikes
        ? ok(`${at} — STRIKES is here, where it does something`)
        : bad(`${at} — STRIKES is missing at ${w}px, where the rail IS drawn`);
    }

    g.picker
      ? ok(`${at} — the layout picker survives`)
      : bad(`${at} — the layout picker went too; it is not inert here`);

    /* THE OFFSET. 132px of clearance from a `display: none` element is 132px
       of chart the bar sits on. Above lg the same expression must still hold
       the real rail's width, which is what the 1024/1280 rows check. */
    if (g.gap == null) bad(`${at} — could not find the bar or the price axis to measure the gap`);
    else if (g.gap < 0) bad(`${at} — the bar overlaps the price axis by ${-g.gap}px`);
    else if (g.gap > 20) bad(`${at} — the bar holds ${g.gap}px of clearance; the rail beside it is ${belowLg ? 'not drawn' : 'drawn'}`);
    else ok(`${at} — the bar sits ${g.gap}px off the price axis`);

    /* THE KEYS. Same control as the button — it titles itself "Shift R" — so
       they have to come and go with it rather than half of it surviving. */
    await page.keyboard.press('Shift+R');
    await page.waitForTimeout(400);
    const after = await page.evaluate(read);
    const rewrote = JSON.stringify(g.ladder) !== JSON.stringify(after.ladder);
    if (belowLg) {
      !rewrote
        ? ok(`${at} — Shift R leaves the stored preference alone`)
        : bad(`${at} — Shift R rewrote ${JSON.stringify(g.ladder)} to ${JSON.stringify(after.ladder)} with no rail on screen`);
    } else {
      rewrote && after.railsOnScreen !== g.railsOnScreen
        ? ok(`${at} — Shift R clears the rails it says it clears`)
        : bad(`${at} — Shift R changed storage:${rewrote} rails:${g.railsOnScreen}->${after.railsOnScreen}`);
    }

    await ctx.close();
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   NO RULE BADGE PRINTS ON A STRIKE.

   The rail's spot and flip rules carry an opaque price chip, `ml-auto` in the
   same right-hand lane a row's strike is right-aligned in — and the chip is
   wider than any strike it meets (38px against 20-29.5px measured), so a rule
   crossing a row did not graze the number, it covered all of it. Rules render
   after every row with no z-index, so the chip won.

   Measured on the build before the fix, at 1024x768 layout 4: 72 covers over
   24 rail-samples, worst 10.0px — the badge's whole line box over the whole
   glyph band of a 10px label. "476.03" over 476. "182.58" over 182.50.
   "117.43" over a strike carrying the K tag, the heaviest in the book.

   SAMPLED OVER TIME, not once. Spot moves every tick and the rows re-fit with
   it, so a single frame is one throw of the dice — at 1440x900 layout 1 the
   pitch is wide enough that a badge often lands between rows, which is exactly
   why this shipped. Layout 4 at 1024 is the dense end and it is where the
   defect was total.

   The premise is asserted first: if no badge or no strike is drawn, an
   overlap count of zero means nothing and this says so instead of passing.
   ───────────────────────────────────────────────────────────────────────── */
head('no rule badge prints on a strike');
{
  const rails = () => {
    const out = [];
    for (const rail of document.querySelectorAll('[aria-label$="exposure by strike"]')) {
      if (getComputedStyle(rail).display === 'none') continue;
      /* The track is the row's own parent — NOT `closest('div')` from a label,
         which walks past a row rendered as a <button> and lands a level up. */
      const track = rail.querySelector('[data-strike]')?.parentElement;
      const shown = el => el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
      const labels = [...rail.querySelectorAll('[data-strike-label]')]
        .filter(el => shown(el.parentElement))
        .map(el => ({ text: el.textContent.trim(), box: el.getBoundingClientRect().toJSON() }));
      const badges = [...rail.querySelectorAll('[data-rule]')]
        .filter(shown)
        .map(r => {
          const b = r.querySelector('[data-badge]');
          return b ? { kind: r.dataset.rule, text: b.textContent.trim(), box: b.getBoundingClientRect().toJSON() } : null;
        })
        .filter(Boolean);
      out.push({ trackBox: (track || rail).getBoundingClientRect().toJSON(), labels, badges });
    }
    return out;
  };

  /* Two boxes overlap when they overlap on BOTH axes; the size of the smaller
     crossing is what a reader loses. */
  const cross = (a, b) => {
    const x = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const y = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    return x > 0 && y > 0 ? Math.min(x, y) : 0;
  };

  for (const [w, h, layout] of [[1024, 768, 4], [1280, 800, 4], [1440, 900, 1]]) {
    const at = `${w}x${h} L${layout}`;
    const { ctx, page } = await openDesk(w, h, layout);

    let samples = 0, withBadge = 0, withLabel = 0;
    const onStrike = [], clipped = [], onEachOther = [];
    for (let i = 0; i < 4; i++) {
      const seen = await page.evaluate(rails);
      for (const r of seen) {
        samples++;
        if (r.badges.length) withBadge++;
        if (r.labels.length) withLabel++;
        for (const b of r.badges) {
          for (const l of r.labels) {
            const ov = cross(b.box, l.box);
            if (ov > 0) onStrike.push(`${b.kind} "${b.text}" over strike "${l.text}" by ${ov.toFixed(1)}px`);
          }
          /* The clamp: a badge stepped past a long price must stop inside an
             `overflow-hidden` track rather than being cut in half. */
          if (b.box.x < r.trackBox.x - 0.5) clipped.push(`${b.kind} "${b.text}" starts ${(r.trackBox.x - b.box.x).toFixed(1)}px outside the track`);
        }
        if (r.badges.length === 2) {
          const ov = cross(r.badges[0].box, r.badges[1].box);
          if (ov > 0) onEachOther.push(`${r.badges[0].text} and ${r.badges[1].text} overlap by ${ov.toFixed(1)}px`);
        }
      }
      await page.waitForTimeout(1500);
    }

    /* THE PREMISE. */
    if (!samples || !withBadge || !withLabel) {
      bad(`${at} — ${samples} rail-samples, ${withBadge} with a rule badge, ${withLabel} with a strike: nothing to measure`);
      await ctx.close();
      continue;
    }
    ok(`${at} — ${samples} rail-samples, ${withBadge} carrying a rule badge`);

    onStrike.length === 0
      ? ok(`${at} — no badge lands on a strike`)
      : bad(`${at} — ${onStrike.length} covers: ${onStrike.slice(0, 3).join(' | ')}`);
    clipped.length === 0
      ? ok(`${at} — every badge stays inside its track`)
      : bad(`${at} — ${clipped.length} clipped: ${clipped.slice(0, 2).join(' | ')}`);
    onEachOther.length === 0
      ? ok(`${at} — spot and the flip stay off each other`)
      : bad(`${at} — ${onEachOther.length} rule-on-rule: ${onEachOther.slice(0, 2).join(' | ')}`);

    await ctx.close();
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   THE TICKER PICKER OPENS SOMEWHERE A READER CAN REACH.

   It hung off its trigger with `absolute right-0 top-full`, which is only
   correct while the trigger has the menu's 288px of room to its LEFT. On a
   phone it does not: every page that renders the picker puts it in a header
   row that WRAPS at a narrow width, and a wrapped row starts at the left edge,
   so the trigger sits at x=16..120 and a right-hung menu is laid out from
   x=-168.

   Measured at 390x844 on the built app before the fix: the search input's left
   edge at x=-134 — a reader could not see what they were typing — and 2 of the
   first 8 symbol rows returned themselves from `document.elementFromPoint`.
   The same two numbers on /pinpoint/exposure-profile and /trace/tracker, which
   reach the picker through two different shells, which is what said the fault
   was the component's rather than one page's.

   BOTH HOSTS ARE SWEPT for that reason, and 1440 alongside 390 so a fix that
   simply moved the problem to the desk would be caught.

   AND IT MUST STILL PICK. The menu is portalled to <body> now, so it is no
   longer inside the wrapper the outside-click handler watches; without the
   matching change there, a mousedown on a row reads as a click outside, the
   menu unmounts, and the row's own click never fires. A placement check alone
   would call that green — so the last assertion clicks a row for real and
   reads the trigger back.
   ───────────────────────────────────────────────────────────────────────── */
head('the ticker picker opens somewhere a reader can reach');
{
  for (const route of ['/pinpoint/exposure-profile', '/trace/tracker']) {
    for (const [w, h] of [[390, 844], [768, 900], [1440, 900]]) {
      const at = `${route} @ ${w}`;
      const phone = w < 500;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: phone, isMobile: phone });
      const page = await ctx.newPage();
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(BOOT_MS);

      /* The picker is the only button on the page carrying `min-w-[104px]`.
         Matching a search icon instead found the top bar's own button. */
      const opened = await page.evaluate(async () => {
        const btn = [...document.querySelectorAll('button')].find(b => getComputedStyle(b).minWidth === '104px');
        if (!btn) return { missing: true };
        const was = (btn.textContent || '').trim();
        btn.click();
        /* The ticker universe is a LAZY import, so the first open renders
           "Loading tickers…" and the rows arrive later. Poll for a row rather
           than sleeping a guessed interval — a fixed wait is either too long
           every run or too short on a cold one, and too short here would read
           as "0 rows reachable" and blame the placement. */
        const until = async test => {
          for (let i = 0; i < 60; i++) {
            if (test()) return true;
            await new Promise(r => setTimeout(r, 100));
          }
          return false;
        };
        await until(() => document.querySelector('input[placeholder^="Search all"]'));
        const inp = document.querySelector('input[placeholder^="Search all"]');
        if (!inp) return { was, noMenu: true };
        await until(() => {
          const m = inp.closest('div[style*="position: fixed"], div[class*="absolute"]');
          return m && m.querySelector('button');
        });
        /* The menu is the input's own box, not the first div in the document
           that happens to contain it — that ancestor is the page. */
        const menu = inp.closest('div[style*="position: fixed"], div[class*="absolute"]');
        const mb = (menu || inp).getBoundingClientRect();
        const ib = inp.getBoundingClientRect();
        const rows = [...(menu || document).querySelectorAll('button')].filter(b => b.getBoundingClientRect().width > 0);
        let reach = 0;
        const sample = rows.slice(0, 8);
        for (const row of sample) {
          const rb = row.getBoundingClientRect();
          const t = document.elementFromPoint(Math.round(rb.left + rb.width / 2), Math.round(rb.top + rb.height / 2));
          if (t && (t === row || row.contains(t))) reach++;
        }
        /* A row whose symbol differs from the current one, so the click has
           something to prove. */
        const target = sample.find(b => {
          const sym = b.querySelector('span')?.textContent?.trim();
          return sym && sym !== was;
        });
        const tb = target ? target.getBoundingClientRect() : null;
        return {
          was,
          menu: { x: Math.round(mb.x), right: Math.round(mb.right), top: Math.round(mb.top), bottom: Math.round(mb.bottom) },
          input: { x: Math.round(ib.x), right: Math.round(ib.right) },
          vw: window.innerWidth,
          vh: window.innerHeight,
          rows: sample.length,
          reach,
          pick: tb ? { x: Math.round(tb.x + tb.width / 2), y: Math.round(tb.y + tb.height / 2), sym: target.querySelector('span').textContent.trim() } : null,
        };
      });

      if (opened.missing) { bad(`${at} — no ticker picker on the page`); await ctx.close(); continue; }
      if (opened.noMenu) { bad(`${at} — the picker did not open`); await ctx.close(); continue; }

      const m = opened.menu;
      const off = [];
      if (m.x < 0) off.push(`${-m.x}px off the left`);
      if (m.right > opened.vw) off.push(`${m.right - opened.vw}px off the right`);
      if (m.top < 0) off.push(`${-m.top}px off the top`);
      if (m.bottom > opened.vh) off.push(`${m.bottom - opened.vh}px below the fold`);
      off.length === 0
        ? ok(`${at} — the menu is inside the window (${m.x}..${m.right} of ${opened.vw})`)
        : bad(`${at} — the menu hangs ${off.join(' and ')}`);

      opened.input.x >= 0 && opened.input.right <= opened.vw
        ? ok(`${at} — you can see what you type (input ${opened.input.x}..${opened.input.right})`)
        : bad(`${at} — the search input runs ${opened.input.x}..${opened.input.right} of a ${opened.vw}px window`);

      opened.rows > 0 && opened.reach === opened.rows
        ? ok(`${at} — all ${opened.rows} sampled rows take their own click`)
        : bad(`${at} — ${opened.reach} of ${opened.rows} sampled rows take their own click`);

      /* AND IT STILL PICKS — a real mouse press, not `.click()`, because the
         defect this guards against is a mousedown handler closing the menu. */
      if (!opened.pick) bad(`${at} — no row with a different symbol to click`);
      else {
        await page.mouse.click(opened.pick.x, opened.pick.y);
        await page.waitForTimeout(600);
        const now = await page.evaluate(() => {
          const btn = [...document.querySelectorAll('button')].find(b => getComputedStyle(b).minWidth === '104px');
          return btn ? (btn.textContent || '').trim() : null;
        });
        now === opened.pick.sym
          ? ok(`${at} — clicking ${opened.pick.sym} actually picks it`)
          : bad(`${at} — clicked ${opened.pick.sym} and the picker still reads ${now} (was ${opened.was})`);
      }

      await ctx.close();
    }
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   A JARGON EXPLAINER DOES NOT FIRE THE CONTROL IT SITS INSIDE.

   `Term` renders a dotted word that reveals a definition. It stops Enter and
   Space from bubbling — its own comment says why, "a Term can sit inside a
   sortable table header" — and the card it portals stops clicks. The ANCHOR
   never did, so a mouse click on an explainer inside a clickable host ran the
   host instead.

   Measured on /pinpoint/ranked-targets before the fix, where the podium cards
   are `<motion.button>` that navigate on click: clicking "BPS" at 1440x900 and
   again at 390x844 left the page for /pulse and showed no definition. The
   phone case is the worse one — with no hover, tapping the word IS the only
   way to read it, so the only affordance for a definition was a way off the
   page.

   BOTH HALVES ARE ASSERTED. "The URL did not change" alone would pass a Term
   that swallowed the click and did nothing, which is a different bug wearing
   the same green.
   ───────────────────────────────────────────────────────────────────────── */
head('a jargon explainer does not fire the control it sits inside');
{
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const at = `${w}x${h}`;
    const phone = w < 500;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: phone, isMobile: phone });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/pinpoint/ranked-targets`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(BOOT_MS);

    const spot = await page.evaluate(() => {
      /* A Term inside a clickable ancestor — the case the guard is about. A
         Term standing on its own has nothing to fire and proves nothing. */
      for (const t of document.querySelectorAll('span[role="button"]')) {
        const r = t.getBoundingClientRect();
        if (!r.width) continue;
        const host = t.parentElement?.closest('button,a');
        if (!host) continue;
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), text: t.textContent.trim() };
      }
      return null;
    });

    if (!spot) { bad(`${at} — found no explainer inside a clickable host to test`); await ctx.close(); continue; }

    const before = page.url();
    await page.mouse.click(spot.x, spot.y);
    await page.waitForTimeout(800);
    const after = page.url();
    const tip = await page.evaluate(() => !!document.querySelector('span[role="tooltip"]'));

    after === before
      ? ok(`${at} — clicking "${spot.text}" stays on the page`)
      : bad(`${at} — clicking "${spot.text}" left ${before.replace(/^https?:\/\/[^/]+/, '')} for ${after.replace(/^https?:\/\/[^/]+/, '')}`);
    tip
      ? ok(`${at} — and shows the definition`)
      : bad(`${at} — the click was swallowed and no definition appeared`);

    await ctx.close();
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   THE SUB-TABS FIT THE WINDOW THEY ARE DRAWN IN.

   `SubNav` is an `inline-flex` of `whitespace-nowrap` pills with neither wrap
   nor scroll. The Pinpoint set — Exposure Profile, Ranked Targets, Vanna &
   Charm — measures 415px against a 358px content area at 390px, so the last
   tab ended 40px past the right edge and the desk slid 43px sideways. A route
   a reader cannot see is a route they cannot reach.

   The nav's OWN overflow is what is asserted, not just the page's: the shells
   differ, and a nav that fits because its parent happens to scroll is still a
   nav with a tab off the edge. Trace is swept too — it renders the same
   component through a different shell, with two shorter tabs, and it must not
   change.
   ───────────────────────────────────────────────────────────────────────── */
head('the sub-tabs fit the window they are drawn in');
{
  for (const route of ['/pinpoint/exposure-profile', '/trace/tracker']) {
    for (const [w, h] of [[390, 844], [768, 900], [1440, 900]]) {
      const at = `${route} @ ${w}`;
      const phone = w < 500;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: phone, isMobile: phone });
      const page = await ctx.newPage();
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(BOOT_MS);

      const g = await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label$="subpages"]');
        if (!nav) return { missing: true };
        const main = document.querySelector('main') || document.documentElement;
        return {
          tabs: nav.querySelectorAll('a').length,
          navOver: nav.scrollWidth - nav.clientWidth,
          offRight: [...nav.querySelectorAll('a')]
            .filter(a => a.getBoundingClientRect().right > window.innerWidth)
            .map(a => `${a.textContent.trim()} ends ${Math.round(a.getBoundingClientRect().right)}`),
          slide: main.scrollWidth - main.clientWidth,
          vw: window.innerWidth,
        };
      });

      if (g.missing) { bad(`${at} — no sub-tab bar on the page`); await ctx.close(); continue; }
      if (g.tabs === 0) { bad(`${at} — the sub-tab bar rendered no tabs`); await ctx.close(); continue; }

      g.navOver <= 0
        ? ok(`${at} — ${g.tabs} tabs fit their own bar`)
        : bad(`${at} — the tab bar overflows itself by ${g.navOver}px`);
      g.offRight.length === 0
        ? ok(`${at} — no tab past the right edge`)
        : bad(`${at} — off the ${g.vw}px window: ${g.offRight.join(', ')}`);
      g.slide === 0
        ? ok(`${at} — the desk does not slide sideways`)
        : bad(`${at} — the desk slides ${g.slide}px sideways`);

      await ctx.close();
    }
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   THE HOVER READ-OUT PRINTS THE SAME NUMBER AS THE BAR IT POINTS AT.

   The positioning map's card built its NET GAMMA headline from the raw
   simulator history, while the band, the exposure matrix, the pinned detail
   bar and the card's OWN C and P legs all print `row.gex.net` — the same value
   after the expiry decay and per-strike jitter this view applies. The card
   contradicted itself inside 200px.

   Measured at 1440x900 before the fix: 14 of 14 hovered cards disagreed with
   their own C+P legs, worst 534%, and one flipped the sign — a band drawn
   green and labelled "dealer long gamma" under a headline in red reading
   DEALER SHORT GAMMA.

   C+P IS THE ORACLE, and it is a good one precisely because it is inside the
   same card: net gamma is call gamma plus put gamma by definition, so any gap
   is the card disagreeing with itself, with no tolerance argument about which
   surface is right. Parsed to numbers rather than matched as strings, so a
   formatting difference cannot fake agreement.
   ───────────────────────────────────────────────────────────────────────── */
head('the hover read-out prints the same number as the bar it points at');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/pinpoint/exposure-profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(BOOT_MS);

  /* Value AND unit: the tolerance below is built from each figure's own
     printed resolution, so the unit has to come along with the number. */
  const money = s => {
    const m = /(-?)\$?([\d.]+)\s*([KMB])?/.exec((s || '').replace(/[+,]/g, ''));
    if (!m) return null;
    const mult = m[3] === 'B' ? 1e9 : m[3] === 'M' ? 1e6 : m[3] === 'K' ? 1e3 : 1;
    return { v: (m[1] ? -1 : 1) * parseFloat(m[2]) * mult, mult };
  };

  const bands = await page.evaluate(() =>
    [...document.querySelectorAll('[aria-label*="gamma"]')]
      .map(el => ({ el, r: el.getBoundingClientRect() }))
      .filter(o => o.r.width > 4 && o.r.height > 2)
      .map(o => ({ x: Math.round(o.r.x + o.r.width / 2), y: Math.round(o.r.y + o.r.height / 2) }))
  );

  let read = 0;
  const off = [];
  for (const b of bands.slice(0, 12)) {
    await page.mouse.move(b.x, b.y);
    await page.waitForTimeout(280);
    const card = await page.evaluate(() => {
      const head = [...document.querySelectorAll('div')].find(d => (d.textContent || '').trim() === 'Net gamma');
      if (!head) return null;
      const box = head.parentElement;
      const legs = box.parentElement.querySelector('div.mt-2.flex');
      return { big: box.children[1]?.textContent?.trim(), legs: legs ? legs.textContent.trim() : null };
    });
    if (!card || !card.big || !card.legs) continue;
    const c = money((/C\s*(-?\$[\d.]+[KMB]?)/.exec(card.legs) ?? [])[1]);
    const p = money((/P\s*(-?\$[\d.]+[KMB]?)/.exec(card.legs) ?? [])[1]);
    const headline = money(card.big);
    if (!c || !p || !headline) continue;
    const sum = c.v + p.v;
    read++;
    /*
      THE TOLERANCE IS EACH FIGURE'S OWN PRINTED RESOLUTION, summed — not a
      flat 2%. fmtUsd prints one decimal in the figure's own unit, so a leg
      that crosses into $x.xB territory carries up to $50M of rounding on its
      face while the headline stays at $0.05M resolution — and a flat 2% of a
      ~$560M net (the CI flake this replaced: "+$560.0M vs C+P 522.7M (7%)",
      push run 33087177732, one green twin apart) cannot absorb that. Half a
      decimal step per figure absorbs exactly what rounding can do and nothing
      more: for three M-scale figures the bound is $0.15M — far TIGHTER than
      the 2% it replaces — and the 534% defect it guards against still trips
      it at any unit mix.
    */
    const tol = 0.05 * (c.mult + p.mult + headline.mult) + 1;
    if (Math.abs(headline.v - sum) > tol) {
      off.push(`${card.big} vs C+P ${(sum / 1e6).toFixed(1)}M (Δ ${((headline.v - sum) / 1e6).toFixed(1)}M > tol ${(tol / 1e6).toFixed(1)}M)`);
    }
  }

  if (read < 4) bad(`only ${read} read-out cards could be read — the guard saw too little to mean anything`);
  else {
    ok(`${read} hovered cards read`);
    off.length === 0
      ? ok('every headline matches its own call and put legs')
      : bad(`${off.length} of ${read} headlines disagree with their own legs: ${off.slice(0, 3).join(' | ')}`);
  }
  await ctx.close();
}

/* ─────────────────────────────────────────────────────────────────────────
   THE MAP'S LEGEND NAMES THE ANCHOR THE RIBBON IS DRAWN FROM.

   Clicking a band re-anchors the cumulative ribbon, and the panel header says
   so — "CUM FROM 485" — while the legend strip below it went on reading
   "CUMULATIVE FROM SPOT". Three surfaces describe one series (header, legend,
   and the hover card's "FROM 485 TO 481"); this was the only one that could
   be wrong, and it was.

   THE PIN IS ASSERTED FIRST. If the click does not actually re-anchor
   anything, both strings stay on "spot", they agree, and a guard that only
   compared them would call that a pass.
   ───────────────────────────────────────────────────────────────────────── */
head('the map legend names the anchor the ribbon is drawn from');
{
  const ctx = await browser.newContext({ viewport: { width: 1760, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/pinpoint/exposure-profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(BOOT_MS);

  const read = () =>
    page.evaluate(() => {
      const t = document.body.innerText;
      return {
        header: (/CUM FROM ([^\s\n]+)/.exec(t) || [])[1] || null,
        legend: (/CUMULATIVE FROM ([^\s\n·]+)/i.exec(t) || [])[1] || null,
      };
    });

  const before = await read();
  if (!before.header || !before.legend) bad(`could not find both the header and the legend (header ${before.header}, legend ${before.legend})`);
  else {
    const band = await page.evaluate(() => {
      const el = [...document.querySelectorAll('[aria-label*="gamma"]')]
        .map(e => ({ e, r: e.getBoundingClientRect() }))
        .filter(o => o.r.width > 4 && o.r.height > 2)[5];
      if (!el) return null;
      return { x: Math.round(el.r.x + el.r.width / 2), y: Math.round(el.r.y + el.r.height / 2) };
    });
    if (!band) bad('found no band to pin');
    else {
      await page.mouse.click(band.x, band.y);
      await page.waitForTimeout(900);
      const after = await read();
      /* THE PREMISE: the click re-anchored something. */
      after.header && after.header !== 'SPOT'
        ? ok(`clicking a band re-anchors the ribbon — header reads CUM FROM ${after.header}`)
        : bad(`clicking a band did not re-anchor anything (header still ${after.header}); the comparison below would prove nothing`);
      if (after.header && after.header !== 'SPOT') {
        after.legend === after.header
          ? ok(`and the legend agrees — CUMULATIVE FROM ${after.legend}`)
          : bad(`the header says ${after.header} and the legend says ${after.legend}`);
      }
    }
  }
  await ctx.close();
}

/* ─────────────────────────────────────────────────────────────────────────
   THE RANKED LADDER'S CLASS COLUMN FITS THE ROW IT JOINS.

   It switched on at `sm` (640px) and the row needs 648, so across an 8px band
   every row read "DOWNSIDE CUSHIO" / "UPSIDE RESISTAN" / "NEUTRA". A scroller
   with `overflow-y-auto` gets `overflow-x: auto` for free, so the tail was not
   clipped — it was scrolled out of sight behind a bar nothing tells you is
   there. Measured before the fix: the scroller overflowed itself by 8px at
   640, 4px at 644, 1px at 647, 0 from 648.

   BOTH DIRECTIONS ARE ASSERTED. "Never overflows" alone is satisfied by a
   ladder with no class column at any width, so above the threshold the column
   must also BE there.
   ───────────────────────────────────────────────────────────────────────── */
head('the ranked ladder fits the row it draws');
{
  /* 390 and 430 are here for the drift check — they are the only widths where
     the ladder scrolls at all, so they are the only ones that can exercise it.
     620 through 1024 carry the fit check across BOTH boundaries — 662 where
     the class lane joins and 770 where the priority lane does — with the
     width either side of each, so a threshold that drifts a pixel is caught
     from whichever direction it drifts. */
  for (const w of [390, 430, 620, 647, 661, 662, 769, 770, 1024]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/pinpoint/ranked-targets`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(BOOT_MS);

    const g = await page.evaluate(() => {
      const sc = document.querySelector('[data-ladder]');
      if (!sc) return { noScroller: true };
      const row = [...sc.querySelectorAll('button')].find(b => /^#\d+/.test((b.textContent || '').trim()));
      if (!row) return { noRow: true };
      const kids = [...row.children];
      const cls = kids[kids.length - 1];
      /* THE CAPTIONS TRAVEL WITH THE ROWS. They used to live outside this box,
         so the two scrolled independently: at 390 dragging the body 102px right
         moved every row and left every caption behind, which put NET GEX under
         somebody else's word. Drag it and measure both.

         FOUND DOCUMENT-WIDE BY ITS OWN HOOK, not inside the scroller. The whole
         defect is the caption row being somewhere else, so looking for it
         inside is looking in the one place a broken build does not keep it —
         the first version of this check searched the scroller, fell back to the
         first ROW, compared that row against itself and passed against the
         exact structure it exists to catch. */
      const head = document.querySelector('[data-ladder-head]');
      if (!head) return { noHead: true };
      const before = { head: head.getBoundingClientRect().left, row: row.getBoundingClientRect().left };
      sc.scrollLeft = 9999;
      const moved = sc.scrollLeft;
      const after = { head: head.getBoundingClientRect().left, row: row.getBoundingClientRect().left };
      sc.scrollLeft = 0;
      return {
        over: sc.scrollWidth - sc.clientWidth,
        classShown: getComputedStyle(cls).display !== 'none' && cls.getBoundingClientRect().width > 0,
        moved: Math.round(moved),
        drift: Math.round((before.head - after.head) - (before.row - after.row)),
      };
    });

    if (g.noScroller || g.noRow) { bad(`ranked @ ${w} — no ladder to measure`); await ctx.close(); continue; }
    if (g.noHead) { bad(`ranked @ ${w} — found no caption row; the drift check below would measure nothing`); await ctx.close(); continue; }

    /* TWO DIFFERENT CLAIMS, and conflating them would have cost the first one.
       From 560px up the row FITS, so any sideways travel there means a column
       turned on before there was room for it — which is exactly the 640-647
       band. Below 560 the row cannot fit at any breakpoint and scrolling is the
       honest answer, so travel there is not a fault. */
    if (w >= 560) {
      g.over === 0
        ? ok(`ranked @ ${w} — the ladder does not overflow itself`)
        : bad(`ranked @ ${w} — the ladder overflows itself by ${g.over}px at a width where the row fits, so a column switched on early`);
    } else {
      ok(`ranked @ ${w} — the row cannot fit a phone; the ladder scrolls ${g.over}px`);
    }
    /* Whether it scrolls is a layout question and either answer can be right.
       Whether the captions come WITH it is not. */
    g.moved === 0
      ? ok(`ranked @ ${w} — nothing to scroll, so nothing can drift`)
      : g.drift === 0
        ? ok(`ranked @ ${w} — scrolled ${g.moved}px and the captions came with the rows`)
        : bad(`ranked @ ${w} — scrolled ${g.moved}px and the captions drifted ${g.drift}px from their columns`);
    /* 662 is where the class lane fits — see the note on the lane itself for
       why the first answer was 648 and why it was wrong. */
    if (w >= 662) {
      g.classShown
        ? ok(`ranked @ ${w} — and the class column is drawn`)
        : bad(`ranked @ ${w} — the class column is missing at a width where it fits`);
    }
    await ctx.close();
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   THE MIGRATION MAP'S HOVER CARD STAYS INSIDE ITS PANEL.

   It was placed with `top: Math.max(4, y - 90)` — clamped at the ceiling and
   silent about the floor — so hovering the lowest strikes pushed it out of the
   panel entirely. Measured at 1440x900 before the fix: a 179px card in a 560px
   panel, 20px past the bottom on the second-to-last row and 44px on the last,
   landing on the Wall Drift panel's header and covering this map's own footer
   legend. Two of the twenty-one strikes could not be read.

   THE LOWEST ROWS ARE THE TEST. Hovering the middle of the map passes on the
   broken build, so the sweep walks the last rows specifically.
   ───────────────────────────────────────────────────────────────────────── */
head('the migration hover card stays inside its panel');
{
  for (const [w, h] of [[1440, 900], [1280, 800]]) {
    const at = `${w}x${h}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/pinpoint/vanna-charm`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(BOOT_MS);

    const rows = await page.evaluate(() => {
      const host = [...document.querySelectorAll('div')].find(
        d => /net GEX/i.test(d.textContent || '') && typeof d.className === 'string' && d.className.includes('flex-col')
      );
      const body = host && host.querySelector('div[class*="overflow-y-auto"]');
      if (!body) return null;
      return [...body.children]
        .filter(c => c.querySelector('span'))
        .slice(-4)
        .map(c => { const r = c.getBoundingClientRect(); return { x: Math.round(r.x + 40), y: Math.round(r.y + r.height / 2) }; });
    });

    if (!rows || rows.length === 0) { bad(`${at} — no migration map rows to hover`); await ctx.close(); continue; }

    let hovered = 0;
    let worst = -Infinity;
    for (const p of rows) {
      await page.mouse.move(p.x, p.y);
      await page.waitForTimeout(320);
      const g = await page.evaluate(() => {
        const card = [...document.querySelectorAll('div')].find(
          d => typeof d.className === 'string' && d.className.includes('w-60') && /Projected/.test(d.textContent || '')
        );
        if (!card || !card.parentElement) return null;
        const cb = card.getBoundingClientRect();
        const hb = card.parentElement.getBoundingClientRect();
        return { over: Math.round(cb.bottom - hb.bottom), above: Math.round(hb.top - cb.top) };
      });
      if (!g) continue;
      hovered++;
      worst = Math.max(worst, g.over, g.above);
    }

    if (hovered === 0) bad(`${at} — hovering the lowest rows produced no read-out card`);
    else {
      ok(`${at} — ${hovered} of the lowest rows produced a card`);
      worst <= 0
        ? ok(`${at} — every one stayed inside the panel (closest edge ${-worst}px in)`)
        : bad(`${at} — a card ran ${worst}px outside its panel`);
    }
    await ctx.close();
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   DOES THE CONTENT FIT ITS BOX?

   Noah, 2026-08-26: "make things in their boxes fit perfectly, aspect ratio is
   a serious thing visually."

   Three faults, kept apart because they have different fixes:

     CLIPPED    overflow:hidden with content bigger than the box — cut off with
                no way to reach it. On a currency figure that is not a smaller
                number, it is a WRONG one.
     TRUNCATED  a horizontal scroller whose content is wider than it. Nothing is
                unreachable in principle, but a desktop scrollbar is invisible
                until you scroll, so the reader sees a table that simply stops.
     SQUASHED   a canvas whose bitmap is a different aspect from its box — the
                picture is stretched.

   Deliberately not reported: a VERTICAL scroller with taller content (that is
   what a scroller is for), and text with a real ellipsis (a considered
   truncation, not a clip).

   Found on the build this was written against: the Exposure Matrix needing
   691px in a 502px column so VEX fell off entirely, and a Ranked Targets card
   cut 20px short of its own Open Int figure.
   ───────────────────────────────────────────────────────────────────────── */
head('content fits the box it is drawn in');
{
  const SCAN = () => {
    const bad = [];
    const path = el => {
      const bits = [];
      for (let n = el; n && bits.length < 3; n = n.parentElement) {
        const c = typeof n.className === 'string' ? n.className.split(/\s+/).slice(0, 2).join('.') : '';
        bits.unshift(n.tagName.toLowerCase() + (c ? '.' + c : ''));
      }
      return bits.join(' > ').slice(0, 90);
    };
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;

      if (el.tagName === 'CANVAS' && el.width > 0 && el.height > 0 && r.width > 40 && r.height > 40) {
        const skew = Math.abs(r.width / r.height - el.width / el.height) / (r.width / r.height);
        if (skew > 0.02) bad.push(`SQUASH ${(skew * 100).toFixed(1)}% ${Math.round(r.width)}x${Math.round(r.height)} vs ${el.width}x${el.height} — ${path(el)}`);
        continue;
      }
      const dx = el.scrollWidth - el.clientWidth;
      const dy = el.scrollHeight - el.clientHeight;
      const scrollsX = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
      const scrollsY = cs.overflowY === 'auto' || cs.overflowY === 'scroll';
      if (scrollsX && dx > 8) bad.push(`TRUNC x by ${dx}px (box ${Math.round(r.width)}, content ${el.scrollWidth}) — ${path(el)}`);
      if (cs.overflowX === 'hidden' && dx > 2 && cs.textOverflow !== 'ellipsis')
        bad.push(`CLIP x by ${dx}px (box ${Math.round(r.width)}) — ${path(el)}`);
      if (cs.overflowY === 'hidden' && dy > 2 && !scrollsY)
        bad.push(`CLIP y by ${dy}px (box ${Math.round(r.height)}) — ${path(el)}`);
    }
    return [...new Set(bad)].slice(0, 6);
  };

  for (const [route, path] of [
    ['terrain', '/terrain'],
    ['exposure', '/pinpoint/exposure-profile'],
    ['ranked', '/pinpoint/ranked-targets'],
    ['vanna', '/pinpoint/vanna-charm'],
    ['weigher', '/weigher'],
  ]) {
    for (const width of [1024, 1280, 1440, 1760]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(BOOT_MS);
      const found = await page.evaluate(SCAN);
      found.length === 0
        ? ok(`${route} @ ${width}`)
        : bad(`${route} @ ${width}:\n         ${found.join('\n         ')}`);
      await ctx.close();
    }
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   T-21. THE WATCHLIST FLIP — and the one band where the arrows are not ours.

   The ring itself is proved headless (scripts/terrain-keys-proof.ts). What
   only a browser can answer is WHO GETS THE KEY, and the answer changes with
   the breakpoint: from `lg` up the desk fills the window and there is nothing
   to scroll, but between `md` and `lg` the panes stack and the shell's
   <main class="overflow-y-auto"> scrolls — so ↑/↓ there belong to the reader's
   only way down a three-pane column.

   The scroller is `main`, NOT the window. `window.scrollY` never moves on any
   page of this app, so a section that measured it would report green whatever
   the desk did. Measured cold, five ArrowDowns move `main` 0px; after one
   click inside the desk they move it ~200. Clicking a pane is also how a pane
   becomes ACTIVE, so that is the exact state the flip would be competing with.
   ───────────────────────────────────────────────────────────────────────── */
head('the flip walks the ring, and gives the arrows back where the desk scrolls');
{
  const capsules = page => page.$$eval('button[title^="Switch ticker"]', bs => bs.map(b => b.textContent.trim()));

  // ── from `lg` up: the desk owns the viewport, so the keys are the desk's ──
  {
    const { ctx, page, errs } = await openDesk(1440, 900, 3);
    const before = await capsules(page);
    before.length === 3
      ? ok(`PREMISE: three panes, ${before.join(' · ')}`)
      : bad(`PREMISE: expected three symbol capsules, saw ${JSON.stringify(before)}`);

    /* The pane BOX, not the grid child — the grid's children are the panes'
       `display: contents` wrappers, which generate no box to click. */
    const boxes = await page.$$('.grid > div > div');
    await boxes[0].click({ position: { x: 200, y: 300 } });
    await page.waitForTimeout(200);

    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(900);
    const down = await capsules(page);
    down[0] !== before[0]
      ? ok(`ArrowDown steps the active pane: ${before[0]} → ${down[0]}`)
      : bad(`ArrowDown left pane 1 on ${before[0]}`);
    down.slice(1).join() === before.slice(1).join()
      ? ok('and the other panes are untouched')
      : bad(`the flip moved another pane: ${before.slice(1).join()} → ${down.slice(1).join()}`);

    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(900);
    const up = await capsules(page);
    up[0] === before[0] ? ok('ArrowUp steps back') : bad(`ArrowUp landed on ${up[0]}, not ${before[0]}`);

    /* A ring nobody can see has to say where in it you are. */
    const said = await page.$eval('span.sr-only[aria-live]', el => el.textContent.trim());
    /^[A-Z.\-0-9]+, \d+ of \d+$/.test(said)
      ? ok(`announced with its place in the ring — ${JSON.stringify(said)}`)
      : bad(`the flip announced ${JSON.stringify(said)}, which does not say where in the ring it is`);

    /* Wrapping, not clamping — the opposite of what `-`/`=` do to intervals. */
    const walk = [up[0]];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(700);
      walk.push((await capsules(page))[0]);
    }
    walk.indexOf(walk[0], 1) > 0
      ? ok(`the ring wraps — ${walk.join(' → ')}`)
      : bad(`the ring stuck rather than wrapping — ${walk.join(' → ')}`);

    /* The whole reason this key is nearly free: it goes through the reducer
       that restores a symbol's setup, so the interval rides along with it. */
    const parked = (await capsules(page))[0];
    await page.keyboard.press('=');
    await page.waitForTimeout(600);
    const tfSet = await page.evaluate(() => JSON.parse(localStorage.getItem('slayer_terrain_v1')).panes[0].timeframe);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(700);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(900);
    const backSym = (await capsules(page))[0];
    const tfBack = await page.evaluate(() => JSON.parse(localStorage.getItem('slayer_terrain_v1')).panes[0].timeframe);
    backSym === parked && tfBack === tfSet
      ? ok(`flipping away and back restores the interval too — ${parked} @ ${tfBack}`)
      : bad(`left ${parked} @ ${tfSet}, came back to ${backSym} @ ${tfBack}`);

    errs.length === 0 ? ok('no page errors') : bad(`page errors: ${errs.join(' | ')}`);
    await ctx.close();
  }

  // ── a menu is up: the arrows belong to the list being read ────────────────
  {
    const { ctx, page, errs } = await openDesk(1440, 900, 3);
    const boxes = await page.$$('.grid > div > div');
    await boxes[0].click({ position: { x: 200, y: 300 } });
    await page.waitForTimeout(200);
    const before = await capsules(page);
    await page.keyboard.press('s');
    await page.waitForTimeout(600);
    const menuUp = await page.$$eval('[role="dialog"]', d => d.length > 0);
    menuUp ? ok('PREMISE: `s` opens the symbol menu') : bad('PREMISE: `s` opened no menu, so the next check proves nothing');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(700);
    const after = await capsules(page);
    after.join() === before.join()
      ? ok('with a menu up the arrows do not flip the pane behind it')
      : bad(`the pane behind an open menu flipped: ${before.join()} → ${after.join()}`);
    errs.length === 0 ? ok('no page errors with the menu open') : bad(`page errors: ${errs.join(' | ')}`);
    await ctx.close();
  }

  // ── the stacked, scrolling band: the arrows are the reader's ──────────────
  {
    const { ctx, page, errs } = await openDesk(900, 800, 3);
    const overflow = await page.$eval('main', m => m.scrollHeight - m.clientHeight);
    overflow > 8
      ? ok(`PREMISE: at 900x800 the desk overflows its scroller by ${overflow}px`)
      : bad(`PREMISE: the desk does not overflow at 900x800 (${overflow}px), so there is no scroll to protect`);

    const before = await capsules(page);
    const boxes = await page.$$('.grid > div > div');
    await boxes[0].click({ position: { x: 200, y: 300 } });
    await page.waitForTimeout(200);
    const top0 = await page.$eval('main', m => m.scrollTop);
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(400);
    const top1 = await page.$eval('main', m => m.scrollTop);
    const after = await capsules(page);
    top1 > top0
      ? ok(`ArrowDown scrolls the desk there — main.scrollTop ${top0} → ${top1}`)
      : bad(`ArrowDown scrolled nothing at 900x800 (${top0} → ${top1}) — the arrows were taken`);
    after.join() === before.join()
      ? ok('and no pane flipped')
      : bad(`a pane flipped in the scrolling band: ${before.join()} → ${after.join()}`);
    errs.length === 0 ? ok('no page errors in the stacked band') : bad(`page errors: ${errs.join(' | ')}`);
    await ctx.close();
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   T-7. THE PRICE SCALE — and the proof that the mode reaches the AXIS.

   The picker is easy to assert and easy to assert vacuously: a menu row can
   mark itself live while the chart draws whatever it drew before. So the load
   bearing check here is the MAPPING. The strike rail places its rows through
   the chart's own `PriceProjection` (`candleSeries.priceToCoordinate`), so
   equally-spaced strikes land at equally-spaced pixels under a linear scale
   and at unequal ones under a log scale. Reading that spread out of the DOM
   observes the axis itself.

   Not a screenshot diff: the simulator moves the tape every tick, so two
   captures always differ and an image comparison would pass no matter what
   the mode did.
   ───────────────────────────────────────────────────────────────────────── */
head('the price scale is the reader’s, and the mode reaches the axis');
{
  const scaleSeed = (over = {}) =>
    JSON.stringify({
      layout: 1,
      panes: [
        {
          ticker: 'SPY', timeframe: '15m',
          overlays: { trails: true, levels: true, darkpool: false, volume: true },
          indicators: { ema9: false, ema21: false, ema50: false, vwap: false },
          chartStyle: 'candles', compares: [], priceScale: 'normal', ladder: true,
          ...over,
        },
      ],
      setups: {},
    });

  const openScale = async (over = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
    await ctx.addInitScript(`localStorage.setItem('slayer_terrain_v1', ${JSON.stringify(scaleSeed(over))})`);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${BASE}/terrain`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(BOOT_MS + 1000);
    return { ctx, page, errs };
  };

  /* px-per-dollar between neighbouring rail rows. Uniform = linear. */
  const railSpread = async page => {
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('[data-strike-label]')]
        .map(el => {
          const row = el.closest('[style*="translate"]') || el.parentElement;
          const r = (row || el).getBoundingClientRect();
          return { strike: parseFloat(el.textContent.replace(/[^0-9.]/g, '')), y: r.top + r.height / 2 };
        })
        .filter(p => Number.isFinite(p.strike) && p.y > 0)
    );
    const sorted = rows.slice().sort((a, b) => a.strike - b.strike);
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) {
      const dK = sorted[i].strike - sorted[i - 1].strike;
      if (dK > 0) gaps.push(Math.abs(sorted[i].y - sorted[i - 1].y) / dK);
    }
    if (gaps.length < 6) return null;
    const lo = Math.min(...gaps);
    const hi = Math.max(...gaps);
    return { n: gaps.length, lo, hi, ratio: hi / lo, span: sorted[sorted.length - 1].strike / sorted[0].strike };
  };

  // ── the mapping, linear vs log ───────────────────────────────────────────
  const linear = await (async () => {
    const { ctx, page } = await openScale({ priceScale: 'normal' });
    const r = await railSpread(page);
    await ctx.close();
    return r;
  })();
  const log = await (async () => {
    const { ctx, page } = await openScale({ priceScale: 'log' });
    const r = await railSpread(page);
    await ctx.close();
    return r;
  })();

  if (!linear || !log) {
    bad(`PREMISE: the rail did not place enough rows to measure the mapping (linear ${linear?.n ?? 0}, log ${log?.n ?? 0})`);
  } else {
    /* Rounding alone moves this by well under a percent — the rail places on
       whole pixels. Uniform to within 1% is "equal dollars, equal height". */
    linear.ratio < 1.01
      ? ok(`linear places equal dollars at equal heights — ${linear.lo.toFixed(2)}..${linear.hi.toFixed(2)} px/$ over ${linear.n} gaps`)
      : bad(`linear px/$ ran ${linear.lo.toFixed(2)}..${linear.hi.toFixed(2)} (ratio ${linear.ratio.toFixed(4)}) — that is not a linear axis`);
    /*
      A log axis spends the same height on the same PERCENTAGE, so px-per-
      dollar falls as price rises — and by a knowable amount: px/$ goes as
      1/K, so the ratio of the widest gap to the narrowest is the ratio of the
      highest strike to the lowest. That is a PHYSICAL check rather than a
      threshold somebody picked, and it fails both ways — a mode that never
      reached the axis measures flat, and one that reached it wrongly measures
      the wrong bend.

      This first shipped as `log.ratio > linear.ratio * 3`, which is the wrong
      arithmetic: three times a RATIO of about 1.003 is about 3.01, so the
      clause demanded a threefold bend rather than three times linear's
      rounding, and a correctly-drawn log axis failed it. The deviations from
      1 are what compare.
    */
    const bend = log.ratio - 1;
    const expected = log.span - 1;
    const overLinear = bend > (linear.ratio - 1) * 3;
    const rightSize = expected > 0.005 && Math.abs(bend - expected) <= Math.max(0.01, expected * 0.25);
    overLinear && rightSize
      ? ok(
          `log bends it by the price span — ${log.lo.toFixed(2)}..${log.hi.toFixed(2)} px/$ ` +
            `(bend ${(bend * 100).toFixed(2)}% against a ${(expected * 100).toFixed(2)}% span)`
        )
      : bad(
          `log px/$ ran ${log.lo.toFixed(2)}..${log.hi.toFixed(2)}: bend ${(bend * 100).toFixed(2)}% ` +
            `against a ${(expected * 100).toFixed(2)}% price span, linear's own bend ${((linear.ratio - 1) * 100).toFixed(2)}%` +
            `${overLinear ? '' : ' — flat, so the mode never reached the axis'}`
        );
  }

  // ── the picker ───────────────────────────────────────────────────────────
  {
    const { ctx, page, errs } = await openScale();
    await page.mouse.move(600, 400);
    await page.waitForTimeout(600);
    const trig = await page.$('button[title^="Chart style"]');
    trig ? ok(`PREMISE: the trigger names it — "${await trig.getAttribute('title')}"`) : bad('PREMISE: no chart-style trigger, so nothing below proves anything');
    if (trig) {
      await trig.click();
      await page.waitForTimeout(400);
      const rows = await page.$$eval('[data-toolbar-menu] button', bs => bs.map(b => b.textContent.trim()));
      const modes = rows.filter(t => /Linear|Logarithmic|Percent|Indexed/.test(t));
      modes.length === 4 ? ok('the menu carries all four modes') : bad(`the menu carries ${modes.length} of 4 modes — ${JSON.stringify(modes)}`);

      for (const b of await page.$$('[data-toolbar-menu] button')) {
        if ((await b.textContent()).includes('Percent')) {
          await b.click();
          break;
        }
      }
      await page.waitForTimeout(1200);
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('slayer_terrain_v1')).panes[0].priceScale);
      stored === 'percent' ? ok('picking a mode writes it to the pane') : bad(`picked Percent, stored ${JSON.stringify(stored)}`);
    }
    errs.length === 0 ? ok('no page errors') : bad(`page errors: ${errs.join(' | ')}`);
    await ctx.close();
  }

  // ── the one case the reader's pick does not win, and it is named ────────
  {
    const { ctx, page, errs } = await openScale({ priceScale: 'log', compares: [{ ticker: 'QQQ', mode: 'percent', ink: '#5B9CF6' }] });
    await page.mouse.move(600, 400);
    await page.waitForTimeout(800);
    const trig = await page.$('button[title^="Chart style"]');
    if (!trig) bad('PREMISE: no chart-style trigger with a comparison up');
    else {
      await trig.click();
      await page.waitForTimeout(400);
      const marked = await page.$$eval('[data-toolbar-menu] button', bs =>
        bs.filter(b => b.className.includes('font-semibold')).map(b => b.textContent.trim())
      );
      marked.some(t => t.includes('Percent')) && !marked.some(t => t.includes('Logarithmic'))
        ? ok('a % comparison holds the axis in percent, over a stored log')
        : bad(`the live mode with a % comparison up was ${JSON.stringify(marked)}`);
      const yours = await page.$$eval('[data-toolbar-menu] button', bs =>
        bs.filter(b => b.textContent.includes('yours')).map(b => b.textContent.trim())
      );
      yours.some(t => t.includes('Logarithmic'))
        ? ok("and the reader's own pick is still shown as theirs")
        : bad(`the held pick was not marked as the reader's — ${JSON.stringify(yours)}`);
      const why = await page.$$eval('[data-toolbar-menu] p', ps => ps.map(p => p.textContent.trim()));
      why.some(t => /% comparison/.test(t))
        ? ok('and the menu says what is holding it')
        : bad(`the menu offered no reason for the lock — ${JSON.stringify(why)}`);
    }
    errs.length === 0 ? ok('no page errors with a held axis') : bad(`page errors: ${errs.join(' | ')}`);
    await ctx.close();
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   THE PANE TOOLBAR OCCUPIES ONE ROW — the property TOOLBAR_FULL_PX exists
   to hold, asserted instead of the constant.

   Terrain.tsx carries a measured breakdown of what the strip costs (818px
   full, 350px compact) and gates `compact` on it. Nothing checked it, so a
   control added three files away in ChartToolbar could push the strip onto a
   second row over the tape and no build would notice. T-7 nearly did exactly
   that.

   ROWS ARE COUNTED BY CENTRE, not by `top`. The strip is `items-center`, so
   children of different heights sit at different tops on the SAME line —
   counting tops reports every one-row strip as two and makes this vacuous.

   THE NARROW COLUMNS ARE EXCLUDED, with their numbers, because the strip has
   never fitted them: the compact strip is 350px and those columns are 271,
   272, 347 and 349. Verified against a clean build of the tree before T-7 —
   identical at every cell. Excluding them silently would be the lie; the
   floor below is what makes the exclusion checkable.
   ───────────────────────────────────────────────────────────────────────── */
head('the pane toolbar never wraps over the tape');
{
  /* Below this the strip has never fitted — see the note above. The floor is
     asserted too, so if a future change makes the strip WIDER these columns
     stop being the known exception and the run says so. */
  const COMPACT_STRIP_PX = 350;
  const NARROW_FLOOR_PX = 360;
  let narrowSeen = 0;
  let widest = 0;

  for (const layout of [1, 2, 3, 4]) {
    const { ctx, page, errs } = await openDesk(1440, 1000, layout);
    for (const width of [1024, 1180, 1280, 1440, 1536, 1760, 1920, 2560]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(500);
      await page.mouse.move(Math.min(400, Math.round(width / 3)), 300);
      await page.waitForTimeout(400);
      const bars = await page.evaluate(() => {
        const out = [];
        for (const root of document.querySelectorAll('div')) {
          if (!root.className.includes('flex items-center gap-2 flex-wrap')) continue;
          const kids = [...root.children].filter(c => c.getBoundingClientRect().width > 0);
          const lanes = new Set(
            kids.map(c => {
              const b = c.getBoundingClientRect();
              return Math.round((b.top + b.height / 2) / 4);
            })
          );
          out.push({ rows: lanes.size, w: Math.round(root.getBoundingClientRect().width) });
        }
        return out;
      });
      if (bars.length === 0) {
        bad(`layout ${layout} @ ${width}: no toolbar found — the strip may not be revealing on hover`);
        continue;
      }
      for (const b of bars) widest = Math.max(widest, b.w);
      const roomy = bars.filter(b => b.w >= NARROW_FLOOR_PX);
      narrowSeen += bars.length - roomy.length;
      const wrapped = roomy.filter(b => b.rows > 1);
      wrapped.length === 0
        ? ok(`layout ${layout} @ ${width}: ${roomy.length} of ${bars.length} toolbars have room, all one row`)
        : bad(
            `layout ${layout} @ ${width}: ${wrapped.length} toolbar(s) wrapped with room to spare — ${JSON.stringify(wrapped)}`
          );
    }
    errs.length === 0 ? ok(`layout ${layout}: no page errors`) : bad(`layout ${layout} page errors: ${errs.join(' | ')}`);
    await ctx.close();
  }

  /* The exclusion has to stay an exclusion. If the strip grows past the floor
     these columns are no longer "narrower than the strip has ever fitted" and
     the whole section above quietly stops testing anything. */
  /* The full strip is 934px in this build (818 before T-1's pencil and T-13's
     Replay joined it). The bound is the figure Terrain gates `compact` on,
     less the padding it adds — past that the strip cannot fit the column the
     constant promises it and the section above stops meaning anything. */
  widest > 0 && widest <= 956 - 22
    ? ok(`the widest strip measured is ${widest}px, inside the 934 the source records`)
    : bad(`the widest strip measured is ${widest}px; the source records 934 and gates compact on 956`);
  narrowSeen > 0
    ? ok(`${narrowSeen} toolbars sat in columns under the ${NARROW_FLOOR_PX}px floor and were excluded, as recorded (compact strip is ${COMPACT_STRIP_PX}px)`)
    : bad('no narrow columns were seen at all — the excluded band has moved and this floor is now untested');
}

/* ─────────────────────────────────────────────────────────────────────────
   T-8. THE HOVERED BAR — reported by every pane, not only the one under the
   pointer.

   HOVER A QUARTER IN, NEVER THE MIDDLE. The chart holds a runway open ahead
   of the last bar, by design, and at 1440 with two panes the last bar sits
   near 45% of the pane — the middle of a narrow column lands in empty space,
   where the honest answer is nothing and a probe reads it as a broken
   feature. That was a real half hour; the premise below is asserted so it
   cannot cost anyone else one.

   The runway is then checked on purpose: past the last bar this reports
   NOTHING rather than the nearest bar, because "the values at the moment you
   are pointing at" and "the values near it" are different claims.
   ───────────────────────────────────────────────────────────────────────── */
head('every pane reports the hovered bar, and reports only what it is drawing');
{
  const barSeed = (layout, indicators, chartStyle = 'candles') =>
    JSON.stringify({
      layout,
      panes: TICKERS.map(t => ({
        ticker: t, timeframe: '15m',
        overlays: { trails: true, levels: true, darkpool: false, volume: true },
        indicators, chartStyle, compares: [], priceScale: 'normal', ladder: true,
      })),
      setups: {},
    });

  const openBars = async (layout, indicators, w, h, chartStyle) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.addInitScript(`localStorage.setItem('slayer_terrain_v1', ${JSON.stringify(barSeed(layout, indicators, chartStyle))})`);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${BASE}/terrain`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(BOOT_MS + 1000);
    return { ctx, page, errs };
  };

  /* The readout rows on screen: a chrome box whose text opens with an O or a
     C followed by a figure. `heavy` opens with the word Heaviest, so the two
     that share this slot are told apart by content rather than by order. */
  const readouts = page =>
    page.evaluate(() =>
      [...document.querySelectorAll('.chrome-hover')]
        .filter(d => /^[OC][\d.]/.test(d.textContent.replace(/\s/g, '')))
        .map(d => ({ w: Math.round(d.getBoundingClientRect().width), t: d.textContent.trim() }))
    );

  const hoverBar = async (page, i = 0, frac = 0.25) => {
    const boxes = await page.$$('.grid > div > div');
    const bb = await boxes[i].boundingBox();
    await page.mouse.move(bb.x + bb.width * (frac - 0.05), bb.y + bb.height / 2);
    await page.waitForTimeout(200);
    await page.mouse.move(bb.x + bb.width * frac, bb.y + bb.height / 2);
    await page.waitForTimeout(1200);
    return bb;
  };

  const ALL_IND = { ema9: true, ema21: true, ema50: true, vwap: true };

  // ── it appears on hover, carries everything at a wide column, and clears ──
  {
    const { ctx, page, errs } = await openBars(1, ALL_IND, 2200, 1000);
    (await readouts(page)).length === 0
      ? ok('PREMISE: nothing is reported before the pointer arrives')
      : bad('a readout was on screen before anything was hovered');
    await hoverBar(page);
    const r = await readouts(page);
    r.length === 1 ? ok(`hovering the plot reports the bar — ${r[0].t.slice(0, 44)}`) : bad(`${r.length} readouts after hovering one pane`);
    const t = (r[0]?.t ?? '').replace(/\s/g, '');
    /^O[\d.]/.test(t) && /V[\d.]/.test(t) && /vwap/.test(t)
      ? ok(`a column this wide carries open, volume and indicators — ${r[0].w}px`)
      : bad(`the widest column shed parts it could pay for — ${r[0]?.t}`);
    await page.mouse.move(4, 4);
    await page.waitForTimeout(900);
    (await readouts(page)).length === 0 ? ok('and leaving the plot clears it') : bad('the readout survived the pointer leaving the plot');
    errs.length === 0 ? ok('no page errors') : bad(`page errors: ${errs.join(' | ')}`);
    await ctx.close();
  }

  // ── it sheds by width, and the close is the part that never goes ─────────
  for (const [w, layout, expect] of [[1440, 2, 'shed'], [1024, 4, 'shed']]) {
    const { ctx, page } = await openBars(layout, ALL_IND, w, 950);
    await hoverBar(page);
    const r = (await readouts(page))[0];
    const t = (r?.t ?? '').replace(/\s/g, '');
    /C[\d.]/.test(t)
      ? ok(`${w} with ${layout} panes: the close is still there — ${r.w}px, ${r.t.slice(0, 40)}`)
      : bad(`${w} with ${layout} panes: no close in the readout — ${JSON.stringify(r ?? null)}`);
    expect === 'shed' && !/vwap|ema/.test(t)
      ? ok('and the indicators have been shed, as the width budget says')
      : bad(`${w} with ${layout} panes: the indicators did not shed — ${r?.t}`);
    await ctx.close();
  }

  // ── the runway reports nothing rather than the nearest bar ───────────────
  {
    const { ctx, page } = await openBars(1, ALL_IND, 1600, 950);
    const bb = await hoverBar(page);
    (await readouts(page)).length === 1
      ? ok('PREMISE: a quarter in, there is a bar to report')
      : bad('PREMISE: nothing to report a quarter in, so the runway check below proves nothing');
    await page.mouse.move(bb.x + bb.width - 150, bb.y + bb.height / 2);
    await page.waitForTimeout(1200);
    (await readouts(page)).length === 0
      ? ok('and past the last bar it reports nothing rather than the nearest one')
      : bad('the readout reported a bar in the runway ahead of the last one');
    await ctx.close();
  }

  // ── THE POINT OF IT: a synced pane reports its OWN values ────────────────
  {
    const { ctx, page, errs } = await openBars(2, ALL_IND, 2200, 1000);
    await hoverBar(page, 0);
    const r = await readouts(page);
    r.length === 2
      ? ok('hovering one pane reports the moment on BOTH panes')
      : bad(`${r.length} of 2 panes reported the hovered moment — a followed pane never fires the crosshair event, so it has to report from the sync`);
    r.length === 2 && r[0].t !== r[1].t
      ? ok(`and each reports its own prices — ${r[0].t.slice(0, 22)} vs ${r[1].t.slice(0, 22)}`)
      : bad(`the two panes reported the same figures: ${JSON.stringify(r.map(x => x.t.slice(0, 30)))}`);
    errs.length === 0 ? ok('no page errors on a synced desk') : bad(`page errors: ${errs.join(' | ')}`);
    await ctx.close();
  }

  // ── a line tape has no high or low, and does not invent them ─────────────
  {
    const { ctx, page, errs } = await openBars(1, { ema9: false, ema21: false, ema50: false, vwap: false }, 2200, 1000, 'line');
    await hoverBar(page);
    const r = (await readouts(page))[0];
    const t = (r?.t ?? '').replace(/\s/g, '');
    /C[\d.]/.test(t) ? ok(`a line tape reports a close — ${r.t}`) : bad(`a line tape reported nothing — ${JSON.stringify(r ?? null)}`);
    !/^O[\d.]/.test(t) && !/H[\d.]/.test(t)
      ? ok('and does not invent an open, high or low it is not drawing')
      : bad(`a line tape printed OHL it does not draw — ${r?.t}`);
    errs.length === 0 ? ok('no page errors on a line tape') : bad(`page errors: ${errs.join(' | ')}`);
    await ctx.close();
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   T-12. THE CONFLUENCE STRIP — at rest, in two forms, and never guessing.
   ───────────────────────────────────────────────────────────────────────── */
head('the timeframes say whether they agree, at every width that can hold them');
{
  const strips = page =>
    page.evaluate(() =>
      [...document.querySelectorAll('[role="img"][aria-label^="Timeframe trend"]')].map(el => ({
        w: Math.round(el.getBoundingClientRect().width),
        text: el.textContent.trim(),
        label: el.getAttribute('aria-label'),
      }))
    );

  const { ctx, page, errs } = await openDesk(1920, 950, 2);
  const seen = { full: 0, tight: 0, none: 0 };
  for (const width of [1920, 1600, 1440, 1366, 1280, 1180, 1024]) {
    await page.setViewportSize({ width, height: 950 });
    await page.waitForTimeout(700);
    const found = await strips(page);
    if (found.length === 0) {
      seen.none++;
      continue;
    }
    /* FULL carries the timeframe names, TIGHT is glyphs only. Told apart by
       whether a digit survives once the glyphs are stripped. */
    const full = /\d/.test(found[0].text.replace(/[▲▼▬–]/g, ''));
    full ? seen.full++ : seen.tight++;
    found.every(f => [...f.text.replace(/[^▲▼▬–]/g, '')].length === 5)
      ? ok(`${width}: ${found.length} strip(s), ${full ? 'full' : 'tight'}, five timeframes — ${found[0].text}`)
      : bad(`${width}: a strip did not carry five glyphs — ${JSON.stringify(found.map(f => f.text))}`);
    /* The tight form drops the labels from the SCREEN, never from the
       accessible name — that is the whole basis for dropping them. */
    found[0].label && /1m|5m|15m|1h|1D/.test(found[0].label) && /EMA21|not enough history/.test(found[0].label)
      ? ok(`${width}: and names the timeframes and the rule to a screen reader`)
      : bad(`${width}: the accessible name does not carry the timeframes and the rule — ${JSON.stringify(found[0].label)}`);
  }
  /* All three tiers have to be REACHED, or the two that were not are untested
     and this section is a slow way of asserting one of them. */
  seen.full > 0 && seen.tight > 0 && seen.none > 0
    ? ok(`all three tiers were exercised — full ×${seen.full}, tight ×${seen.tight}, absent ×${seen.none}`)
    : bad(`only some tiers were reached (full ${seen.full}, tight ${seen.tight}, absent ${seen.none}) — the widths here no longer straddle the thresholds`);
  errs.length === 0 ? ok('no page errors') : bad(`page errors: ${errs.join(' | ')}`);
  await ctx.close();
}

/* ─────────────────────────────────────────────────────────────────────────
   T-6. SESSION LEVELS — off by default, on the field, and never on the axis.

   The engine is proved headless (scripts/session-levels-proof.ts). What only
   a browser can answer is whether the rules reach the tape, whether their
   labels land on the FIELD rather than on the price axis (the house rule),
   and whether the opening-range choice actually changes what is drawn.

   The lines are canvas, so they cannot be counted from the DOM. What CAN be
   read is the price scale's own width: the levels are created with
   `axisLabelVisible: false`, so turning seven of them on must not add a
   single tag to the gutter — and the gutter's width is what a pile of tags
   would move.
   ───────────────────────────────────────────────────────────────────────── */
head('the session levels draw on the tape and leave the price axis alone');
{
  const sessionSeed = (session, sessionOr) =>
    JSON.stringify({
      layout: 1,
      panes: TICKERS.map(t => ({
        ticker: t, timeframe: '15m',
        overlays: { trails: false, levels: false, darkpool: false, volume: true, flow: false, netDrift: false, volDrift: false, dexStrike: false, session },
        indicators: { ema9: false, ema21: false, ema50: false, vwap: false },
        chartStyle: 'candles', compares: [], priceScale: 'normal', sessionOr, ladder: true,
      })),
      setups: {},
    });

  const openSession = async (session, sessionOr = 15) => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
    await ctx.addInitScript(`localStorage.setItem('slayer_terrain_v1', ${JSON.stringify(sessionSeed(session, sessionOr))})`);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${BASE}/terrain`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(BOOT_MS + 1000);
    return { ctx, page, errs };
  };

  /* The plot's ink, and the price gutter's width. Seven rules put ink on the
     plot; seven axis tags would widen the gutter. */
  const measure = page =>
    page.evaluate(() => {
      /* THE FIRST wide canvas in DOM order, not the widest.
         lightweight-charts stacks two same-sized canvases per pane and paints
         on the lower one; taking "the widest" landed on the upper overlay,
         which is empty — measured 0 pixels of ink with the tape plainly
         drawn, which reads as a broken feature rather than a broken probe. */
      const plot = [...document.querySelectorAll('canvas')].find(
        c => c.getBoundingClientRect().height > 200 && c.getBoundingClientRect().width > 200
      );
      if (!plot) return null;
      const d = plot.getContext('2d').getImageData(0, 0, plot.width, plot.height).data;
      let ink = 0;
      for (let k = 3; k < d.length; k += 4) if (d[k] > 8) ink++;
      return { ink, plotW: Math.round(plot.getBoundingClientRect().width) };
    });

  /*
    TOGGLED INSIDE ONE PAGE LOAD, not compared across two.

    The first version loaded the desk twice and compared the plot's ink. The
    tape moves between loads — measured across three loads with the overlay
    OFF the ink ran 83,472 / 85,110 / 86,570, a ±2% band — and the levels are
    worth about 12%, so the comparison worked but sat only six times its own
    noise. Toggling in place removes the variance rather than budgeting for
    it: the same session, a second apart, with only the overlay changed.
  */
  /*
    OPENS THE MENU ONLY IF IT IS SHUT.

    Clicking an overlay row does NOT close the menu — the rows are checkboxes
    and a reader ticking three of them should not have to reopen it twice. So
    a second call that clicked the trigger unconditionally CLOSED the menu and
    then found no rows in it, and the "turn it off again" check read an
    unchanged chart as an overlay that would not turn off. The app was fine;
    the toggle was.
  */
  const toggleSession = async page => {
    const menuOpen = async () => (await page.$$('[data-toolbar-menu] [role="checkbox"]')).length > 0;
    if (!(await menuOpen())) {
      for (const b of await page.$$('[aria-haspopup="menu"]')) {
        if (/Overlays/.test((await b.textContent()) ?? '')) {
          await b.click();
          await page.waitForTimeout(400);
          break;
        }
      }
    }
    for (const item of await page.$$('[data-toolbar-menu] [role="checkbox"]')) {
      if (/Session levels/.test((await item.textContent()) ?? '')) {
        await item.click();
        await page.waitForTimeout(900);
        return true;
      }
    }
    return false;
  };

  {
    const { ctx, page, errs } = await openSession(false);
    await page.mouse.move(600, 400);
    await page.waitForTimeout(600);
    const before = await measure(page);
    const toggled = await toggleSession(page);
    toggled ? ok('PREMISE: the Session levels row toggles from the Overlays menu') : bad('PREMISE: no Session levels row in the Overlays menu, so nothing below proves anything');
    const after = await measure(page);
    if (!before || !after) {
      bad('PREMISE: no plot canvas to measure');
    } else {
      after.plotW === before.plotW
        ? ok(`PREMISE: the plot is the same ${after.plotW}px wide either way, so the ink is the levels`)
        : bad(`the plot changed width across the toggle (${before.plotW} → ${after.plotW})`);
      after.ink > before.ink * 1.05
        ? ok(`turning the levels on puts ink on the tape — ${before.ink} → ${after.ink} (+${(((after.ink - before.ink) / before.ink) * 100).toFixed(1)}%)`)
        : bad(`the overlay drew nothing: ${before.ink} pixels of ink off, ${after.ink} on`);
      /* And OFF again puts it back — an overlay that cannot be turned off is
         a different bug from one that never drew. */
      const off = await toggleSession(page);
      off ? ok('the Session levels row toggles a second time') : bad('the second toggle never found the row, so the check below proves nothing');
      const back = await measure(page);
      back && Math.abs(back.ink - before.ink) < before.ink * 0.05
        ? ok(`and turning it off again takes it away — ${after.ink} → ${back.ink}`)
        : bad(`turning the overlay off left ink behind: ${before.ink} before, ${back?.ink} after`);
    }
    errs.length === 0 ? ok('no page errors toggling the overlay') : bad(`page errors: ${errs.join(' | ')}`);
    await ctx.close();
  }

  /* THE PRICE AXIS IS LEFT ALONE — the house rule, and the reason these carry
     their labels on the rule itself. */
  {
    const gutter = async session => {
      const { ctx, page } = await openSession(session);
      const w = await page.evaluate(() => {
        const canvases = [...document.querySelectorAll('canvas')].filter(c => c.getBoundingClientRect().height > 200);
        const widths = canvases.map(c => Math.round(c.getBoundingClientRect().width)).sort((a, b) => a - b);
        return widths[0] ?? null; // the narrow one beside the plot is the scale
      });
      await ctx.close();
      return w;
    };
    const a = await gutter(false);
    const b = await gutter(true);
    a !== null && b !== null && a === b
      ? ok(`and the price gutter is untouched at ${b}px — nothing was named on the axis`)
      : bad(`the price gutter moved with the overlay on (${a} → ${b}) — the levels are tagging the axis`);
  }

  /*
    THE OPENING RANGE IS A CHOICE — asserted as WIRED AND PERSISTED, which is
    what a browser can actually establish here.

    The obvious check would be that 5 and 30 draw different pixels, and it is
    not worth having: the labels are canvas text no selector can read, the two
    ranges differ by two rules out of seven, and that delta sits inside the
    tape's own between-load noise. `five.ink > 0 && thirty.ink > 0` was the
    first version of it and it is vacuous — the plot has ink with the overlay
    off entirely.

    So the chain is split at the seam instead. That the ranges COMPUTE
    differently is proved exactly, headless, against a fixture whose collapse
    lands between the 15th and 30th minute (session-levels-proof.ts). What is
    left for the browser is that the control reaches the pane and survives:
    the pick lands in storage, and the chart still paints after it.
  */
  {
    const { ctx, page, errs } = await openSession(true, 15);
    await page.mouse.move(600, 400);
    await page.waitForTimeout(600);
    let opened = false;
    for (const b of await page.$$('[aria-haspopup="menu"]')) {
      if (/Overlays/.test((await b.textContent()) ?? '')) {
        await b.click();
        await page.waitForTimeout(400);
        opened = true;
        break;
      }
    }
    opened ? ok('PREMISE: the Overlays menu opens') : bad('PREMISE: the Overlays menu never opened');
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('slayer_terrain_v1')).panes[0].sessionOr);
    (await stored()) === 15 ? ok('PREMISE: the pane starts on the 15-minute range') : bad(`the pane started on ${await stored()}`);
    let picked = false;
    for (const b of await page.$$('[role="group"][aria-label="Opening range minutes"] button')) {
      if ((await b.textContent())?.trim() === '5m') {
        await b.click();
        await page.waitForTimeout(900);
        picked = true;
        break;
      }
    }
    picked ? ok('the 5-minute range can be picked') : bad('no 5m button in the opening-range picker');
    (await stored()) === 5
      ? ok('and the pick lands in the pane, where a reload will find it')
      : bad(`picked 5m and the pane stored ${await stored()}`);
    const after = await measure(page);
    after && after.ink > 0
      ? ok(`and the chart still paints after the change — ${after.ink} pixels of ink`)
      : bad('the chart stopped painting after the opening range changed');
    errs.length === 0 ? ok('no page errors changing the opening range') : bad(`page errors: ${errs.join(' | ')}`);
    await ctx.close();
  }

  /* THE PICKER IS ON THE OVERLAY'S OWN ROW, and only while the overlay is on
     — a live control with nothing to change is the thing this desk rules out. */
  {
    const rowState = async session => {
      const { ctx, page } = await openSession(session);
      await page.mouse.move(600, 400);
      await page.waitForTimeout(600);
      /* The Overlays trigger wears its COUNT rather than a fixed label
         (`Overlays 3`), so it is found by the word inside it rather than by a
         selector that would have to know the number. */
      const buttons = await page.$$('[aria-haspopup="menu"]');
      let opened = false;
      for (const b of buttons) {
        const t = (await b.textContent()) ?? '';
        if (/Overlays/.test(t)) {
          await b.click();
          opened = true;
          break;
        }
      }
      const found = opened
        ? await page.$$eval('[role="group"][aria-label="Opening range minutes"] button', bs => bs.map(x => x.textContent.trim()))
        : null;
      await ctx.close();
      return { opened, found };
    };
    const onRow = await rowState(true);
    onRow.opened ? ok('PREMISE: the Overlays menu opens') : bad('PREMISE: the Overlays menu never opened, so the picker check proves nothing');
    onRow.found && onRow.found.length === 3
      ? ok(`the opening-range picker sits on the overlay's row — ${onRow.found.join(' ')}`)
      : bad(`the opening-range picker was not on the row: ${JSON.stringify(onRow.found)}`);
    const offRow = await rowState(false);
    offRow.found && offRow.found.length === 0
      ? ok('and is absent while the overlay is off, rather than live with nothing to change')
      : bad(`the picker was present with the overlay off: ${JSON.stringify(offRow.found)}`);
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   T-1. THE MEASURE — and the door the drawing layer did not have.

   The figures are proved headless (scripts/measure-proof.ts) and the box is
   drawn on canvas, so what a browser adds is the CHAIN: the pencil is
   reachable from the pane strip, the toolbar under it offers three tools,
   dragging with Measure picked commits a two-point measure, and it is in the
   per-ticker store where a reload will find it.

   That chain is the whole point of the section. Before this the toolbar's
   pencil was gated on `!minimal` and no host in the app passed a handler, so
   trendlines, levels and the measure were all unreachable — a layer with no
   way in reads exactly like a layer that works, from the outside.
   ───────────────────────────────────────────────────────────────────────── */
head('the measure is reachable, and what it draws is a stored measure');
{
  const { ctx, page, errs } = await openDesk(1600, 950, 1);
  await page.mouse.move(600, 400);
  await page.waitForTimeout(600);

  const pencil = await page.$('button[aria-label="Draw on the chart"]');
  pencil ? ok('PREMISE: the pane strip carries a draw button') : bad('PREMISE: no draw button in the pane strip — the drawing layer still has no door');

  if (pencil) {
    await pencil.click();
    await page.waitForTimeout(500);
    /* The rail's buttons are icon-only since the partner's round — names
       ride aria-label. This section only cares that its three founding tools
       are still offered and that Measure still measures. */
    const tools = await page.$$eval('button[aria-label]', bs =>
      bs.map(b => b.getAttribute('aria-label')).filter(t => /^(Trend|Level|Measure)$/.test(t))
    );
    tools.length === 3 && tools.includes('Measure')
      ? ok(`draw mode offers the founding three — ${tools.join(' · ')}`)
      : bad(`draw mode offered ${JSON.stringify(tools)}`);

    /* Pick Measure, then drag across the tape. A QUARTER in and a quarter
       wide, so both ends land on real bars rather than in the runway the
       chart holds open ahead of the last one. */
    for (const b of await page.$$('button[aria-label]')) {
      if ((await b.getAttribute('aria-label')) === 'Measure') {
        await b.click();
        break;
      }
    }
    await page.waitForTimeout(300);
    const box = (await page.$$('.grid > div > div'))[0];
    const bb = await box.boundingBox();
    const y = bb.y + bb.height * 0.45;
    await page.mouse.move(bb.x + bb.width * 0.2, y);
    await page.mouse.down();
    for (const f of [0.24, 0.28, 0.32, 0.36]) {
      await page.mouse.move(bb.x + bb.width * f, y - bb.height * 0.08);
      await page.waitForTimeout(80);
    }
    await page.mouse.up();
    await page.waitForTimeout(700);

    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('slayer_chart_drawings_SPY');
      return raw ? JSON.parse(raw) : null;
    });
    const measures = Array.isArray(stored) ? stored.filter(d => d.kind === 'measure') : [];
    measures.length === 1
      ? ok('a drag with Measure picked commits one measure')
      : bad(`the drag stored ${JSON.stringify(stored)} — expected exactly one measure`);
    measures[0]?.p1 && measures[0]?.p2 && measures[0].p1.time !== measures[0].p2.time
      ? ok(`and it carries two anchors spanning real bars — ${measures[0].p1.time} → ${measures[0].p2.time}`)
      : bad(`the stored measure has no span: ${JSON.stringify(measures[0] ?? null)}`);

    /* It has to SURVIVE a reload, which is the half a kind-list validator
       breaks silently — `loadDrawings` dropped any kind it did not enumerate. */
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(BOOT_MS);
    const after = await page.evaluate(() => {
      const raw = localStorage.getItem('slayer_chart_drawings_SPY');
      return raw ? JSON.parse(raw).filter(d => d.kind === 'measure').length : 0;
    });
    after === 1
      ? ok('and it is still there after a reload — the validator keeps the kind')
      : bad(`the measure did not survive a reload (${after} left) — loadDrawings is dropping the kind`);
  }

  errs.length === 0 ? ok('no page errors') : bad(`page errors: ${errs.join(' | ')}`);
  await ctx.close();
}

/* ─────────────────────────────────────────────────────────────────────────
   T-13. REPLAY, WIRED — the door, the key, the badge, and whose moment may
   travel.

   The transport itself was already built and already good (play, pause, step,
   speed, scrub). What it did not have on this desk was any way in: only
   Pulse's LiveChartWidget passed `replay`, so the dedicated chart desk could
   not reach it.

   THE SYNC DECISION IS OBSERVED THROUGH T-8's READOUT, which is the only
   surface that makes it visible from the DOM: a pane that RECEIVES a moment
   reports its own values at it, so counting readouts counts marks. Four
   cases, because the rule has two clauses and both have to bite.
   ───────────────────────────────────────────────────────────────────────── */
head('replay has a door, says so on the pane, and keeps its moment to itself');
{
  const replaySeed = tfs =>
    JSON.stringify({
      layout: 2,
      panes: TICKERS.map((t, i) => ({
        ticker: t, timeframe: tfs[i] ?? '15m',
        overlays: { trails: true, levels: true, darkpool: false, volume: true, flow: false, netDrift: false, volDrift: false, dexStrike: false, session: false },
        indicators: { ema9: false, ema21: false, ema50: false, vwap: false },
        chartStyle: 'candles', compares: [], priceScale: 'normal', sessionOr: 15, ladder: true,
      })),
      setups: {},
    });

  const openReplay = async (tfs, w = 1600, h = 950, layout = 2) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const seedStr = JSON.stringify({ ...JSON.parse(replaySeed(tfs)), layout });
    await ctx.addInitScript(`localStorage.setItem('slayer_terrain_v1', ${JSON.stringify(seedStr)})`);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${BASE}/terrain`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(BOOT_MS + 1000);
    return { ctx, page, errs };
  };

  const badges = page => page.$$eval('[title="This pane is replaying history — it is not live"]', bs => bs.length);
  /* The SCRUBBER, not a button titled "Exit replay": the toolbar's own replay
     toggle wears that title too once a pane is replaying, so counting titles
     counts the door as well as the transport. */
  const transports = page => page.$$eval('input[type="range"]', bs => bs.length);
  const readouts = page =>
    page.$$eval('.chrome-hover', ds => ds.filter(d => /^[OC][\d.]/.test(d.textContent.replace(/\s/g, ''))).length);

  // ── the door, and what it puts on screen ─────────────────────────────────
  {
    const { ctx, page, errs } = await openReplay(['15m'], 1600, 950, 1);
    await page.mouse.move(600, 400);
    await page.waitForTimeout(700);
    (await badges(page)) === 0 ? ok('PREMISE: no replay badge before anything is toggled') : bad('a replay badge was up before replay was');
    const btn = await page.$('button[title="Replay session history — P"]');
    btn ? ok('the pane toolbar carries a replay button') : bad('no replay button in the pane toolbar — the desk still cannot reach replay');
    if (btn) {
      await btn.click();
      await page.waitForTimeout(1500);
      (await transports(page)) === 1 ? ok('clicking it puts the pane in replay') : bad(`${await transports(page)} transports after one click`);
      (await badges(page)) === 1
        ? ok('and the pane wears a REPLAY badge, so a historical chart cannot pass for a live one')
        : bad(`${await badges(page)} badges with one pane replaying`);
      await page.mouse.move(600, 400);
      await page.waitForTimeout(500);
      const xs = await page.$$('button[title="Exit replay"]');
      await xs[xs.length - 1].click();
      await page.waitForTimeout(1200);
      (await transports(page)) === 0 && (await badges(page)) === 0
        ? ok('and exiting takes both away')
        : bad('exiting replay left the transport or the badge behind');
    }
    errs.length === 0 ? ok('no page errors') : bad(`page errors: ${errs.join(' | ')}`);
    await ctx.close();
  }

  // ── the key, and what ends a replay ──────────────────────────────────────
  {
    const { ctx, page, errs } = await openReplay(['15m', '15m']);
    const boxes = await page.$$('.grid > div > div');
    await boxes[0].click({ position: { x: 200, y: 300 } });
    await page.waitForTimeout(250);
    await page.keyboard.press('p');
    await page.waitForTimeout(1500);
    (await badges(page)) === 1 ? ok('`p` puts the ACTIVE pane in replay') : bad(`${await badges(page)} panes replaying after one \`p\``);
    const said = await page.$eval('span.sr-only[aria-live]', el => el.textContent.trim());
    /replay on$/.test(said) ? ok(`and announces it — ${JSON.stringify(said)}`) : bad(`\`p\` announced ${JSON.stringify(said)}`);
    /* A replay was recorded in another world; a symbol change has to end it. */
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(1800);
    (await badges(page)) === 0
      ? ok('and a symbol change ends it — the replay was recorded in another world')
      : bad(`the replay survived a symbol change (${await badges(page)} badges)`);
    errs.length === 0 ? ok('no page errors') : bad(`page errors: ${errs.join(' | ')}`);
    await ctx.close();
  }

  /*
    SHED IN COMPACT, AND STILL REACHABLE — the trade T-1 and T-13 made to add
    nothing to the narrow strip.

    Both mode buttons come off at compact widths, which is only honest because
    both keep a key. If a future change sheds one without its key, or renames
    a title so the key stops being announced, this is what says so.
  */
  {
    const { ctx, page, errs } = await openReplay(['15m', '15m', '15m', '15m'], 1280, 950, 4);
    const pencil = await page.$('button[aria-label="Draw on the chart"]');
    !pencil
      ? ok('PREMISE: at 1280 with four panes both mode buttons are shed')
      : bad('the pencil is still in the compact strip — the width budget above is not what it says');
    const boxes = await page.$$('.grid > div > div');
    await boxes[0].click({ position: { x: 150, y: 250 } });
    await page.waitForTimeout(250);
    await page.keyboard.press('d');
    await page.waitForTimeout(900);
    const tools = await page.$$eval('button[aria-label="Measure"]', bs => bs.length);
    tools === 1 ? ok('`d` still opens draw mode where the pencil is shed') : bad(`\`d\` opened ${tools} tool rails at a compact width`);
    const said = await page.$eval('span.sr-only[aria-live]', el => el.textContent.trim());
    /draw mode on$/.test(said) ? ok(`and announces it — ${JSON.stringify(said)}`) : bad(`\`d\` announced ${JSON.stringify(said)}`);
    await page.keyboard.press('p');
    await page.waitForTimeout(1500);
    (await badges(page)) === 1 ? ok('`p` still opens replay there too') : bad(`\`p\` put ${await badges(page)} panes in replay at a compact width`);
    errs.length === 0 ? ok('no page errors') : bad(`page errors: ${errs.join(' | ')}`);
    await ctx.close();
  }

  // ── whose moment may travel ──────────────────────────────────────────────
  for (const [label, tfs, replayPanes, expect] of [
    ['both live', ['15m', '15m'], [], 2],
    ['one live, one replaying', ['15m', '15m'], [1], 1],
    ['both replaying, same interval', ['15m', '15m'], [0, 1], 2],
    ['both replaying, different intervals', ['15m', '5m'], [0, 1], 1],
  ]) {
    const { ctx, page, errs } = await openReplay(tfs, 2200, 1000);
    const boxes = await page.$$('.grid > div > div');
    for (const i of replayPanes) {
      await boxes[i].click({ position: { x: 200, y: 300 } });
      await page.waitForTimeout(250);
      await page.keyboard.press('p');
      await page.waitForTimeout(1600);
    }
    const b = await badges(page);
    b === replayPanes.length
      ? ok(`${label}: PREMISE — ${b} pane(s) in replay`)
      : bad(`${label}: PREMISE — ${b} panes replaying, expected ${replayPanes.length}, so the count below proves nothing`);
    const bb = await boxes[0].boundingBox();
    await page.mouse.move(bb.x + bb.width * 0.2, bb.y + bb.height * 0.5);
    await page.waitForTimeout(250);
    await page.mouse.move(bb.x + bb.width * 0.25, bb.y + bb.height * 0.5);
    await page.waitForTimeout(1500);
    const n = await readouts(page);
    n === expect
      ? ok(`${label}: ${n} pane(s) report the moment`)
      : bad(`${label}: ${n} panes reported the moment, expected ${expect}`);
    errs.length === 0 ? ok(`${label}: no page errors`) : bad(`${label} page errors: ${errs.join(' | ')}`);
    await ctx.close();
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   P-4. THE FLIP, ANSWERED — one strip on every Pinpoint tab.

   The engine is proved headless (scripts/flip-gauge-proof.ts), including the
   crossing counter and the one-flip-rule unification behind it. What a
   browser establishes is that the strip is really on every tab, that it
   carries the whole answer, and that the flip it prints is a price the desk
   below could be drawing — read from the aria-label, which the component
   builds from the same gauge as the visible text.

   NO cross-surface equality assertion, deliberately: the strip reads the
   FULL chain and each desk reads its own window, and "everyone reads
   pickFlip" — the real claim — is pinned per module in the proof. Asserting
   strip-flip === page-flip here would fail honestly whenever the nearest
   crossing to spot sits outside a ±10 window, which is a state of the book
   rather than a bug.
   ───────────────────────────────────────────────────────────────────────── */
head('every Pinpoint tab opens with the flip already answered');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  for (const path of ['/pinpoint/exposure-profile', '/pinpoint/ranked-targets', '/pinpoint/vanna-charm']) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(path.endsWith('exposure-profile') ? BOOT_MS + 1000 : 2500);
    const strip = await page.$('[role="status"][aria-label*="GAMMA"], [role="status"][aria-label*="No gamma flip"]');
    strip ? ok(`${path}: the strip is on the tab`) : bad(`${path}: no flip strip — the shell is not carrying it here`);
    if (!strip) continue;
    const label = (await strip.getAttribute('aria-label')) ?? '';
    const text = ((await strip.textContent()) ?? '').trim();
    if (/No gamma flip/.test(label)) {
      /* A real state; the strip saying so IS the pass. The simulator's books
         essentially always cross, so reaching this line is itself unusual —
         noted in the message so a run that lands here is legible. */
      ok(`${path}: a one-sided book, and the strip says so rather than hiding`);
      continue;
    }
    /(SHORT|LONG) GAMMA/.test(text)
      ? ok(`${path}: it names the regime`)
      : bad(`${path}: no regime in the strip — ${text.slice(0, 80)}`);
    /spot/.test(text) && /flip/.test(text) && /%/.test(text)
      ? ok(`${path}: with spot, the flip, and the distance in two units`)
      : bad(`${path}: the strip is missing parts — ${text.slice(0, 110)}`);
    /crossed \d+× today/.test(text)
      ? ok(`${path}: and how many times it was crossed today`)
      : bad(`${path}: no crossing count — ${text.slice(0, 110)}`);
    /* The label a screen reader gets carries the same answer AND the
       mechanism, which the visible strip teaches through the Term card. */
    /amplifies|absorbs/.test(label)
      ? ok(`${path}: the accessible name explains the regime, not just names it`)
      : bad(`${path}: the aria-label does not carry the mechanism — ${label.slice(0, 90)}`);
  }
  /* T-19 rides the strip: the desk-wide unit picker is ON it, and choosing
     ATR re-words the lead distance in that ruler (or as its honest em-dash
     while the warmup holds — either way the unit's mark appears). */
  {
    const picker = await page.$('[role="group"][aria-label="Distance unit — desk-wide"]');
    picker ? ok('the distance-unit picker rides the strip') : bad('no unit picker on the flip strip');
    if (picker) {
      for (const b of await picker.$$('button')) {
        if (((await b.textContent()) ?? '').trim() === 'ATR') { await b.click(); break; }
      }
      await page.waitForTimeout(600);
      const strip2 = await page.$('[role="status"][aria-label*="GAMMA"]');
      const text2 = strip2 ? ((await strip2.textContent()) ?? '') : '';
      /ATR/.test(text2)
        ? ok('choosing ATR re-words the distance in the new ruler')
        : bad(`the strip ignored the unit choice — ${text2.slice(0, 100)}`);
      /%/.test(text2)
        ? ok('with percent still riding second for the cross-check')
        : bad('the constant second read vanished');
    }
  }

  errs.length === 0 ? ok('no page errors across the three tabs') : bad(`page errors: ${errs.join(' | ')}`);
  await ctx.close();
}

/* ─────────────────────────────────────────────────────────────────────────
   P-3 / P-7. THE TOTAL, THROUGH TIME AND AGAINST HISTORY.

   Both engines are proved headless (scripts/gex-series-proof.ts) — the sums,
   the crossings, the rank and its tie behaviour. The browser establishes the
   landings: the Net GEX timeline sits beside Wall Drift on Vanna & Charm
   with its zero line NAMED, and the percentile fact on Exposure Profile
   carries its own basis — the whole book, and the store's real depth — since
   a rank of one quantity printed beside a different quantity was the exact
   dishonesty the fact was designed around.
   ───────────────────────────────────────────────────────────────────────── */
head('the total has a timeline and a rank, and each states its basis');
{
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));

  await page.goto(`${BASE}/pinpoint/vanna-charm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(BOOT_MS + 1000);
  const body = await page.evaluate(() => document.body.textContent ?? '');
  /Wall Drift/i.test(body) && /THE WHOLE BOOK/i.test(body)
    ? ok('Vanna & Charm carries both timelines — where the levels went, and whether the gamma behind them grew')
    : bad('the Net GEX timeline is not beside Wall Drift');
  /Zero — the book flips/.test(body)
    ? ok('and the zero line is named as what it is — the whole book changing sign')
    : bad('the zero line is unnamed');
  /Net GEX \+/.test(body) && /Net GEX −/.test(body)
    ? ok('with the regime pair on the legend')
    : bad('the sign pair is missing from the legend');

  await page.goto(`${BASE}/pinpoint/exposure-profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(BOOT_MS + 1000);
  const body2 = await page.evaluate(() => document.body.textContent ?? '');
  const m = body2.match(/(\d+)(st|nd|rd|th)whole book · (\d+) sessions/);
  m
    ? ok(`the percentile fact states its basis — ${m[1]}${m[2]}, whole book, ${m[3]} sessions`)
    : bad('no percentile fact with its basis on Exposure Profile');
  if (m) {
    /* The depth is the store's own. The simulator seeds 22 sessions; the day
       the seam is swapped to a real 2yr feed this number moves WITH the data
       and the bound here moves with it — what it must never do is exceed
       what any store could have held, which is what a hardcoded "2yr" label
       would have done from day one. */
    Number(m[3]) >= 1 && Number(m[3]) <= 30
      ? ok('and the depth is the store’s own, not a borrowed period')
      : bad(`the label claims ${m[3]} sessions against a 22-session store`);
  }
  /* P-10 rides the same page — both pins, named, with the gap read as which
     mass leans where. The engine (max pain really minimising payout, the
     centroid, the disagreement case) is pins-proof.ts's job. */
  /Both Pins/i.test(body2) && /Max pain/i.test(body2) && /Gamma pin/i.test(body2)
    ? ok('both pins are on the page, named')
    : bad('the Both Pins panel is missing from Exposure Profile');
  /gamma mass (above|below|on) the OI mass/.test(body2)
    ? ok('and the gap reads as which mass leans where')
    : bad('the gap is a bare number with no read');

  /* P-9 — three flips, and the spread stated as a sentence. */
  /The Flip, By Expiry/i.test(body2) && /Whole book/i.test(body2) && /Weekly/i.test(body2)
    ? ok('the flip is answered per expiry — 0DTE, weekly, whole book')
    : bad('the by-expiry flip panel is missing');
  /(Spread \d|The lenses agree|No spread)/.test(body2)
    ? ok('with the spread read out, agreement and no-flip included')
    : bad('the spread line is missing its sentence');

  errs.length === 0 ? ok('no page errors on either landing') : bad(`page errors: ${errs.join(' | ')}`);
  await ctx.close();
}

/* ─────────────────────────────────────────────────────────────────────────
   T-2 + THE PARTNER'S ROUND. THE DRAWING TOOLS — thirteen on the rail, and
   the gestures that are not a plain drag.

   The persistence layer is proved headless (scripts/drawings-proof.ts). The
   browser owns the gestures: the channel's two-phase flow (release does NOT
   commit — the width is still owed, and the next press pays it) and the
   note's floating input, which lived exactly one millisecond until the
   pointerdown's default focus action was cancelled — the regression this
   section exists to catch.

   Storage is cleared by evaluate, never addInitScript: an init script runs
   on EVERY navigation, so it wiped the store during the reload half of this
   section and made survival untestable.
   ───────────────────────────────────────────────────────────────────────── */
head('thirteen tools on the rail, two of them take three anchors, the note takes words');
{
  const { ctx, page, errs } = await openDesk(1600, 950, 1);
  await page.evaluate(() => localStorage.removeItem('slayer_chart_drawings_SPY'));
  const paneBox = async () => (await page.$$('.grid > div > div'))[0].boundingBox();
  {
    const b0 = await paneBox();
    await page.mouse.click(b0.x + 200, b0.y + 300);
    await page.waitForTimeout(200);
  }
  await page.keyboard.press('d');
  await page.waitForTimeout(600);

  /* The rail's buttons are icon-only — the names live in aria-label (and the
     tooltip), which is also what a screen reader gets. */
  const RAIL = ['Select', 'Trend', 'Ray', 'Extended', 'Arrow', 'Level', 'Moment', 'Box', 'Ellipse', 'Channel', 'Curve', 'Fib', 'Measure', 'Note'];
  const tools = await page.$$eval('button[aria-label]', bs => bs.map(b => b.getAttribute('aria-label')));
  RAIL.every(t => tools.includes(t))
    ? ok(`the pointer and all thirteen tools are on the rail — ${RAIL.join(' · ')}`)
    : bad(`the rail is missing ${RAIL.filter(t => !tools.includes(t)).join(', ')}`);

  const bb = await paneBox();
  const pick = async name => {
    for (const b of await page.$$('button[aria-label]')) if ((await b.getAttribute('aria-label')) === name) { await b.click(); return; }
  };
  const drag = async (fx1, fy1, fx2, fy2) => {
    await page.mouse.move(bb.x + bb.width * fx1, bb.y + bb.height * fy1);
    await page.mouse.down();
    await page.mouse.move(bb.x + bb.width * fx2, bb.y + bb.height * fy2, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(350);
  };
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('slayer_chart_drawings_SPY') ?? '[]').map(d => d.kind));

  await pick('Ray');
  await drag(0.15, 0.6, 0.3, 0.4);
  await pick('Box');
  await drag(0.18, 0.35, 0.32, 0.55);
  await pick('Fib');
  await drag(0.2, 0.7, 0.35, 0.3);
  await pick('Extended');
  await drag(0.4, 0.6, 0.55, 0.45);
  await pick('Arrow');
  await drag(0.4, 0.3, 0.55, 0.5);
  await pick('Ellipse');
  await drag(0.45, 0.4, 0.6, 0.6);
  JSON.stringify(await stored()) === JSON.stringify(['ray', 'rect', 'fib', 'extend', 'arrow', 'ellipse'])
    ? ok('ray, box, fib, extended, arrow and ellipse each commit on release')
    : bad(`after six drags the store holds ${(await stored()).join(',')}`);
  /* The moment-marker is one click, like the level it is the vertical twin
     of. */
  await pick('Moment');
  await page.mouse.click(bb.x + bb.width * 0.62, bb.y + bb.height * 0.5);
  await page.waitForTimeout(300);
  (await stored()).includes('vline') ? ok('a moment commits on one click') : bad('the vline never stored');

  await pick('Channel');
  await drag(0.15, 0.5, 0.35, 0.35);
  !(await stored()).includes('channel')
    ? ok('a channel does not commit on release — the width is still owed')
    : bad('the channel committed without its width anchor');
  await page.mouse.move(bb.x + bb.width * 0.25, bb.y + bb.height * 0.62);
  await page.waitForTimeout(200);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(400);
  (await stored()).includes('channel') ? ok('and the next press sets the width and commits it') : bad('the width press never committed the channel');
  const chan = await page.evaluate(() => JSON.parse(localStorage.getItem('slayer_chart_drawings_SPY')).find(d => d.kind === 'channel'));
  chan?.p1 && chan?.p2 && chan?.p3 ? ok('with all three anchors stored') : bad(`the stored channel is missing anchors: ${JSON.stringify(chan)}`);

  /* The curve rides the same two-phase gesture — the shape table drives it,
     so the sweep only needs to see that it does. */
  await pick('Curve');
  await drag(0.6, 0.7, 0.75, 0.55);
  !(await stored()).includes('curve')
    ? ok('a curve does not commit on release — the bend is still owed')
    : bad('the curve committed without its bend anchor');
  await page.mouse.move(bb.x + bb.width * 0.68, bb.y + bb.height * 0.5);
  await page.waitForTimeout(200);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(400);
  const curve = await page.evaluate(() => JSON.parse(localStorage.getItem('slayer_chart_drawings_SPY') ?? '[]').find(d => d.kind === 'curve'));
  curve?.p1 && curve?.p2 && curve?.p3 ? ok('the bend press commits the curve with all three anchors') : bad(`the stored curve: ${JSON.stringify(curve)}`);

  await pick('Note');
  await page.mouse.move(bb.x + bb.width * 0.4, bb.y + bb.height * 0.5);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(400);
  (await page.$('input[aria-label^="Note text"]'))
    ? ok('a note click opens the floating input — and it survives the pointer’s own focus default')
    : bad('the note input is not there — the 1ms-blur regression is back');
  await page.keyboard.type('held twice pre-market');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const note = await page.evaluate(() => JSON.parse(localStorage.getItem('slayer_chart_drawings_SPY')).find(d => d.kind === 'note'));
  note?.text === 'held twice pre-market' ? ok('Enter places the note with its words') : bad(`the note stored ${JSON.stringify(note)}`);

  await page.mouse.move(bb.x + bb.width * 0.5, bb.y + bb.height * 0.5);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.keyboard.type('abandoned');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const notes = await page.evaluate(() => JSON.parse(localStorage.getItem('slayer_chart_drawings_SPY')).filter(d => d.kind === 'note').length);
  notes === 1 ? ok('Escape abandons a half-typed note') : bad(`${notes} notes after an abandoned one`);
  (await page.evaluate(() => !document.querySelector('[role="dialog"][aria-modal]')))
    ? ok('and the Escape stayed in the input — nothing else on the desk moved')
    : bad('the Escape leaked out of the note input');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(BOOT_MS);
  const after = await stored();
  ['ray', 'rect', 'fib', 'channel', 'note', 'vline', 'extend', 'arrow', 'ellipse', 'curve'].every(k => after.includes(k))
    ? ok('all ten newer kinds survive a reload')
    : bad(`after a reload the store holds ${after.join(',')}`);

  /*
    THE EDITOR — select, move, delete ONE. Driven on a fresh level drawn
    after the reload, because the pre-reload marks' pixel positions belong
    to the pre-reload autoscale and aiming at them is aiming at a memory.
    The level is the drag target of choice here: it spans the full width, so
    the click only has to be right about the PRICE, and the axis-parallel
    hit tolerance (8px) covers the tape's drift between frames.
  */
  {
    const bb2 = await paneBox();
    await page.mouse.click(bb2.x + 200, bb2.y + 300);
    await page.waitForTimeout(200);
    await page.keyboard.press('d');
    await page.waitForTimeout(600);
    const countBefore = (await stored()).length;
    const deleteDisabled = async () => {
      for (const b of await page.$$('button[aria-label="Delete selected"]')) return await b.isDisabled();
      return null;
    };
    await pick('Level');
    await page.mouse.click(bb2.x + bb2.width * 0.5, bb2.y + bb2.height * 0.28);
    await page.waitForTimeout(300);
    const levels0 = (await stored()).filter(d => d.kind === 'hline');
    levels0.length === 1 ? ok('PREMISE: one fresh level to edit') : bad(`PREMISE: ${levels0.length} levels stored`);
    (await deleteDisabled()) === true ? ok('Delete is disabled while nothing is selected') : bad('Delete armed with no selection');
    await pick('Select');
    await page.mouse.click(bb2.x + bb2.width * 0.5, bb2.y + bb2.height * 0.28);
    await page.waitForTimeout(250);
    (await deleteDisabled()) === false ? ok('clicking a mark selects it — Delete arms') : bad('the click selected nothing');
    await page.mouse.move(bb2.x + bb2.width * 0.5, bb2.y + bb2.height * 0.28);
    await page.mouse.down();
    await page.mouse.move(bb2.x + bb2.width * 0.5, bb2.y + bb2.height * 0.45, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(350);
    const levels1 = (await stored()).filter(d => d.kind === 'hline');
    levels1[0] && levels0[0] && levels1[0].p1.price !== levels0[0].p1.price
      ? ok(`a body-drag moves the mark — ${levels0[0].p1.price.toFixed(2)} → ${levels1[0].p1.price.toFixed(2)}`)
      : bad('the drag moved nothing');
    for (const b of await page.$$('button[aria-label="Delete selected"]')) if (!(await b.isDisabled())) await b.click();
    await page.waitForTimeout(300);
    const afterDel = await stored();
    afterDel.length === countBefore && !afterDel.some(d => d.kind === 'hline')
      ? ok('Delete removes exactly the selected mark; the rest survive')
      : bad(`after delete the store holds ${afterDel.map(d => d.kind).join(',')}`);
    await page.mouse.click(bb2.x + bb2.width * 0.8, bb2.y + bb2.height * 0.06);
    await page.waitForTimeout(250);
    (await deleteDisabled()) === true ? ok('an empty click puts the selection down') : bad('the selection survived an empty click');
  }

  errs.length === 0 ? ok('no page errors through the tour') : bad(`page errors: ${errs.join(' | ').slice(0, 200)}`);
  await ctx.close();
}

/* ─────────────────────────────────────────────────────────────────────────
   T-9. THE EXPECTED-MOVE CONE — the envelope on the tape, the forward half
   on the runway, and the price axis left alone.

   The engine is proved headless (scripts/expected-move-proof.ts) and the
   session roll that keeps its forward half alive is proved too
   (scripts/session-roll-proof.ts). The browser owns the geometry: that
   toggling the overlay puts ink on the plot AND on the runway — the region
   right of the last bar, where only the forward cone (and the dotted live
   price line) can paint — and that none of it widens the price gutter.

   THE RUNWAY IS THE REGRESSION THIS SECTION EXISTS TO CATCH. v5.2's
   logicalToCoordinate returns 0 for a FRACTIONAL logical (measured: 610 →
   x 1064, 610.263 → x 0), and the first cut handed it the exact-close tip's
   fraction — which dragged the tip to the left edge and wrapped the ±1σ fill
   across the entire tape as a full-width band. The primitive now interpolates
   fractions itself; the far-left ink bound below is the tripwire that fails
   if the wrap ever comes back.

   MEASURED AFTER THE FIRST SESSION ROLL, deliberately: at boot the seeded
   tape's last session is always complete (remaining = 0, cone collapsed), and
   the first live bar (~6s in, four 1500ms ticks) rolls a fresh session with
   the whole day still implied. BOOT_MS already covers that, so by the time
   this section measures, the forward half has real width to draw.
   ───────────────────────────────────────────────────────────────────────── */
head('the expected move draws its envelope and its runway cone, and leaves the axis alone');
{
  const coneSeed = cone =>
    JSON.stringify({
      layout: 1,
      panes: [{
        ticker: 'SPY', timeframe: '15m',
        overlays: { trails: false, levels: false, darkpool: false, volume: false, flow: false, netDrift: false, volDrift: false, dexStrike: false, session: false, cone },
        indicators: { ema9: false, ema21: false, ema50: false, vwap: false },
        chartStyle: 'candles', compares: [], priceScale: 'normal', sessionOr: 15, ladder: false,
      }],
      setups: {},
    });

  const openCone = async cone => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
    await ctx.addInitScript(`localStorage.setItem('slayer_terrain_v1', ${JSON.stringify(coneSeed(cone))})`);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${BASE}/terrain`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(BOOT_MS + 2500);
    return { ctx, page, errs };
  };

  /*
    Plot ink, split into tape / runway at `splitX` — and the split is taken
    from the OFF measurement and REUSED for the on one. The first cut derived
    the boundary per-measure from "the last heavy column", which is circular:
    the cone's own wash at the tip is the heaviest thing on the runway, so
    with the overlay on the boundary slid out to the cone's far edge and the
    runway read 0 with the cone plainly drawn. Off, the heavy columns really
    are the candles, so that split is the live bar; the grid does not move
    across a toggle (plot width asserted equal below), so it stays valid for
    the on-state read. Plus the far-left band the wrap bug painted.
  */
  const measure = (page, splitX = null) =>
    page.evaluate(split => {
      const plot = [...document.querySelectorAll('canvas')].find(
        c => c.getBoundingClientRect().height > 200 && c.getBoundingClientRect().width > 200
      );
      if (!plot) return null;
      const { width: w, height: h } = plot;
      const d = plot.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
      const colInk = new Array(w).fill(0);
      for (let y = 0; y < h; y += 2) {
        for (let x = 0; x < w; x += 2) {
          const k = (y * w + x) * 4;
          if (Math.max(d[k], d[k + 1], d[k + 2]) > 40) colInk[x] += 1;
        }
      }
      const heavy = Math.max(...colInk) * 0.35;
      let lastHeavy = 0;
      for (let x = 0; x < w; x += 2) if (colInk[x] > heavy) lastHeavy = x;
      const boundary = split ?? lastHeavy;
      let total = 0, runway = 0, farLeft = 0;
      for (let x = 0; x < w; x += 2) {
        total += colInk[x];
        if (x > boundary + 12) runway += colInk[x];
        if (x < 200) farLeft += colInk[x];
      }
      return { total, runway, farLeft, lastHeavy, w };
    }, splitX);

  /*
    TOGGLED INSIDE ONE PAGE LOAD — the same reasoning as the session-levels
    section above: across loads the tape itself varies more than a thin
    envelope is worth, and toggling in place removes the variance instead of
    budgeting for it.
  */
  const toggleCone = async page => {
    /* The pane toolbar sits UNDER the plot canvas until the pane is hovered —
       measured: every trigger's centre hit CANVAS until a mouse.move over the
       pane, then BUTTON. The session-levels section above carries the same
       hover for the same reason; without it the click retries into a 30s
       TimeoutError and takes the whole sweep down (the ccfdb57 local run). */
    await page.mouse.move(600, 400);
    await page.waitForTimeout(600);
    const menuOpen = async () => (await page.$$('[data-toolbar-menu] [role="checkbox"]')).length > 0;
    if (!(await menuOpen())) {
      for (const b of await page.$$('[aria-haspopup="menu"]')) {
        if (/Overlays/.test((await b.textContent()) ?? '')) {
          await b.click();
          await page.waitForTimeout(400);
          break;
        }
      }
    }
    for (const item of await page.$$('[data-toolbar-menu] [role="checkbox"]')) {
      if (/Expected move/.test((await item.textContent()) ?? '')) {
        await item.click();
        await page.waitForTimeout(900);
        return true;
      }
    }
    return false;
  };

  {
    const { ctx, page, errs } = await openCone(false);
    const before = await measure(page);
    const toggled = await toggleCone(page);
    toggled ? ok('PREMISE: the Expected move row toggles from the Overlays menu') : bad('PREMISE: no Expected move row in the Overlays menu, so nothing below proves anything');
    const after = await measure(page, before?.lastHeavy ?? null);
    if (!before || !after) {
      bad('PREMISE: no plot canvas to measure');
    } else {
      after.runway > before.runway + 300
        ? ok(`the forward cone paints the runway — ${before.runway} → ${after.runway} sampled cells right of the live bar`)
        : bad(`the runway gained no cone: ${before.runway} → ${after.runway}`);
      after.total > before.total
        ? ok(`and the overlay adds ink overall — ${before.total} → ${after.total}`)
        : bad(`the overlay drew nothing: ${before.total} → ${after.total}`);
      /* The fractional-logical wrap painted a full-width band: the far-left
         200 columns ballooned by the fill's whole height. A cone anchored at
         the live bar has no business out there. */
      after.farLeft < before.farLeft * 2 + 300
        ? ok(`no wrap band — far-left ink ${before.farLeft} → ${after.farLeft}`)
        : bad(`far-left ink ballooned ${before.farLeft} → ${after.farLeft}: the fractional-logical wrap is back`);
      const off = await toggleCone(page);
      off ? ok('the row toggles a second time') : bad('the second toggle never found the row');
      const back = await measure(page, before.lastHeavy);
      /*
        RELATIONAL, not absolute: the session is YOUNG here (the roll is ~6s
        into boot) and paints a fresh candle every ~6s, so total ink grows a
        few hundred cells between any two reads and a flat "back within 8% of
        before" bound fails on honest drift (measured: 5431 → 6182 across two
        toggle round-trips). The claim is that turning the cone off removes
        MOST of what turning it on added; a stuck overlay leaves back ≈ after
        and still trips this.
      */
      back && after.total - back.total > (after.total - before.total) * 0.7
        ? ok(`and turning it off takes it away — ${after.total} → ${back.total}`)
        : bad(`turning the overlay off left ink behind: ${before.total} before, ${after.total} on, ${back?.total} after`);
    }
    errs.length === 0 ? ok('no page errors toggling the cone') : bad(`page errors: ${errs.join(' | ')}`);
    await ctx.close();
  }

  /* THE PRICE AXIS IS LEFT ALONE — the tag rides the field, the tip prints
     its claim in the plot, and the gutter must not learn any of it. */
  {
    const gutter = async cone => {
      const { ctx, page } = await openCone(cone);
      const w = await page.evaluate(() => {
        const canvases = [...document.querySelectorAll('canvas')].filter(c => c.getBoundingClientRect().height > 200);
        const widths = canvases.map(c => Math.round(c.getBoundingClientRect().width)).sort((a, b) => a - b);
        return widths[0] ?? null;
      });
      await ctx.close();
      return w;
    };
    const gOff = await gutter(false);
    const gOn = await gutter(true);
    gOff !== null && gOff === gOn
      ? ok(`the price gutter is ${gOn}px with the cone on or off — nothing named on the axis`)
      : bad(`the cone moved the price gutter: ${gOff}px off, ${gOn}px on`);
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   T-11. EVENT MARKERS — the calendar on the tape, with a card on hover.

   The engine is proved headless (scripts/events-proof.ts): placement, the
   sessions bridge, the print floor and cap. The browser owns two things —
   that the lane's glyphs are really there to hover, and that hovering one
   opens a card naming a real event kind.

   ZOOMED OUT FIRST, deliberately: the macro dates nearest "now" sit days to
   weeks from the last bar, so at the default ~5-day view the lane is often
   legitimately empty — the first cut of this probe read that emptiness as a
   broken overlay. Ten wheel-notches pull the buffer's weeks into view, where
   the monthly CPI/NFP cadence guarantees at least one mark on screen.

   THE SCAN STAYS IN THE LEFT HALF: the pane's bottom-right corner carries
   the arrangement cluster as a sibling of the chart wrapper, so hovers
   there never reach the handler (documented in eventsPrimitive.ts) — a
   sweep that scanned into it would flake on geometry, not on the feature.
   ───────────────────────────────────────────────────────────────────────── */
head('the event lane draws, and a glyph answers with its card');
{
  const seed = JSON.stringify({
    layout: 1,
    panes: [{
      ticker: 'NVDA', timeframe: '15m',
      overlays: { trails: false, levels: false, darkpool: false, volume: false, flow: false, netDrift: false, volDrift: false, dexStrike: false, session: false, cone: false, events: true },
      indicators: { ema9: false, ema21: false, ema50: false, vwap: false },
      chartStyle: 'candles', compares: [], priceScale: 'normal', sessionOr: 15, ladder: false,
    }],
    setups: {},
  });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  await ctx.addInitScript(`localStorage.setItem('slayer_terrain_v1', ${JSON.stringify(seed)})`);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(`${BASE}/terrain`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(BOOT_MS + 1500);

  const bb = await (await page.$$('.grid > div > div'))[0].boundingBox();
  await page.mouse.move(bb.x + bb.width * 0.5, bb.y + bb.height * 0.5);
  for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, 480); await page.waitForTimeout(120); }
  await page.waitForTimeout(600);

  /* Walk the lane until a card opens. 6px steps against a ±7px hit window,
     left half only. */
  let card = null;
  const laneY = bb.y + bb.height - 38;
  for (let x = bb.x + 30; x < bb.x + bb.width * 0.55 && !card; x += 6) {
    await page.mouse.move(x, laneY);
    await page.waitForTimeout(30);
    card = await page.evaluate(() => {
      const el = [...document.querySelectorAll('div')].find(d => typeof d.className === 'string' && d.className.includes('bottom-9'));
      return el ? el.textContent : null;
    });
  }
  card !== null
    ? ok(`a glyph answers with its card — ${String(card).slice(0, 60)}`)
    : bad('no hover card anywhere along the lane');
  card !== null && /(CPI|NFP|FOMC|earnings|print)/i.test(String(card))
    ? ok('and the card names a real event kind')
    : bad(`the card says ${JSON.stringify(String(card ?? '').slice(0, 80))}`);
  /* Off the lane, the card closes — the readout row above must not fight a
     phantom card. */
  await page.mouse.move(bb.x + bb.width * 0.4, bb.y + bb.height * 0.3);
  await page.waitForTimeout(300);
  const gone = await page.evaluate(() => ![...document.querySelectorAll('div')].some(d => typeof d.className === 'string' && d.className.includes('bottom-9')));
  gone ? ok('and closes once the pointer leaves the lane') : bad('the card survived leaving the lane');

  /* The toolbar offers the row. */
  const menuOpen = async () => (await page.$$('[data-toolbar-menu] [role="checkbox"]')).length > 0;
  await page.mouse.move(bb.x + 600, bb.y + 400);
  await page.waitForTimeout(500);
  if (!(await menuOpen())) {
    for (const b of await page.$$('[aria-haspopup="menu"]')) {
      if (/Overlays/.test((await b.textContent()) ?? '')) { await b.click(); await page.waitForTimeout(400); break; }
    }
  }
  let hasRow = false;
  for (const item of await page.$$('[data-toolbar-menu] [role="checkbox"]')) {
    if (/Events/.test((await item.textContent()) ?? '')) hasRow = true;
  }
  hasRow ? ok('the Overlays menu offers the Events row') : bad('no Events row in the Overlays menu');

  errs.length === 0 ? ok('no page errors with the lane on') : bad(`page errors: ${errs.join(' | ').slice(0, 200)}`);
  await ctx.close();
}

console.log(`\n${fails} failing`);
await browser.close();
process.exit(fails ? 1 : 0);
