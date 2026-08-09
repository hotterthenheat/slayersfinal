/**
 * Sweep every route in a real browser and report UI defects.
 *
 * This exists because the UI checks that found real bugs kept being written as
 * throwaway scripts: a script measured the wrong element and reported all 23
 * routes broken; another filed holographic silver as a hue because it used HSL
 * saturation, which collapses near white. Both were fixed, both were deleted,
 * and the next wave started from nothing. A check worth running once is worth
 * keeping — so the sweep lives here, in the repo, with the reasoning attached.
 *
 * What it looks for, and why each one is a defect and not a preference:
 *
 *   overflow        The document scrolls sideways. Nothing on a page is
 *                   reachable if the viewport cuts it off, and the culprit is
 *                   named so it does not turn into a bisect.
 *   stringified-object  "[object Object]" on screen — a record rendered where
 *                   one of its fields was meant.
 *   dead-space      The complement of overflow: a page that does not use the
 *                   column it has — a strip of the page column that no ink
 *                   touches, which is what a max-width cap or a centred narrow
 *                   column leaves behind.
 *                   `--canyons` adds a second, noisier lens: the same large gap
 *                   repeated down a list of rows, which is what justify-between
 *                   does once a row grows past the width it was designed at. It
 *                   is opt-in — see the note at the flag for why.
 *   collapsed       A chart painted into a zero-sized box. recharts'
 *                   ResponsiveContainer measures 0 inside an auto-width or
 *                   undeclared-height parent and then renders nothing, silently.
 *   contrast        Text below the WCAG AA ratio for its size, with alpha and
 *                   inherited opacity composited the way the eye sees them.
 *   type-floor      Text below 10px. The ramp's smallest step IS 10px; anything
 *                   under it came from a stray `text-[9px]`.
 *   focus           Keyboard traversal: a tab stop with no visible focus change,
 *                   a stop on a zero-sized element, or a trap that never moves.
 *   tap-target      An interactive element under 24x24 CSS px on a phone.
 *   clipped         Text hard-cut by `overflow:hidden` with no ellipsis, so the
 *                   reader cannot tell a truncated word from a short one.
 *   heading         A heading level skipped, or a page with no h1.
 *   a11y-name       A control or image a screen reader cannot name.
 *   duplicate-id    The same id twice, which breaks every aria-* reference to it.
 *   dangling-aria   An aria-labelledby / aria-describedby pointing at nothing.
 *   motion          An infinite animation still running under reduced motion.
 *
 * Usage:
 *   node scripts/ui-audit.mjs                    # build if needed, serve, sweep all
 *   node scripts/ui-audit.mjs --route /pulse     # one route (repeatable)
 *   node scripts/ui-audit.mjs --viewport laptop  # one viewport (repeatable)
 *   node scripts/ui-audit.mjs --base http://localhost:5173   # use a running server
 *   node scripts/ui-audit.mjs --json out.json    # machine-readable findings
 *   node scripts/ui-audit.mjs --canyons          # + row-canyon lens (noisy)
 *
 * Exits non-zero when anything at severity `error` is found.
 *
 * Route coverage is an explicit list below rather than a parse of App.tsx's
 * JSX: nested <Route> trees do not survive a regex, and a harness that quietly
 * audits half the site is worse than one that says which paths it skipped. The
 * script cross-checks the list against App.tsx and warns about concrete paths
 * it does not cover, so adding a desk without adding it here is visible.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Chromium ships pre-installed in this container at a fixed path and the
 * download is disabled, so playwright's own resolution finds nothing. Fall back
 * to the bundled binary only when it is actually there.
 */
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/** Concrete, renderable routes. Redirect stubs are deliberately absent. */
const ROUTES = [
  '/',
  '/terminal',
  '/pulse',
  '/compass',
  '/stocks',
  '/prove-it',
  '/tracker',
  '/guide/overview',
  '/guide/desks',
  '/guide/concepts',
  '/guide/faq',
  '/guide/shortcuts',
  '/pinpoint/gamma',
  '/pinpoint/levels',
  '/pinpoint/greeks',
  '/pinpoint/stress',
  '/pinpoint/history',
  '/trace/live-tape',
  '/trace/gamma-tape',
  '/trace/informed-flow',
  '/trace/dark-pool',
  '/trace/scanner',
  '/trace/reconstruction',
  '/community/ideas',
  '/community/requests',
  '/community/feedback',
  '/legal/disclaimer',
  '/legal/terms',
  '/legal/privacy',
  '/this-route-does-not-exist',
];

/**
 * The trailer is a 78-second autoplaying WebGL timeline. Sweeping it measures
 * whichever frame the clock happened to land on, so it is opt-in via --route.
 */
const OPT_IN = ['/trailer'];

const VIEWPORTS = {
  phone: { width: 390, height: 844, label: 'phone 390' },
  tablet: { width: 768, height: 1024, label: 'tablet 768' },
  laptop: { width: 1440, height: 900, label: 'laptop 1440' },
  ultrawide: { width: 2560, height: 1440, label: 'ultrawide 2560' },
};

/** Keyboard traversal is the slow check and does not vary with pixel width —
    only with which chrome the breakpoint renders. One narrow, one wide. */
const FOCUS_VIEWPORTS = new Set(['phone', 'laptop']);

// ── argv ──────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = name => {
  const out = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === name && argv[i + 1]) out.push(argv[++i]);
  return out;
};
const wantRoutes = flag('--route');
const wantViewports = flag('--viewport');
const baseFlag = flag('--base')[0];
const jsonOut = flag('--json')[0];
/*
  Row-canyon detection is opt-in, and deliberately so.

  It finds real defects — it is how the shortcut sheet's 1013px label-to-keycap
  gap and the dark pool shelf read's 837px were found — but measured against the
  whole app it also reports 40 findings of which most are correct layouts it
  cannot distinguish: a chart's axis tick groups are SUPPOSED to spread across
  the plot, and a caption whose label and value sit at the two ends of the bar
  directly beneath it is labelling that bar's ends, not leaving a hole.

  A warn-level gate with that ratio gets ignored, or worse, gets someone to
  "fix" a correct axis. So it stays a lens you point at a page while working on
  it (`--canyons`), not a check the sweep enforces. The band check below has no
  such ambiguity and runs always.
*/
const wantCanyons = argv.includes('--canyons');

const routes = wantRoutes.length ? wantRoutes : ROUTES;
const viewports = Object.entries(VIEWPORTS).filter(
  ([k]) => !wantViewports.length || wantViewports.includes(k)
);

// ── route coverage ────────────────────────────────────────────────────────────

/**
 * Redirects that are not spelled `<Navigate>`. Each is a component whose whole
 * job is to compute a destination and send the visitor there, so there is no
 * surface to sweep — but the name has to be listed, not inferred.
 */
const REDIRECT_COMPONENTS = ['VolatilityMoved'];

/** Concrete paths declared in App.tsx that this sweep does not visit. */
function uncoveredRoutes() {
  const src = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8');
  const audited = ROUTES.concat(OPT_IN);
  const missing = [];
  for (const m of src.matchAll(/path="([^"]+)"/g)) {
    const path = m[1];
    if (path === '*' || path.includes('*')) continue;
    // A redirect stub declares its destination within its own element; look
    // only as far as the next Route so a sibling's element cannot excuse it.
    const next = src.indexOf('<Route', m.index + 1);
    const rest = src.slice(m.index, next === -1 ? undefined : next);
    if (rest.includes('<Navigate') || REDIRECT_COMPONENTS.some(c => rest.includes(`<${c}`))) continue;
    const leaf = path.startsWith('/') ? path : `/${path}`;
    // A layout route (`/guide`, `/pinpoint`) has no surface of its own — it is
    // covered when its children are, which is a prefix match, not equality.
    const covered = audited.some(r => r === leaf || r.endsWith(leaf) || r.startsWith(`${leaf}/`));
    if (!covered) missing.push(path);
  }
  return [...new Set(missing)];
}

// ── colour maths ──────────────────────────────────────────────────────────────

/**
 * Defined once and used twice: injected into the page for the sweep, and called
 * directly by `--self-test` in Node.
 *
 * It is split out for exactly one reason. The first version of this file
 * linearized sRGB with `(s + 0.055) / 2.055` instead of `1.055`, which
 * understates every ratio — #a3a3a3 on the canvas scored 2.4:1 when it is
 * really 8.1:1, and the sweep reported the whole site as failing. A harness
 * that can be wrong about its own arithmetic has to be able to check it, so
 * these four functions have anchors below that a typo cannot survive.
 */
function colorMath() {
  const parseColor = c => {
    const m = /rgba?\(([^)]+)\)/.exec(c || '');
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (p.length < 3 || p.some(Number.isNaN)) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };

  const hexColor = h => {
    const n = parseInt(h.replace('#', ''), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  };

  /** Source-over: `fg` at its own alpha, painted on an opaque `bg`. */
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });

  /** WCAG 2.x relative luminance. The divisor is 1.055. */
  const luminance = ({ r, g, b }) => {
    const f = v => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };

  const ratio = (a, b) => {
    const l1 = luminance(a);
    const l2 = luminance(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  return { parseColor, hexColor, over, luminance, ratio };
}

/** Anchors with published values, so the curve cannot drift unnoticed. */
function selfTest() {
  const { hexColor, over, ratio } = colorMath();
  const cases = [
    ['#ffffff on #000000', ratio(hexColor('#ffffff'), hexColor('#000000')), 21, 0.01],
    ['#000000 on #000000', ratio(hexColor('#000000'), hexColor('#000000')), 1, 0.001],
    // The classic smallest grey that still clears 4.5:1 on white.
    ['#767676 on #ffffff', ratio(hexColor('#767676'), hexColor('#ffffff')), 4.54, 0.02],
    ['#777777 on #ffffff', ratio(hexColor('#777777'), hexColor('#ffffff')), 4.48, 0.02],
    // The house tiers on the house canvas.
    ['textSecondary on canvas', ratio(hexColor('#a3a3a3'), hexColor('#050505')), 8.08, 0.05],
    ['textMuted on canvas', ratio(hexColor('#7d7d7d'), hexColor('#050505')), 4.95, 0.05],
    // 50% white over black is the midpoint of the channel, not of the ratio.
    [
      '50% white over black',
      over({ r: 255, g: 255, b: 255, a: 0.5 }, { r: 0, g: 0, b: 0, a: 1 }).r,
      127.5,
      0.01,
    ],
  ];
  let bad = 0;
  for (const [name, got, want, tol] of cases) {
    const ok = Math.abs(got - want) <= tol;
    if (!ok) bad++;
    console.log(`${ok ? '✓' : '✗'} ${name}: ${got.toFixed(3)} (expected ${want} ±${tol})`);
  }
  process.exit(bad ? 1 : 0);
}

// ── in-page checks ────────────────────────────────────────────────────────────

/**
 * Everything below runs inside the page. It is one function because a single
 * evaluate is one round trip, and because the checks share the colour and
 * visibility helpers — two copies of "is this element actually on screen" is
 * exactly how the earlier harnesses drifted.
 */
function collectFindings(opts) {
  const out = [];
  const add = (kind, severity, message, extra) =>
    out.push({ kind, severity, message, ...extra });

  // ── shared helpers ──

  const describe = el => {
    if (!el || !el.tagName) return '<unknown>';
    const id = el.id ? `#${el.id}` : '';
    const cls =
      typeof el.className === 'string' && el.className.trim()
        ? `.${el.className.trim().split(/\s+/).slice(0, 4).join('.')}`
        : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };

  /**
   * A short ancestor trail, so a finding can be found in the source.
   *
   * `span.w-14.text-right` appears in five files. Without the chain above it,
   * every finding on a shared utility class costs a grep-and-guess round.
   */
  const trail = el => {
    const parts = [];
    for (let n = el.parentElement; n && n !== document.body && parts.length < 4; n = n.parentElement) {
      parts.unshift(describe(n));
    }
    return parts.join(' > ');
  };

  const textOf = el => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);

  /** Visible means it occupies space AND nothing in its chain hides it. */
  const isVisible = el => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
      if (s.contentVisibility === 'hidden') return false;
    }
    return true;
  };

  /** Cumulative opacity, because `opacity-50` on a wrapper dims the text too. */
  const effectiveOpacity = el => {
    let o = 1;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      o *= Number(getComputedStyle(n).opacity || 1);
    }
    return o;
  };

  // Injected by addInitScript from the same source Node self-tests.
  const { parseColor, over, ratio } = window.__auditColor;

  /**
   * The opaque colour behind an element, composited layer by layer.
   *
   * Returns null when a layer is a gradient or an image: those cannot be
   * reduced to one number, and guessing produces false failures on the
   * holographic surfaces, which is worse than saying "not measurable here".
   *
   * Walking ancestors alone is not enough. The house pill idiom paints its
   * surface as an absolutely-positioned SIBLING of the label —
   *
   *   <button class="relative">
   *     <span class="absolute inset-0 holo-bg" />
   *     <span class="relative z-10">Top Setups</span>
   *   </button>
   *
   * — so the label's ancestors are all transparent and the first version of
   * this walk reported dark ink on the dark panel below: 1.02:1, on 76 route ×
   * viewport pairs, for text that is actually near-black on bright silver. Each
   * ancestor's earlier-in-DOM positioned siblings that cover the text are part
   * of its backdrop and are collected here too.
   */
  const backdrop = el => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const layers = [];

    /** @returns true when the layer is opaque and the walk can stop. */
    const push = style => {
      if (style.backgroundImage && style.backgroundImage !== 'none') return 'unmeasurable';
      const c = parseColor(style.backgroundColor);
      if (!c || c.a === 0) return false;
      layers.push(c);
      return c.a === 1;
    };

    for (let n = el; n; n = n.parentElement) {
      const own = push(getComputedStyle(n));
      if (own === 'unmeasurable') return null;
      if (own === true) break;

      const parent = n.parentElement;
      if (!parent) break;
      for (const sib of parent.children) {
        if (sib === n) continue;
        const ss = getComputedStyle(sib);
        if (ss.position !== 'absolute' && ss.position !== 'fixed') continue;
        // Later siblings paint ON TOP of the text, so they are not its backdrop.
        if (!(n.compareDocumentPosition(sib) & Node.DOCUMENT_POSITION_PRECEDING)) continue;
        const sr = sib.getBoundingClientRect();
        if (cx < sr.left || cx > sr.right || cy < sr.top || cy > sr.bottom) continue;
        const under = push(ss);
        if (under === 'unmeasurable') return null;
        if (under === true) break;
      }
      if (layers.length && layers[layers.length - 1].a === 1) break;
    }

    if (!layers.length) return { r: 0, g: 0, b: 0, a: 1 };
    let acc = layers[layers.length - 1];
    if (acc.a < 1) acc = over(acc, { r: 0, g: 0, b: 0, a: 1 });
    for (let i = layers.length - 2; i >= 0; i--) acc = over(layers[i], acc);
    return acc;
  };

  const INTERACTIVE =
    'a[href], button, input:not([type=hidden]), select, textarea, summary, ' +
    '[role="button"], [role="link"], [role="tab"], [role="switch"], [role="checkbox"], ' +
    '[tabindex]:not([tabindex="-1"])';

  /*
    ── overflow ──

    Two places have to be checked, not one.

    The document is the obvious one. The other is the app shell: `<main>` is
    `h-full overflow-y-auto`, and `overflow-y: auto` makes the X axis a scroll
    axis too. So a page that runs off the right edge inside the shell scrolls
    THERE, and `document.documentElement.scrollWidth` never moves — the check
    that looked only at the document reported a clean sweep while two desks were
    sliding sideways on a phone.

    Panels that deliberately scroll a wide table (`overflow-auto` on a table
    wrapper) are not this. The page's own scroll container is: nothing that owns
    the page frame should have content wider than itself.
  */
  const scrolls = s => ['auto', 'scroll'].includes(s.overflowX) || ['auto', 'scroll'].includes(s.overflow);

  const overflowCulprits = (root, limit) => {
    const out = [];
    for (const el of root.querySelectorAll('*')) {
      const s = getComputedStyle(el);
      if (s.position === 'fixed' || s.display === 'none') continue;
      // A wide table inside its own `overflow-auto` wrapper is not an overflow —
      // it is a deliberate horizontal scroller doing its job, and so is every
      // element inside one. Checking only the element itself listed the table
      // and the subnav rail as culprits and buried the one row that was really
      // pushing the page.
      if (el !== root && scrolls(s)) continue;
      let inScroller = false;
      for (let n = el.parentElement; n && n !== root; n = n.parentElement) {
        if (scrolls(getComputedStyle(n))) {
          inScroller = true;
          break;
        }
      }
      if (inScroller) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (r.right > limit + 1) {
        // Only the outermost offender is worth naming; its children inherit it.
        if (!out.some(c => c.el.contains(el))) out.push({ el, right: r.right });
      }
    }
    return out.slice(0, 5).map(c => `${describe(c.el)} → right ${Math.round(c.right)}px`);
  };

  const docWidth = document.documentElement.scrollWidth;
  if (docWidth > window.innerWidth + 1) {
    add(
      'overflow',
      'error',
      `document scrolls sideways: ${docWidth}px in a ${window.innerWidth}px viewport`,
      { culprits: overflowCulprits(document.body, window.innerWidth) }
    );
  }

  const shell = document.getElementById('main-content');
  if (shell && shell.scrollWidth > shell.clientWidth + 1) {
    add(
      'overflow',
      'error',
      `the page scrolls sideways inside the shell: ${shell.scrollWidth}px of content in a ${shell.clientWidth}px column`,
      { element: describe(shell), culprits: overflowCulprits(shell, shell.getBoundingClientRect().left + shell.clientWidth) }
    );
  }

  // ── collapsed charts ──

  for (const el of document.querySelectorAll('svg.recharts-surface, .recharts-wrapper, canvas')) {
    const r = el.getBoundingClientRect();
    // A chart inside a hidden tab is not a defect; only judge what is on screen.
    if (!isVisible(el.parentElement || el)) continue;
    if (r.width < 20 || r.height < 20) {
      add('collapsed', 'error', `chart painted into ${Math.round(r.width)}x${Math.round(r.height)}`, {
        element: describe(el.closest('[class]') || el),
      });
    }
  }

  // ── contrast, type floor, clipping ──

  const seenContrast = new Set();
  const seenTiny = new Set();

  for (const el of document.querySelectorAll('body *')) {
    const own = [...el.childNodes]
      .filter(n => n.nodeType === 3)
      .map(n => n.textContent)
      .join('')
      .trim();
    if (!own) continue;
    if (!isVisible(el)) continue;

    const s = getComputedStyle(el);
    const size = parseFloat(s.fontSize);

    // The foil paints its ink with a clipped gradient; `color` is transparent
    // there by design and measuring it would report every brand surface.
    const foil = s.webkitBackgroundClip === 'text' || s.backgroundClip === 'text';

    if (size < 10) {
      const key = `${describe(el)}|${size}`;
      if (!seenTiny.has(key)) {
        seenTiny.add(key);
        add('type-floor', 'error', `${size}px text is below the 10px ramp floor`, {
          element: describe(el),
          text: textOf(el),
        });
      }
    }

    if (!foil) {
      const fg = parseColor(s.color);
      const bg = backdrop(el);
      if (fg && bg) {
        const op = effectiveOpacity(el);
        const ink = over({ ...fg, a: fg.a * op }, bg);
        const r = ratio(ink, bg);
        const weight = Number(s.fontWeight) || 400;
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        /*
          Text a screen reader is not meant to read is not functioning as text —
          it is a graphic. The applicable bar is 1.4.11 Non-text Contrast (3:1),
          not 1.4.3 Contrast Minimum (4.5:1).

          This is a real distinction and it cuts both ways here. The landing
          page's code rain is aria-hidden, masked, and animated between 0.24 and
          0.78 opacity — pure texture, and holding it to 4.5:1 would mean
          brightening it until it fought the headline in front of it. The
          terminal index's separator dot is also aria-hidden, and it measured
          1.38:1 — below 3:1, so it still fails, correctly: a divider nobody can
          see is not a divider.
        */
        const decorative = el.closest('[aria-hidden="true"], [aria-hidden=""]') != null;
        const need = decorative ? 3 : large ? 3 : 4.5;
        if (r < need) {
          const key = `${describe(el)}|${s.color}|${op.toFixed(2)}`;
          if (!seenContrast.has(key)) {
            seenContrast.add(key);
            add(
              'contrast',
              'error',
              `${r.toFixed(2)}:1 against its backdrop, needs ${need}:1 at ${size}px/${weight}`,
              { element: describe(el), text: textOf(el), within: trail(el) }
            );
          }
        }
      }
    }

    // Hard clip: content wider than the box, hidden, and no ellipsis to say so.
    // `clientWidth > 12` skips the sr-only pattern, which is a deliberate 1px
    // box holding a full sentence for screen readers.
    const clips = s.overflowX === 'hidden' || s.overflow === 'hidden';
    const ellipsis = s.textOverflow === 'ellipsis';
    if (clips && !ellipsis && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 12) {
      add('clipped', 'warn', `text cut at ${el.clientWidth}px with ${el.scrollWidth}px of content`, {
        element: describe(el),
        text: textOf(el),
      });
    }
  }

  // ── tap targets ──

  if (window.innerWidth <= 480) {
    /*
      WCAG 2.2 SC 2.5.8, as written — including its exceptions, because a check
      that ignores them just produces work.

        Inline    The target sits in a line of text and is sized by it.
        Spacing   A 24px-diameter circle centred on the target's box touches no
                  other target, and no other undersized target's circle.

      Without the spacing rule this reported 91 findings — every footer link,
      every glossary chip, the wordmark. Most of them are the only tappable
      thing for well over 24px in any direction, which is precisely the case
      the criterion excuses. What survives is the set a thumb can actually
      mis-hit.
    */
    const targets = [];
    for (const el of document.querySelectorAll(INTERACTIVE)) {
      if (!isVisible(el)) continue;
      // A control inside another control is one target, not two.
      if (targets.some(t => t.el.contains(el) || el.contains(t.el))) continue;
      targets.push({ el, rect: el.getBoundingClientRect() });
    }

    /** Shortest distance from a point to a rectangle; 0 when inside it. */
    const distToRect = (x, y, r) => {
      const dx = Math.max(r.left - x, 0, x - r.right);
      const dy = Math.max(r.top - y, 0, y - r.bottom);
      return Math.hypot(dx, dy);
    };

    const seen = new Set();
    for (const t of targets) {
      const r = t.rect;
      if (r.width >= 24 && r.height >= 24) continue;
      if (getComputedStyle(t.el).display === 'inline') continue;
      // The skip link is a deliberate 1px box until it takes focus, at which
      // point it un-hides at full size. Measuring it hidden measures nothing.
      if (t.el.classList.contains('sr-only')) continue;
      // SC 2.5.8's "Essential" exception, claimed explicitly in the source
      // rather than assumed here. A strike band on a price axis is the case:
      // its height IS the data, so enlarging it would move the strike.
      if (t.el.closest('[data-target-size="essential"]')) continue;

      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const crowder = targets.find(u => {
        if (u === t) return false;
        if (distToRect(cx, cy, u.rect) < 12) return true;
        const ur = u.rect;
        if (ur.width >= 24 && ur.height >= 24) return false;
        const ucx = ur.left + ur.width / 2;
        const ucy = ur.top + ur.height / 2;
        return Math.hypot(cx - ucx, cy - ucy) < 24;
      });
      if (!crowder) continue;

      const key = describe(t.el);
      if (seen.has(key)) continue;
      seen.add(key);
      add(
        'tap-target',
        'warn',
        `${Math.round(r.width)}x${Math.round(r.height)} is under 24x24 and has a neighbouring target inside the 24px circle`,
        {
          element: key,
          text: textOf(t.el),
          within: trail(t.el),
          culprits: [`crowded by ${describe(crowder.el)} "${textOf(crowder.el)}"`],
        }
      );
    }
  }

  // ── headings ──

  const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter(isVisible);
  if (!headings.some(h => h.tagName === 'H1')) {
    add('heading', 'warn', 'page has no visible h1', {});
  }
  let prev = 0;
  for (const h of headings) {
    const level = Number(h.tagName[1]);
    if (prev && level > prev + 1) {
      add('heading', 'warn', `h${prev} is followed by h${level}, skipping a level`, {
        element: describe(h),
        text: textOf(h),
      });
    }
    prev = level;
  }

  // ── accessible names ──

  const named = el => {
    if (el.getAttribute('aria-label')?.trim()) return true;
    if (el.getAttribute('aria-labelledby')?.trim()) return true;
    if (el.getAttribute('title')?.trim()) return true;
    if ((el.textContent || '').trim()) return true;
    if (el.querySelector('img[alt]:not([alt=""])')) return true;
    // `labels` covers both association forms, and it exists on every labelable
    // element — not just <input>. Checking only inputs reported all three
    // community <textarea>s as unnamed when each is wrapped in its own <label>.
    if (el.labels && el.labels.length) return true;
    if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return true;
    if (el.tagName === 'INPUT' && ['submit', 'button', 'reset'].includes(el.type) && el.value.trim()) return true;
    return false;
  };

  for (const el of document.querySelectorAll('button, a[href], [role="button"], input:not([type=hidden]), select, textarea')) {
    if (!isVisible(el)) continue;
    if (el.getAttribute('aria-hidden') === 'true') continue;
    if (!named(el)) {
      add('a11y-name', 'error', 'interactive element has no accessible name', {
        element: describe(el),
      });
    }
  }

  for (const img of document.querySelectorAll('img')) {
    if (!img.hasAttribute('alt')) {
      add('a11y-name', 'error', 'img has no alt attribute', { element: describe(img) });
    }
  }

  // ── ids and aria wiring ──

  const ids = new Map();
  for (const el of document.querySelectorAll('[id]')) {
    ids.set(el.id, (ids.get(el.id) || 0) + 1);
  }
  for (const [id, n] of ids) {
    if (n > 1) add('duplicate-id', 'error', `id "${id}" appears ${n} times`, {});
  }
  for (const attr of ['aria-labelledby', 'aria-describedby', 'aria-controls']) {
    for (const el of document.querySelectorAll(`[${attr}]`)) {
      for (const ref of (el.getAttribute(attr) || '').split(/\s+/).filter(Boolean)) {
        if (!document.getElementById(ref)) {
          add('dangling-aria', 'error', `${attr}="${ref}" points at no element`, {
            element: describe(el),
          });
        }
      }
    }
  }

  /*
    ── stringified-object ──

    "[object Object]" reaching the screen. It is always a bug and never a
    preference: something rendered a record where it meant to render a field.

    Found on the live tape, where the OI column called `toLocaleString()` on an
    `OpenInterest` record — { value, asOf, freshness } — instead of on its
    `.value`, and printed the literal string on all 400 rows. The sibling ΔOI
    cell in the same file already read `.value`, so nothing about the data was
    wrong; one call site was simply missed, and no check in the suite was
    looking for the result.

    Cheap to test and impossible to argue with, so it is an error, not a warn.
  */
  for (const el of document.querySelectorAll('*')) {
    if (!isVisible(el)) continue;
    const own = [...el.childNodes]
      .filter(n => n.nodeType === 3)
      .map(n => n.textContent)
      .join('');
    if (own.includes('[object Object]')) {
      add('stringified-object', 'error', 'renders the literal string "[object Object]"', {
        element: describe(el),
        within: trail(el),
      });
    }
  }

  /*
    ── dead-space ──

    The complement of `overflow`. That check catches a page too WIDE for its
    column; this one catches a page that does not use the column it has.

    Two different holes, because one measurement cannot see both:

    band     A vertical strip of the page column that no ink touches at all.
             This is what a max-width cap leaves behind — the shell used to cap
             at 1280px, so a 1600px screen painted 310px of pure background, and
             a centred `max-w-3xl` prose column left 760px at 2560.

    canyon   A gap between two things ON THE SAME ROW. A band check cannot see
             this: in a stack of rows, some sibling row almost always covers the
             strip even when every individual row has a thousand pixels down its
             middle. `justify-between` on a row that grew with the viewport is
             the shape — a shortcut's label 1013px from its key cap.

    Only REPEATED canyons are reported. A one-off is a deliberate composition —
    a panel header with its title left and its controls right, a card footer
    with its action in the corner — and those are correct. Three or more
    identical rows with the same hole is a list the reader has to scan across,
    which is not.
  */
  const pageCol = document.querySelector('[data-page-container="body"]');
  const pageFooter = document.querySelector('footer');
  if (pageCol) {
    const inks = el => {
      if (pageFooter && pageFooter.contains(el)) return false;
      if (!isVisible(el)) return false;
      const s = getComputedStyle(el);
      if ([...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return true;
      if (['svg', 'canvas', 'img', 'input', 'textarea'].includes(el.tagName.toLowerCase())) return true;
      if (['Top', 'Right', 'Bottom', 'Left'].some(k => parseFloat(s[`border${k}Width`]) > 0)) return true;
      return s.backgroundColor !== 'rgba(0, 0, 0, 0)';
    };

    const cs = getComputedStyle(pageCol);
    const box = pageCol.getBoundingClientRect();

    /*
      First: does the column fill the screen at all?

      This has to be asked BEFORE looking inside the column, and the first
      version of this check did not ask it — it measured bands within the
      column's own content box, so a column capped at 1280px on a 2560 screen
      came back perfectly clean while half the monitor was painted background.
      Caught by putting the old `max-w-[1280px]` back and watching this check
      stay silent, which is the regression it exists to catch.

      clientWidth, not innerWidth: the latter counts the scrollbar, and the
      column is not expected to run underneath it.
    */
    const screenW = document.documentElement.clientWidth;
    // Three times the widest gutter (2xl:px-8 → 32px a side). Anything beyond
    // that is not spacing, it is unused screen.
    if (screenW - box.width > 96) {
      add('dead-space', 'warn', `the page column is ${Math.round(box.width)}px on a ${screenW}px screen`, {
        element: describe(pageCol),
      });
    }

    // Then: gutters are padding, not dead space — measure the content box only.
    const lo = box.left + parseFloat(cs.paddingLeft);
    const hi = box.right - parseFloat(cs.paddingRight);
    const BAND = 40;
    const nBands = Math.max(1, Math.ceil((hi - lo) / BAND));
    const bands = new Array(nBands).fill(0);

    for (const el of pageCol.querySelectorAll('*')) {
      if (!inks(el)) continue;
      const r = el.getBoundingClientRect();
      const a = Math.max(0, Math.floor((r.left - lo) / BAND));
      const b = Math.min(nBands, Math.ceil((r.right - lo) / BAND));
      for (let i = a; i < b; i++) bands[i]++;
    }
    let run = 0;
    let worst = { len: 0, at: 0 };
    for (let i = 0; i < nBands; i++) {
      if (bands[i] === 0) {
        run++;
        if (run > worst.len) worst = { len: run, at: Math.round(lo + (i - run + 1) * BAND) };
      } else run = 0;
    }
    // 160px is four bands — narrower than that and it is spacing between two
    // blocks, not a column of the page going unused.
    if (worst.len * BAND >= 160) {
      add('dead-space', 'warn', `${worst.len * BAND}px of the page column is empty from x=${worst.at}`, {
        element: describe(pageCol),
      });
    }

    /*
      A row's child counts as covering its width if IT or anything under it
      paints — not only if it paints itself.

      `inks` alone was wrong here and reported a hole through solid content. The
      dark pool shelf row lays out [price, badge, bar+caption, distance, held];
      the third child is a bare wrapper with no text of its own, no border and
      no background, so `inks` rejected it, and the gap was then measured from
      the badge straight across to the distance column — 1113px of "empty" that
      is in fact a bar chart and a caption. Verified against the live row: the
      five children are adjacent with 12px between them.
    */
    const covers = el => inks(el) || [...el.querySelectorAll('*')].some(inks);

    const canyons = opts && opts.canyons ? new Map() : null;
    for (const parent of canyons ? pageCol.querySelectorAll('*') : []) {
      const kids = [...parent.children].filter(covers);
      if (kids.length < 2) continue;
      const boxes = kids.map(k => k.getBoundingClientRect()).sort((a, b) => a.left - b.left);
      for (let i = 1; i < boxes.length; i++) {
        const a = boxes[i - 1];
        const b = boxes[i];
        // Same visual row only.
        if (Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) <= 2) continue;
        const gap = b.left - a.right;
        if (gap < 320) continue;
        const key = describe(parent);
        const prev = canyons.get(key);
        if (prev) {
          prev.n++;
          prev.gap = Math.max(prev.gap, gap);
        } else canyons.set(key, { n: 1, gap, within: trail(parent) });
      }
    }
    for (const [key, c] of canyons || []) {
      if (c.n < 3) continue;
      add('dead-space', 'warn', `${Math.round(c.gap)}px gap inside a row, repeated on ${c.n} rows`, {
        element: key,
        within: c.within,
      });
    }
  }

  return out;
}

/** Reduced motion: nothing should still be looping. Separate pass so it runs
    against a context that actually emulates the preference. */
function collectMotion() {
  const out = [];
  for (const a of document.getAnimations()) {
    const timing = a.effect && a.effect.getTiming ? a.effect.getTiming() : null;
    if (!timing || timing.iterations !== Infinity) continue;
    if (a.playState !== 'running') continue;
    const target = a.effect.target;
    const name =
      typeof a.animationName === 'string'
        ? a.animationName
        : a.transitionProperty || a.id || 'animation';
    out.push({
      kind: 'motion',
      severity: 'error',
      message: `"${name}" loops forever under prefers-reduced-motion`,
      element: target
        ? `${target.tagName.toLowerCase()}${
            typeof target.className === 'string' && target.className.trim()
              ? `.${target.className.trim().split(/\s+/).slice(0, 3).join('.')}`
              : ''
          }`
        : '<unknown>',
    });
  }
  const seen = new Set();
  return out.filter(f => {
    const k = `${f.message}|${f.element}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** One tab stop: what it is, whether the ring shows, whether it is on screen. */
function probeFocusStop() {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return null;

  // Identity, not appearance. A form with three inputs that share a class list
  // produces three consecutive identical descriptions, and comparing those
  // reported "focus never leaves this element" on two perfectly good forms.
  window.__auditIds = window.__auditIds || new WeakMap();
  window.__auditSeq = window.__auditSeq || 0;
  let uid = window.__auditIds.get(el);
  if (uid === undefined) {
    uid = ++window.__auditSeq;
    window.__auditIds.set(el, uid);
  }

  const snap = e => {
    const s = getComputedStyle(e);
    return [
      s.outlineStyle,
      s.outlineWidth,
      s.outlineColor,
      s.outlineOffset,
      s.boxShadow,
      s.borderColor,
      s.borderWidth,
      s.backgroundColor,
      s.color,
      s.textDecorationLine,
      s.filter,
    ].join('|');
  };

  const describe = e => {
    const id = e.id ? `#${e.id}` : '';
    const cls =
      typeof e.className === 'string' && e.className.trim()
        ? `.${e.className.trim().split(/\s+/).slice(0, 4).join('.')}`
        : '';
    return `${e.tagName.toLowerCase()}${id}${cls}`;
  };

  const rect = el.getBoundingClientRect();
  const focused = snap(el);
  el.blur();
  const blurred = snap(el);
  el.focus();

  return {
    uid,
    element: describe(el),
    text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    ring: focused !== blurred,
  };
}

// ── driver ────────────────────────────────────────────────────────────────────

async function waitForServer(base, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(base, { redirect: 'manual' });
      if (res.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`server at ${base} never answered`);
}

/**
 * Every context gets three things before the app boots.
 *
 * The colour maths the checks call, and two flags that put a fresh browser
 * profile into the state this sweep is actually about — the terminal in use.
 * Without them, every context is a first-ever visit: the onboarding overlay
 * covers the first route, and the launch gate holds a full-screen splash for
 * 1350ms. Neither changes layout, so the measurements survived; screenshots did
 * not, and a returning visitor sees neither.
 */
const SEED = `
  window.__auditColor = (${colorMath.toString()})();
  try {
    localStorage.setItem('slayer_onboarded_v1', '1');
    localStorage.setItem('slayer_booted_v1', '1');
  } catch (e) { /* private mode */ }
`;

async function main() {
  let server;
  let base = baseFlag;

  if (!base) {
    if (!existsSync(join(ROOT, 'dist/index.html'))) {
      console.error('dist/ is missing — run `npm run build` first, or pass --base <url>.');
      process.exit(2);
    }
    base = 'http://localhost:4173';
    server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], {
      cwd: ROOT,
      stdio: 'ignore',
    });
  }
  await waitForServer(base);

  const browser = await chromium.launch(existsSync(CHROME) ? { executablePath: CHROME } : {});
  const findings = [];
  const notes = [];

  try {
    for (const [key, vp] of viewports) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        reducedMotion: 'no-preference',
      });
      // The onboarding overlay covers the first route of a fresh profile and
      // would be the only thing every sweep ever measured.
      await context.addInitScript(SEED);
      const page = await context.newPage();
      // index.html loads Inter and JetBrains Mono from a host this sandbox
      // cannot reach; the blocking stylesheet stalls every navigation ~13s.
      await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
      page.on('pageerror', err => {
        findings.push({
          route: page.url().replace(base, '') || '?',
          viewport: vp.label,
          kind: 'page-error',
          severity: 'error',
          message: String(err.message || err).slice(0, 200),
        });
      });

      for (const route of routes) {
        await page.goto(`${base}${route}`, { waitUntil: 'networkidle', timeout: 45_000 });
        // Charts size themselves from a ResizeObserver a frame after mount.
        await page.waitForTimeout(700);

        const found = await page.evaluate(collectFindings, { canyons: wantCanyons });
        for (const f of found) findings.push({ route, viewport: vp.label, ...f });

        if (FOCUS_VIEWPORTS.has(key)) {
          await page.evaluate(() => document.body.focus());
          const stops = [];
          let repeats = 0;
          for (let i = 0; i < 160; i++) {
            await page.keyboard.press('Tab');
            const stop = await page.evaluate(probeFocusStop);
            if (!stop) break;
            const last = stops[stops.length - 1];
            if (last && last.uid === stop.uid) {
              if (++repeats >= 3) {
                findings.push({
                  route,
                  viewport: vp.label,
                  kind: 'focus',
                  severity: 'error',
                  message: 'keyboard focus never leaves this element',
                  element: stop.element,
                });
                break;
              }
            } else {
              repeats = 0;
            }
            stops.push(stop);
            // Tab has wrapped back to the first stop — the ring is complete.
            if (stops.length > 4 && stop.uid === stops[0].uid) break;
          }

          const reported = new Set();
          for (const stop of stops) {
            const key2 = `${stop.element}|${stop.text}`;
            if (reported.has(key2)) continue;
            if (!stop.ring) {
              reported.add(key2);
              findings.push({
                route,
                viewport: vp.label,
                kind: 'focus',
                severity: 'error',
                message: 'tab stop shows no focus indicator',
                element: stop.element,
                text: stop.text,
              });
            } else if (stop.width === 0 || stop.height === 0) {
              reported.add(key2);
              findings.push({
                route,
                viewport: vp.label,
                kind: 'focus',
                severity: 'warn',
                message: 'tab stop is a zero-sized element',
                element: stop.element,
              });
            }
          }
          notes.push(`${route} @ ${vp.label}: ${stops.length} tab stops`);
        }
      }
      await context.close();
    }

    // Reduced motion, one pass at one width: the preference is global and the
    // animations that ignore it do so on every route the same way.
    const rm = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    });
    await rm.addInitScript(SEED);
    const rmPage = await rm.newPage();
    await rmPage.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    for (const route of routes) {
      await rmPage.goto(`${base}${route}`, { waitUntil: 'networkidle', timeout: 45_000 });
      await rmPage.waitForTimeout(500);
      for (const f of await rmPage.evaluate(collectMotion)) {
        findings.push({ route, viewport: 'reduced-motion', ...f });
      }
    }
    await rm.close();
  } finally {
    await browser.close();
    if (server) server.kill();
  }

  // ── report ──

  const missing = uncoveredRoutes();
  if (missing.length && !wantRoutes.length) {
    console.log(`\n⚠ App.tsx declares routes this sweep does not visit: ${missing.join(', ')}`);
    console.log('  Add them to ROUTES in scripts/ui-audit.mjs.\n');
  }

  const byKind = new Map();
  for (const f of findings) {
    if (!byKind.has(f.kind)) byKind.set(f.kind, []);
    byKind.get(f.kind).push(f);
  }

  const order = [...byKind.keys()].sort(
    (a, b) => byKind.get(b).length - byKind.get(a).length
  );

  for (const kind of order) {
    const group = byKind.get(kind);
    const errors = group.filter(f => f.severity === 'error').length;
    console.log(`\n── ${kind} — ${group.length} (${errors} error, ${group.length - errors} warn)`);
    const shown = new Map();
    for (const f of group) {
      const key = `${f.kind}|${f.message}|${f.element || ''}`;
      if (!shown.has(key)) shown.set(key, []);
      shown.get(key).push(`${f.route}@${f.viewport}`);
    }
    for (const [key, where] of [...shown].slice(0, 40)) {
      const f = group.find(g => `${g.kind}|${g.message}|${g.element || ''}` === key);
      console.log(`  • ${f.message}`);
      if (f.element) console.log(`      ${f.element}`);
      if (f.text) console.log(`      "${f.text}"`);
      if (f.within) console.log(`      in  ${f.within}`);
      if (f.culprits) for (const c of f.culprits) console.log(`      ↳ ${c}`);
      console.log(
        `      ${where.length} occurrence${where.length === 1 ? '' : 's'}: ${where.slice(0, 6).join(', ')}${
          where.length > 6 ? ` +${where.length - 6}` : ''
        }`
      );
    }
    if (shown.size > 40) console.log(`  … ${shown.size - 40} more distinct`);
  }

  const errors = findings.filter(f => f.severity === 'error').length;
  console.log(
    `\n${findings.length} findings across ${routes.length} routes × ${viewports.length} viewports — ${errors} error, ${
      findings.length - errors
    } warn`
  );

  if (jsonOut) {
    writeFileSync(jsonOut, JSON.stringify({ findings, notes, uncovered: missing }, null, 2));
    console.log(`wrote ${jsonOut}`);
  }

  process.exit(errors ? 1 : 0);
}

if (argv.includes('--self-test')) selfTest();

main().catch(err => {
  console.error(err);
  process.exit(2);
});
