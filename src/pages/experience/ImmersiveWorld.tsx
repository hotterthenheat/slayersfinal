import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Environment,
  Lightformer,
  Float,
  Sparkles,
  MeshReflectorMaterial,
  MeshTransmissionMaterial,
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

/*
  Slayer Terminal — Immersive World.
  A genuine React-Three-Fiber scene (not layered divs): a dark data-cathedral you
  move through station-to-station with cinematic GSAP camera moves. Real geometry,
  PBR materials, procedural image-based lighting via Lightformers (no external
  HDR needed — CSP-safe), and a bloom/DoF/vignette/grain post stack. OrbitControls
  give constrained look-around at each station.
*/

const KING = '#EA00FF';
const CYAN = '#46d2eb';

interface Station {
  name: string;
  caption: string;
  cam: [number, number, number];
  target: [number, number, number];
}

const STATIONS: Station[] = [
  { name: 'Threshold', caption: 'You are standing at the mouth of the hall. The core burns at the far end.', cam: [0, 1.7, 9.6], target: [0, 1.55, -1] },
  { name: 'The Core', caption: 'A single crystal of live market structure — refracting every desk at once.', cam: [0.2, 1.8, 3.9], target: [0, 1.7, 0] },
  { name: 'The Gallery', caption: 'The desks, hung as glass — Pulse, Trace, Pinpoint, Compass, Prove It.', cam: [-5.7, 1.9, 2.6], target: [-4.4, 1.7, -1] },
  { name: 'The Vault', caption: 'Above the floor. The colonnade runs to the vanishing point.', cam: [0, 4.7, 7.2], target: [0, 0.7, -3.5] },
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

/** Emissive light strips running along the floor toward the core — the runway. */
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

/** The centerpiece: a slowly turning glass crystal with an inner magenta glow. */
const Core = () => {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.18;
  });
  return (
    <Float speed={1.2} rotationIntensity={0.15} floatIntensity={0.5}>
      <group ref={ref} position={[0, 1.7, 0]}>
        {/* inner emissive heart */}
        <mesh>
          <icosahedronGeometry args={[0.62, 0]} />
          <meshStandardMaterial color={KING} emissive={KING} emissiveIntensity={3.2} toneMapped={false} />
        </mesh>
        {/* outer glass shell */}
        <mesh castShadow>
          <icosahedronGeometry args={[1.25, 0]} />
          <MeshTransmissionMaterial
            samples={4}
            resolution={256}
            thickness={0.9}
            roughness={0.1}
            transmission={1}
            ior={1.4}
            chromaticAberration={0.05}
            anisotropy={0.25}
            distortion={0.15}
            distortionScale={0.3}
            color="#dfe8f5"
          />
        </mesh>
      </group>
    </Float>
  );
};

/** Floating glass desk-panels along the left wall. */
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

/** Procedural studio IBL — no external HDR, works under a strict CSP. */
const Lighting = () => (
  <>
    <ambientLight intensity={0.12} />
    <directionalLight position={[6, 12, 4]} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]}>
      <orthographicCamera attach="shadow-camera" args={[-14, 14, 14, -14, 0.1, 50]} />
    </directionalLight>
    <spotLight position={[0, 9, 2]} angle={0.5} penumbra={0.8} intensity={40} color={CYAN} distance={30} castShadow />
    <pointLight position={[0, 1.7, 0]} intensity={6} color={KING} distance={9} />
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

/** Drives the camera + orbit target between stations with a weighted GSAP move. */
const Rig = ({ index }: { index: number }) => {
  const { camera, controls } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: { target: THREE.Vector3; update: () => void } | null };
  const target = useRef(new THREE.Vector3(...STATIONS[0].target));

  useEffect(() => {
    const st = STATIONS[index];
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
  <EffectComposer multisampling={2}>
    <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.62} luminanceSmoothing={0.3} radius={0.7} />
    <DepthOfField focusDistance={0.02} focalLength={0.045} bokehScale={2} />
    <Vignette eskil={false} offset={0.25} darkness={0.9} />
    <Noise opacity={0.03} />
  </EffectComposer>
);

const Scene = ({ index }: { index: number }) => (
  <>
    <color attach="background" args={['#05060a']} />
    <fog attach="fog" args={['#05060a', 10, 34]} />
    <Lighting />
    <Floor />
    <Colonnade />
    <Runway />
    <Core />
    <Gallery />
    <Sparkles count={120} scale={[18, 8, 24]} size={2} speed={0.3} color="#9fb4d4" opacity={0.5} />
    <OrbitControls
      makeDefault
      enablePan={false}
      enableZoom={false}
      enableDamping
      dampingFactor={0.08}
      minPolarAngle={Math.PI / 3.4}
      maxPolarAngle={Math.PI / 1.9}
      minAzimuthAngle={-Math.PI / 5}
      maxAzimuthAngle={Math.PI / 5}
    />
    <Rig index={index} />
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
  const [index, setIndex] = useState(0);
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setBooted(true), 1400);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndex(i => Math.min(i + 1, STATIONS.length - 1));
      if (e.key === 'ArrowLeft') setIndex(i => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const st = STATIONS[index];

  return (
    <div className="fixed inset-0 z-[100] bg-[#05060a]">
      <SceneBoundary>
        <Canvas shadows dpr={[1, 2]} camera={{ position: STATIONS[0].cam, fov: 38, near: 0.1, far: 100 }} gl={{ antialias: true }}>
          <Suspense fallback={null}>
            <Scene index={index} />
          </Suspense>
        </Canvas>
      </SceneBoundary>

      {/* Boot sequence */}
      {!booted && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#05060a] transition-opacity">
          <div className="flex flex-col items-center gap-3">
            <span className="font-mono text-sm holo-text tracking-widest">&gt; slayer_terminal</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-textMuted animate-pulse">entering</span>
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

        {/* prev / next */}
        <button
          onClick={() => setIndex(i => Math.max(i - 1, 0))}
          disabled={index === 0}
          aria-label="Previous station"
          className="pointer-events-auto absolute left-5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-11 h-11 rounded-full border border-borderMuted bg-black/40 text-textSecondary hover:text-textPrimary hover:border-borderFocus disabled:opacity-25 transition-colors backdrop-blur"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={() => setIndex(i => Math.min(i + 1, STATIONS.length - 1))}
          disabled={index === STATIONS.length - 1}
          aria-label="Next station"
          className="pointer-events-auto absolute right-5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-11 h-11 rounded-full border border-borderMuted bg-black/40 text-textSecondary hover:text-textPrimary hover:border-borderFocus disabled:opacity-25 transition-colors backdrop-blur"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* bottom station panel */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[min(560px,90vw)] text-center">
          <div className="mb-2 flex items-center justify-center gap-1.5">
            {STATIONS.map((_, i) => (
              <span key={i} className={`h-[3px] rounded-full transition-all duration-500 ${i === index ? 'w-8 bg-select' : 'w-3 bg-white/25'}`} />
            ))}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-select mb-1.5">
            {String(index + 1).padStart(2, '0')} / {String(STATIONS.length).padStart(2, '0')} · {st.name}
          </div>
          <p className="text-[13px] text-textSecondary leading-relaxed">{st.caption}</p>
          <div className="mt-2 font-mono text-[9px] uppercase tracking-widest text-textMuted">drag to look · ← → to travel</div>
        </div>
      </div>
    </div>
  );
};

export default ImmersiveWorld;
