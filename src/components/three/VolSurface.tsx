import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/*
  Quant-grade 3D surface, rendered in real WebGL (three.js) — replaces the flat
  canvas wireframe. A grid of normalized heights (−1…1) becomes a lit, shaded
  mesh: strikes across, expiries deep, exposure tall. Positive structure wears
  the holographic silver run; negative gamma burns red — the same grammar as
  every 2D exposure view. Auto-orbits while idle; drag to spin and tilt.
*/

export type SurfaceColormap = 'exposure' | 'vol';

interface VolSurfaceProps {
  /** Row-major grid of normalized heights, −1…1 (rows = expiries, cols = strikes) */
  grid: number[][];
  colormap?: SurfaceColormap;
  height?: number | string;
  className?: string;
}

const WIDTH = 3.2;
const DEPTH = 2.4;
const RISE = 0.95;

/** −1…1 height → RGB in the house grammar. */
function colorFor(z: number, map: SurfaceColormap, out: THREE.Color) {
  if (map === 'vol') {
    // sequential: deep navy → cyan → ice → white as vol rises
    const t = Math.min(Math.max((z + 1) / 2, 0), 1);
    out.setRGB(0.05 + t * 0.75, 0.12 + t * 0.7, 0.28 + t * 0.68);
    return out;
  }
  // diverging: silver support (+) vs hot red (−)
  const t = Math.min(Math.abs(z) * 1.3, 1);
  if (z >= 0) out.setRGB((174 + t * 70) / 255, (185 + t * 60) / 255, (207 + t * 48) / 255);
  else out.setRGB(1, (80 - t * 34) / 255, (64 - t * 24) / 255);
  return out;
}

function buildGeometry(grid: number[][], map: SurfaceColormap): THREE.BufferGeometry {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const geo = new THREE.BufferGeometry();
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
      colorFor(z, map, tmp);
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

const VolSurface = ({ grid, colormap = 'exposure', height = 340, className = '' }: VolSurfaceProps) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef(grid);
  gridRef.current = grid;

  // Persistent three objects live across renders; only geometry swaps on data change.
  const objs = useRef<{
    renderer?: THREE.WebGLRenderer;
    scene?: THREE.Scene;
    camera?: THREE.PerspectiveCamera;
    group?: THREE.Group;
    mesh?: THREE.Mesh;
    wire?: THREE.LineSegments;
    raf?: number;
  }>({});

  // ---- one-time scene setup ----
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 2.1, 4.4);
    camera.lookAt(0, -0.15, 0);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return; // no WebGL context — leave the mount empty so the parent bg shows
    }
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mount.appendChild(renderer.domElement);

    // Lighting — a cool key from above, a dim warm fill, a rim for the silver sheen
    scene.add(new THREE.AmbientLight(0x5a6472, 1.15));
    const key = new THREE.DirectionalLight(0xdfe8f5, 1.7);
    key.position.set(4, 8, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x7db0ff, 0.5);
    rim.position.set(-5, 2, -4);
    scene.add(rim);

    const group = new THREE.Group();
    scene.add(group);

    // base grid for axis context
    const gh = new THREE.GridHelper(WIDTH, 12, 0x2a2f38, 0x1a1d22);
    gh.position.y = -RISE * 1.05;
    (gh.material as THREE.Material).transparent = true;
    (gh.material as THREE.Material).opacity = 0.5;
    group.add(gh);

    objs.current = { renderer, scene, camera, group };
    buildMesh();

    // ---- interaction: manual orbit (yaw + clamped pitch) + idle auto-spin ----
    let dragging = false;
    let px = 0;
    let py = 0;
    let yaw = 0.55;
    let pitch = 0;
    const el = renderer.domElement;
    el.style.touchAction = 'none';
    el.style.cursor = 'grab';
    const onDown = (e: PointerEvent) => {
      dragging = true;
      px = e.clientX;
      py = e.clientY;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = 'grabbing';
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      yaw += (e.clientX - px) * 0.01;
      pitch = Math.max(-0.5, Math.min(0.6, pitch + (e.clientY - py) * 0.006));
      px = e.clientX;
      py = e.clientY;
    };
    const onUp = () => {
      dragging = false;
      el.style.cursor = 'grab';
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointerleave', onUp);

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const tick = () => {
      if (!dragging && !reduce) yaw += 0.0032;
      group.rotation.y = yaw;
      group.rotation.x = pitch;
      renderer.render(scene, camera);
      objs.current.raf = requestAnimationFrame(tick);
    };
    objs.current.raf = requestAnimationFrame(tick);

    return () => {
      if (objs.current.raf) cancelAnimationFrame(objs.current.raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointerleave', onUp);
      objs.current.mesh?.geometry.dispose();
      (objs.current.mesh?.material as THREE.Material)?.dispose();
      objs.current.wire?.geometry.dispose();
      (objs.current.wire?.material as THREE.Material)?.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (re)build the mesh + wireframe from the current grid
  function buildMesh() {
    const o = objs.current;
    if (!o.group) return;
    const g = gridRef.current;
    if (!g.length || !g[0]?.length) return;
    const geo = buildGeometry(g, colormap);
    if (o.mesh) {
      o.group.remove(o.mesh);
      o.mesh.geometry.dispose();
    }
    if (o.wire) {
      o.group.remove(o.wire);
      o.wire.geometry.dispose();
    }
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.38,
      roughness: 0.46,
      side: THREE.DoubleSide,
      flatShading: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    o.group.add(mesh);
    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0xc7d3e8, transparent: true, opacity: 0.09 })
    );
    o.group.add(wire);
    o.mesh = mesh;
    o.wire = wire;
  }

  // rebuild when data changes
  useEffect(() => {
    buildMesh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, colormap]);

  return <div ref={mountRef} className={className} style={{ height, width: '100%' }} />;
};

export default VolSurface;
