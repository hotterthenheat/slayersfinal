import { WORLD_CLOCKS, readClock, type ClockRead } from './worldClocks';
import { freshnessOf, FRESHNESS_FACTOR, type GeoNewsEvent, type NewsGrade } from './newsroom';

/*
==================================================
  SLAYER TERMINAL - PLACE REPORT (data/placeReport.ts)
==================================================

  WHAT IS GOING ON AT A POINT ON THE PLANET — for a reader who clicked the
  globe somewhere that is not a ping.

  Noah, 2026-08-30: "the places you click it shows you whats going on".
  Until now only a CITY PING answered a click, which means the globe only
  spoke where a story had already originated. Most of the sphere was inert.
  A reader who spins to Taipei and clicks it wants to know what is landing
  on Taipei — and Taipei may well have originated nothing today.

  THE READING THAT ONLY A GLOBE HAS: LANDINGS. Every other surface on this
  desk sorts news by its SOURCE. The globe alone draws where a story
  REACHES, because it draws the arcs. So this counts both:

    origins  — stories that came OUT of here
    landings — stories aimed AT here from somewhere else

  and they are kept apart rather than summed, because "Santa Clara had four
  headlines" and "four headlines are pointed at Taipei" are different facts
  about a place and a reader conflating them would misread the map.

  DISTANCE IS REPORTED, NOT SWALLOWED. Click the mid-Atlantic and a naive
  nearest-match says "London" as if you had clicked London. This returns
  the great-circle gap and a `remote` flag past the catchment, so the panel
  can say "open water — nearest centre London, 2,100km" instead of quietly
  lying about where the reader pointed.

  WEIGHT IS SEVERITY x FRESHNESS — the same currency the globe's heat layer
  spends. A number in the panel that disagreed with the pixels beside it
  would be worse than no number.

  TIME COMES FROM THE PLATFORM. Each region carries an IANA zone and the
  clock is read through `Intl`, so DST is the browser's problem and not a
  table of offsets that rots twice a year. Regions that host a cash session
  link to WORLD_CLOCKS by name rather than restating its hours — one set of
  session hours on the desk, not two that can drift apart.
*/

export interface PlaceRegion {
  name: string;
  /** Country or state, for the second line. */
  area: string;
  lat: number;
  lng: number;
  /** IANA zone — the platform resolves the offset, DST included. */
  zone: string;
  /** WORLD_CLOCKS city when this place hosts a cash session. */
  clock?: string;
  /** What the place is known for on this desk — the panel's subtitle. */
  known: string;
}

/* The named places a click can land on. Chosen as the centres this room's
   news actually orbits — the HQ clusters in newsroom.ts plus the venues and
   policy capitals its impact zones point at — rather than "big cities",
   because a reader clicking Cairo wants to be told there is nothing here,
   not handed a population figure. */
export const PLACE_REGIONS: PlaceRegion[] = [
  { name: 'New York', area: 'United States', lat: 40.71, lng: -74.01, zone: 'America/New_York', clock: 'New York', known: 'the listing venues and the money that trades them' },
  { name: 'Washington', area: 'United States', lat: 38.89, lng: -77.04, zone: 'America/New_York', known: 'policy, rates and the regulators' },
  { name: 'Bay Area', area: 'California', lat: 37.39, lng: -122.08, zone: 'America/Los_Angeles', known: 'semiconductors, platforms and the software complex' },
  { name: 'Seattle', area: 'Washington', lat: 47.61, lng: -122.33, zone: 'America/Los_Angeles', known: 'cloud, retail logistics and aerospace' },
  { name: 'Los Angeles', area: 'California', lat: 34.05, lng: -118.24, zone: 'America/Los_Angeles', known: 'media, streaming and the ports' },
  { name: 'Austin', area: 'Texas', lat: 30.27, lng: -97.74, zone: 'America/Chicago', known: 'autos and the chip fabs that followed them' },
  { name: 'Houston', area: 'Texas', lat: 29.76, lng: -95.37, zone: 'America/Chicago', known: 'energy — production, refining and the majors' },
  { name: 'Chicago', area: 'Illinois', lat: 41.88, lng: -87.63, zone: 'America/Chicago', known: 'futures, options and the clearing houses' },
  { name: 'Boise', area: 'Idaho', lat: 43.61, lng: -116.2, zone: 'America/Boise', known: 'memory' },
  { name: 'Detroit', area: 'Michigan', lat: 42.33, lng: -83.05, zone: 'America/Detroit', known: 'the legacy auto makers' },
  { name: 'Toronto', area: 'Canada', lat: 43.65, lng: -79.38, zone: 'America/Toronto', known: 'banks and the resource listings' },
  { name: 'Mexico City', area: 'Mexico', lat: 19.43, lng: -99.13, zone: 'America/Mexico_City', known: 'the assembly base for North American manufacturing' },
  { name: 'São Paulo', area: 'Brazil', lat: -23.55, lng: -46.63, zone: 'America/Sao_Paulo', known: 'commodities and the largest LatAm exchange' },
  { name: 'London', area: 'United Kingdom', lat: 51.51, lng: -0.13, zone: 'Europe/London', clock: 'London', known: 'FX, metals and the European money centre' },
  { name: 'Frankfurt', area: 'Germany', lat: 50.11, lng: 8.68, zone: 'Europe/Berlin', clock: 'Frankfurt', known: 'the ECB and the German industrial listings' },
  { name: 'Paris', area: 'France', lat: 48.86, lng: 2.35, zone: 'Europe/Paris', known: 'luxury, aerospace and the CAC names' },
  { name: 'Amsterdam', area: 'Netherlands', lat: 52.37, lng: 4.9, zone: 'Europe/Amsterdam', known: 'lithography and the European trading venues' },
  { name: 'Zurich', area: 'Switzerland', lat: 47.37, lng: 8.54, zone: 'Europe/Zurich', known: 'pharma and private banking' },
  { name: 'Dublin', area: 'Ireland', lat: 53.35, lng: -6.26, zone: 'Europe/Dublin', known: 'where the US tech complex is domiciled in Europe' },
  { name: 'Moscow', area: 'Russia', lat: 55.76, lng: 37.62, zone: 'Europe/Moscow', known: 'energy supply and the sanctions file' },
  { name: 'Riyadh', area: 'Saudi Arabia', lat: 24.71, lng: 46.68, zone: 'Asia/Riyadh', known: 'crude policy and sovereign capital' },
  { name: 'Dubai', area: 'United Arab Emirates', lat: 25.2, lng: 55.27, zone: 'Asia/Dubai', known: 'the Gulf trading and shipping hub' },
  { name: 'Mumbai', area: 'India', lat: 19.08, lng: 72.88, zone: 'Asia/Kolkata', known: 'services, software and the Indian market' },
  { name: 'Singapore', area: 'Singapore', lat: 1.35, lng: 103.82, zone: 'Asia/Singapore', known: 'the Asian shipping lane and commodity trade' },
  { name: 'Hong Kong', area: 'China', lat: 22.32, lng: 114.17, zone: 'Asia/Hong_Kong', clock: 'Hong Kong', known: 'the gateway listing venue for mainland names' },
  { name: 'Shanghai', area: 'China', lat: 31.23, lng: 121.47, zone: 'Asia/Shanghai', known: 'manufacturing and the mainland demand read' },
  { name: 'Shenzhen', area: 'China', lat: 22.54, lng: 114.06, zone: 'Asia/Shanghai', known: 'electronics assembly' },
  { name: 'Beijing', area: 'China', lat: 39.9, lng: 116.4, zone: 'Asia/Shanghai', known: 'policy, export controls and the regulators' },
  { name: 'Taipei', area: 'Taiwan', lat: 25.03, lng: 121.56, zone: 'Asia/Taipei', known: 'the leading-edge foundries the whole chip complex depends on' },
  { name: 'Seoul', area: 'South Korea', lat: 37.56, lng: 126.97, zone: 'Asia/Seoul', known: 'memory, displays and the shipbuilders' },
  { name: 'Tokyo', area: 'Japan', lat: 35.68, lng: 139.69, zone: 'Asia/Tokyo', clock: 'Tokyo', known: 'the yen, the carry trade and the industrial exporters' },
  { name: 'Sydney', area: 'Australia', lat: -33.87, lng: 151.21, zone: 'Australia/Sydney', clock: 'Sydney', known: 'iron ore, and the first bell of the trading day' },
  { name: 'Johannesburg', area: 'South Africa', lat: -26.2, lng: 28.05, zone: 'Africa/Johannesburg', known: 'precious metals' },
];

/** Great-circle distance in kilometres. */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  /* asin form rather than atan2 on 1-s: identical here and one call fewer,
     and clamping guards the float that creeps above 1 at antipodes. */
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export interface PlaceHit {
  event: GeoNewsEvent;
  /** How far the origin or landing sits from the click, in km. */
  km: number;
  /** The impact zone's own label when this is a landing. */
  zone?: string;
  /** severity x freshness — the heat layer's currency. */
  weight: number;
}

export interface PlaceReport {
  /** Where the reader actually clicked. */
  lat: number;
  lng: number;
  region: PlaceRegion;
  /** Great-circle gap from the click to the region's centre. */
  km: number;
  /** True when the click was outside the catchment — ocean, or empty land.
      The region is still named, as the NEAREST one, not as the place. */
  remote: boolean;
  clock: ClockRead | null;
  /** Local wall time at the click, always — even where no market trades. */
  localTime: string;
  /** Stories that came out of here. */
  origins: PlaceHit[];
  /** Stories aimed at here from elsewhere — the globe's own reading. */
  landings: PlaceHit[];
  /** Tickers touching this place either way, loudest first. */
  tickers: string[];
  /** Weighted pressure landing here, by grade. */
  threat: number;
  ally: number;
  lean: NewsGrade;
}

const weightOf = (e: GeoNewsEvent): number => e.severity * FRESHNESS_FACTOR[freshnessOf(e)];

/** Local wall time in a zone, 24h. */
function timeIn(zone: string, at: Date): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(at);
  } catch {
    /* An unknown zone must not take the panel down with it. */
    return '--:--';
  }
}

/**
 * What is going on at a point on the planet.
 *
 * @param lat,lng     where the reader clicked
 * @param events      the room's stories
 * @param radiusKm    the catchment — a click beyond it is `remote`, and the
 *                    same radius decides which origins and landings count
 * @param at          injectable clock, so this is provable at an instant
 */
export function placeAt(
  lat: number,
  lng: number,
  events: GeoNewsEvent[],
  radiusKm = 1200,
  at: Date = new Date()
): PlaceReport {
  let region = PLACE_REGIONS[0];
  let best = Infinity;
  for (const r of PLACE_REGIONS) {
    const d = distanceKm(lat, lng, r.lat, r.lng);
    if (d < best) {
      best = d;
      region = r;
    }
  }
  const remote = best > radiusKm;

  const origins: PlaceHit[] = [];
  const landings: PlaceHit[] = [];
  let threat = 0;
  let ally = 0;
  const byTicker = new Map<string, number>();

  for (const e of events) {
    const w = weightOf(e);
    const oKm = distanceKm(lat, lng, e.origin.lat, e.origin.lng);
    const isOrigin = oKm <= radiusKm;
    if (isOrigin) origins.push({ event: e, km: Math.round(oKm), weight: w });

    /* A story's NEAREST impact zone to the click is the one that represents
       it here. Pushing every zone in range would list one story three times
       because a wide cluster happened to be drawn as three dots. */
    let nearZone: { km: number; label: string } | null = null;
    for (const z of e.impacts) {
      const zKm = distanceKm(lat, lng, z.lat, z.lng);
      if (zKm <= radiusKm && (!nearZone || zKm < nearZone.km)) nearZone = { km: zKm, label: z.label };
    }
    /* Origin wins over landing for the same story: a headline out of here
       is not also "aimed at" here, and counting it twice would double its
       pressure. */
    if (nearZone && !isOrigin) {
      landings.push({ event: e, km: Math.round(nearZone.km), zone: nearZone.label, weight: w });
    }

    if (isOrigin || nearZone) {
      if (e.grade === 'THREAT') threat += w;
      else if (e.grade === 'ALLY') ally += w;
      /* One ticker per item, and macro items carry none — they are counted
         in the pressure above but cannot name a symbol, so they are skipped
         here rather than filed under a placeholder that opens nothing. */
      const t = e.item.ticker;
      if (t) byTicker.set(t, (byTicker.get(t) ?? 0) + w);
    }
  }

  const near = (a: PlaceHit, b: PlaceHit) => b.weight - a.weight || a.km - b.km;
  origins.sort(near);
  landings.sort(near);

  const clockCity = region.clock;
  const wc = clockCity ? WORLD_CLOCKS.find(c => c.city === clockCity) : undefined;

  return {
    lat,
    lng,
    region,
    km: Math.round(best),
    remote,
    clock: wc ? readClock(wc, at) : null,
    localTime: timeIn(region.zone, at),
    origins,
    landings,
    tickers: [...byTicker.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t),
    threat: Number(threat.toFixed(1)),
    ally: Number(ally.toFixed(1)),
    /* A tie leans on neither — WATCH is the honest verdict when the two
       sides weigh the same, not a coin flip toward whichever was tested
       first. */
    lean: threat > ally ? 'THREAT' : ally > threat ? 'ALLY' : 'WATCH',
  };
}

/** Rough compass bearing from the region's centre to the click. */
export function bearingFrom(region: PlaceRegion, lat: number, lng: number): string {
  const dLat = lat - region.lat;
  let dLng = lng - region.lng;
  if (dLng > 180) dLng -= 360;
  if (dLng < -180) dLng += 360;
  const ns = dLat > 0.5 ? 'north' : dLat < -0.5 ? 'south' : '';
  const ew = dLng > 0.5 ? 'east' : dLng < -0.5 ? 'west' : '';
  if (ns && ew) return `${ns}-${ew}`;
  return ns || ew || 'right on';
}

/** The report's headline sentence. */
export function placeRead(p: PlaceReport): string {
  const n = p.origins.length + p.landings.length;
  if (p.remote && n === 0) {
    return `Nothing is happening here. The nearest centre this room tracks is ${p.region.name}, ${p.km.toLocaleString()}km ${bearingFrom(p.region, p.lat, p.lng)} of ${p.km > 0 ? 'this point' : 'here'}.`;
  }
  if (n === 0) {
    return `${p.region.name} is quiet — no headline today came out of here, and none is pointed at it.`;
  }
  const parts: string[] = [];
  if (p.origins.length > 0) {
    parts.push(`${p.origins.length} ${p.origins.length === 1 ? 'story came' : 'stories came'} out of ${p.region.name}`);
  }
  if (p.landings.length > 0) {
    parts.push(`${p.landings.length} ${p.landings.length === 1 ? 'is' : 'are'} aimed at it from elsewhere`);
  }
  const lean =
    p.lean === 'THREAT'
      ? ' The weight lands against it.'
      : p.lean === 'ALLY'
        ? ' The weight lands in its favour.'
        : ' The two sides weigh the same.';
  return `${parts.join(', and ')}.${n > 1 ? lean : ''}`;
}
