import type { GazetteerEntry, LatLng, Upazila } from '../types/gis';

// NOTE: Upazila centres and boxes are approximate (hand-placed, roughly 2-5 km
// accuracy). They are good for bounds checks, flyTo and fallback centroids,
// but are NOT survey-grade administrative boundaries. Replace `polygon` with
// official BBS/LGED boundary GeoJSON when you have it.

export const SYLHET_CENTER: LatLng = [24.8949, 91.8687];
export const SYLHET_DISTRICT_BOUNDS: [LatLng, LatLng] = [
  [24.55, 91.62],
  [25.2, 92.35],
];

function box(c: LatLng, dLat: number, dLng: number): [LatLng, LatLng] {
  return [
    [c[0] - dLat, c[1] - dLng],
    [c[0] + dLat, c[1] + dLng],
  ];
}

function rectPolygon(b: [LatLng, LatLng]): LatLng[] {
  const [[s, w], [n, e]] = b;
  return [
    [s, w],
    [s, e],
    [n, e],
    [n, w],
    [s, w],
  ];
}

function mk(
  id: string,
  name: string,
  nameBn: string,
  center: LatLng,
  dLat: number,
  dLng: number,
): Upazila {
  const bounds = box(center, dLat, dLng);
  return { id, name, nameBn, center, bounds, polygon: rectPolygon(bounds) };
}

export const UPAZILAS: Upazila[] = [
  mk('sylhet-sadar', 'Sylhet Sadar', 'সিলেট সদর', [24.8949, 91.8687], 0.07, 0.09),
  mk('balaganj', 'Balaganj', 'বালাগঞ্জ', [24.6475, 91.9955], 0.08, 0.08),
  mk('beanibazar', 'Beanibazar', 'বিয়ানীবাজার', [24.82, 92.14], 0.07, 0.09),
  mk('bishwanath', 'Bishwanath', 'বিশ্বনাথ', [24.7833, 91.7333], 0.07, 0.08),
  mk('companiganj', 'Companiganj', 'কোম্পানীগঞ্জ', [25.07, 91.78], 0.08, 0.09),
  mk('dakshin-surma', 'Dakshin Surma', 'দক্ষিণ সুরমা', [24.83, 91.85], 0.05, 0.06),
  mk('fenchuganj', 'Fenchuganj', 'ফেঞ্চুগঞ্জ', [24.7, 91.93], 0.05, 0.06),
  mk('golapganj', 'Golapganj', 'গোলাপগঞ্জ', [24.85, 92.01], 0.07, 0.08),
  mk('gowainghat', 'Gowainghat', 'গোয়াইনঘাট', [25.1, 91.95], 0.1, 0.1),
  mk('jaintiapur', 'Jaintiapur', 'জৈন্তাপুর', [25.1, 92.12], 0.08, 0.09),
  mk('kanaighat', 'Kanaighat', 'কানাইঘাট', [24.99, 92.25], 0.08, 0.09),
  mk('osmani-nagar', 'Osmani Nagar', 'ওসমানীনগর', [24.77, 91.97], 0.06, 0.07),
  mk('zakiganj', 'Zakiganj', 'জকিগঞ্জ', [24.88, 92.33], 0.07, 0.08),
];

export const UPAZILA_BY_ID: Record<string, Upazila> = Object.fromEntries(
  UPAZILAS.map((u) => [u.id, u]),
);

// Normalise an arbitrary spelling of an upazila ("Sylhet Sadar", "sadar",
// "সিলেট সদর", "Dakshin Surma") to an Upazila id.
const UPAZILA_ALIASES: Record<string, string> = {
  sylhetsadar: 'sylhet-sadar',
  sadar: 'sylhet-sadar',
  sylhet: 'sylhet-sadar',
  sylhetsadarupazila: 'sylhet-sadar',
  সিলেটসদর: 'sylhet-sadar',
  balaganj: 'balaganj',
  বালাগঞ্জ: 'balaganj',
  beanibazar: 'beanibazar',
  beani: 'beanibazar',
  bianibazar: 'beanibazar',
  বিয়ানীবাজার: 'beanibazar',
  bishwanath: 'bishwanath',
  bishwanathupazila: 'bishwanath',
  biswanath: 'bishwanath',
  বিশ্বনাথ: 'bishwanath',
  companiganj: 'companiganj',
  companigonj: 'companiganj',
  কোম্পানীগঞ্জ: 'companiganj',
  dakshinsurma: 'dakshin-surma',
  southsurma: 'dakshin-surma',
  দক্ষিণসুরমা: 'dakshin-surma',
  fenchuganj: 'fenchuganj',
  fenchugonj: 'fenchuganj',
  ফেঞ্চুগঞ্জ: 'fenchuganj',
  golapganj: 'golapganj',
  golapgonj: 'golapganj',
  গোলাপগঞ্জ: 'golapganj',
  gowainghat: 'gowainghat',
  goainghat: 'gowainghat',
  গোয়াইনঘাট: 'gowainghat',
  jaintiapur: 'jaintiapur',
  jointapur: 'jaintiapur',
  জৈন্তাপুর: 'jaintiapur',
  kanaighat: 'kanaighat',
  kanaighat1: 'kanaighat',
  কানাইঘাট: 'kanaighat',
  osmaninagar: 'osmani-nagar',
  usmaninagar: 'osmani-nagar',
  ওসমানীনগর: 'osmani-nagar',
  zakiganj: 'zakiganj',
  jakiganj: 'zakiganj',
  জকিগঞ্জ: 'zakiganj',
};

export function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/upazila|upazilla|thana/g, '')
    .replace(/[^a-z0-9ঀ-৿]/g, '');
}

export function resolveUpazilaId(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const key = normalizeKey(raw);
  if (!key) return null;
  if (UPAZILA_ALIASES[key]) return UPAZILA_ALIASES[key];
  // direct id match
  const direct = UPAZILAS.find((u) => normalizeKey(u.name) === key || u.id.replace(/-/g, '') === key);
  return direct ? direct.id : null;
}

export function pointInBounds(lat: number, lng: number, b: [LatLng, LatLng]): boolean {
  return lat >= b[0][0] && lat <= b[1][0] && lng >= b[0][1] && lng <= b[1][1];
}

export function pointInPolygon(lat: number, lng: number, poly: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    const hit = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

export function upazilaAt(lat: number, lng: number): Upazila | null {
  // Prefer the upazila whose centre is closest among those containing the point.
  let best: Upazila | null = null;
  let bestD = Infinity;
  for (const u of UPAZILAS) {
    if (!pointInBounds(lat, lng, u.bounds)) continue;
    const d = haversineKm([lat, lng], u.center);
    if (d < bestD) {
      bestD = d;
      best = u;
    }
  }
  return best;
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Offline gazetteer: well-known places used as the first-pass geocoder.
// Coordinates are approximate (a few hundred metres) and meant for ranking
// and fallback; confirm important points in the GPS Verification view.
export const GAZETTEER: GazetteerEntry[] = [
  { name: 'Zindabazar', nameBn: 'জিন্দাবাজার', upazila: 'sylhet-sadar', lat: 24.8985, lng: 91.8683, kind: 'city-area' },
  { name: 'Ambarkhana', nameBn: 'আম্বরখানা', aliases: ['Amberkhana'], upazila: 'sylhet-sadar', lat: 24.9006, lng: 91.8692, kind: 'city-area' },
  { name: 'Bandarbazar', nameBn: 'বন্দরবাজার', upazila: 'sylhet-sadar', lat: 24.8996, lng: 91.8605, kind: 'city-area' },
  { name: 'Subid Bazar', nameBn: 'সুবিদবাজার', aliases: ['Subidbazar'], upazila: 'sylhet-sadar', lat: 24.8932, lng: 91.88, kind: 'city-area' },
  { name: 'Kumarpara', nameBn: 'কুমারপাড়া', upazila: 'sylhet-sadar', lat: 24.9, lng: 91.859, kind: 'city-area' },
  { name: 'Mirboxtula', nameBn: 'মীরবক্সটুলা', aliases: ['Mirbox Tula'], upazila: 'sylhet-sadar', lat: 24.9, lng: 91.8725, kind: 'city-area' },
  { name: 'Tilagor', nameBn: 'টিলাগড়', aliases: ['Tilagarh'], upazila: 'sylhet-sadar', lat: 24.9162, lng: 91.8744, kind: 'city-area' },
  { name: 'Shibganj', nameBn: 'শিবগঞ্জ', upazila: 'sylhet-sadar', lat: 24.9102, lng: 91.8835, kind: 'city-area' },
  { name: 'Uposhohor', nameBn: 'উপশহর', aliases: ['Upashahar', 'Upashahar Sylhet'], upazila: 'sylhet-sadar', lat: 24.9088, lng: 91.8657, kind: 'city-area' },
  { name: 'Rikabi Bazar', nameBn: 'রিকাবী বাজার', aliases: ['Rikabibazar'], upazila: 'sylhet-sadar', lat: 24.8976, lng: 91.8667, kind: 'city-area' },
  { name: 'Mejortila', nameBn: 'মেজরটিলা', upazila: 'sylhet-sadar', lat: 24.9068, lng: 91.8814, kind: 'city-area' },
  { name: 'Shahjalal University of Science and Technology', nameBn: 'শাহজালাল বিজ্ঞান ও প্রযুক্তি বিশ্ববিদ্যালয়', aliases: ['SUST'], upazila: 'sylhet-sadar', lat: 24.919, lng: 91.833, kind: 'institution' },
  { name: 'MC College', nameBn: 'এমসি কলেজ', aliases: ['Murari Chand College'], upazila: 'sylhet-sadar', lat: 24.9, lng: 91.8995, kind: 'institution' },
  { name: 'Sylhet Government Pilot High School', nameBn: 'সিলেট সরকারি পাইলট উচ্চ বিদ্যালয়', upazila: 'sylhet-sadar', lat: 24.8978, lng: 91.8701, kind: 'institution' },
  { name: 'Shahi Eidgah', nameBn: 'শাহী ঈদগাহ', upazila: 'sylhet-sadar', lat: 24.9028, lng: 91.8825, kind: 'landmark' },
  { name: 'Lakkatura', nameBn: 'লাক্কাতুরা', upazila: 'sylhet-sadar', lat: 24.9229, lng: 91.8667, kind: 'city-area' },
  { name: 'Kadamtoli', nameBn: 'কদমতলী', aliases: ['Kadamtali'], upazila: 'sylhet-sadar', lat: 24.8918, lng: 91.8918, kind: 'city-area' },
  { name: 'Akhalia', nameBn: 'আখালিয়া', upazila: 'sylhet-sadar', lat: 24.9318, lng: 91.8995, kind: 'union' },
  { name: 'Mogla Bazar', nameBn: 'মোগলাবাজার', aliases: ['Moglabazar'], upazila: 'sylhet-sadar', lat: 24.9395, lng: 91.9477, kind: 'union' },
  { name: 'Surma Garden City', nameBn: 'সুরমা গার্ডেন সিটি', upazila: 'dakshin-surma', lat: 24.8675, lng: 91.848, kind: 'city-area' },
  { name: 'Kamalbazar', nameBn: 'কামালবাজার', upazila: 'dakshin-surma', lat: 24.8517, lng: 91.8545, kind: 'union' },
  { name: 'Lalabazar', nameBn: 'লালাবাজার', upazila: 'dakshin-surma', lat: 24.84, lng: 91.8267, kind: 'union' },
  { name: 'Balaganj', nameBn: 'বালাগঞ্জ', upazila: 'balaganj', lat: 24.6475, lng: 91.9955, kind: 'town' },
  { name: 'Osmaninagar', nameBn: 'ওসমানীনগর', aliases: ['Usmaninagar'], upazila: 'osmani-nagar', lat: 24.7689, lng: 91.9689, kind: 'town' },
  { name: 'Beanibazar', nameBn: 'বিয়ানীবাজার', aliases: ['Bianibazar'], upazila: 'beanibazar', lat: 24.8167, lng: 92.1667, kind: 'town' },
  { name: 'Bishwanath', nameBn: 'বিশ্বনাথ', aliases: ['Biswanath'], upazila: 'bishwanath', lat: 24.7833, lng: 91.7333, kind: 'town' },
  { name: 'Companiganj', nameBn: 'কোম্পানীগঞ্জ', upazila: 'companiganj', lat: 25.0667, lng: 91.7667, kind: 'town' },
  { name: 'Fenchuganj', nameBn: 'ফেঞ্চুগঞ্জ', upazila: 'fenchuganj', lat: 24.6917, lng: 91.9333, kind: 'town' },
  { name: 'Golapganj', nameBn: 'গোলাপগঞ্জ', upazila: 'golapganj', lat: 24.8667, lng: 92.0167, kind: 'town' },
  { name: 'Gowainghat', nameBn: 'গোয়াইনঘাট', aliases: ['Goainghat'], upazila: 'gowainghat', lat: 25.0833, lng: 91.9667, kind: 'town' },
  { name: 'Jaintiapur', nameBn: 'জৈন্তাপুর', upazila: 'jaintiapur', lat: 25.1333, lng: 92.1167, kind: 'town' },
  { name: 'Kanaighat', nameBn: 'কানাইঘাট', upazila: 'kanaighat', lat: 24.9833, lng: 92.2667, kind: 'town' },
  { name: 'Zakiganj', nameBn: 'জকিগঞ্জ', aliases: ['Jakiganj'], upazila: 'zakiganj', lat: 24.8667, lng: 92.3, kind: 'town' },
];
