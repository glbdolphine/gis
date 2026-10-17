import {
  GAZETTEER,
  SYLHET_DISTRICT_BOUNDS,
  UPAZILA_BY_ID,
  normalizeKey,
  pointInBounds,
  haversineKm,
} from '../data/sylhetGeoData';
import type {
  AppSettings,
  GeocodeCandidate,
  GeocodeJob,
  SchoolRecord,
} from '../types/gis';

// ---------- text similarity ----------

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9ঀ-৿\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

const STOP = new Set([
  'school', 'high', 'govt', 'government', 'primary', 'secondary', 'college', 'madrasa', 'madrasah',
  'and', 'the', 'of', 'ebtedayee', 'registered', 'non', 'model', 'academy', 'institute',
  'বিদ্যালয়', 'উচ্চ', 'প্রাথমিক', 'সরকারি', 'কলেজ', 'মাদ্রাসা',
]);

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  sa.forEach((t) => {
    if (sb.has(t)) inter++;
  });
  return inter / (sa.size + sb.size - inter);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

export function similarity(a: string, b: string): number {
  const ka = normalizeKey(a);
  const kb = normalizeKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  if (ka.includes(kb) || kb.includes(ka)) return 0.88;
  const lev = 1 - levenshtein(ka, kb) / Math.max(ka.length, kb.length);
  const jac = jaccard(tokens(a), tokens(b));
  return Math.max(lev, jac);
}

// ---------- candidate generators ----------

function candId(source: string, lat: number, lng: number): string {
  return `${source}_${lat.toFixed(5)}_${lng.toFixed(5)}`;
}

export function gazetteerCandidates(school: SchoolRecord): GeocodeCandidate[] {
  const upz = UPAZILA_BY_ID[school.upazila];
  const probes = [school.village, school.union, school.address, school.name, school.nameBn]
    .filter((x): x is string => !!x && x.trim().length > 0);
  const out: GeocodeCandidate[] = [];

  for (const g of GAZETTEER) {
    const names = [g.name, g.nameBn, ...(g.aliases ?? [])].filter((x): x is string => !!x);
    let best = 0;
    for (const probe of probes) {
      for (const n of names) {
        const s = similarity(probe, n);
        if (s > best) best = s;
        // an address like "Zindabazar, Sylhet" should still match "Zindabazar"
        if (normalizeKey(probe).includes(normalizeKey(n)) && normalizeKey(n).length >= 5) {
          best = Math.max(best, 0.9);
        }
      }
    }
    if (best < 0.62) continue;
    const sameUpazila = g.upazila === school.upazila;
    let score = best * (sameUpazila ? 1 : 0.7);
    if (g.kind === 'institution') score = Math.min(1, score + 0.05);
    out.push({
      id: candId('gaz', g.lat, g.lng),
      label: `${g.name}${g.nameBn ? ` · ${g.nameBn}` : ''} (gazetteer)`,
      lat: g.lat,
      lng: g.lng,
      source: 'gazetteer',
      score,
      insideUpazila: upz ? pointInBounds(g.lat, g.lng, upz.bounds) : true,
    });
  }
  return out;
}

export function centroidCandidate(school: SchoolRecord): GeocodeCandidate | null {
  const upz = UPAZILA_BY_ID[school.upazila];
  if (!upz) return null;
  return {
    id: candId('upz', upz.center[0], upz.center[1]),
    label: `${upz.name} upazila centre (rough fallback)`,
    lat: upz.center[0],
    lng: upz.center[1],
    source: 'upazila-centroid',
    score: 0.25,
    insideUpazila: true,
  };
}

interface NominatimHit {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  importance?: number;
}

export async function nominatimCandidates(
  school: SchoolRecord,
  settings: AppSettings,
  signal?: AbortSignal,
): Promise<GeocodeCandidate[]> {
  const upz = UPAZILA_BY_ID[school.upazila];
  const queries: string[] = [];
  const area = [school.village, school.union, upz?.name, 'Sylhet', 'Bangladesh'].filter(Boolean).join(', ');
  queries.push([school.name, area].join(', '));
  if (school.address) queries.push([school.address, upz?.name, 'Sylhet', 'Bangladesh'].filter(Boolean).join(', '));

  const [[s, w], [n, e]] = SYLHET_DISTRICT_BOUNDS;
  const out: GeocodeCandidate[] = [];
  for (const q of queries) {
    const url = new URL(settings.nominatimUrl);
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '5');
    url.searchParams.set('countrycodes', 'bd');
    url.searchParams.set('viewbox', `${w},${n},${e},${s}`);
    url.searchParams.set('bounded', '1');
    if (settings.apiKey) url.searchParams.set('key', settings.apiKey);
    const res = await fetch(url.toString(), { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Geocoder responded ${res.status}`);
    const hits = (await res.json()) as NominatimHit[];
    for (const h of hits) {
      const lat = parseFloat(h.lat);
      const lng = parseFloat(h.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const nameSim = similarity(school.name, h.display_name.split(',')[0] ?? '');
      out.push({
        id: candId('osm', lat, lng),
        label: `${h.display_name} (OSM)`,
        lat,
        lng,
        source: 'nominatim',
        score: Math.min(1, 0.45 + (h.importance ?? 0) * 0.2 + nameSim * 0.35),
        insideUpazila: upz ? pointInBounds(lat, lng, upz.bounds) : true,
      });
    }
  }
  return out;
}

// ---------- ranking ----------

export function rankCandidates(school: SchoolRecord, list: GeocodeCandidate[]): GeocodeCandidate[] {
  const upz = UPAZILA_BY_ID[school.upazila];
  const adjusted = list.map((c) => {
    let score = c.score;
    if (upz) {
      if (!c.insideUpazila) score *= 0.55;
      else if (c.source !== 'upazila-centroid') score = Math.min(1, score + 0.05);
    }
    return { ...c, score };
  });
  // de-duplicate candidates within ~120 m, keep the best
  const sorted = adjusted.sort((a, b) => b.score - a.score);
  const kept: GeocodeCandidate[] = [];
  for (const c of sorted) {
    if (!kept.some((k) => haversineKm([k.lat, k.lng], [c.lat, c.lng]) < 0.12)) kept.push(c);
  }
  return kept.slice(0, 6);
}

export async function geocodeSchool(
  school: SchoolRecord,
  settings: AppSettings,
  signal?: AbortSignal,
): Promise<GeocodeCandidate[]> {
  const all: GeocodeCandidate[] = [];
  if (settings.geocoderProvider !== 'nominatim') all.push(...gazetteerCandidates(school));
  const bestOffline = all.reduce((m, c) => Math.max(m, c.score), 0);
  // skip the network if the offline match is already convincing
  const needOnline =
    settings.geocoderProvider === 'nominatim' ||
    (settings.geocoderProvider === 'both' && bestOffline < settings.autoAcceptThreshold);
  let netError: string | undefined;
  if (needOnline) {
    try {
      all.push(...(await nominatimCandidates(school, settings, signal)));
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      netError = (err as Error).message;
    }
  }
  const fallback = centroidCandidate(school);
  if (fallback) all.push(fallback);
  const ranked = rankCandidates(school, all);
  if (ranked.length === 0 && netError) throw new Error(netError);
  return ranked;
}

// ---------- applying a result ----------

export function applyCandidate(school: SchoolRecord, c: GeocodeCandidate): SchoolRecord {
  return {
    ...school,
    lat: c.lat,
    lng: c.lng,
    geoStatus: 'verified',
    geoSource: c.source,
    geoConfidence: c.score,
    updatedAt: Date.now(),
  };
}

export function applyManualPin(school: SchoolRecord, lat: number, lng: number): SchoolRecord {
  return {
    ...school,
    lat,
    lng,
    geoStatus: 'manual',
    geoSource: 'manual',
    geoConfidence: 1,
    updatedAt: Date.now(),
  };
}

// ---------- queue ----------

export interface QueueHandlers {
  onJob: (job: GeocodeJob) => void;
  onAutoAccept: (school: SchoolRecord, candidate: GeocodeCandidate) => void;
  onProgress: (done: number, total: number) => void;
  onFinish: () => void;
}

export class GeocodingQueue {
  private ids: string[] = [];
  private running = false;
  private abort: AbortController | null = null;
  private done = 0;
  private total = 0;

  constructor(
    private getSchool: (id: string) => SchoolRecord | undefined,
    private getSettings: () => AppSettings,
    private handlers: QueueHandlers,
  ) {}

  get isRunning() {
    return this.running;
  }

  enqueue(ids: string[]) {
    const existing = new Set(this.ids);
    for (const id of ids) if (!existing.has(id)) this.ids.push(id);
    this.total = this.done + this.ids.length;
    this.handlers.onProgress(this.done, this.total);
    if (!this.running) void this.run();
  }

  stop() {
    this.abort?.abort();
    this.ids = [];
    this.running = false;
    this.done = 0;
    this.total = 0;
    this.handlers.onProgress(0, 0);
    this.handlers.onFinish();
  }

  private async run() {
    this.running = true;
    this.abort = new AbortController();
    while (this.ids.length > 0 && this.running) {
      const id = this.ids.shift() as string;
      const school = this.getSchool(id);
      if (!school) {
        this.done++;
        continue;
      }
      const settings = this.getSettings();
      this.handlers.onJob({ schoolId: id, candidates: [], state: 'running' });
      try {
        const candidates = await geocodeSchool(school, settings, this.abort.signal);
        const top = candidates[0];
        if (top && top.score >= settings.autoAcceptThreshold && top.source !== 'upazila-centroid') {
          this.handlers.onAutoAccept(school, top);
          this.handlers.onJob({ schoolId: id, candidates, state: 'done' });
        } else if (top) {
          this.handlers.onJob({ schoolId: id, candidates, state: 'done' });
        } else {
          this.handlers.onJob({ schoolId: id, candidates: [], state: 'failed', error: 'No candidates found' });
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        this.handlers.onJob({ schoolId: id, candidates: [], state: 'failed', error: (err as Error).message });
      }
      this.done++;
      this.handlers.onProgress(this.done, this.total);
      // rate limit only when an online provider is in play
      if (settings.geocoderProvider !== 'gazetteer' && this.ids.length > 0) {
        await new Promise((r) => setTimeout(r, 1000 / Math.max(0.1, settings.requestsPerSecond)));
      }
    }
    this.running = false;
    this.done = 0;
    this.total = 0;
    this.handlers.onFinish();
  }
}
