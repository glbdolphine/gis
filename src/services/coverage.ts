import { UPAZILAS, haversineKm } from '../data/sylhetGeoData';
import type { NetworkNode, QualityTier, SchoolRecord } from '../types/gis';

// Derived numbers shared by Directory, Analytics and Network views.

export function hasCoords(s: SchoolRecord): s is SchoolRecord & { lat: number; lng: number } {
  return s.lat !== null && s.lng !== null;
}

export function qualityTier(s: SchoolRecord): QualityTier {
  if (!hasCoords(s)) return 'none';
  if (s.geoStatus === 'manual') return 'high';
  if (s.geoStatus === 'verified') {
    const c = s.geoConfidence ?? 0.7;
    if (c >= 0.85) return 'high';
    if (c >= 0.55) return 'medium';
    return 'low';
  }
  return 'low';
}

export function nearestPop(
  lat: number,
  lng: number,
  nodes: NetworkNode[],
): { node: NetworkNode; km: number } | null {
  let best: { node: NetworkNode; km: number } | null = null;
  for (const n of nodes) {
    if (n.kind !== 'pop' || n.status === 'offline') continue;
    const km = haversineKm([lat, lng], [n.lat, n.lng]);
    if (!best || km < best.km) best = { node: n, km };
  }
  return best;
}

/** Fill nearestPopId / nearestPopKm for every located school (pure, returns new array). */
export function withNearestPop(schools: SchoolRecord[], nodes: NetworkNode[]): SchoolRecord[] {
  return schools.map((s) => {
    if (!hasCoords(s)) return { ...s, nearestPopId: null, nearestPopKm: null };
    const np = nearestPop(s.lat, s.lng, nodes);
    return {
      ...s,
      nearestPopId: np ? np.node.id : null,
      nearestPopKm: np ? Math.round(np.km * 100) / 100 : null,
    };
  });
}

export function isCovered(s: SchoolRecord, nodes: NetworkNode[]): boolean {
  if (!hasCoords(s)) return false;
  const np = nearestPop(s.lat, s.lng, nodes);
  return !!np && np.km <= np.node.radiusKm;
}

export interface UpazilaStat {
  id: string;
  name: string;
  total: number;
  located: number;
  verified: number;
  needsReview: number;
  noGps: number;
  students: number;
  teachers: number;
  byLevel: Record<string, number>;
}

export function upazilaStats(schools: SchoolRecord[]): UpazilaStat[] {
  const map = new Map<string, UpazilaStat>();
  for (const u of UPAZILAS) {
    map.set(u.id, {
      id: u.id, name: u.name, total: 0, located: 0, verified: 0,
      needsReview: 0, noGps: 0, students: 0, teachers: 0, byLevel: {},
    });
  }
  for (const s of schools) {
    const st = map.get(s.upazila);
    if (!st) continue;
    st.total++;
    if (hasCoords(s)) st.located++;
    else st.noGps++;
    if (s.geoStatus === 'verified' || s.geoStatus === 'manual') st.verified++;
    if (s.geoStatus === 'candidates') st.needsReview++;
    st.students += s.students ?? 0;
    st.teachers += s.teachers ?? 0;
    const lvl = s.level || 'Unspecified';
    st.byLevel[lvl] = (st.byLevel[lvl] ?? 0) + 1;
  }
  return Array.from(map.values());
}

export function levelsIn(schools: SchoolRecord[]): string[] {
  return Array.from(new Set(schools.map((s) => s.level || 'Unspecified'))).sort();
}

export const DISTANCE_BUCKETS: { label: string; max: number }[] = [
  { label: '≤ 2 km', max: 2 },
  { label: '2–5 km', max: 5 },
  { label: '5–10 km', max: 10 },
  { label: '> 10 km', max: Infinity },
];

export function distanceBuckets(schools: SchoolRecord[], nodes: NetworkNode[]) {
  const counts = DISTANCE_BUCKETS.map(() => 0);
  let noGps = 0;
  let noPop = 0;
  for (const s of schools) {
    if (!hasCoords(s)) {
      noGps++;
      continue;
    }
    const np = nearestPop(s.lat, s.lng, nodes);
    if (!np) {
      noPop++;
      continue;
    }
    const idx = DISTANCE_BUCKETS.findIndex((b) => np.km <= b.max);
    counts[idx]++;
  }
  return { counts, noGps, noPop };
}
