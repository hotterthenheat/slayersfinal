import { useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { rampColor } from '../experience/surfaceRamps';

/*
  A READABLE dealer-exposure surface. The old render was a glowing shape with no
  axes — you couldn't tell which strike, which expiry, or how much. This one is
  built to be read: labelled strike axis (min · spot · max), an expiry axis
  (near → far), a NET GEX colourbar with the real dollar scale, a spot marker,
  and a vertical exposure gauge. Green ridges = dealer support (long gamma);
  red troughs = negative gamma. Drag to orbit, scroll to zoom.
*/

const WIDTH = 4.2;
const DEPTH = 3.0;
const RISE = 1.15;

const xForCol = (c: number, cols: number) => (c / (cols - 1) - 0.5) * WIDTH;
const zForRow = (r: number, rows: number) => (0.5 - r / (rows - 1)) * DEPTH; // r=0 (near) toward camera

function fmtUsd(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(0)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`;
  return `${s}$${a.toFixed(0)}`;
}

function buildGeometry(grid: number[][]): THREE.BufferGeometry {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const geo = new THREE.BufferGeometry();
  if (rows < 2 || cols < 2) return geo;
  const positions = new Float32Array(rows * cols * 3);
  const colors = new Float32Array(rows * cols * 3);
  const tmp = new THREE.Color();
  let p = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const z = grid[r][c];
      positions[p] = xForCol(c, cols);
      positions[p + 1] = z * RISE;
      positions[p + 2] = zForRow(r, rows);
      rampColor(z, 'gamma', tmp);
      // Peaks self-illuminate — the taller the wall (|z|), the brighter it burns.
      // Pushes ridge colors past 1.0 (HDR) so the bloom pass makes them glow
      // while flat, near-zero cells stay matte and readable.
      const glow = 1 + Math.abs(z) * Math.abs(z) * 1.35;
      colors[p] = tmp.r * glow;
      colors[p + 1] = tmp.g * glow;
      colors[p + 2] = tmp.b * glow;
      p += 3;
    }
  }
  const indices: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = (r + 1) * cols + c;
      const e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

const labelClass = 'font-mono text-[10px] uppercase tracking-wide text-textMuted whitespace-nowrap';

const Tag = ({ pos, children, color }: { pos: [number, number, number]; children: React.ReactNode; color?: string }) => (
  <Html position={pos} center style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
    <span className={labelClass} style={color ? { color } : undefined}>{children}</span>
  </Html>
);

const Surface = ({ grid, strikes, spotCol }: { grid: number[][]; strikes: number[]; spotCol: number }) => {
  const geo = useMemo(() => buildGeometry(grid), [grid]);
  const wire = useMemo(() => new THREE.WireframeGeometry(geo), [geo]);
  useEffect(() => () => { geo.dispose(); wire.dispose(); }, [geo, wire]);

  const cols = strikes.length;
  const xSpot = xForCol(spotCol, cols);
  const yFloor = -RISE * 1.04;
  const xL = -WIDTH / 2;
  const zFront = DEPTH / 2;
  const zBack = -DEPTH / 2;

  return (
    <group>
      <mesh geometry={geo}>
        {/* toneMapped off so the HDR ridge colors survive to the bloom pass */}
        <meshStandardMaterial vertexColors toneMapped={false} metalness={0.16} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments geometry={wire}>
        <lineBasicMaterial color="#0a0e14" transparent opacity={0.18} />
      </lineSegments>

      {/* floor grid for depth reference */}
      <gridHelper args={[WIDTH, 12, '#2b3947', '#151b22']} position={[0, yFloor, 0]} />

      {/* spot marker — a bright rod on the front strike axis + label */}
      <mesh position={[xSpot, 0, zFront]}>
        <boxGeometry args={[0.03, RISE * 2, 0.03]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.55} />
      </mesh>
      <Tag pos={[xSpot, RISE * 1.25, zFront]} color="#e4e8f4">spot ${strikes[spotCol]?.toLocaleString()}</Tag>

      {/* strike (X) axis — min · max on the front edge */}
      <Line points={[[xL, yFloor, zFront], [WIDTH / 2, yFloor, zFront]]} color="#2b3947" lineWidth={1} />
      <Tag pos={[xL, yFloor - 0.12, zFront + 0.12]}>${strikes[0]?.toLocaleString()}</Tag>
      <Tag pos={[WIDTH / 2, yFloor - 0.12, zFront + 0.12]}>${strikes[cols - 1]?.toLocaleString()}</Tag>
      <Tag pos={[0, yFloor - 0.34, zFront + 0.12]}>strike →</Tag>

      {/* expiry (Z) axis — near → far on the left edge (pushed out to clear the strike labels) */}
      <Line points={[[xL, yFloor, zFront], [xL, yFloor, zBack]]} color="#2b3947" lineWidth={1} />
      <Tag pos={[xL - 0.6, yFloor + 0.04, zFront]}>near</Tag>
      <Tag pos={[xL - 0.55, yFloor + 0.04, zBack]}>far</Tag>
      <Tag pos={[xL - 0.9, yFloor + 0.04, 0]}>expiry</Tag>

      {/* exposure (Y) gauge — +/0/− at the back-left corner */}
      <Line points={[[xL, -RISE, zBack], [xL, RISE, zBack]]} color="#2b3947" lineWidth={1} />
      <Tag pos={[xL - 0.3, RISE, zBack]} color="#30d158">+GEX</Tag>
      <Tag pos={[xL - 0.24, 0, zBack]}>0</Tag>
      <Tag pos={[xL - 0.3, -RISE, zBack]} color="#ff3b30">−GEX</Tag>
    </group>
  );
};

interface DealerSurface3DProps {
  grid: number[][];
  strikes: number[];
  spotCol: number;
  /** max |net GEX| in the window, dollars — labels the colourbar */
  maxAbsUsd: number;
}

const DealerSurface3D = ({ grid, strikes, spotCol, maxAbsUsd }: DealerSurface3DProps) => (
  <div className="relative w-full h-full">
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [3.4, 2.7, 4.6], fov: 40, near: 0.1, far: 40 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: 'transparent' }}
    >
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#cfe0ff', '#0a0d12', 0.5]} />
      <directionalLight position={[5, 8, 5]} intensity={1.4} />
      <directionalLight position={[-4, 3, -3]} intensity={0.45} color="#8ab4ff" />
      <Surface grid={grid} strikes={strikes} spotCol={spotCol} />
      <OrbitControls
        makeDefault
        target={[0, -0.1, 0]}
        enablePan={false}
        enableDamping
        dampingFactor={0.1}
        minDistance={3.4}
        maxDistance={9}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.1}
      />
      {/* Cinematic glow — only the brightest ridges (the walls) bloom; the DOM
          axis/labels ride above the canvas untouched, so readability holds. */}
      <EffectComposer>
        <Bloom luminanceThreshold={1} luminanceSmoothing={0.7} intensity={0.7} mipmapBlur />
      </EffectComposer>
    </Canvas>

    {/* NET GEX colourbar — the dollar scale the surface can't show on its own */}
    <div className="pointer-events-none absolute top-3 left-3 flex flex-col items-start gap-1">
      <span className="font-mono text-[10px] uppercase tracking-wide text-textMuted">net gex</span>
      <div className="flex items-center gap-1.5">
        <div
          className="w-2 h-24 rounded-sm border border-borderSubtle/60"
          style={{ background: 'linear-gradient(to top, #d43329, #7a1a15, #0a0a0d, #187a3f, #30d158)' }}
        />
        <div className="flex flex-col justify-between h-24 py-0.5">
          <span className="font-mono text-[10px] text-[#30d158]">+{fmtUsd(maxAbsUsd)}</span>
          <span className="font-mono text-[10px] text-textMuted">0</span>
          <span className="font-mono text-[10px] text-[#ff3b30]">{fmtUsd(-maxAbsUsd)}</span>
        </div>
      </div>
    </div>
  </div>
);

export default DealerSurface3D;
