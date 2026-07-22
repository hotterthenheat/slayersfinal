import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { QuantSurfaceData, SurfaceRamp } from '../../data/quantsurfaces';

/*
  The immersive world's hero: a live quant surface rendered as real geometry —
  a grid of normalized heights becomes a lit, shaded terrain you fly around.
  Not decoration; the mesh IS the data (dealer gamma / vol / MC cone / RND).
*/

const WIDTH = 12;
const DEPTH = 9;
const RISE = 2.15;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Normalized height → RGB per ramp (same grammar as the 2D desks). */
function rampColor(z: number, kind: SurfaceRamp, out: THREE.Color) {
  if (kind === 'gamma') {
    // diverging: green support (+) vs hot red (−); brightness scales with |z|
    const t = Math.min(Math.abs(z) * 1.3, 1);
    const b = 0.1 + t * 0.82;
    if (z >= 0) out.setRGB(b * 0.22, b, b * 0.42);
    else out.setRGB(b, b * 0.2, b * 0.16);
    return out;
  }
  if (kind === 'vol') {
    // sequential: deep navy → ice as vol rises
    const t = clamp(z, 0, 1);
    out.setRGB(0.05 + t * 0.75, 0.12 + t * 0.7, 0.28 + t * 0.68);
    return out;
  }
  // density: thermal dark→blue→cyan→yellow→red
  const t = clamp(z, 0, 1);
  const stops: [number, number, number, number][] = [
    [0.0, 0.02, 0.03, 0.12],
    [0.32, 0.08, 0.28, 0.78],
    [0.55, 0.16, 0.78, 0.9],
    [0.78, 0.96, 0.86, 0.24],
    [1.0, 0.96, 0.26, 0.1],
  ];
  let i = 0;
  while (i < stops.length - 1 && t > stops[i + 1][0]) i++;
  const a = stops[i];
  const bb = stops[Math.min(i + 1, stops.length - 1)];
  const f = (t - a[0]) / (bb[0] - a[0] || 1);
  out.setRGB(a[1] + (bb[1] - a[1]) * f, a[2] + (bb[2] - a[2]) * f, a[3] + (bb[3] - a[3]) * f);
  return out;
}

function buildGeometry(grid: number[][], ramp: SurfaceRamp): THREE.BufferGeometry {
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

const QuantSurface = ({ data }: { data: QuantSurfaceData }) => {
  const geo = useMemo(() => buildGeometry(data.grid, data.ramp), [data]);
  const wire = useMemo(() => new THREE.WireframeGeometry(geo), [geo]);
  // dispose old geometry when the surface swaps
  useEffect(() => () => { geo.dispose(); wire.dispose(); }, [geo, wire]);

  return (
    <group position={[0, 2.3, -1.2]}>
      <mesh geometry={geo} castShadow receiveShadow>
        <meshStandardMaterial vertexColors metalness={0.24} roughness={0.46} envMapIntensity={0.5} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments geometry={wire}>
        <lineBasicMaterial color="#c7d3e8" transparent opacity={0.09} />
      </lineSegments>
      {/* holographic reference plane at the surface's zero level — for gamma, ridges
          rise above it (long-Γ support) and troughs fall below (short-Γ) */}
      <gridHelper args={[WIDTH, 16, '#2b3947', '#151b22']} position={[0, 0, 0]} />
    </group>
  );
};

export default QuantSurface;
