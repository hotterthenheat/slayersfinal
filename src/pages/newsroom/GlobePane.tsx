/*
==================================================
  SLAYER TERMINAL - NEWS ROOM GLOBE
  The 3D stage (Noah, 2026-08-29: "the actual sun
  being rendered... a trajectory from the point where
  the company news came from to where it can
  potentially impact... heatsignal... matches our
  pressure matrix").

  react-globe.gl (three.js) — NOT hand-rolled WebGL.
  The sun is real: a shader blends day/night textures
  across the live subsolar point. EVERY event pings
  as a point in its grade's ink; the SELECTED event
  tells its whole story — origin ripple, impact arcs,
  hex heat in the matching industrial ramp — and the
  camera flies to it. Data comes in through props
  (data/newsroom.ts owns the facts); this file only
  draws.

  three.js returns here deliberately after the
  landing-terrain removal — that was an aesthetic
  verdict on a toy, this is a data surface. The page
  lazy-loads this pane so only the News Room pays
  the chunk.
==================================================
*/

import { useEffect, useMemo, useRef, useState } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import { mesh } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import {
  clusterByCity,
  freshnessOf,
  FRESHNESS_FACTOR,
  type CityPing,
  type GeoNewsEvent,
  type NewsGrade,
} from '../../data/newsroom';

/* ── map furniture: borders + names (Noah, 2026-08-29: "highlighted
   countries and main cities/states... the border should be white and also
   labeled") ────────────────────────────────────────────────────────────────
   Countries at 110m + US states at 10m, self-hosted topojson.

   AS ONE DRAW CALL PER ATLAS, not a polygons layer (perf arc, 2026-08-29:
   the room idled at 29fps — ~230 border polygons was ~700 draw calls every
   frame). `topojson.mesh` dedupes shared borders into one MultiLineString;
   each atlas becomes a single THREE.LineSegments in a custom layer. Same
   pixels, two draw calls.

   Labels are a CURATED set — the room's own places (origins and impact
   hubs), whispered white so the grade pings stay the loud layer. */
interface BorderBatch {
  kind: 'country' | 'state';
  lines: [number, number][][]; // [lng, lat] runs
}
const MAP_LABELS: { lat: number; lng: number; text: string; size: number }[] = [
  { lat: 40.71, lng: -74.01, text: 'New York', size: 0.95 },
  { lat: 38.89, lng: -77.04, text: 'Washington DC', size: 0.8 },
  { lat: 36.7, lng: -119.9, text: 'California', size: 0.95 },
  { lat: 31.2, lng: -99.3, text: 'Texas', size: 0.8 },
  { lat: 47.61, lng: -122.33, text: 'Seattle', size: 0.7 },
  { lat: 41.88, lng: -87.63, text: 'Chicago', size: 0.7 },
  { lat: 34.05, lng: -118.24, text: 'Los Angeles', size: 0.7 },
  { lat: 29.76, lng: -95.37, text: 'Houston', size: 0.65 },
  { lat: 51.51, lng: -0.13, text: 'London', size: 0.9 },
  { lat: 50.11, lng: 8.68, text: 'Frankfurt', size: 0.75 },
  { lat: 48.21, lng: 16.37, text: 'Vienna', size: 0.65 },
  { lat: 51.92, lng: 4.48, text: 'Rotterdam', size: 0.6 },
  { lat: 47.56, lng: 7.59, text: 'Basel', size: 0.6 },
  { lat: 53.35, lng: -6.26, text: 'Dublin', size: 0.6 },
  { lat: 35.68, lng: 139.69, text: 'Tokyo', size: 0.9 },
  { lat: 37.56, lng: 126.97, text: 'Seoul', size: 0.8 },
  { lat: 25.03, lng: 121.56, text: 'Taipei', size: 0.8 },
  { lat: 31.23, lng: 121.47, text: 'Shanghai', size: 0.8 },
  { lat: 39.9, lng: 116.4, text: 'Beijing', size: 0.8 },
  { lat: 22.28, lng: 114.16, text: 'Hong Kong', size: 0.65 },
  { lat: 1.35, lng: 103.82, text: 'Singapore', size: 0.7 },
  { lat: 24.71, lng: 46.68, text: 'Riyadh', size: 0.7 },
];

/* ── the sun, for real ─────────────────────────────────────────────────────
   Subsolar point from UTC time — declination + equation of time, the
   standard approximations (within ~0.3°, far finer than a terminator that
   is itself a soft twilight band). */
function subsolarPoint(d: Date): { lat: number; lng: number } {
  const rad = Math.PI / 180;
  const dayOfYear = (d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86_400_000;
  const decl = -23.44 * Math.cos(rad * (360 / 365) * (dayOfYear + 10));
  const B = rad * (360 / 365) * (dayOfYear - 81);
  const eotMin = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  const utcHours = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const lng = -15 * (utcHours - 12 + eotMin / 60);
  return { lat: decl, lng: ((lng + 540) % 360) - 180 };
}

/* ── grade ink — color IS the information ─────────────────────────────────
   THREAT presses (bear family), ALLY lifts (bull family), WATCH has no lean
   (white). Heat ramps are the industrial one-hue luminance walks — the
   pressure matrix's exact language, per side. */
const GRADE_INK: Record<NewsGrade, string> = {
  THREAT: '#FF3B30',
  ALLY: '#30D158',
  WATCH: 'rgba(237,237,237,0.8)',
};
const RAMPS: Record<NewsGrade, string[]> = {
  THREAT: ['#2a2a2a', '#5C1512', '#A82019', '#FF3B30'],
  ALLY: ['#2a2a2a', '#14532A', '#1C7A38', '#30D158'],
  WATCH: ['#2a2a2a', '#4a4a4a', '#8a8a8a', '#ededed'],
};
const rampAt = (ramp: string[], t: number): string => {
  const x = Math.max(0, Math.min(1, t)) * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(x));
  const f = x - i;
  const ch = (s: string, o: number) => parseInt(s.slice(o, o + 2), 16);
  const mix = (o: number) => Math.round(ch(ramp[i], o) + (ch(ramp[i + 1], o) - ch(ramp[i], o)) * f);
  return `rgb(${mix(1)},${mix(3)},${mix(5)})`;
};

/* Deterministic heat cloud per event — seeded off the id so every mount of
   the same story pools the same way (Math.random would shimmer). */
function heatCloud(ev: GeoNewsEvent) {
  let s = 7;
  for (const c of ev.id) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 2 ** 32);
  const pts: { lat: number; lng: number; w: number }[] = [];
  for (const z of ev.impacts) {
    const n = 10 + z.w * 3;
    for (let i = 0; i < n; i++) {
      const r = (rnd() + rnd()) * 2.4;
      const a = rnd() * Math.PI * 2;
      pts.push({ lat: z.lat + Math.sin(a) * r, lng: z.lng + Math.cos(a) * r * 1.4, w: z.w * (1 - r / 6) });
    }
  }
  return pts;
}

/* One LineSegments per atlas — every border run chained into a single
   position buffer at a whisker above the surface. Radius 100 is
   three-globe's globe radius. */
const GLOBE_R = 100.35;
function llToXyz(lat: number, lng: number): [number, number, number] {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((90 - lng) * Math.PI) / 180;
  return [GLOBE_R * Math.sin(phi) * Math.cos(theta), GLOBE_R * Math.cos(phi), GLOBE_R * Math.sin(phi) * Math.sin(theta)];
}
function buildBorderBatch(d: object): THREE.Object3D {
  const batch = d as BorderBatch;
  const pos: number[] = [];
  for (const line of batch.lines) {
    for (let i = 0; i < line.length - 1; i++) {
      /* Sample long great-circle-ish gaps? Border arcs from topojson are
         dense enough at 110m/10m that straight chords stay under a pixel. */
      pos.push(...llToXyz(line[i][1], line[i][0]), ...llToXyz(line[i + 1][1], line[i + 1][0]));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0xededed,
    transparent: true,
    opacity: batch.kind === 'country' ? 0.38 : 0.16,
    depthWrite: false,
  });
  return new THREE.LineSegments(geo, mat);
}

/* ── layer accessors, hoisted ─────────────────────────────────────────────
   Inline arrows are new identities every render, and the globe re-runs a
   layer whenever an accessor "changes" — hoisting them makes re-renders of
   the room free for the planet. */
const pingColor = (d: object) => GRADE_INK[(d as CityPing).grade];
const pingAltitude = (d: object) => ((d as { sel: boolean }).sel ? 0.02 : 0.008);
const pingRadius = (d: object) => {
  const p = d as CityPing & { sel: boolean };
  const k = FRESHNESS_FACTOR[p.freshest];
  return ((p.sel ? 0.3 : 0.16) + p.maxSeverity * 0.02 + (p.n > 1 ? 0.12 : 0)) * (0.7 + 0.3 * k);
};
const pingLabel = (d: object) => {
  const p = d as CityPing;
  const ink = p.grade === 'WATCH' ? '#a3a3a3' : GRADE_INK[p.grade];
  const lean = [
    p.threats ? `<span style="color:#FF3B30">${p.threats} pressing</span>` : '',
    p.allies ? `<span style="color:#30D158">${p.allies} lifting</span>` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return `<div style="font-family:'SF Pro',sans-serif;font-size:11px;background:#101114;border:1px solid #262626;border-radius:6px;padding:6px 9px;color:#ededed;max-width:260px">
    <div style="font-weight:700;letter-spacing:0.04em">${p.city} · <span style="color:${ink}">${p.n} ${p.n === 1 ? 'story' : 'stories'}</span></div>
    ${lean ? `<div style="margin-top:2px">${lean}</div>` : ''}
    <div style="margin-top:4px;color:#a3a3a3">${p.topHeadline}</div>
  </div>`;
};
const arcInk = (d: object) => ['rgba(237,237,237,0.9)', (d as { ink: string }).ink];
const ringInk = (d: object) => (t: number) => {
  const r = d as { grade: NewsGrade; strong: boolean };
  const a = Math.max(0, (r.strong ? 0.7 : 0.3) * (1 - t));
  return r.grade === 'ALLY' ? `rgba(48,209,88,${a})` : r.grade === 'THREAT' ? `rgba(255,59,48,${a})` : `rgba(237,237,237,${a})`;
};
const ringRadius = (d: object) => ((d as { strong: boolean }).strong ? 5.5 : 3.2);
const labelSizeOf = (d: object) => (d as { size: number }).size;
const labelInk = () => 'rgba(237,237,237,0.6)';

interface GlobePaneProps {
  events: GeoNewsEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Clicking a city ping opens that place's dossier (and selects its
      loudest story). Falls back to plain selection when absent. */
  onCityOpen?: (city: string, topId: string) => void;
  /** Camera preset — a LOOK, not a selection; `n` bumps so repeating the
      same region still flies. */
  focusRegion?: { lat: number; lng: number; alt?: number; n: number } | null;
  /** Fires ONCE, two frames after the textured globe has real pixels — the
      boot overlay holds until this (with its own failsafe timer upstream,
      per the wedge law: no overlay may depend solely on a callback). */
  onReady?: () => void;
}

const GlobePane = ({ events, selectedId, onSelect, onCityOpen, focusRegion, onReady }: GlobePaneProps) => {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [material, setMaterial] = useState<THREE.ShaderMaterial | null>(null);
  const [borders, setBorders] = useState<BorderBatch[]>([]);

  const selected = useMemo(() => events.find(e => e.id === selectedId) ?? null, [events, selectedId]);

  // Borders: countries + US states — meshed (shared edges once) then
  // batched. States keep only their INTERIOR lines; the coastline is the
  // country layer's job.
  useEffect(() => {
    let dead = false;
    Promise.all([
      fetch('/globe/countries.json').then(r => r.json()),
      fetch('/globe/us-states.json').then(r => r.json()),
    ]).then(([world, us]: [Topology, Topology]) => {
      if (dead) return;
      const runs = (m: { type: string; coordinates: unknown }): [number, number][][] =>
        (m.type === 'MultiLineString' ? (m.coordinates as [number, number][][]) : [m.coordinates as [number, number][]]);
      const countryMesh = mesh(world, world.objects.countries as GeometryCollection);
      const stateMesh = mesh(us, us.objects.states as GeometryCollection, (a, b) => a !== b);
      setBorders([
        { kind: 'country', lines: runs(countryMesh) },
        { kind: 'state', lines: runs(stateMesh) },
      ]);
    });
    return () => {
      dead = true;
    };
  }, []);

  // The pane fills its host — the host owns layout, the canvas follows.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => setSize({ w: host.clientWidth, h: host.clientHeight }));
    ro.observe(host);
    setSize({ w: host.clientWidth, h: host.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Day/night shader — the terminator is a soft twilight band, night side
  // carries the city-lights texture (the "lit from within" read).
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    let dead = false;
    Promise.all([
      /* day-dark: the muted-earth day texture (Noah, 2026-08-29: "swap the
         day side to the darker texture") — day.jpg (blue marble) stays on
         disk for a future theme toggle. */
      loader.loadAsync('/globe/day-dark.jpg'),
      loader.loadAsync('/globe/night.jpg'),
    ]).then(([day, night]) => {
      if (dead) return;
      /* NO colorSpace tagging on purpose: tagging sRGB makes three decode
         samples to LINEAR, and a raw ShaderMaterial never re-encodes for the
         display — the whole planet rendered dim (measured: city lights nearly
         invisible). Untagged textures sample as-authored and the shader
         writes them straight through. */
      setMaterial(
        new THREE.ShaderMaterial({
          uniforms: {
            dayTexture: { value: day },
            nightTexture: { value: night },
            sunDirection: { value: new THREE.Vector3(1, 0, 0) },
          },
          vertexShader: /* glsl */ `
            varying vec2 vUv;
            varying vec3 vNormal;
            void main() {
              vUv = uv;
              vNormal = normalize(mat3(modelMatrix) * normal);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`,
          fragmentShader: /* glsl */ `
            uniform sampler2D dayTexture;
            uniform sampler2D nightTexture;
            uniform vec3 sunDirection;
            varying vec2 vUv;
            varying vec3 vNormal;
            void main() {
              float sun = dot(normalize(vNormal), normalize(sunDirection));
              float blend = smoothstep(-0.14, 0.12, sun);
              vec3 day = texture2D(dayTexture, vUv).rgb;           // already a dark cut
              vec3 night = texture2D(nightTexture, vUv).rgb * 1.15; // let the cities burn
              gl_FragColor = vec4(mix(night, day, blend), 1.0);
            }`,
        })
      );
    });
    return () => {
      dead = true;
    };
  }, []);

  // Aim the sun at the live subsolar point — re-aimed each minute, converted
  // through the globe's own coordinate system so the convention can't drift.
  useEffect(() => {
    if (!material) return;
    const aim = () => {
      const g = globeRef.current;
      if (!g) return;
      const { lat, lng } = subsolarPoint(new Date());
      const p = g.getCoords(lat, lng, 0);
      (material.uniforms.sunDirection.value as THREE.Vector3).set(p.x, p.y, p.z).normalize();
    };
    aim();
    const t = window.setInterval(aim, 60_000);
    return () => window.clearInterval(t);
  }, [material]);

  // First frame + drift. The drift PAUSES while a story is selected — a
  // rotating stage under someone reading arcs is a moving target.
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const controls = g.controls() as { autoRotate: boolean; autoRotateSpeed: number };
    controls.autoRotate = !selected;
    controls.autoRotateSpeed = 0.32;
    if (!selected) g.pointOfView({ lat: 30, lng: -60, altitude: 2.1 }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material, !!selected]);

  // Selection flies the camera to the story's origin.
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !selected) return;
    g.pointOfView({ lat: selected.origin.lat, lng: selected.origin.lng, altitude: 1.75 }, 1100);
  }, [selected]);

  // Region presets fly wider — a look at a continent, selection untouched.
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !focusRegion) return;
    g.pointOfView({ lat: focusRegion.lat, lng: focusRegion.lng, altitude: focusRegion.alt ?? 2.05 }, 900);
  }, [focusRegion]);

  // A dark globe does not need 2x pixels: cap the ratio and re-assert the
  // canvas size (the lib re-applies size on prop changes and keeps the
  // ratio). Half the pixels ≈ half the GPU frame on high-density displays.
  useEffect(() => {
    const g = globeRef.current;
    if (!g || size.w === 0) return;
    const r = g.renderer();
    const want = Math.min(window.devicePixelRatio || 1, 1.5);
    if (Math.abs(r.getPixelRatio() - want) > 0.01) {
      r.setPixelRatio(want);
      r.setSize(size.w, size.h);
    }
  }, [material, size]);

  // The ready signal — material means textures decoded, size means the
  // canvas exists; two rAFs later the first real frame has painted.
  const readyFiredRef = useRef(false);
  useEffect(() => {
    if (readyFiredRef.current || !material || size.w === 0 || !onReady) return;
    readyFiredRef.current = true;
    const id = requestAnimationFrame(() => requestAnimationFrame(onReady));
    return () => cancelAnimationFrame(id);
  }, [material, size.w, onReady]);

  // A hidden tab spends nothing: the render loop pauses with visibility.
  useEffect(() => {
    const onVis = () => {
      const g = globeRef.current;
      if (!g) return;
      if (document.hidden) g.pauseAnimation();
      else g.resumeAnimation();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      globeRef.current?.resumeAnimation();
    };
  }, []);

  /* Heat cools as the selected story ages — the lifecycle on the planet. */
  const heat = useMemo(() => {
    if (!selected) return [];
    const k = FRESHNESS_FACTOR[freshnessOf(selected)];
    return heatCloud(selected).map(p => ({ ...p, w: p.w * k }));
  }, [selected]);

  /* ONE ping per city (five NYC stories = one louder ping with a count),
     sized by count + loudest severity, dimmed as its freshest story ages. */
  const pings = useMemo(() => {
    const selCity = selected?.origin.city;
    return clusterByCity(events).map(c => ({ ...c, sel: c.city === selCity }));
  }, [events, selected]);

  /* Fresh stories ripple even unselected — the planet shows what just
     landed; the selected story keeps its ripple at full voice regardless. */
  const rings = useMemo(() => {
    const out = events
      .filter(e => freshnessOf(e) === 'fresh' || e.id === selectedId)
      .map(e => ({
        lat: e.origin.lat,
        lng: e.origin.lng,
        grade: e.grade,
        strong: e.id === selectedId,
      }));
    return out;
  }, [events, selectedId]);
  const arcs = useMemo(
    () =>
      selected
        ? selected.impacts.map(z => ({
            startLat: selected.origin.lat,
            startLng: selected.origin.lng,
            endLat: z.lat,
            endLng: z.lng,
            ink: GRADE_INK[selected.grade],
          }))
        : [],
    [selected]
  );
  const ramp = RAMPS[selected?.grade ?? 'WATCH'];

  return (
    <div ref={hostRef} className="absolute inset-0">
      {size.w > 0 && material && (
        <Globe
          ref={globeRef}
          width={size.w}
          height={size.h}
          backgroundColor="rgba(0,0,0,0)"
          globeMaterial={material}
          showAtmosphere
          atmosphereColor="#7E96B8"
          atmosphereAltitude={0.12}
          /* country + state borders — one merged line batch per atlas */
          customLayerData={borders}
          customThreeObject={buildBorderBatch}
          /* the map's names — curated places, whispered */
          labelsData={MAP_LABELS}
          labelLat="lat"
          labelLng="lng"
          labelText="text"
          labelSize={labelSizeOf}
          labelColor={labelInk}
          labelDotRadius={0.12}
          labelAltitude={0.004}
          labelResolution={2}
          /* fresh stories ripple; the selected one at full voice */
          ringsData={rings}
          ringLat="lat"
          ringLng="lng"
          ringColor={ringInk}
          ringMaxRadius={ringRadius}
          ringPropagationSpeed={1.6}
          ringRepeatPeriod={1400}
          /* one ping per city, in the dominant grade's ink */
          pointsData={pings}
          pointLat="lat"
          pointLng="lng"
          pointColor={pingColor}
          pointAltitude={pingAltitude}
          pointRadius={pingRadius}
          onPointClick={(d: object) => {
            const p = d as CityPing;
            if (onCityOpen) onCityOpen(p.city, p.topId);
            else onSelect(p.topId);
          }}
          pointLabel={pingLabel}
          /* the selected story's trajectories */
          arcsData={arcs}
          arcStartLat="startLat"
          arcStartLng="startLng"
          arcEndLat="endLat"
          arcEndLng="endLng"
          arcColor={arcInk}
          arcAltitudeAutoScale={0.45}
          arcStroke={0.42}
          arcDashLength={0.45}
          arcDashGap={0.35}
          arcDashAnimateTime={2600}
          /* the selected story's heat — pooling in its grade's ramp */
          hexBinPointsData={heat}
          hexBinPointLat="lat"
          hexBinPointLng="lng"
          hexBinPointWeight="w"
          hexBinResolution={3}
          hexMargin={0.25}
          hexAltitude={(d: { sumWeight: number }) => 0.008 + Math.min(0.05, d.sumWeight * 0.0016)}
          hexTopColor={(d: { sumWeight: number }) => rampAt(ramp, Math.min(1, d.sumWeight / 26))}
          hexSideColor={(d: { sumWeight: number }) => rampAt(ramp, Math.min(1, d.sumWeight / 34))}
          hexBinMerge
        />
      )}
    </div>
  );
};

export default GlobePane;
