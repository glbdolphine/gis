import { useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { AppSettings, LatLng, NetworkNode, NetworkRoute, SchoolRecord, TileLayerKey } from '../../types/gis';
import { SYLHET_CENTER, SYLHET_DISTRICT_BOUNDS, UPAZILAS } from '../../data/sylhetGeoData';
import { STATUS_LABELS, clusterIcon, draftPinIcon, popIcon, schoolIcon } from './mapIcons';

export interface FlyTarget {
  lat: number;
  lng: number;
  zoom?: number;
  nonce: number; // change to re-trigger the same location
}

interface Props {
  schools: SchoolRecord[];
  nodes?: NetworkNode[];
  routes?: NetworkRoute[];
  settings: Pick<AppSettings, 'tileLayer' | 'showHeatmap' | 'showInfluenceZones' | 'clusterPins'>;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  flyTarget?: FlyTarget | null;
  pickMode?: boolean;
  onPick?: (lat: number, lng: number) => void;
  draftPin?: LatLng | null;
  showUpazilas?: boolean;
  className?: string;
  fitToData?: boolean;
}

const TILES: Record<TileLayerKey, { url: string; attribution: string; maxZoom: number }> = {
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  },
  'carto-light': {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 20,
  },
  'carto-dark': {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 20,
  },
  'esri-satellite': {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
  },
};

const STATUS_STROKE = { active: '#2563eb', planned: '#d97706', offline: '#dc2626' } as const;

function esc(s: string | undefined | null): string {
  return (s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function schoolPopup(s: SchoolRecord): string {
  const rows = [
    s.eiin ? `EIIN ${esc(s.eiin)}` : '',
    [s.level, s.type].filter(Boolean).map(esc).join(' · '),
    [s.village, s.union, s.upazila].filter(Boolean).map(esc).join(', '),
    s.students ? `${s.students} students` : '',
  ].filter(Boolean);
  return `
    <div class="gis-popup">
      <div class="gis-popup-title">${esc(s.name)}</div>
      ${s.nameBn ? `<div class="gis-popup-bn">${esc(s.nameBn)}</div>` : ''}
      ${rows.map((r) => `<div class="gis-popup-row">${r}</div>`).join('')}
      <div class="gis-popup-row gis-popup-status">${STATUS_LABELS[s.geoStatus]}${
        s.lat !== null && s.lng !== null ? ` · ${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}` : ''
      }</div>
    </div>`;
}

export default function GisMap({
  schools,
  nodes = [],
  routes = [],
  settings,
  selectedId,
  onSelect,
  flyTarget,
  pickMode = false,
  onPick,
  draftPin,
  showUpazilas = false,
  className = '',
  fitToData = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const layers = useRef<Record<'upazila' | 'schools' | 'heat' | 'network' | 'draft', L.LayerGroup | null>>({
    upazila: null,
    schools: null,
    heat: null,
    network: null,
    draft: null,
  });
  const [zoom, setZoom] = useState(10);
  const [ready, setReady] = useState(false);

  // keep latest callbacks without re-binding map listeners
  const onSelectRef = useRef(onSelect);
  const onPickRef = useRef(onPick);
  const pickModeRef = useRef(pickMode);
  onSelectRef.current = onSelect;
  onPickRef.current = onPick;
  pickModeRef.current = pickMode;

  // ---- init ----
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: SYLHET_CENTER,
      zoom: 10,
      zoomControl: true,
      preferCanvas: true,
      maxBounds: L.latLngBounds(
        [SYLHET_DISTRICT_BOUNDS[0][0] - 0.6, SYLHET_DISTRICT_BOUNDS[0][1] - 0.6],
        [SYLHET_DISTRICT_BOUNDS[1][0] + 0.6, SYLHET_DISTRICT_BOUNDS[1][1] + 0.6],
      ),
      maxBoundsViscosity: 0.6,
    });
    mapRef.current = map;
    (Object.keys(layers.current) as (keyof typeof layers.current)[]).forEach((k) => {
      layers.current[k] = L.layerGroup().addTo(map);
    });
    map.on('zoomend', () => setZoom(map.getZoom()));
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (pickModeRef.current) onPickRef.current?.(e.latlng.lat, e.latlng.lng);
    });
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(containerRef.current);
    setReady(true);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // ---- tiles ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    tileRef.current?.remove();
    const t = TILES[settings.tileLayer] ?? TILES.osm;
    tileRef.current = L.tileLayer(t.url, {
      attribution: t.attribution,
      maxZoom: t.maxZoom,
      subdomains: 'abc',
    }).addTo(map);
    tileRef.current.bringToBack();
  }, [settings.tileLayer, ready]);

  // ---- upazila outlines ----
  useEffect(() => {
    const g = layers.current.upazila;
    if (!g || !ready) return;
    g.clearLayers();
    if (!showUpazilas) return;
    for (const u of UPAZILAS) {
      L.polygon(u.polygon, {
        color: '#0f766e',
        weight: 1,
        dashArray: '4 4',
        fillColor: '#14b8a6',
        fillOpacity: 0.03,
        interactive: false,
      }).addTo(g);
      L.marker(u.center, {
        interactive: false,
        icon: L.divIcon({ className: 'gis-upazila-label', html: esc(u.name), iconSize: [100, 16], iconAnchor: [50, 8] }),
      }).addTo(g);
    }
  }, [showUpazilas, ready]);

  // ---- schools: pins, clusters, heat ----
  useEffect(() => {
    const map = mapRef.current;
    const g = layers.current.schools;
    const heat = layers.current.heat;
    if (!map || !g || !heat || !ready) return;
    g.clearLayers();
    heat.clearLayers();

    const located = schools.filter((s) => s.lat !== null && s.lng !== null);

    if (settings.showHeatmap) {
      for (const s of located) {
        L.circleMarker([s.lat as number, s.lng as number], {
          radius: 24,
          stroke: false,
          fillColor: '#ef4444',
          fillOpacity: 0.1,
          interactive: false,
        }).addTo(heat);
      }
    }

    const addPin = (s: SchoolRecord) => {
      const sel = s.id === selectedId;
      const m = L.marker([s.lat as number, s.lng as number], {
        icon: schoolIcon(s.geoStatus, sel),
        zIndexOffset: sel ? 1000 : 0,
        title: s.name,
      });
      m.bindPopup(schoolPopup(s), { closeButton: true, offset: [0, 0] });
      m.on('click', () => onSelectRef.current?.(s.id));
      m.addTo(g);
      if (sel) m.openPopup();
    };

    const doCluster = settings.clusterPins && zoom < 15 && located.length > 1;
    if (!doCluster) {
      located.forEach(addPin);
      return;
    }

    const cell = 56;
    const buckets = new Map<string, SchoolRecord[]>();
    for (const s of located) {
      const p = map.project([s.lat as number, s.lng as number], zoom);
      const key = `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`;
      const arr = buckets.get(key);
      if (arr) arr.push(s);
      else buckets.set(key, [s]);
    }
    buckets.forEach((group) => {
      // keep the selected school as its own pin so its popup stays reachable
      const rest = group.filter((s) => s.id !== selectedId);
      group.filter((s) => s.id === selectedId).forEach(addPin);
      if (rest.length === 1) {
        addPin(rest[0]);
      } else if (rest.length > 1) {
        const lat = rest.reduce((a, s) => a + (s.lat as number), 0) / rest.length;
        const lng = rest.reduce((a, s) => a + (s.lng as number), 0) / rest.length;
        const hasBad = rest.some((s) => s.geoStatus !== 'verified' && s.geoStatus !== 'manual');
        const m = L.marker([lat, lng], { icon: clusterIcon(rest.length, hasBad) });
        m.on('click', () => {
          const b = L.latLngBounds(rest.map((s) => [s.lat as number, s.lng as number] as [number, number]));
          map.flyToBounds(b.pad(0.25), { maxZoom: 16, duration: 0.6 });
        });
        m.addTo(g);
      }
    });
  }, [schools, selectedId, settings.clusterPins, settings.showHeatmap, zoom, ready]);

  // ---- network: nodes, routes, influence zones ----
  useEffect(() => {
    const g = layers.current.network;
    if (!g || !ready) return;
    g.clearLayers();
    for (const r of routes) {
      if (r.path.length < 2) continue;
      L.polyline(r.path, {
        color: STATUS_STROKE[r.status],
        weight: 4,
        opacity: 0.85,
        dashArray: r.status === 'active' ? undefined : r.status === 'planned' ? '8 8' : '2 8',
      })
        .bindTooltip(`${esc(r.name)} · ${r.lengthKm.toFixed(1)} km`, { sticky: true })
        .addTo(g);
    }
    for (const n of nodes) {
      if (settings.showInfluenceZones && n.kind === 'pop') {
        L.circle([n.lat, n.lng], {
          radius: n.radiusKm * 1000,
          color: STATUS_STROKE[n.status],
          weight: 1.5,
          dashArray: '6 6',
          fillColor: STATUS_STROKE[n.status],
          fillOpacity: 0.07,
          interactive: false,
        }).addTo(g);
      }
      L.marker([n.lat, n.lng], { icon: popIcon(n.kind, n.status), zIndexOffset: 500 })
        .bindPopup(
          `<div class="gis-popup"><div class="gis-popup-title">${esc(n.name)}</div>
           <div class="gis-popup-row">${n.kind === 'pop' ? 'POP' : 'Cluster'} · ${esc(n.status)}</div>
           ${n.capacityGbps ? `<div class="gis-popup-row">${n.capacityGbps} Gbps</div>` : ''}
           <div class="gis-popup-row">Radius ${n.radiusKm} km</div></div>`,
        )
        .addTo(g);
    }
  }, [nodes, routes, settings.showInfluenceZones, ready]);

  // ---- draft pin ----
  useEffect(() => {
    const g = layers.current.draft;
    if (!g || !ready) return;
    g.clearLayers();
    if (draftPin) L.marker(draftPin, { icon: draftPinIcon(), zIndexOffset: 2000 }).addTo(g);
  }, [draftPin, ready]);

  // ---- flyTo ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !flyTarget) return;
    map.flyTo([flyTarget.lat, flyTarget.lng], flyTarget.zoom ?? 16, { duration: 1.1 });
    // depend on primitives: callers often build a fresh object every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTarget?.nonce, flyTarget?.lat, flyTarget?.lng, flyTarget?.zoom, ready]);

  // ---- fit to data once records arrive ----
  const fitted = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !fitToData || fitted.current) return;
    const pts = schools
      .filter((s) => s.lat !== null && s.lng !== null)
      .map((s) => [s.lat as number, s.lng as number] as [number, number]);
    if (pts.length === 0) return;
    map.fitBounds(L.latLngBounds(pts).pad(0.1), { maxZoom: 13 });
    fitted.current = true;
  }, [schools, fitToData, ready]);

  // ---- crosshair while picking ----
  useEffect(() => {
    if (containerRef.current) containerRef.current.style.cursor = pickMode ? 'crosshair' : '';
  }, [pickMode]);

  return <div ref={containerRef} className={`gis-map ${className}`} style={{ minHeight: 240 }} />;
}
