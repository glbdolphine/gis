import * as L from 'leaflet';
import type { GeoStatus, NetworkNode } from '../../types/gis';

// Custom SVG vector markers. No image assets, so they work offline and stay
// crisp at any pixel density.

export const STATUS_COLORS: Record<GeoStatus, string> = {
  verified: '#059669',
  manual: '#2563eb',
  candidates: '#d97706',
  pending: '#d97706',
  unverified: '#6b7280',
  failed: '#dc2626',
};

export const STATUS_LABELS: Record<GeoStatus, string> = {
  verified: 'Verified',
  manual: 'Manual pin',
  candidates: 'Needs review',
  pending: 'Queued',
  unverified: 'No GPS',
  failed: 'Not found',
};

export function schoolIcon(status: GeoStatus, selected = false): L.DivIcon {
  const color = STATUS_COLORS[status];
  const size = selected ? 38 : 28;
  const ring = selected ? `<circle cx="14" cy="12" r="13" fill="none" stroke="${color}" stroke-width="2" opacity="0.35"/>` : '';
  const html = `
    <svg width="${size}" height="${Math.round(size * 1.25)}" viewBox="0 0 28 35" xmlns="http://www.w3.org/2000/svg">
      ${ring}
      <path d="M14 34C14 34 2 21.5 2 12.5C2 6 7.4 1 14 1s12 5 12 11.5C26 21.5 14 34 14 34z"
            fill="${color}" stroke="#ffffff" stroke-width="2"/>
      <path d="M14 6.5 6.5 10.2 14 14l5.4-2.7v4.2h1.6v-5.2L14 6.5zm-4.6 6.9v2.6c0 1.2 2 2.2 4.6 2.2s4.6-1 4.6-2.2v-2.6L14 15.6l-4.6-2.2z"
            fill="#ffffff"/>
    </svg>`;
  return L.divIcon({
    className: 'gis-marker',
    html,
    iconSize: [size, Math.round(size * 1.25)],
    iconAnchor: [size / 2, Math.round(size * 1.25)],
    popupAnchor: [0, -Math.round(size * 1.1)],
  });
}

export function clusterIcon(count: number, hasUnverified = false): L.DivIcon {
  const d = count < 10 ? 36 : count < 100 ? 44 : 54;
  const fill = hasUnverified ? '#b45309' : '#047857';
  const html = `
    <div style="width:${d}px;height:${d}px;border-radius:9999px;background:${fill}33;display:flex;align-items:center;justify-content:center;">
      <div style="width:${d - 10}px;height:${d - 10}px;border-radius:9999px;background:${fill};color:#fff;
                  font:600 ${count < 100 ? 13 : 12}px Inter,system-ui,sans-serif;display:flex;align-items:center;
                  justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);">${count}</div>
    </div>`;
  return L.divIcon({
    className: 'gis-marker',
    html,
    iconSize: [d, d],
    iconAnchor: [d / 2, d / 2],
  });
}

const NODE_COLORS: Record<NetworkNode['status'], string> = {
  active: '#2563eb',
  planned: '#d97706',
  offline: '#dc2626',
};

export function popIcon(kind: NetworkNode['kind'], status: NetworkNode['status']): L.DivIcon {
  const color = NODE_COLORS[status];
  const inner =
    kind === 'pop'
      ? `<rect x="9" y="9" width="14" height="14" rx="2" fill="#fff"/>
         <path d="M16 11v10M11 16h10" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>`
      : `<circle cx="16" cy="16" r="6" fill="#fff"/><circle cx="16" cy="16" r="2.4" fill="${color}"/>`;
  const html = `
    <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 1.5 29 9v14L16 30.5 3 23V9L16 1.5z" fill="${color}" stroke="#fff" stroke-width="2"/>
      ${inner}
    </svg>`;
  return L.divIcon({
    className: 'gis-marker',
    html,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -14],
  });
}

export function draftPinIcon(): L.DivIcon {
  const html = `
    <svg width="34" height="44" viewBox="0 0 28 35" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 34C14 34 2 21.5 2 12.5C2 6 7.4 1 14 1s12 5 12 11.5C26 21.5 14 34 14 34z"
            fill="#7c3aed" stroke="#fff" stroke-width="2"/>
      <circle cx="14" cy="12.5" r="4.5" fill="#fff"/>
    </svg>`;
  return L.divIcon({
    className: 'gis-marker gis-marker-draft',
    html,
    iconSize: [34, 44],
    iconAnchor: [17, 44],
  });
}
