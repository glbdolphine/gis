// Core TypeScript interfaces for the Sylhet School GIS.

export type LatLng = [number, number]; // [lat, lng]

export type GeoStatus =
  | 'unverified' // no coordinates yet
  | 'pending' // queued for geocoding
  | 'candidates' // geocoder returned candidates awaiting review
  | 'verified' // coordinates confirmed (auto or manual)
  | 'manual' // pin dropped by hand
  | 'failed'; // geocoder found nothing

export type QualityTier = 'high' | 'medium' | 'low' | 'none';

export interface SchoolRecord {
  id: string;
  name: string;
  nameBn?: string;
  eiin?: string; // Education Institution Identification Number
  level?: string; // Primary, Secondary, College, Madrasa...
  type?: string; // Government, Non-government, Private...
  upazila: string; // matches Upazila.id
  union?: string;
  village?: string;
  address?: string;
  phone?: string;
  students?: number;
  teachers?: number;
  lat: number | null;
  lng: number | null;
  geoStatus: GeoStatus;
  geoSource?: string; // gazetteer | nominatim | manual | import
  geoConfidence?: number; // 0..1
  notes?: string;
  nearestPopId?: string | null;
  nearestPopKm?: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface Upazila {
  id: string;
  name: string;
  nameBn: string;
  center: LatLng;
  // [[south, west], [north, east]]
  bounds: [LatLng, LatLng];
  polygon: LatLng[];
}

export interface GazetteerEntry {
  name: string;
  nameBn?: string;
  aliases?: string[];
  upazila: string;
  lat: number;
  lng: number;
  kind: 'city-area' | 'town' | 'union' | 'landmark' | 'institution';
}

export type NodeKind = 'pop' | 'cluster';

export interface NetworkNode {
  id: string;
  name: string;
  kind: NodeKind;
  lat: number;
  lng: number;
  upazila?: string;
  capacityGbps?: number;
  radiusKm: number; // influence zone
  status: 'active' | 'planned' | 'offline';
  notes?: string;
}

export interface NetworkRoute {
  id: string;
  name: string;
  fromNodeId: string;
  toNodeId: string;
  path: LatLng[];
  lengthKm: number;
  cores?: number;
  status: 'active' | 'planned' | 'offline';
  owner?: string;
  notes?: string;
}

export type TileLayerKey = 'osm' | 'carto-light' | 'carto-dark' | 'esri-satellite';

export interface AppSettings {
  geocoderProvider: 'gazetteer' | 'nominatim' | 'both';
  nominatimUrl: string;
  apiKey: string; // optional key for a commercial geocoder
  requestsPerSecond: number; // rate limit for online geocoding
  autoAcceptThreshold: number; // 0..1, auto-verify at or above
  tileLayer: TileLayerKey;
  defaultRadiusKm: number;
  showHeatmap: boolean;
  showInfluenceZones: boolean;
  clusterPins: boolean;
  language: 'en' | 'bn';
}

export const DEFAULT_SETTINGS: AppSettings = {
  geocoderProvider: 'both',
  nominatimUrl: 'https://nominatim.openstreetmap.org/search',
  apiKey: '',
  requestsPerSecond: 1,
  autoAcceptThreshold: 0.85,
  tileLayer: 'osm',
  defaultRadiusKm: 5,
  showHeatmap: false,
  showInfluenceZones: true,
  clusterPins: true,
  language: 'en',
};

export interface GeocodeCandidate {
  id: string;
  label: string;
  lat: number;
  lng: number;
  source: 'gazetteer' | 'nominatim' | 'upazila-centroid';
  score: number; // 0..1 after ranking
  insideUpazila: boolean;
}

export interface GeocodeJob {
  schoolId: string;
  candidates: GeocodeCandidate[];
  state: 'queued' | 'running' | 'done' | 'failed';
  error?: string;
}

export interface ColumnMapping {
  name?: string;
  nameBn?: string;
  eiin?: string;
  level?: string;
  type?: string;
  upazila?: string;
  union?: string;
  village?: string;
  address?: string;
  phone?: string;
  students?: string;
  teachers?: string;
  lat?: string;
  lng?: string;
  notes?: string;
}

export type ViewId =
  | 'overview'
  | 'coverage'
  | 'directory'
  | 'gps'
  | 'analytics'
  | 'network'
  | 'import'
  | 'settings';

// Everything a view needs from the App shell (state + actions).
export interface AppApi {
  schools: SchoolRecord[];
  nodes: NetworkNode[];
  routes: NetworkRoute[];
  settings: AppSettings;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;

  upsertSchool: (s: SchoolRecord) => Promise<void>;
  upsertSchools: (list: SchoolRecord[]) => Promise<void>;
  removeSchools: (ids: string[]) => Promise<void>;
  upsertNode: (n: NetworkNode) => Promise<void>;
  removeNode: (id: string) => Promise<void>;
  upsertRoute: (r: NetworkRoute) => Promise<void>;
  removeRoute: (id: string) => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  importSchools: (list: SchoolRecord[], mode: 'append' | 'replace') => Promise<void>;
  restoreBackup: (b: DbBackup) => Promise<void>;
  resetData: () => Promise<void>;

  navigate: (v: ViewId) => void;
  goToSchool: (id: string) => void; // switch to the map and fly to the school
  flyTarget: { lat: number; lng: number; zoom?: number; nonce: number } | null;
  flyTo: (lat: number, lng: number, zoom?: number) => void;

  // geocoding
  jobs: Record<string, GeocodeJob>;
  queueProgress: { done: number; total: number };
  queueGeocode: (ids: string[]) => void;
  stopGeocode: () => void;
  acceptCandidate: (schoolId: string, c: GeocodeCandidate) => Promise<void>;
  setManualPin: (schoolId: string, lat: number, lng: number) => Promise<void>;
  clearPin: (schoolId: string) => Promise<void>;
}

export interface DbBackup {
  version: 1;
  exportedAt: number;
  schools: SchoolRecord[];
  nodes: NetworkNode[];
  routes: NetworkRoute[];
  settings: AppSettings;
}
