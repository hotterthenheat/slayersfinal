import { describe, expect, it } from 'vitest';
import { footerVariant, isTerminalRoute } from './chromeRoutes';
import { DEFAULT_TITLE, SUITE, pageNameFor, titleFor } from './documentTitle';
import { NAV_ITEMS, REFERENCE_ITEMS } from './nav';
import { GEX_SUBPAGES } from '../../pages/gex/subnav';
import { FLOWDESK_SUBPAGES } from '../../pages/flowdesk/subnav';
import { GUIDE_SUBPAGES } from '../../pages/guide/subnav';
import { COMMUNITY_SUBPAGES } from '../../pages/community/subnav';

describe('footerVariant', () => {
  it('gives Pulse no footer at all', () => {
    expect(footerVariant('/pulse')).toBeNull();
    expect(isTerminalRoute('/pulse')).toBe(true);
  });

  it('gives the working desks the compact bar', () => {
    for (const path of ['/trace', '/trace/live-tape', '/pinpoint', '/pinpoint/gamma', '/compass', '/prove-it']) {
      expect(footerVariant(path), path).toBe('compact');
    }
  });

  it('gives documents the full footer', () => {
    for (const path of [
      '/terminal',
      '/stocks',
      '/earnings',
      '/tracker',
      '/guide/overview',
      '/community/ideas',
      '/legal/terms',
    ]) {
      expect(footerVariant(path), path).toBe('full');
    }
  });

  it('does not match a section on a name that merely starts with it', () => {
    // `/pulse-archive` is not under `/pulse`; without the separator check it
    // would silently lose its footer.
    expect(footerVariant('/pulse-archive')).toBe('full');
    expect(footerVariant('/tracer')).toBe('full');
  });
});

describe('document titles', () => {
  it('leaves the landing page on its own marketing line', () => {
    expect(pageNameFor('/')).toBeNull();
    expect(titleFor('/')).toBe(DEFAULT_TITLE);
  });

  it('names every desk in the nav', () => {
    for (const item of NAV_ITEMS) {
      expect(pageNameFor(item.path), item.path).toBe(item.label);
    }
  });

  it('names every reference page', () => {
    for (const item of REFERENCE_ITEMS) {
      expect(pageNameFor(item.path), item.path).not.toBeNull();
    }
  });

  it('names every subpage as leaf + section', () => {
    const cases: [readonly { path: string; label: string }[], string][] = [
      [GEX_SUBPAGES, 'Pinpoint'],
      [FLOWDESK_SUBPAGES, 'Trace'],
      [GUIDE_SUBPAGES, 'Guide'],
      [COMMUNITY_SUBPAGES, 'Community'],
    ];
    for (const [pages, section] of cases) {
      for (const page of pages) {
        expect(pageNameFor(page.path), page.path).toBe(`${page.label} · ${section}`);
      }
    }
  });

  it('always ends a page title on the suite name', () => {
    expect(titleFor('/compass')).toBe(`Compass — ${SUITE}`);
    expect(titleFor('/trace/dark-pool')).toBe(`Dark Pool · Trace — ${SUITE}`);
  });

  it('treats a trailing slash as the same page', () => {
    expect(pageNameFor('/guide/faq/')).toBe(pageNameFor('/guide/faq'));
    expect(pageNameFor('/compass/')).toBe('Compass');
  });

  it('falls back rather than inventing a name for an unknown path', () => {
    expect(pageNameFor('/not-a-route')).toBeNull();
    expect(titleFor('/not-a-route')).toBe(DEFAULT_TITLE);
  });
});
