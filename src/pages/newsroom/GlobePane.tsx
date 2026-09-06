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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motionAllowed, usePrefs } from '../../data/prefs';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import { mesh } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import {
  clusterByCity,
  placedEvents,
  PLACEMENT_NOTES,
  freshnessOf,
  FRESHNESS_FACTOR,
  bandFor,
  openingView,
  placeMarks,
  BAND_WORDS,
  type CityPing,
  type GlobeBand,
  type SpreadStory,
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
/* Channels, not hex — the layers that fade a grade need an alpha. */
const GRADE_RGB: Record<NewsGrade, string> = {
  THREAT: '255,59,48',
  ALLY: '48,209,88',
  WATCH: '237,237,237',
};
const pingRadiusGround = (d: object) => pingRadius(d) * 0.45;
/*
  AT GROUND THE PING IS A TARGET, NOT A PICTURE.

  A globe "point" is a cylinder standing on the sphere. From orbit you look
  down its axis and it reads as a dot; at ground level you look ACROSS the
  surface, its side shows, and it reads as a slanted green capsule lying on
  the map beside the mark. The HTML mark already draws the coloured dot down
  here, so what the cylinder still has to be is the thing a click lands on:
  flat to the surface, and faint enough to be the halo under a mark rather
  than a second object competing with it.
*/
const pingAltitudeGround = () => 0.0008;
const pingColorGround = (d: object) => `rgba(${GRADE_RGB[(d as CityPing).grade]},0.42)`;
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
/*
  THE MARKS THE CLOSE BANDS DRAW.

  Built as real DOM rather than sprites so they can wear the desk's own
  type and its own ink tokens — a canvas label would be a second typeface
  on a page that has one. `htmlElementVisibilityModifier` hides the ones
  that have gone round the back of the planet, which a flat overlay cannot
  know and which is the difference between a map and a mess.

  Both bands are the same element with a different amount said, so a
  descent reads as one mark growing rather than two designs swapping.
*/
const markerEl = (d: object): HTMLElement => {
  const m = d as SpreadStory & { band: GlobeBand; sel: boolean };
  const ink = m.grade === 'THREAT' ? '#FF3B30' : m.grade === 'ALLY' ? '#30D158' : '#a3a3a3';
  /*
    TWO ELEMENTS, BECAUSE THE RENDERER OWNS ONE OF THEM.

    CSS2DRenderer writes `position`, `transform` and `display` onto the
    element it is given, every frame, for every mark. So the transform this
    mark used to set on itself was overwritten before it ever painted, and
    — worse — so was the `display:none` that `htmlElementVisibilityModifier`
    set: the renderer's own line is `display = object.visible ? '' : 'none'`
    and three-globe forces `object.visible = true` whenever a modifier is
    present. The far-side hiding this layer was written for has therefore
    never actually run; marks on the other side of the planet showed
    through it.

    The host below is the renderer's. Everything the desk styles lives on
    the child, which the renderer never touches.
  */
  const host = document.createElement('div');
  /* The visibility pass gets the element and a boolean, not the datum, so
     the coordinate rides on the element. */
  host.dataset.lat = String(m.lat);
  host.dataset.lng = String(m.lng);
  host.style.cssText = 'pointer-events:none';

  const el = document.createElement('div');
  el.style.cssText = [
    'position:relative',
    'display:flex',
    'align-items:center',
    'gap:5px',
    /* The renderer centres the HOST on the coordinate. The dot is the thing
       that is at the place, not the middle of the row, so the row shifts
       right by half its own width less the dot's own offset. */
    'transform:translate(calc(50% - 4px),0)',
    'white-space:nowrap',
    'pointer-events:none',
    'font-family:"SF Pro",sans-serif',
    `opacity:${m.sel ? '1' : '0.92'}`,
    'transition:opacity 200ms ease',
  ].join(';');

  /* The dot is the thing that is AT the coordinate; everything else hangs
     off it to the right, so the mark points at its own place. */
  const dot = document.createElement('span');
  const r = m.sel ? 9 : 7;
  dot.style.cssText = `width:${r}px;height:${r}px;border-radius:9999px;background:${ink};box-shadow:0 0 0 1px rgba(0,0,0,0.55),0 0 ${m.sel ? 10 : 5}px ${ink}80;flex:none`;
  el.appendChild(dot);

  /* ONE LINE, NOT A STACK. Ticker over move put an 11px and a 10px label
     within a pixel of each other and their shadows merged into a smudge —
     and doubled the height of a mark at exactly the moment marks are fanned
     close together. "TSLA +3.4%" is how the fact is said out loud anyway. */
  /* THE TEXT RIDES ABOVE THE DOT, NOT BESIDE IT. The globe draws its own
     curated place names the same way a mark is drawn — a small dot with
     text off its right shoulder, on the coordinate's own baseline — so a
     mark at a company's headquarters printed straight through the label
     that named the place: "Texas" and "TSLA" came out as "TexaTSLA", and
     "MSFT" sat on the top half of "Seattle". Raising the text clears that
     baseline without moving the dot, which is the thing that is actually
     AT the place. */
  const text = document.createElement('span');
  text.style.cssText = 'position:relative;top:-11px;display:flex;align-items:baseline;gap:4px;line-height:1';
  const name = document.createElement('span');
  /* The globe's own place names GROW with the camera; these do not, so at
     ground level a 10px ticker was a whisper beside a 30px "Chicago". One
     step up the desk's scale and a harder shadow, because the ground under
     a marker is a satellite photo rather than a flat panel. */
  name.style.cssText = `font-family:ui-monospace,monospace;font-size:11px;font-weight:700;letter-spacing:0.04em;color:${m.ticker ? '#ededed' : '#a3a3a3'};text-shadow:0 1px 2px #000,0 0 6px rgba(0,0,0,0.9)`;
  name.textContent = m.ticker ?? 'MACRO';
  text.appendChild(name);

  /* GROUND SAYS WHAT THE STORY IS WORTH. Approach names the company and
     stops — the move is a second number per mark, which is a hairball
     until the marks have spread out. */
  if (m.band === 'ground') {
    const move = document.createElement('span');
    const up = m.movePct >= 0;
    move.style.cssText = `font-family:ui-monospace,monospace;font-size:10px;font-weight:600;color:${up ? '#30D158' : '#FF3B30'};text-shadow:0 1px 2px #000,0 0 6px rgba(0,0,0,0.9)`;
    move.textContent = `${up ? '+' : '−'}${Math.abs(m.movePct).toFixed(1)}%`;
    text.appendChild(move);
  }
  el.appendChild(text);
  host.appendChild(el);
  return host;
};

/*
  BEHIND THE PLANET IS NOT "VERY TRANSPARENT", IT IS GONE — a label showing
  through the Earth puts New York in the Indian Ocean. But the globe's own
  answer to that question is the whole visible hemisphere, and the last few
  degrees before the limb are where a sphere squeezes a third of a continent
  into a hundred pixels. At ground level, with the camera over the Gulf,
  every West Coast mark stacked into one unreadable pile in the top-left
  corner — on top of the page's own title, because the canvas is the pane.

  So the cap is the horizon the camera actually has, pulled in. A camera at
  altitude `a` sees to acos(1/(1+a)) from the point under it; marks past
  0.62 of that are the ones being crushed against the edge, and they are
  also the ones furthest from what the reader came down to look at.
*/
const LIMB_KEEP = 0.62;
const DEG = Math.PI / 180;
const arcDegrees = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const c =
    Math.sin(aLat * DEG) * Math.sin(bLat * DEG) +
    Math.cos(aLat * DEG) * Math.cos(bLat * DEG) * Math.cos((aLng - bLng) * DEG);
  return Math.acos(Math.max(-1, Math.min(1, c))) / DEG;
};

/* THE ARCS ARE A PLANET-SCALE CLAIM. From orbit they say a story in one
   place reaches another; from two hundred miles up they are two white
   streaks crossing the whole screen with both ends off it. They fade out
   as the reader descends rather than snapping off, so the descent has no
   seam — hence a continuous fade rather than the band.

   Both ends are built from one channel table: GRADE_INK mixes hex and
   rgba, and patching an alpha onto a string whose format varies is how a
   colour silently becomes `rgba(237,237,237,0.8.4)`. */
const arcInk = (d: object) => {
  const a = (d as { fade: number }).fade;
  const g = (d as { grade: NewsGrade }).grade;
  return [`rgba(237,237,237,${(0.9 * a).toFixed(3)})`, `rgba(${GRADE_RGB[g]},${(0.85 * a).toFixed(3)})`];
};
/* A ring is either a story landing or the reader's own click. The mark
   gets the desk's select blue so it never reads as a grade — a white ripple
   on a place the reader chose would look like a WATCH headline they did
   not send. */
const ringInk = (d: object) => (t: number) => {
  const r = d as { grade: NewsGrade; strong: boolean; mark?: boolean };
  const a = Math.max(0, (r.strong ? 0.7 : 0.3) * (1 - t));
  if (r.mark) return `rgba(120,170,255,${Math.max(0, 0.85 * (1 - t))})`;
  return r.grade === 'ALLY' ? `rgba(48,209,88,${a})` : r.grade === 'THREAT' ? `rgba(255,59,48,${a})` : `rgba(237,237,237,${a})`;
};
const ringRadius = (d: object) => {
  const r = d as { strong: boolean; mark?: boolean };
  return r.mark ? 4.4 : r.strong ? 5.5 : 3.2;
};
const labelSizeOf = (d: object) => (d as { size: number }).size;
/* Full voice while the place names are the ONLY names on the sphere; a
   background whisper once the marks arrive and the names on the map are
   the companies'. */
const labelInk = (alpha: number) => () => `rgba(237,237,237,${alpha})`;
/* A curated label this close to a mark is under it, not beside it. Measured
   against the pairs that actually collided: Seattle/Redmond 0.2°,
   Texas/Austin 1.6°, California/Bay Area 1.9°, Houston/Austin 2.1°,
   Chicago/Indianapolis 2.4°. */
const LABEL_CLEARANCE_DEG = 2.4;
const marksOnto = (p: { lat: number; lng: number }, l: { lat: number; lng: number }) => {
  const dLat = p.lat - l.lat;
  /* Degrees of longitude are not degrees of arc away from the equator, and
     every pair above is at 30-48°N where the difference is a third. */
  const dLng = (p.lng - l.lng) * Math.cos((((p.lat + l.lat) / 2) * Math.PI) / 180);
  return Math.hypot(dLat, dLng) <= LABEL_CLEARANCE_DEG;
};

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
  /** A click on the SPHERE ITSELF rather than on a ping — the reader
      pointed at a place. Every point on the planet answers now; before
      this only the cities that happened to have a story did. */
  onPlaceClick?: (lat: number, lng: number) => void;
  /** Where the reader last clicked, so the planet marks the spot it is
      answering about. Null clears the mark. */
  placeMark?: { lat: number; lng: number } | null;
  /** Fires ONCE, two frames after the textured globe has real pixels — the
      boot overlay holds until this (with its own failsafe timer upstream,
      per the wedge law: no overlay may depend solely on a callback). */
  onReady?: () => void;
}

const GlobePane = ({ events, selectedId, onSelect, onCityOpen, onPlaceClick, placeMark, focusRegion, onReady }: GlobePaneProps) => {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const spin = motionAllowed(usePrefs().motion);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [material, setMaterial] = useState<THREE.ShaderMaterial | null>(null);
  const [borders, setBorders] = useState<BorderBatch[]>([]);

  /*
    HOW CLOSE THE READER IS — and only that.

    `onZoom` fires on every frame of a wheel or a drag, and re-rendering the
    room at that rate would be the globe driving React. What the layers
    actually need is the BAND, which changes three times in a full descent,
    so the altitude lives in a ref and state moves only when the band does.
    The ref keeps the raw number for the things that want a continuum — the
    arcs fade across their band rather than snapping off at its edge.
  */
  const povRef = useRef({ lat: 0, lng: 0, altitude: 2.1 });
  const [band, setBand] = useState<GlobeBand>('orbit');
  const onZoom = useCallback((pov: { lat: number; lng: number; altitude: number }) => {
    povRef.current = pov;
    const next = bandFor(pov.altitude);
    setBand(cur => (cur === next ? cur : next));
  }, []);

  /* Stable identity — a new modifier every render is a new layer, and this
     one runs per frame. It reads the ref, which is why it can be. */
  const markerVisibility = useCallback((host: HTMLElement, isVisible: boolean) => {
    /* The child, not the host — the renderer rewrites the host's display on
       every frame and would undo this one before it painted. */
    const el = host.firstElementChild as HTMLElement | null;
    if (!el) return;
    if (!isVisible) {
      el.style.display = 'none';
      return;
    }
    const pov = povRef.current;
    const horizon = Math.acos(1 / (1 + Math.max(0.05, pov.altitude))) / DEG;
    const away = arcDegrees(pov.lat, pov.lng, Number(host.dataset.lat), Number(host.dataset.lng));
    el.style.display = away <= horizon * LIMB_KEEP ? 'flex' : 'none';
  }, []);

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
      /* THE REAL EARTH. day.jpg is the blue marble; day-dark.jpg is the
         muted version this used to run (Noah, 2026-08-29: "swap the day
         side to the darker texture"), superseded on 2026-08-30 — "make the
         globe like an apple maps globe where it's real... i dont like the
         full black". The muted texture is what made the planet read as a
         silhouette; the real one gives it land, ocean and ice. day-dark
         stays on disk behind a one-word swap. */
      loader.loadAsync('/globe/day.jpg'),
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
    /*
      SMOOTHER TO DRIVE (Noah, 2026-08-30: "make the interaction smoother").

      Damping is what separates a globe that feels like an object with weight from
      one that stops dead the instant the mouse does — the drag carries a
      little momentum and eases out instead of snapping. `zoomSpeed` and
      `rotateSpeed` come down from the library defaults, which are tuned for
      a full-window globe; this one shares a page with a headline list and a
      story panel, and at default speed one wheel notch crossed half the
      altitude range.

      `update()` has to be called for damping to advance, and react-globe.gl
      drives its own animation loop — so this hooks the controls' own change
      handler rather than starting a second rAF beside the library's.
    */
    const controls = g.controls() as {
      autoRotate: boolean;
      autoRotateSpeed: number;
      enableDamping: boolean;
      dampingFactor: number;
      zoomSpeed: number;
      rotateSpeed: number;
      minDistance: number;
      maxDistance: number;
    };
    /* AND IT ASKS BEFORE IT TURNS. The drift already paused for a selected
       story; it did not pause for a reader who had asked the desk — or the
       operating system — for less motion, and a slowly rotating planet is
       the single largest moving object on this page. Dragging is untouched:
       motion the reader causes is not motion imposed on them. */
    controls.autoRotate = !selected && spin;
    controls.autoRotateSpeed = 0.32;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.zoomSpeed = 0.55;
    controls.rotateSpeed = 0.62;
    /* Opens on the news rather than on the mid-Atlantic — see openingView. */
    if (!selected) g.pointOfView({ ...openingView(events), altitude: 2.1 }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material, !!selected, spin]);

  /*
    Selection flies the camera to the story's origin.

    `material` IS A DEPENDENCY, and that is the whole fix. The Globe only
    mounts once the shader material has loaded, so on a cold open this
    effect ran while `globeRef.current` was still undefined, returned early,
    and never ran again — `selected` had not changed. The room opened with
    a story selected in the panel, in Austin, and a camera pointing at the
    Atlantic. Every reader's first view of this page was of the one part of
    the planet the story was not on.
  */
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !selected) return;
    g.pointOfView({ lat: selected.origin.lat, lng: selected.origin.lng, altitude: 1.75 }, 1100);
    /*
      KEYED ON THE STORY, NOT ON THE OBJECT.

      This depended on `selected` itself, and `selected` is
      `events.find(...)` over an `events` that the wire rebuilds every
      thirty seconds — so it was a NEW OBJECT twice a minute for the same
      story, and the effect flew the camera home each time. A reader who
      had come down to read the ground band was hauled back to orbit on the
      next tick, over and over, with nothing on screen to explain it.

      The camera should move when the reader picks a different story. That
      is `selectedId`, which is a string.
    */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, material]);

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
    /* 8.3 — ONLY WHAT CAN HONESTLY BE PLACED. A story naming a company
       whose head office this desk does not have used to land in New York
       by fallback; it is now absent from the planet and present in the
       list, with the count below saying how many. */
    return clusterByCity(placedEvents(events)).map(c => ({ ...c, sel: c.city === selCity }));
  }, [events, selected]);

  const unplaced = useMemo(() => events.filter(e => e.placed === 'unplaced'), [events]);

  /*
    WHAT THE CLOSE BANDS DRAW.

    Approach keeps the city's single mark and names it — the loudest story
    is the one the dot already stood for, so the name that appears is the
    name of the thing that was there. Ground fans every story out.

    Empty on orbit, so the planet-scale view is exactly what it was: a
    hairball of tickers is what this layer exists to avoid at that height.
  */
  const marks = useMemo(
    () => placeMarks(pings, band).map(m => ({ ...m, band, sel: m.id === selectedId })),
    [band, pings, selectedId]
  );

  /* Fresh stories ripple even unselected — the planet shows what just
     landed; the selected story keeps its ripple at full voice regardless. */
  const rings = useMemo(() => {
    const out: { lat: number; lng: number; grade: NewsGrade; strong: boolean; mark?: boolean }[] = placedEvents(events)
      .filter(e => freshnessOf(e) === 'fresh' || e.id === selectedId)
      .map(e => ({
        lat: e.origin.lat,
        lng: e.origin.lng,
        grade: e.grade,
        strong: e.id === selectedId,
      }));
    /* The reader's own click ripples too — on a sphere you have just spun,
       a panel that changed without the planet acknowledging where you
       pointed leaves you hunting for the spot. */
    if (placeMark) out.push({ ...placeMark, grade: 'WATCH', strong: false, mark: true });
    return out;
  }, [events, selectedId, placeMark]);
  /* Full voice on orbit, gone by the time the marks have spread. Keyed on
     the band so the memo settles rather than rebuilding every wheel frame;
     within a band the value is constant, which is what the layer wants. */
  const arcFade = band === 'orbit' ? 1 : band === 'approach' ? 0.35 : 0;
  const arcs = useMemo(
    () =>
      selected && arcFade > 0
        ? selected.impacts.map(z => ({
            startLat: selected.origin.lat,
            startLng: selected.origin.lng,
            endLat: z.lat,
            endLng: z.lng,
            grade: selected.grade,
            fade: arcFade,
          }))
        : [],
    [selected, arcFade]
  );
  const ramp = RAMPS[selected?.grade ?? 'WATCH'];
  /* THE HEAT GOES THE WAY THE ARCS DO. It pools where a story lands hard,
     which is a claim about a REGION — from ground level it is a field of
     green hexagons a hundred miles wide sitting on top of the marks that
     replaced it. Same reasoning, same fade. */
  const heatShown = useMemo(() => (band === 'ground' ? [] : heat), [band, heat]);

  /*
    THE MARKS SUPERSEDE THE PLACE NAMES THEY LAND ON.

    At orbit the curated names are the only names on the sphere and they are
    what orients a reader. From `approach` down the ticker marks arrive at
    company headquarters — which is the same handful of pixels as the city
    label that named the place, drawn at the same size, in the same ink, on
    the same baseline. Two label systems fighting over one spot, and the one
    that loses is the one saying less.

    So a name a mark has landed on goes, and every other name stays and
    steps back to a whisper. Dropping the layer wholesale would be easier
    and worse: "Los Angeles" and "London" are still how you know where you
    are, and nothing is standing on them.
  */
  const placeLabels = useMemo(
    () => (band === 'orbit' ? MAP_LABELS : MAP_LABELS.filter(l => !pings.some(p => marksOnto(p, l)))),
    [band, pings]
  );
  /* Memoised on the band, not rebuilt per frame — the layer diffs on
     identity and a new function every wheel tick is a new layer. */
  const labelTint = useMemo(() => labelInk(band === 'orbit' ? 0.6 : 0.26), [band]);

  return (
    <div ref={hostRef} className="absolute inset-0">
      {/* 8.3 — WHAT THE PINS MEAN, ON THE SURFACE.

          A pin on a spinning planet is the strongest possible claim that
          something HAPPENED THERE, and for corporate news it is almost
          never true: a Cupertino dot on an Apple story means Apple's head
          office is in Cupertino, not that the news came out of Cupertino.
          The checklist calls this "the honesty is the feature" and it is
          right — the clustering is genuinely useful, and it is only useful
          if the reader knows what they are looking at.

          Bottom-left, quiet, always present: a caption a reader can find
          when they wonder, without a legend that competes with the map.
          Pointer-events off so it can never eat a drag on the sphere. */}
      {/*
        ONE BLOCK IN THIS CORNER, NOT TWO.

        The room drew a grade legend at `left-4 bottom-3` and the pane drew
        this caption at `left-3 bottom-2`, neither aware of the other, and
        they overlapped into four illegible lines on top of each other —
        visible in the first screenshot anybody took of the page. The pane
        owns it now, because the pane is the thing being explained.

        AND THE FIRST LINE IS THE VIEW, NOT A STATIC KEY. It says which
        band the camera is in and what that band draws — which is the only
        way a reader finds out there is anything down there. A legend that
        reads the same at every altitude cannot teach a zoom.
      */}
      {/* CLEAR OF THE FURNITURE. Both blocks that used to live here sat at
          left-3 and left-4 — and the headlines panel is `lg:left-4
          lg:w-[350px]`, so from the width it appears at they were behind
          it, not merely overlapping each other. The world clocks own the
          bottom centre, so this sits above them and starts past the
          panel's right edge. */}
      <div className="pointer-events-none absolute bottom-2 lg:bottom-14 left-3 lg:left-[382px] z-10 flex flex-col gap-0.5 max-w-[46ch]">
        <span className="flex items-baseline gap-2 font-mono text-[10px]">
          <span className="uppercase tracking-wider text-textPrimary">{BAND_WORDS[band].label}</span>
          <span className="text-textMuted">{BAND_WORDS[band].note}</span>
        </span>
        <span className="flex items-center gap-3 font-mono text-[10px]">
          <span className="text-bear font-semibold">THREAT presses</span>
          <span className="text-bull font-semibold">ALLY lifts</span>
          <span className="text-textSecondary">WATCH no lean</span>
        </span>
        {/* TWO SENTENCES, TWO LINES. Joined by a middot inside one 46ch
            block they wrapped wherever the width fell — "· 2 STORIES ARE"
            hung off the end of the first line and "NOT ON THE MAP" started
            the second. They are separate claims and one of them is amber;
            neither should have to be reassembled across a line break. */}
        <span
          className="pointer-events-auto font-mono text-[9px] uppercase tracking-wider text-textMuted/80"
          title={PLACEMENT_NOTES.headquarters}
        >
          pins sit at company headquarters — not where the story happened
        </span>
        {unplaced.length > 0 && (
          <span
            className="pointer-events-auto font-mono text-[9px] uppercase tracking-wider text-warn/80"
            title={PLACEMENT_NOTES.unplaced}
          >
            {unplaced.length} {unplaced.length === 1 ? 'story is' : 'stories are'} not on the map — in the list, no known
            location
          </span>
        )}
      </div>
      {/* SPACE, NOT A VOID. A very faint radial wash so the globe's dark
          limb has something to sit against instead of ending in the page.
          Pointer-events off — it must never eat a drag on the sphere. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 60% at 50% 46%, rgba(56,86,124,0.16) 0%, rgba(24,38,58,0.10) 42%, rgba(0,0,0,0) 72%)',
        }}
      />
      {size.w > 0 && material && (
        <Globe
          ref={globeRef}
          width={size.w}
          height={size.h}
          backgroundColor="rgba(0,0,0,0)"
          globeMaterial={material}
          showAtmosphere
          /* A WIDER, WARMER HALO. The planet used to sit on pure black with
             a thin rim, which is the "full black" Noah called out: nothing
             separated the globe's dark limb from the page behind it, so the
             sphere lost its edge and read as a hole. A taller atmosphere at
             a lighter blue gives the limb somewhere to end. The page behind
             it carries a faint radial wash for the same reason — see the
             backdrop under this element. */
          atmosphereColor="#8FB3D9"
          atmosphereAltitude={0.18}
          /* country + state borders — one merged line batch per atlas */
          customLayerData={borders}
          customThreeObject={buildBorderBatch}
          /* the map's names — curated places, whispered */
          labelsData={placeLabels}
          labelLat="lat"
          labelLng="lng"
          labelText="text"
          labelSize={labelSizeOf}
          labelColor={labelTint}
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
          onZoom={onZoom}
          /*
            THE MARKS THE READER CAME DOWN FOR. Empty on orbit; the city's
            name on approach; every story, fanned and priced, on the ground.
          */
          htmlElementsData={marks}
          htmlLat="lat"
          htmlLng="lng"
          htmlAltitude={0.012}
          htmlElement={markerEl}
          htmlElementVisibilityModifier={markerVisibility}
          htmlTransitionDuration={260}
          /* one ping per city, in the dominant grade's ink */
          pointsData={pings}
          pointLat="lat"
          pointLng="lng"
          pointColor={band === 'ground' ? pingColorGround : pingColor}
          pointAltitude={band === 'ground' ? pingAltitudeGround : pingAltitude}
          /* THE DOT YIELDS. Once every story carries its own mark the city
             ping is a second, blunter answer to the same question sitting
             underneath it — so it shrinks to a locator as the reader
             descends rather than blobbing under the labels. */
          pointRadius={band === 'ground' ? pingRadiusGround : pingRadius}
          onPointClick={(d: object) => {
            const p = d as CityPing;
            if (onCityOpen) onCityOpen(p.city, p.topId);
            else onSelect(p.topId);
          }}
          /* ANY POINT ON THE PLANET ANSWERS. A ping click is handled above
             and never reaches here — globe.gl dispatches one object type
             per click — so this is exactly "the reader pointed at a place
             with no story on it", which is most of the sphere and used to
             be dead. A drag past the library's threshold is not a click
             (clickAfterDrag is false), so spinning the globe never opens a
             panel. */
          onGlobeClick={({ lat, lng }: { lat: number; lng: number }) => onPlaceClick?.(lat, lng)}
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
          hexBinPointsData={heatShown}
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
