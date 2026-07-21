/*
==================================================
  SLAYER TERMINAL - HERO SCENE (landing)
  The real slayerterminal.com hero: a code-rain of
  tinted terminal output over pure black — steel for
  SkyVision, amber for Pinpoint. Cursor-reactive: the
  pointer lights the glyphs beneath it. (The 3D
  exposure surface still lives on Prove It, where a
  real surface belongs.)
==================================================
*/

import CodeRain from './CodeRain';

const HeroScene = () => (
  <div className="w-full h-full overflow-hidden" aria-hidden style={{ background: '#08090A' }}>
    <CodeRain />
  </div>
);

export default HeroScene;
