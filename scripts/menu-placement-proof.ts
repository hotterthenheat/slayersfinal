/*
  Acceptance test for the toolbar dropdown's placement. Runs the ACTUAL module.

  This is the arithmetic that replaced four CSS classes, and it replaced them
  because CSS could not answer the question that matters: how much room is
  there actually? Every assertion below is about a menu being REACHABLE.

  Proves:
  1. Each side anchors to the edge it claims to
  2. The height is capped by the room that exists, never by a guess
  3. A cramped side FLIPS, and only when the other side is genuinely better
  4. A menu never runs off the left or the top of the window
  5. The caller is told which side it actually got, so the caret cannot lie
  6. Degenerate windows and triggers never produce an invisible menu

  Run: npx tsx scripts/menu-placement-proof.ts
*/
import {
  MENU_EDGE,
  MENU_MAX_SHARE,
  MENU_MIN_USEFUL,
  MENU_MIN_WIDTH,
  MENU_OFFSET,
  placeMenu,
  type AnchorRect,
  type MenuBox,
  type MenuSide,
} from '../src/components/gex/menuPlacement';

/*
  WHERE THE MENU'S OWN EDGES END UP, given the box and the window.

  This is the function the first draft of section 4 was missing. It checked the
  ANCHOR (`right > vw - 8`) and called that "on screen", which is a different
  question: a menu anchored by its right edge extends MENU_MIN_WIDTH to the
  LEFT of that anchor, so a trigger near the window's left margin passed the
  anchor check with 186px of menu off the side of the screen. Resolve the box
  to actual edges and the assertion has something real to test.
*/
const edgesOf = (box: MenuBox, vw: number, vh: number) => {
  const left = box.left !== undefined ? box.left : vw - (box.right as number) - MENU_MIN_WIDTH;
  const right = box.left !== undefined ? box.left + MENU_MIN_WIDTH : vw - (box.right as number);
  const top = box.top !== undefined ? box.top : vh - (box.bottom as number) - box.maxHeight;
  const bottom = box.top !== undefined ? box.top + box.maxHeight : vh - (box.bottom as number);
  return { left, right, top, bottom };
};

let pass = 0,
  fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const VW = 1440;
const VH = 900;
const at = (top: number, left: number, w = 80, h = 24): AnchorRect => ({
  top,
  left,
  right: left + w,
  bottom: top + h,
});
const place = (r: AnchorRect, s: MenuSide, vw = VW, vh = VH) => placeMenu(r, s, vw, vh);
/** The same, with the menu's real width — the parameter the wide-menu block
    at the bottom exists to exercise. */
const place2 = (r: AnchorRect, s: MenuSide, vw: number, vh: number, w?: number) => placeMenu(r, s, vw, vh, w);

// ---- 1. each side anchors where it says --------------------------------------
{
  const r = at(300, 400);
  const b = place(r, 'bottom');
  check('bottom hangs from the trigger\'s underside', b.box.top === r.bottom + MENU_OFFSET, `${b.box.top}`);
  check('and aligns its RIGHT edge with the trigger\'s', b.box.right === VW - r.right, `${b.box.right}`);
  check('bottom sets no bottom anchor', b.box.bottom === undefined && b.box.left === undefined);

  const t = place(r, 'top');
  check('top rises from the trigger\'s upper edge', t.box.bottom === VH - r.top + MENU_OFFSET, `${t.box.bottom}`);
  check('and is right-aligned too', t.box.right === VW - r.right);
  check('top sets no top anchor', t.box.top === undefined);

  const rt = place(r, 'right');
  check('right sits beside the trigger', rt.box.left === r.right + MENU_OFFSET && rt.box.top === r.top, JSON.stringify(rt.box));
  const lf = place(r, 'left');
  check('left sits on its other side', lf.box.right === VW - r.left + MENU_OFFSET && lf.box.top === r.top, JSON.stringify(lf.box));
}

// ---- 2. the height is the room that exists -----------------------------------
{
  /*
    THE WHOLE POINT. The CSS version used a flat 70vh and had no idea what was
    below the trigger, which is how a menu ended up 221px past the bottom of
    the box it was in.
  */
  const low = at(700, 400);
  const b = place(low, 'bottom');
  const room = VH - low.bottom - MENU_OFFSET - MENU_EDGE;
  check('a trigger near the floor gets only the room below it', b.box.maxHeight === Math.max(MENU_MIN_USEFUL, room), `${b.box.maxHeight} for ${room}px of room`);
  check('and that is far less than a flat 70vh would have taken', b.box.maxHeight < VH * MENU_MAX_SHARE, `${b.box.maxHeight} vs ${VH * MENU_MAX_SHARE}`);

  const high = at(40, 400);
  const b2 = place(high, 'bottom');
  check('a trigger near the ceiling is capped by the share, not the room', b2.box.maxHeight === VH * MENU_MAX_SHARE, `${b2.box.maxHeight}`);
  check('a full-height menu is never produced', b2.box.maxHeight < VH);
}

// ---- 3. flipping ---------------------------------------------------------------
{
  /* 40px below, 700 above: opening downward would show a header and nothing. */
  const low = at(830, 400);
  const b = place(low, 'bottom');
  check('a cramped bottom flips to the top', b.side === 'top', `${b.side}`);
  check('and is then anchored as a top menu', b.box.bottom !== undefined && b.box.top === undefined, JSON.stringify(b.box));
  check('with the room ABOVE as its cap', b.box.maxHeight === Math.min(VH * MENU_MAX_SHARE, low.top - MENU_OFFSET - MENU_EDGE), `${b.box.maxHeight}`);

  const high = at(10, 400);
  const t = place(high, 'top');
  check('a cramped top flips to the bottom', t.side === 'bottom', `${t.side}`);

  /*
    A FLIP MUST BE AN IMPROVEMENT, NOT A REFLEX — and this needs a case where
    the requested side is cramped and the other side is WORSE, or it proves
    nothing.

    The first version of this used a trigger with 14px below and 138px above,
    where flipping is right either way. Mutation-tested: changing the rule to
    "flip whenever this side is cramped" left it green. A test that only ever
    sees the case both rules agree on is not testing the rule.

    Here: a 200px window, trigger at the very top. 154px below (under the
    useful minimum, so the flip condition fires) and -2px above. Staying put is
    the only sane answer.
  */
  const topOfShort = place(at(10, 400), 'bottom', VW, 200);
  const belowRoom = 200 - 34 - MENU_OFFSET - MENU_EDGE;
  const aboveRoom = 10 - MENU_OFFSET - MENU_EDGE;
  check('the cramped-side condition really does fire here', belowRoom < MENU_MIN_USEFUL, `${belowRoom} below`);
  check('but it does NOT flip into a worse side', topOfShort.side === 'bottom', `${topOfShort.side}: above ${aboveRoom} below ${belowRoom}`);

  /* The mirror image: requested top, cramped, and below is worse still. */
  const botOfShort = place(at(166, 400), 'top', VW, 200);
  check('and the same holds the other way up', botOfShort.side === 'top', `${botOfShort.side}`);

  /*
    Sideways, same rule — and the same trap. A 260px window left 222px to the
    right of the trigger, which clears MENU_MIN_WIDTH, so the flip condition
    never fired and both the real rule and a reflexive one answered "right".

    200px window, trigger 4px from the left edge: 164px to the right (cramped,
    so the condition fires) and -8px to the left. Staying put is correct.
  */
  const narrow = place(at(300, 4, 20), 'right', 200, VH);
  const rRoom = 200 - 24 - MENU_OFFSET - MENU_EDGE;
  const lRoom = 4 - MENU_OFFSET - MENU_EDGE;
  check('the sideways cramped condition really does fire here', rRoom < MENU_MIN_WIDTH, `${rRoom} to the right`);
  check('a sideways flip is refused when the other side is worse', narrow.side === 'right', `${narrow.side}: left ${lRoom} right ${rRoom}`);

  /* Room on both sides: no flip at all. */
  const roomy = place(at(400, 400), 'bottom');
  check('a side with room is left alone', roomy.side === 'bottom');
  /* Side-docked menus do not flip vertically — they are not vertical. */
  check('a right menu stays right', place(at(830, 400), 'right').side === 'right');
  check('a left menu stays left', place(at(830, 400), 'left').side === 'left');
}

// ---- 4. it never runs off the window -------------------------------------------
{
  /*
    A trigger hard against the left edge. Right-anchoring it puts the menu's
    own LEFT edge at `trigger.right - menuWidth`, which is off screen — and the
    first version of this section could not see that, because it tested the
    anchor instead of the edge. Resolve to real edges and it is obvious.
  */
  let allOnScreen = true;
  const notes: string[] = [];
  for (const side of ['bottom', 'top', 'left', 'right'] as MenuSide[]) {
    for (const rect of [at(300, 4, 20), at(300, VW - 24, 20), at(4, 4, 20), at(VH - 28, VW - 24, 20)]) {
      const p = place(rect, side);
      const e = edgesOf(p.box, VW, VH);
      if (e.left < 0 || e.right > VW) { allOnScreen = false; notes.push(`${side} @${rect.left},${rect.top}: ${e.left}..${e.right}`); }
    }
  }
  check('no menu hangs off the left or right of the window', allOnScreen, notes.slice(0, 3).join('; ') || '4 sides x 4 corners');

  /* The specific defect, spelled out so it cannot regress quietly. */
  const hugLeft = place(at(300, 4, 20), 'left');
  const hugEdges = edgesOf(hugLeft.box, VW, VH);
  check('a left menu on a left-edge trigger stays on screen', hugEdges.left >= 0, `left edge at ${hugEdges.left}`);
  check('and it flipped to the side that had room', hugLeft.side === 'right', `${hugLeft.side}`);

  const bottomHugLeft = place(at(300, 4, 20), 'bottom');
  check('a bottom menu on a left-edge trigger is clamped too', edgesOf(bottomHugLeft.box, VW, VH).left >= 0, `${edgesOf(bottomHugLeft.box, VW, VH).left}`);
  /* And the naive anchor really would have been off screen — so this is
     testing the clamp, not restating an inequality that was always true. */
  check('the unclamped anchor would have been off screen', VW - (VW - 24) - MENU_MIN_WIDTH < 0, `${24 - MENU_MIN_WIDTH}`);

  /* And never off the top. */
  const top = place(at(2, 400), 'top');
  check('a top menu against the ceiling keeps its edge margin', (top.box.bottom ?? 0) <= VH - MENU_EDGE || top.side === 'bottom', JSON.stringify(top));
}

// ---- 5. the caret cannot lie ------------------------------------------------------
{
  /* The component points the trigger's caret at `side`. If placement flipped
     and reported the requested side, the caret would point away from the menu. */
  const flipped = place(at(830, 400), 'bottom');
  check('a flipped menu REPORTS the side it took', flipped.side === 'top' && flipped.box.bottom !== undefined);
  const anchorMatchesSide = (s: MenuSide, box: { top?: number; bottom?: number; left?: number; right?: number }) =>
    s === 'bottom' ? box.top !== undefined && box.bottom === undefined
    : s === 'top' ? box.bottom !== undefined && box.top === undefined
    : s === 'right' ? box.left !== undefined
    : box.right !== undefined && box.left === undefined;
  let consistent = true;
  for (const side of ['bottom', 'top', 'left', 'right'] as MenuSide[]) {
    for (const top of [0, 100, 400, 830, 890]) {
      const p = place(at(top, 400), side);
      if (!anchorMatchesSide(p.side, p.box)) consistent = false;
    }
  }
  check('the anchors always match the reported side', consistent, '4 sides x 5 positions');
}

// ---- 6. degenerate windows -----------------------------------------------------
{
  /*
    A menu that declines to appear because the window is short is a control the
    reader cannot reach — the exact failure this module exists to end. It may
    overhang and scroll; it may not vanish.
  */
  const cases: [AnchorRect, MenuSide, number, number][] = [
    [at(0, 0), 'bottom', 320, 100],
    [at(90, 0), 'top', 320, 100],
    [at(50, 300), 'left', 320, 100],
    [at(50, 0), 'right', 320, 100],
    [at(0, 0), 'bottom', 1, 1],
  ];
  let alwaysVisible = true;
  const notes: string[] = [];
  for (const [r, s, vw, vh] of cases) {
    const p = place(r, s, vw, vh);
    if (!(p.box.maxHeight > 0)) { alwaysVisible = false; notes.push(`${s} @${vw}x${vh}: ${p.box.maxHeight}`); }
    for (const v of [p.box.left, p.box.right, p.box.top, p.box.bottom]) {
      if (v !== undefined && !Number.isFinite(v)) { alwaysVisible = false; notes.push(`${s}: non-finite anchor`); }
    }
  }
  check('a tiny window still yields a visible, finite box', alwaysVisible, notes.join('; ') || `${cases.length} cases`);
  /*
    In a window SHORTER than the useful minimum the ceiling wins over the
    floor, and that is the right way round: a 160px menu in a 100px window has
    rows below the fold that no scroll inside the menu can reach. The floor is
    there to stop a collapse to nothing, not to force a menu past its window.
  */
  const tiny = place(at(0, 0), 'bottom', 320, 100);
  check('a window shorter than the minimum caps by the window, not the floor', tiny.box.maxHeight === 100 * MENU_MAX_SHARE, `${tiny.box.maxHeight}`);
  check('and never exceeds the window itself', tiny.box.maxHeight < 100);
  /* Where the window IS tall enough, the floor does its job. */
  const short = place(at(700, 400), 'bottom', VW, VH);
  check('a cramped trigger in a tall window still gets the floor', short.box.maxHeight >= MENU_MIN_USEFUL, `${short.box.maxHeight}`);
}

/*
  A MENU WIDER THAN THE ASSUMED MINIMUM STAYS ON SCREEN.

  The clamp keeps the menu's FAR edge inside the window, and to do that it has
  to assume a width. It assumed MENU_MIN_WIDTH — true of the toolbar menus this
  module was written for, false of the two that were later routed through it:
  the compare popover is `w-[380px]` and the symbol quick-pick `w-72` (288).

  Measured in the built desk before this: at 1024x768 with four panes, the
  compare menu in a LEFT-COLUMN pane landed at x = -162. 162px of a 380px menu
  was off the side of the window, and the old clamp passed it because keeping
  210px on screen was all it ever promised.
*/
{
  const edgeOf = (box: { left?: number; right?: number }, vw: number, w: number) =>
    box.left !== undefined ? box.left : vw - (box.right as number) - w;

  for (const w of [MENU_MIN_WIDTH, 288, 380]) {
    /* A trigger hard against the left of the window — the worst case for a
       menu anchored by its right edge, because it extends its whole width
       back the other way. */
    const p = place2(at(100, 12), 'bottom', 1024, 768, w);
    const left = edgeOf(p.box, 1024, w);
    check(
      `a ${w}px menu on a left-edge trigger keeps its left edge on screen`,
      left >= MENU_EDGE - 0.5,
      `left ${left.toFixed(1)} vs edge ${MENU_EDGE}`
    );
    check(`and its right edge too`, left + w <= 1024 - MENU_EDGE + 0.5, `right ${(left + w).toFixed(1)} of 1024`);
  }

  /* THE GUARD FOR THE GUARD: the default must still behave exactly as it did,
     or every existing caller silently moved. */
  const a = place2(at(100, 12), 'bottom', 1024, 768);
  const b = place2(at(100, 12), 'bottom', 1024, 768, MENU_MIN_WIDTH);
  check('omitting the width matches passing the old assumed one', JSON.stringify(a) === JSON.stringify(b));

  /* And it has to actually MOVE for a wide menu, or the check above is passing
     on a value the parameter never changed. */
  const narrow = place2(at(100, 12), 'bottom', 1024, 768, MENU_MIN_WIDTH);
  const wide = place2(at(100, 12), 'bottom', 1024, 768, 380);
  check(
    'and a wider menu is placed differently from a narrow one',
    JSON.stringify(narrow.box) !== JSON.stringify(wide.box),
    `narrow ${JSON.stringify(narrow.box)} vs wide ${JSON.stringify(wide.box)}`
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
