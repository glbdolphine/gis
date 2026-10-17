import { useEffect, useState } from 'react';
import type { AppApi, AppSettings, TileLayerKey } from '../../types/gis';
import { DEFAULT_SETTINGS } from '../../types/gis';
import { Card, Field, PageHeader, btn, inputCls } from '../ui';

const TILE_LABELS: Record<TileLayerKey, string> = {
  osm: 'OpenStreetMap (street)',
  'carto-light': 'CARTO Light',
  'carto-dark': 'CARTO Dark',
  'esri-satellite': 'Esri World Imagery (satellite)',
};

export default function SettingsView({ api }: { api: AppApi }) {
  const [s, setS] = useState<AppSettings>(api.settings);
  const [saved, setSaved] = useState(false);

  useEffect(() => setS(api.settings), [api.settings]);

  const dirty = JSON.stringify(s) !== JSON.stringify(api.settings);
  const patch = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => {
    setSaved(false);
    setS({ ...s, [k]: v });
  };
  const numeric = (raw: string, fallback: number, min: number, max: number) => {
    const n = parseFloat(raw);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };

  const save = async () => {
    await api.updateSettings(s);
    setSaved(true);
  };

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Stored in this browser only"
        actions={
          <>
            <button className={btn.secondary} onClick={() => { setS(DEFAULT_SETTINGS); setSaved(false); }}>Reset to defaults</button>
            <button className={btn.primary} disabled={!dirty} onClick={save}>Save changes</button>
          </>
        }
      />
      {saved && <div className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Settings saved.</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Geocoding">
          <div className="space-y-3">
            <Field label="Provider" hint="The offline gazetteer is instant and private. Online lookup sends school names and areas to the service below.">
              <select className={inputCls} value={s.geocoderProvider} onChange={(e) => patch('geocoderProvider', e.target.value as AppSettings['geocoderProvider'])}>
                <option value="both">Gazetteer first, then online</option>
                <option value="gazetteer">Offline gazetteer only</option>
                <option value="nominatim">Online only</option>
              </select>
            </Field>
            <Field label="Search endpoint (Nominatim-compatible)">
              <input className={inputCls} value={s.nominatimUrl} onChange={(e) => patch('nominatimUrl', e.target.value)} />
            </Field>
            <Field label="API key (optional)" hint="Only needed for a hosted geocoder that requires one. Stored unencrypted in this browser.">
              <input className={inputCls} type="password" autoComplete="off" value={s.apiKey} onChange={(e) => patch('apiKey', e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Requests per second" hint="The public OSM server allows at most 1.">
                <input className={inputCls} type="number" step="0.5" min={0.1} max={10} value={s.requestsPerSecond} onChange={(e) => patch('requestsPerSecond', numeric(e.target.value, 1, 0.1, 10))} />
              </Field>
              <Field label="Auto-accept at ≥" hint="Match score 0–1. Lower means less review.">
                <input className={inputCls} type="number" step="0.05" min={0.5} max={1} value={s.autoAcceptThreshold} onChange={(e) => patch('autoAcceptThreshold', numeric(e.target.value, 0.85, 0.5, 1))} />
              </Field>
            </div>
          </div>
        </Card>

        <Card title="Map">
          <div className="space-y-3">
            <Field label="Base map">
              <select className={inputCls} value={s.tileLayer} onChange={(e) => patch('tileLayer', e.target.value as TileLayerKey)}>
                {(Object.keys(TILE_LABELS) as TileLayerKey[]).map((k) => (
                  <option key={k} value={k}>{TILE_LABELS[k]}</option>
                ))}
              </select>
            </Field>
            <Field label="Default POP influence radius (km)">
              <input className={inputCls} type="number" step="0.5" min={0.5} max={50} value={s.defaultRadiusKm} onChange={(e) => patch('defaultRadiusKm', numeric(e.target.value, 5, 0.5, 50))} />
            </Field>
            {([
              ['clusterPins', 'Group nearby pins into clusters'],
              ['showHeatmap', 'Show density heatmap'],
              ['showInfluenceZones', 'Show POP influence zones'],
            ] as const).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="accent-emerald-600" checked={s[k]} onChange={(e) => patch(k, e.target.checked)} />
                {label}
              </label>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
