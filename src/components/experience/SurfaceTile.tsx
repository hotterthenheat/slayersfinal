import { useEffect, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { rampColor, type RampKind } from './surfaceRamps';

/*
  A single quant surface rendered inside a dashboard panel — the lit mesh IS the
  data. Fixed three-quarter vantage, slow auto-rotate, drag to look. No post
  stack (several of these share one page, so we keep each context cheap).
  Grids are normalized: sequential 0…1, or diverging −1…1 (diverging=true).
*/

const WIDTH = 4.2;
const DEPTH = 3.1;
const RISE = 1.15;

function buildGeometry(grid: number[][], ramp: RampKind): THREE.BufferGeometry {
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
      positions[p] = (c / (cols - 1) - 0.5) * WIDTH;
      positions[p + 1] = z * RISE;
      positions[p + 2] = (r / (rows - 1) - 0.5) * DEPTH;
      rampColor(z, ramp, tmp);
      colors[p] = tmp.r;
      colors[p + 1] = tmp.g;
      colors[p + 2] = tmp.b;
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

const Mesh = ({ grid, ramp }: { grid: number[][]; ramp: RampKind }) => {
  const geo = useMemo(() => buildGeometry(grid, ramp), [grid, ramp]);
  const wire = useMemo(() => new THREE.WireframeGeometry(geo), [geo]);
  useEffect(() => () => { geo.dispose(); wire.dispose(); }, [geo, wire]);
  return (
    <group>
      <mesh geometry={geo}>
        <meshStandardMaterial vertexColors metalness={0.18} roughness={0.52} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments geometry={wire}>
        <lineBasicMaterial color="#0a0e14" transparent opacity={0.22} />
      </lineSegments>
      <gridHelper args={[WIDTH, 12, '#2b3947', '#141a21']} position={[0, -RISE * 1.02, 0]} />
    </group>
  );
};

interface SurfaceTileProps {
  grid: number[][];
  ramp: RampKind;
  /** Slow idle rotation (default on). */
  spin?: boolean;
  className?: string;
}

const SurfaceTile = ({ grid, ramp, spin = true, className }: SurfaceTileProps) => {
  const ready = grid.length > 1 && (grid[0]?.length ?? 0) > 1;
  const controls = useRef(null);
  return (
    <div className={className} style={{ width: '100%', height: '100%' }}>
      {ready && (
        <Canvas
          dpr={[1, 1.75]}
          camera={{ position: [3.9, 3.5, 4.6], fov: 34, near: 0.1, far: 40 }}
          gl={{ antialias: true, alpha: true }}
          style={{ background: 'transparent' }}
        >
          <ambientLight intensity={0.55} />
          <hemisphereLight args={['#cfe0ff', '#0a0d12', 0.5]} />
          <directionalLight position={[5, 8, 4]} intensity={1.5} />
          <directionalLight position={[-4, 3, -3]} intensity={0.5} color="#8ab4ff" />
          <Mesh grid={grid} ramp={ramp} />
          <OrbitControls
            ref={controls}
            makeDefault
            enablePan={false}
            enableZoom={false}
            autoRotate={spin}
            autoRotateSpeed={0.55}
            enableDamping
            dampingFactor={0.1}
            minPolarAngle={Math.PI / 5}
            maxPolarAngle={Math.PI / 2.15}
          />
        </Canvas>
      )}
    </div>
  );
};

export default SurfaceTile;
