/*
==================================================
  SLAYER TERMINAL - HERO SCENE (landing)
  Rebuilt to match the real slayerterminal.com hero:
  pure black with a fine dot-matrix field — no 3D
  scene, no blue/purple boxes. The cursor is the light
  source: dots warm to holo-silver and swell under the
  pointer, a soft glow trails it, and a phantom light
  drifts when nobody's touching it. Cursor-reactive by
  construction. (The 3D exposure surface still lives on
  Prove It, where a real surface belongs.)
==================================================
*/

import DotField from '../../components/three/DotField';

const HeroScene = () => (
  <div
    className="w-full h-full overflow-hidden"
    aria-hidden
    style={{ background: '#000000' }}
  >
    <DotField gap={26} reach={190} height="100%" />
  </div>
);

export default HeroScene;
