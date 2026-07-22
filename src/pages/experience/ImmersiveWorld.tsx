import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Environment,
  Lightformer,
  Float,
  Sparkles,
  MeshReflectorMaterial,
  OrbitControls,
  Instances,
  Instance,
  RoundedBox,
} from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, Noise, DepthOfField } from '@react-three/postprocessing';
import * as THREE from 'three';
import gsap from 'gsap';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import { buildQuantSurfaces, type QuantSurfaceData, type SurfaceKey } from '../../data/quantsurfaces';
import QuantSurface from '../../components/experience/QuantSurface';

/*
  Slayer Terminal — Immersive World.
  A genuine React-Three-Fiber scene (not layered divs). The hero is a LIVE quant
  surface — dealer gamma / vol / Monte-Carlo cone / risk-neutral density rendered
  as real lit geometry you fly around and read. Reflective floor, instanced PBR
  colonnade, procedural image-based lighting via Lightformers (CSP-safe, no HDR),
  a bloom/DoF/vignette/grain post stack, and cinematic GSAP camera vantages. The
  surface is the analytics; the room just frames it.
*/

const CYAN = '#46d2eb';

interface Vantage {
  name: string;
  hint: string;
  cam: [number, number, number];
  target: [number, number, number];
}

/** Camera stations = reading angles on the surface (it stays put; you move). */
const VANTAGES: Vantage[] = [
  { name: 'Approach', hint: 'The surface at the end of the hall — the whole shape at once.', cam: [0, 2.9, 11], target: [0, 2.5, -1.2] },
  { name: 'The Read', hint: 'Pulled in to eye level — ridge heights and the near-term detail.', cam: [0.4, 3.1, 5.8], target: [0, 2.4, -1.4] },
  { name: 'Overhead', hint: 'Above the field — the topology reads like a heatmap from here.', cam: [0.2, 7.6, 3.6], target: [0, 2.0, -1.8] },
  { name: 'The Wing', hint: 'Off the flank — skew and asymmetry across the wings.', cam: [-7.2, 3.2, 4.6], target: [0.2, 2.4, -1.4] },
];

/** Surface selector chrome — labels render before the data resolves. */
const SURFACE_TABS: { key: SurfaceKey; label: string; short: string }[] = [
  { key: 'gamma', label: 'Dealer Gamma', short: 'Γ' },
  { key: 'vol', label: 'Vol Surface', short: 'IV' },
  { key: 'mc', label: 'Monte Carlo', short: 'MC' },
  { key: 'rnd', label: 'Risk-Neutral', short: 'RND' },
];

/** Reflective stone floor. */
const Floor = () => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
    <planeGeometry args={[80, 80]} />
    <MeshReflectorMaterial
      resolution={512}
      mixBlur={1}
      mixStrength={8}
      blur={[200, 70]}
      roughness={0.85}
      depthScale={1}
      minDepthThreshold={0.4}
      maxDepthThreshold={1.4}
      color="#0a0a0d"
      metalness={0.6}
      mirror={0.35}
    />
  </mesh>
);

/** A colonnade of PBR columns marching down both sides. */
const Colonnade = () => {
  const positions = useMemo(() => {
    const p: [number, number, number][] = [];
    for (let i = 0; i < 9; i++) {
      const z = 2 - i * 3.2;
      p.push([-5.2, 2.4, z]);
      p.push([5.2, 2.4, z]);
    }
    return p;
  }, []);
  return (
    <Instances castShadow receiveShadow>
      <cylinderGeometry args={[0.42, 0.5, 4.8, 24]} />
      <meshStandardMaterial color="#17181d" metalness={0.7} roughness={0.35} envMapIntensity={0.8} />
      {positions.map((pos, i) => (
        <Instance key={i} position={pos} />
      ))}
    </Instances>
  );
};

/** Emissive light strips running along the floor toward the surface — the runway. */
const Runway = () => (
  <group>
    {[-1.4, 1.4].map((x, i) => (
      <mesh key={i} position={[x, 0.02, -6]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.06, 30]} />
        <meshBasicMaterial color={CYAN} toneMapped={false} />
      </mesh>
    ))}
  </group>
);

/** Floating glass desk-panels along the left wall — ambient context. */
const Gallery = () => {
  const panels = ['PULSE', 'TRACE', 'PINPOINT', 'COMPASS', 'PROVE IT'];
  return (
    <group position={[-4.9, 1.8, -1]} rotation={[0, Math.PI / 2.4, 0]}>
      {panels.map((_, i) => (
        <Float key={i} speed={1.4} rotationIntensity={0.12} floatIntensity={0.6}>
          <RoundedBox
            args={[1.5, 2.1, 0.06]}
            radius={0.05}
            smoothness={4}
            position={[(i - 2) * 1.85, Math.sin(i) * 0.12, -i * 0.05]}
            castShadow
          >
            <meshPhysicalMaterial
              color="#0e1626"
              metalness={0.2}
              roughness={0.15}
              transmission={0.55}
              thickness={0.4}
              emissive={CYAN}
              emissiveIntensity={0.12}
              clearcoat={1}
              clearcoatRoughness={0.1}
            />
          </RoundedBox>
        </Float>
      ))}
    </group>
  );
};

/** Procedural studio IBL — no external HDR, works under a strict CSP. Kept neutral
    over the surface so the data colours read true (bloom still catches bright peaks). */
const Lighting = () => (
  <>
    <ambientLight intensity={0.14} />
    <directionalLight position={[6, 12, 4]} intensity={2.3} castShadow shadow-mapSize={[2048, 2048]}>
      <orthographicCamera attach="shadow-camera" args={[-14, 14, 14, -14, 0.1, 50]} />
    </directionalLight>
    <spotLight position={[0, 10, 2]} angle={0.5} penumbra={0.8} intensity={34} color="#eaf2ff" distance={32} castShadow />
    {/* soft cool fill centred on the surface so it lifts off the dark hall */}
    <pointLight position={[0, 2.3, -1.2]} intensity={3.2} color="#cfe0ff" distance={12} />
    <Environment resolution={256}>
      <group rotation={[0, 0, 0]}>
        <Lightformer form="rect" intensity={2} position={[0, 6, -9]} scale={[10, 4, 1]} color="#5a6472" />
        <Lightformer form="rect" intensity={3} position={[-8, 4, 2]} scale={[3, 8, 1]} color={CYAN} />
        <Lightformer form="rect" intensity={2.5} position={[8, 4, 2]} scale={[3, 8, 1]} color="#7db0ff" />
        <Lightformer form="circle" intensity={4} position={[0, 8, 0]} scale={[6, 6, 1]} color="#ffffff" />
      </group>
    </Environment>
  </>
);

/** Drives the camera + orbit target between vantages with a weighted GSAP move. */
const Rig = ({ index }: { index: number }) => {
  const { camera, controls } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: { target: THREE.Vector3; update: () => void } | null };
  const target = useRef(new THREE.Vector3(...VANTAGES[0].target));

  useEffect(() => {
    const st = VANTAGES[index];
    gsap.to(camera.position, { x: st.cam[0], y: st.cam[1], z: st.cam[2], duration: 2.1, ease: 'power3.inOut' });
    gsap.to(target.current, { x: st.target[0], y: st.target[1], z: st.target[2], duration: 2.1, ease: 'power3.inOut' });
  }, [index, camera]);

  useFrame(() => {
    if (controls) {
      controls.target.lerp(target.current, 0.1);
      controls.update();
    }
  });
  return null;
};

const Effects = () => (
  // multisampling 0: MSAA render targets conflict with DepthOfField's depth-buffer
  // blit (glBlitFramebuffer depth-stencil error). Bloom + DoF soften edges anyway.
  <EffectComposer multisampling={0}>
    <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.62} luminanceSmoothing={0.3} radius={0.7} />
    <DepthOfField focusDistance={0.02} focalLength={0.045} bokehScale={2} />
    <Vignette eskil={false} offset={0.25} darkness={0.9} />
    <Noise opacity={0.03} />
  </EffectComposer>
);

const Scene = ({ vantage, surface }: { vantage: number; surface: QuantSurfaceData | null }) => (
  <>
    <color attach="background" args={['#05060a']} />
    <fog attach="fog" args={['#05060a', 12, 38]} />
    <Lighting />
    <Floor />
    <Colonnade />
    <Runway />
    {surface && <QuantSurface data={surface} />}
    <Gallery />
    <Sparkles count={120} scale={[18, 8, 24]} size={2} speed={0.3} color="#9fb4d4" opacity={0.5} />
    <OrbitControls
      makeDefault
      enablePan={false}
      enableZoom={false}
      enableDamping
      dampingFactor={0.08}
      minPolarAngle={Math.PI / 5}
      maxPolarAngle={Math.PI / 1.9}
      minAzimuthAngle={-Math.PI / 4}
      maxAzimuthAngle={Math.PI / 4}
    />
    <Rig index={vantage} />
    <Effects />
  </>
);

/** Graceful fallback if the GPU/WebGL context can't build the scene. */
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="fixed inset-0 z-[100] bg-[#05060a] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center px-6">
            <span className="font-mono text-sm holo-text tracking-widest">&gt; slayer_terminal</span>
            <p className="text-[12px] text-textSecondary max-w-xs leading-relaxed">
              This device can’t render the immersive world (WebGL unavailable). The full terminal is right here.
            </p>
            <Link
              to="/pulse"
              className="mt-1 inline-flex items-center gap-1.5 rounded border border-select/40 bg-select/10 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-select hover:bg-select/15 transition-colors"
            >
              Enter terminal
            </Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** HUD + boot overlay — the only DOM in the experience; everything else is real 3D. */
const ImmersiveWorld = () => {
  const { marketData, activeTicker } = useMarketData();
  const [surfaceIndex, setSurfaceIndex] = useState(0);
  const [vantage, setVantage] = useState(0);
  const [booted, setBooted] = useState(false);

  // Build the four surfaces once per ticker (deterministic structure; a live tick
  // shouldn't rebuild the mesh every 1.5s and make it flicker). Cache by ticker.
  const cacheRef = useRef<Record<string, QuantSurfaceData[]>>({});
  const surfaces = useMemo(() => {
    if (!marketData) return cacheRef.current[activeTicker] ?? null;
    if (!cacheRef.current[activeTicker]) {
      const iv = Simulator.TICKERS[marketData.ticker]?.iv ?? 0.2;
      cacheRef.current[activeTicker] = buildQuantSurfaces(marketData, iv);
    }
    return cacheRef.current[activeTicker];
  }, [activeTicker, marketData]);

  const surface = surfaces?.[surfaceIndex] ?? null;

  useEffect(() => {
    const id = setTimeout(() => setBooted(true), 1400);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setVantage(i => Math.min(i + 1, VANTAGES.length - 1));
      if (e.key === 'ArrowLeft') setVantage(i => Math.max(i - 1, 0));
      if (e.key >= '1' && e.key <= '4') setSurfaceIndex(Math.min(Number(e.key) - 1, SURFACE_TABS.length - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const van = VANTAGES[vantage];

  return (
    <div className="fixed inset-0 z-[100] bg-[#05060a]">
      <SceneBoundary>
        <Canvas shadows dpr={[1, 2]} camera={{ position: VANTAGES[0].cam, fov: 38, near: 0.1, far: 100 }} gl={{ antialias: true }}>
          <Suspense fallback={null}>
            <Scene vantage={vantage} surface={surface} />
          </Suspense>
        </Canvas>
      </SceneBoundary>

      {/* Boot sequence */}
      {!booted && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#05060a] transition-opacity">
          <div className="flex flex-col items-center gap-3">
            <span className="font-mono text-sm holo-text tracking-widest">&gt; slayer_terminal</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-textMuted animate-pulse">rendering surface</span>
          </div>
        </div>
      )}

      {/* HUD */}
      <div className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${booted ? 'opacity-100' : 'opacity-0'}`}>
        {/* top-left brand */}
        <div className="absolute top-5 left-6 font-mono text-[13px] font-bold tracking-tight select-none">
          <span className="text-textMuted">&gt; </span>
          <span className="holo-text">slayer_terminal</span>
        </div>
        {/* top-right exit */}
        <Link
          to="/pulse"
          className="pointer-events-auto absolute top-5 right-6 inline-flex items-center gap-1.5 rounded border border-borderMuted bg-black/40 px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-textSecondary hover:text-textPrimary hover:border-borderFocus transition-colors backdrop-blur"
        >
          <X className="w-3.5 h-3.5" /> Enter terminal
        </Link>

        {/* top-center surface selector — the primary control: which quant surface */}
        <div className="pointer-events-auto absolute top-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-1 rounded-full border border-borderMuted bg-black/45 p-1 backdrop-blur">
            {SURFACE_TABS.map((t, i) => {
              const active = i === surfaceIndex;
              return (
                <button
                  key={t.key}
                  onClick={() => setSurfaceIndex(i)}
                  className={`rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                    active ? 'bg-select/20 text-select border border-select/40' : 'text-textSecondary border border-transparent hover:text-textPrimary'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-textMuted">surface · {activeTicker}</div>
        </div>

        {/* prev / next — move around the surface (vantage) */}
        <button
          onClick={() => setVantage(i => Math.max(i - 1, 0))}
          disabled={vantage === 0}
          aria-label="Previous vantage"
          className="pointer-events-auto absolute left-5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-11 h-11 rounded-full border border-borderMuted bg-black/40 text-textSecondary hover:text-textPrimary hover:border-borderFocus disabled:opacity-25 transition-colors backdrop-blur"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={() => setVantage(i => Math.min(i + 1, VANTAGES.length - 1))}
          disabled={vantage === VANTAGES.length - 1}
          aria-label="Next vantage"
          className="pointer-events-auto absolute right-5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-11 h-11 rounded-full border border-borderMuted bg-black/40 text-textSecondary hover:text-textPrimary hover:border-borderFocus disabled:opacity-25 transition-colors backdrop-blur"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* bottom panel — what the surface is + which vantage you're reading it from */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[min(620px,92vw)] text-center">
          <div className="mb-2 flex items-center justify-center gap-1.5">
            {VANTAGES.map((_, i) => (
              <span key={i} className={`h-[3px] rounded-full transition-all duration-500 ${i === vantage ? 'w-8 bg-select' : 'w-3 bg-white/25'}`} />
            ))}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-select mb-1.5">
            {surface?.label ?? SURFACE_TABS[surfaceIndex].label} · {van.name}
          </div>
          <p className="text-[13px] text-textSecondary leading-relaxed min-h-[2.6em]">
            {surface?.caption ?? van.hint}
          </p>
          <div className="mt-2 font-mono text-[9px] uppercase tracking-widest text-textMuted">
            1–4 surface · ← → move around it · drag to look
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImmersiveWorld;
