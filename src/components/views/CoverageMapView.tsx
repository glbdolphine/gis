import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { AppApi, GeoStatus, TileLayerKey } from '../../types/gis';
import { UPAZILAS } from '../../data/sylhetGeoData';
import GisMap from '../map/GisMap';
import { STATUS_COLORS } from '../map/mapIcons';
import { hasCoords } from '../../services/coverage';
import { inputCls } from '../ui';

const TILE_OPTIONS: { key: TileLayerKey; label: string }[] = [
  { key: 'osm', label: 'Street' },
  { key: 'carto-light', label: 'Light' },
  { key: 'carto-dark', label: 'Dark' },
  { key: 'esri-satellite', label: 'Satellite' },
];

export default function CoverageMapView({ api }: { api: AppApi }) {
  const { schools, settings } = api;
  const [q, setQ] = useState('');
  const [upazila, setUpazila] = useState('');
  const [status, setStatus] = useState<GeoStatus | ''>('');
  const [showUpazilas, setShowUpazilas] = useState(true);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return schools.filter((s) => {
      if (upazila && s.upazila !== upazila) return false;
      if (status && s.geoStatus !== status) return false;
      if (!needle) return true;
      return (
        s.name.toLowerCase().includes(needle) ||
        (s.nameBn ?? '').includes(q.trim()) ||
        (s.eiin ?? '').includes(needle) ||
        (s.village ?? '').toLowerCase().includes(needle)
      );
    });
  }, [schools, q, upazila, status]);

  const listed = filtered.slice(0, 200);
  const upzName = (id: string) => UPAZILAS.find((u) => u.id === id)?.name ?? id;

  const Toggle = ({
    label,
    on,
    onChange,
  }: {
    label: string;
    on: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-700">
      <input type="checkbox" className="accent-emerald-600" checked={on} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-80 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="space-y-2 border-b border-slate-200 p-3">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              className={`${inputCls} pl-8`}
              placeholder="Search name, EIIN, village…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select className={inputCls} value={upazila} onChange={(e) => setUpazila(e.target.value)}>
              <option value="">All upazilas</option>
              {UPAZILAS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as GeoStatus | '')}>
              <option value="">Any GPS status</option>
              <option value="verified">Verified</option>
              <option value="manual">Manual pin</option>
              <option value="candidates">Needs review</option>
              <option value="unverified">No GPS</option>
              <option value="failed">Not found</option>
            </select>
          </div>
          <div className="text-xs text-slate-500">
            {filtered.length.toLocaleString()} school{filtered.length === 1 ? '' : 's'}
            {filtered.length > listed.length && ` · showing first ${listed.length}`}
          </div>
        </div>

        <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
          {listed.map((s) => {
            const located = hasCoords(s);
            const active = s.id === api.selectedId;
            return (
              <li key={s.id}>
                <button
                  className={`flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-slate-50 ${active ? 'bg-emerald-50' : ''}`}
                  onClick={() => {
                    api.setSelectedId(s.id);
                    if (hasCoords(s)) api.flyTo(s.lat, s.lng, 16);
                  }}
                >
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: STATUS_COLORS[s.geoStatus] }}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800">{s.name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {upzName(s.upazila)}
                      {s.union ? ` · ${s.union}` : ''}
                      {!located && ' · no GPS'}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {listed.length === 0 && <li className="p-6 text-center text-sm text-slate-500">No schools match.</li>}
        </ul>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 bg-white px-3 py-2">
          <div className="flex items-center gap-1">
            {TILE_OPTIONS.map((t) => (
              <button
                key={t.key}
                onClick={() => api.updateSettings({ tileLayer: t.key })}
                className={`rounded px-2 py-1 text-xs font-medium ${
                  settings.tileLayer === t.key ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Toggle label="Clusters" on={settings.clusterPins} onChange={(v) => api.updateSettings({ clusterPins: v })} />
          <Toggle label="Heatmap" on={settings.showHeatmap} onChange={(v) => api.updateSettings({ showHeatmap: v })} />
          <Toggle
            label="POP zones"
            on={settings.showInfluenceZones}
            onChange={(v) => api.updateSettings({ showInfluenceZones: v })}
          />
          <Toggle label="Upazilas" on={showUpazilas} onChange={setShowUpazilas} />
        </div>
        <GisMap
          className="min-h-0 w-full flex-1"
          schools={filtered}
          nodes={api.nodes}
          routes={api.routes}
          settings={settings}
          selectedId={api.selectedId}
          onSelect={api.setSelectedId}
          flyTarget={api.flyTarget}
          showUpazilas={showUpazilas}
          fitToData
        />
      </div>
    </div>
  );
}
