/*
==================================================
  SLAYER TERMINAL - NUMBER FORMAT (core/numFormat.ts)

  One place that decides how a number is punctuated,
  pinned to one locale — the number half of what
  etFormat.ts already does for dates and times.
==================================================

  WHY THIS EXISTS, MEASURED IN A BROWSER SET TO GERMAN.

  `(1234).toLocaleString()` with no locale renders in the VIEWER's. That was
  already established here as a bug for dates — etFormat.ts pins 'en-US' on
  every formatter it owns, replay-proof asserts no date escapes it, and the
  comment at etFormat.ts:19 says "Locale is pinned too". Numbers were never
  brought under the same rule: 44 calls across 41 lines in 13 files, of which
  exactly ONE passed a locale (indexTwins.ts) and one passed `undefined`
  explicitly, which is the viewer's.

  Loading the terminal with the browser set to de-DE:

      /trace/live-tape     2.350   4.467   10.892   38.688
                           $512.28   $419.73   $9.46   $16.68

  Both on one screen. The dot is a thousands separator in the size column and
  a decimal point in the price column, four inches apart, on a screen someone
  is meant to read a trade off. `2.350` is two thousand three hundred and
  fifty; `512.28` is five hundred and twelve. A reader who applies either
  convention consistently gets one of the two columns wrong.

  It was also inconsistent BETWEEN routes, which is the tell that nothing was
  deciding this: the same German browser rendered US grouping (`5,135`) on
  /pulse and German grouping on the tape.

  THE CHOICE, AND WHY IT IS NOT "LOCALISE PROPERLY". Prices here are US
  dollars with a `$` written into the string, strikes are US option strikes,
  and the clock is pinned to New York. Rendering the separators in the
  viewer's convention while everything around them stays American is the
  mixture above. Pinning matches what dates already do, and it is one line
  per call site rather than a product decision about which markets this
  terminal speaks to.
*/

/** The one locale this terminal punctuates in — same as etFormat's. */
const LOCALE = 'en-US';

/**
 * Group and punctuate a number, always the same way for every viewer.
 *
 * Options pass straight through, and omitting them gives exactly what a bare
 * `toLocaleString()` gives a US viewer — so this changes nothing on screen
 * for the locale the app was built and measured in, and everything for the
 * ones it was not.
 */
export const fmtNum = (v: number, opts?: Intl.NumberFormatOptions): string =>
  v.toLocaleString(LOCALE, opts);

export default fmtNum;
