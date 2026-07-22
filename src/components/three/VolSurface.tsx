import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/*
  Quant-grade 3D surface, rendered in real WebGL (three.js) — replaces the flat
  canvas wireframe. A grid of normalized heights (−1…1) becomes a lit, shaded
  mesh: strikes across, expiries deep, exposure tall. Positive structure reads
  green; negative gamma burns red — the same grammar as every 2D exposure view.
  Auto-orbits while idle; drag to spin and tilt.
*/

export type SurfaceColormap = 'exposure' | 'vol';

interface VolSurfaceProps {
  /** Row-major grid of normalized heights, −1…1 (rows = expiries, cols = strikes) */
  grid: number[][];
  colormap?: SurfaceColormap;
  height?: number | string;
  /** Hero mode: the surface tilts toward the cursor and glows under it */
  cursorReactive?: boolean;
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
  // diverging: green support (+) vs hot red (−) — silver is selection-only.
  // Brightness scales with magnitude so low-exposure cells stay DARK (they melt
  // into the scene) and only the walls glow — a readable heat ramp, not a
  // washed-out pale sheet.
  const t = Math.min(Math.abs(z) * 1.3, 1);
  const b = 0.1 + t * 0.82; // ~0.1 near zero → ~0.92 at a wall
  if (z >= 0) out.setRGB(b * 0.22, b, b * 0.42);
  else out.setRGB(b, b * 0.2, b * 0.16);
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

const VolSurface = ({ grid, colormap = 'exposure', height = 340, cursorReactive = false, className = '' }: VolSurfaceProps) => {
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
    composer?: EffectComposer;
    bloom?: UnrealBloomPass;
    pmrem?: THREE.PMREMGenerator;
    envTex?: THREE.Texture;
    raf?: number;
  }>({});

  // ---- one-time scene setup ----
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    // Pulled in + slightly lower so the surface fills the frame — no dead margins.
    camera.position.set(0, 1.85, 3.75);
    camera.lookAt(0, -0.08, 0);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      return; // no WebGL context — leave the mount empty so the parent bg shows
    }
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // Filmic tone mapping + correct colour space give the surface a graded,
    // cinematic look instead of raw clipped WebGL colours.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    // Image-based lighting from a neutral studio room — gives the PBR metal its
    // soft reflections and grounds the whole surface in real light.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    // Lighting — the env map does most of the work now; direct lights just shape
    // the ridges. Kept dim so the green/red exposure colours stay saturated,
    // never washed to white.
    scene.add(new THREE.AmbientLight(0x5a6472, 0.7));
    const key = new THREE.DirectionalLight(0xdfe8f5, 1.5);
    key.position.set(4, 8, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x7db0ff, 0.45);
    rim.position.set(-5, 2, -4);
    scene.add(rim);

    // Cursor light — a warm-white point that chases the mouse so the surface
    // glows where the cursor is (hero mode only). Starts dark.
    const cursorLight = new THREE.PointLight(0xe8eef8, 0, 9, 2);
    cursorLight.position.set(0, 1.5, 0);
    if (cursorReactive) scene.add(cursorLight);

    const group = new THREE.Group();
    scene.add(group);

    // base grid for axis context
    const gh = new THREE.GridHelper(WIDTH, 12, 0x2a2f38, 0x1a1d22);
    gh.position.y = -RISE * 1.05;
    (gh.material as THREE.Material).transparent = true;
    (gh.material as THREE.Material).opacity = 0.5;
    group.add(gh);

    // Postprocessing — a restrained bloom so bright exposure ridges glow like
    // lit glass, plus an OutputPass that applies the tone-map after compositing.
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.5, 0.92); // strength, radius, threshold — subtle glow on the brightest ridges only
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    objs.current = { renderer, scene, camera, group, composer, bloom, pmrem, envTex };
    buildMesh();

    // ---- interaction: manual orbit (yaw + clamped pitch) + idle auto-spin ----
    let dragging = false;
    let px = 0;
    let py = 0;
    let yaw = 0.55;
    let pitch = 0;
    let curNx = 0; // cursor position over the surface, −1…1
    let curNy = 0;
    let framesIdle = 999; // frames since the cursor last moved
    const el = renderer.domElement;
    el.style.touchAction = 'none';
    el.style.cursor = cursorReactive ? 'default' : 'grab';
    const onDown = (e: PointerEvent) => {
      dragging = true;
      px = e.clientX;
      py = e.clientY;
      el.setPointerCapture(e.pointerId);
      if (!cursorReactive) el.style.cursor = 'grabbing';
    };
    const onMove = (e: PointerEvent) => {
      if (dragging) {
        yaw += (e.clientX - px) * 0.01;
        pitch = Math.max(-0.5, Math.min(0.6, pitch + (e.clientY - py) * 0.006));
        px = e.clientX;
        py = e.clientY;
      }
      if (cursorReactive) {
        const rect = el.getBoundingClientRect();
        curNx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        curNy = ((e.clientY - rect.top) / rect.height) * 2 - 1;
        framesIdle = 0;
      }
    };
    const onUp = () => {
      dragging = false;
      if (!cursorReactive) el.style.cursor = 'grab';
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
      composer.setSize(w, h);
      bloom.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const tick = () => {
      framesIdle++;
      if (dragging) {
        // manual orbit wins
      } else if (cursorReactive) {
        const hovering = framesIdle < 90 && !reduce; // ~1.5s since last move
        if (hovering) {
          // tilt toward the cursor (parallax) and let the glow chase it
          const ty = curNx * 0.85;
          const tp = Math.max(-0.5, Math.min(0.6, -curNy * 0.42));
          yaw += (ty - yaw) * 0.06;
          pitch += (tp - pitch) * 0.06;
          cursorLight.position.x += (curNx * 2.6 - cursorLight.position.x) * 0.12;
          cursorLight.position.z += (-curNy * 1.9 - cursorLight.position.z) * 0.12;
          cursorLight.intensity += (3.0 - cursorLight.intensity) * 0.08;
        } else {
          if (!reduce) yaw += 0.0022; // gentle idle drift
          pitch += (0 - pitch) * 0.03;
          cursorLight.intensity += (0 - cursorLight.intensity) * 0.06;
        }
      } else if (!reduce) {
        yaw += 0.0032;
      }
      group.rotation.y = yaw;
      group.rotation.x = pitch;
      composer.render();
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
      objs.current.composer?.dispose();
      objs.current.envTex?.dispose();
      objs.current.pmrem?.dispose();
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
      metalness: 0.22,
      roughness: 0.52,
      envMapIntensity: 0.3,
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
