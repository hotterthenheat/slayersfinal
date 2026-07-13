/*
==================================================
  SLAYER TERMINAL - HERO SCENE (landing)
  Noah's isometric floating-boxes Spline scene as the
  hero backdrop, forced monochrome with a CSS
  grayscale filter (the scene ships blue/purple).
  Lazy chunk — the Spline runtime never reaches
  terminal users; WebGL failure degrades to gradient.
==================================================
*/

import { Component, Suspense, lazy, type ReactNode } from 'react';

const Spline = lazy(() => import('@splinetool/react-spline'));

const SCENE_URL = 'https://prod.spline.design/cjTCO1IpJ2NvD3-9/scene.splinecode';

const Fallback = () => (
  <div
    className="w-full h-full"
    style={{ background: 'radial-gradient(ellipse at 65% 45%, #101012 0%, #050505 68%)' }}
  />
);

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <Fallback /> : this.props.children;
  }
}

/** The community scene ships a baked-in mock site (a "UI" group: Texts,
    Rectangles, Ellipse). Keep only the boxes, effector & camera. */
function stripMockUi(app: unknown) {
  const anyApp = app as { getAllObjects?: () => Array<{ name: string; visible: boolean }> };
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__splineApp = app;
  try {
    const mockUi = /^(ui$|text|rectangle|ellipse)/i;
    for (const obj of anyApp.getAllObjects?.() ?? []) {
      if (mockUi.test(obj.name)) obj.visible = false;
    }
  } catch {
    /* scene renders as-authored — scrims still keep the copy readable */
  }
}

/** Full-bleed backdrop. Pointer events stay ON — the scene's whole show is
    the cursor-follow effector (boxes rise and glow near the mouse); the hero
    copy sits above at z-10 so buttons and text still win where they overlap.
    grayscale kills the scene's blue/purple; brightness lifts the wire edges
    so they read on black. The canvas is oversized inside an overflow-hidden
    frame so the runtime's bottom-right watermark is cropped out of view. */
const HeroScene = () => (
  <div className="w-full h-full overflow-hidden" aria-hidden>
    <div style={{ width: '104%', height: '112%', filter: 'grayscale(1) brightness(2.4) contrast(1.05)' }}>
      <SceneBoundary>
        <Suspense fallback={<Fallback />}>
          <Spline scene={SCENE_URL} style={{ width: '100%', height: '100%' }} onLoad={stripMockUi} />
        </Suspense>
      </SceneBoundary>
    </div>
  </div>
);

export default HeroScene;
