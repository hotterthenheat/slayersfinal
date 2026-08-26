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
          shifted: /translateX/.test(bf.style.transform || ''),
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
    const missed = near.filter(r => !r.shifted);
    if (near.length) {
      missed.length === 0
        ? ok(`${at} — ${near.length} rail(s) had the rules within a badge, and every one stepped aside`)
        : bad(`${at} — ${missed.length} rail(s) had the rules within a badge and did NOT step aside`);
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

console.log(`\n${fails} failing`);
await browser.close();
process.exit(fails ? 1 : 0);
