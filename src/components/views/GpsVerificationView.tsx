import { useMemo, useState } from 'react';
import { Check, Crosshair, Loader2, MapPinned, Play, RotateCcw, Square } from 'lucide-react';
import type { AppApi, GeocodeCandidate, LatLng, SchoolRecord } from '../../types/gis';
import { UPAZILA_BY_ID, SYLHET_DISTRICT_BOUNDS, pointInBounds } from '../../data/sylhetGeoData';
import GisMap from '../map/GisMap';
import { Bar, Card, EmptyState, PageHeader, StatusBadge, btn } from '../ui';

const NEEDS_WORK = new Set(['unverified', 'failed', 'candidates', 'pending']);

export default function GpsVerificationView({ api }: { api: AppApi }) {
  const { schools, jobs, queueProgress } = api;
  const [filter, setFilter] = useState<'todo' | 'review' | 'failed'>('todo');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LatLng | null>(null);
  const [picking, setPicking] = useState(false);
  const [msg, setMsg] = useState('');

  const todo = useMemo(() => schools.filter((s) => NEEDS_WORK.has(s.geoStatus)), [schools]);
  const list = useMemo(() => {
    if (filter === 'review') return todo.filter((s) => s.geoStatus === 'candidates' || (jobs[s.id]?.candidates.length ?? 0) > 0);
    if (filter === 'failed') return todo.filter((s) => s.geoStatus === 'failed');
    return todo;
  }, [todo, filter, jobs]);

  const active = schools.find((s) => s.id === activeId) ?? null;
  const job = active ? jobs[active.id] : undefined;
  const running = queueProgress.total > 0;
  const unqueued = todo.filter((s) => s.geoStatus === 'unverified' || s.geoStatus === 'failed');

  const choose = (s: SchoolRecord) => {
    setActiveId(s.id);
    setDraft(null);
    setPicking(false);
    setMsg('');
    api.setSelectedId(s.id);
  };

  const accept = async (c: GeocodeCandidate) => {
    if (!active) return;
    await api.acceptCandidate(active.id, c);
    setMsg(`Saved "${active.name}" at ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}.`);
    setActiveId(null);
    setDraft(null);
  };

  const saveManual = async () => {
    if (!active || !draft) return;
    if (!pointInBounds(draft[0], draft[1], SYLHET_DISTRICT_BOUNDS)) {
      setMsg('That point is outside Sylhet district. Pick again.');
      return;
    }
    await api.setManualPin(active.id, draft[0], draft[1]);
    setMsg(`Saved manual pin for "${active.name}".`);
    setActiveId(null);
    setDraft(null);
    setPicking(false);
  };

  return (
    <>
      <PageHeader
        title="GPS verification"
        subtitle="Geocode schools, review candidate points, or drop a pin by hand."
        actions={
          running ? (
            <button className={btn.danger} onClick={api.stopGeocode}>
              <Square size={13} /> Stop
            </button>
          ) : (
            <button
              className={btn.primary}
              disabled={unqueued.length === 0}
              onClick={() => api.queueGeocode(unqueued.map((s) => s.id))}
            >
              <Play size={13} /> Geocode {unqueued.length.toLocaleString()} unplaced
            </button>
          )
        }
      />

      {running && (
        <div className="mb-3 rounded-md border border-slate-200 bg-white p-3">
          <div className="mb-1 flex justify-between text-xs text-slate-600">
            <span className="inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Geocoding…</span>
            <span>{queueProgress.done} / {queueProgress.total}</span>
          </div>
          <Bar value={queueProgress.done} max={queueProgress.total} />
        </div>
      )}
      {msg && <div className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</div>}

      {todo.length === 0 ? (
        <EmptyState
          title={schools.length === 0 ? 'No schools to verify' : 'Every school has a verified point'}
          body={schools.length === 0 ? 'Import schools first.' : 'Nothing is waiting for review.'}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card
            className="lg:col-span-2"
            padded={false}
            title={`Queue (${list.length})`}
            right={
              <select
                className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs"
                value={filter}
                onChange={(e) => setFilter(e.target.value as 'todo' | 'review' | 'failed')}
              >
                <option value="todo">All unplaced</option>
                <option value="review">Has candidates</option>
                <option value="failed">Not found</option>
              </select>
            }
          >
            <ul className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto">
              {list.slice(0, 300).map((s) => {
                const j = jobs[s.id];
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => choose(s)}
                      className={`flex w-full items-center justify-between gap-2 px-4 py-2 text-left hover:bg-slate-50 ${s.id === activeId ? 'bg-emerald-50' : ''}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-800">{s.name}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {UPAZILA_BY_ID[s.upazila]?.name ?? s.upazila}
                          {s.village ? ` · ${s.village}` : ''}
                          {j?.state === 'done' && j.candidates.length > 0 && ` · ${j.candidates.length} candidate${j.candidates.length > 1 ? 's' : ''}`}
                          {j?.state === 'failed' && ` · ${j.error ?? 'failed'}`}
                        </span>
                      </span>
                      {j?.state === 'running' ? <Loader2 size={14} className="animate-spin text-slate-400" /> : <StatusBadge status={s.geoStatus} />}
                    </button>
                  </li>
                );
              })}
            </ul>
            {list.length > 300 && <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Showing first 300.</div>}
          </Card>

          <div className="space-y-4 lg:col-span-3">
            <Card title={active ? active.name : 'Select a school'}>
              {!active ? (
                <p className="text-sm text-slate-500">Pick a school from the queue to see candidate locations.</p>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">
                    {[active.village, active.union, UPAZILA_BY_ID[active.upazila]?.name].filter(Boolean).join(', ')}
                    {active.address ? ` · ${active.address}` : ''}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <button className={btn.secondary} onClick={() => api.queueGeocode([active.id])} disabled={job?.state === 'running'}>
                      <RotateCcw size={13} /> {job ? 'Re-run geocoder' : 'Run geocoder'}
                    </button>
                    <button
                      className={picking ? btn.primary : btn.secondary}
                      onClick={() => setPicking(!picking)}
                    >
                      <Crosshair size={13} /> {picking ? 'Click the map…' : 'Drop pin manually'}
                    </button>
                    {draft && (
                      <button className={btn.primary} onClick={saveManual}>
                        <Check size={13} /> Save pin ({draft[0].toFixed(5)}, {draft[1].toFixed(5)})
                      </button>
                    )}
                  </div>

                  {job?.candidates.length ? (
                    <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                      {job.candidates.map((c) => (
                        <li
                          key={c.id}
                          className="flex items-center justify-between gap-2 px-3 py-2"
                          onMouseEnter={() => !picking && setDraft([c.lat, c.lng])}
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm text-slate-800">{c.label}</div>
                            <div className="text-xs text-slate-500">
                              {Math.round(c.score * 100)}% match
                              {!c.insideUpazila && ' · outside this upazila'}
                              {' · '}{c.lat.toFixed(5)}, {c.lng.toFixed(5)}
                            </div>
                          </div>
                          <button className={btn.primary} onClick={() => accept(c)}>
                            <MapPinned size={13} /> Use
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : job?.state === 'failed' ? (
                    <p className="text-sm text-red-700">{job.error ?? 'No candidates found.'} Try dropping a pin by hand.</p>
                  ) : (
                    <p className="text-sm text-slate-500">No candidates yet. Run the geocoder or drop a pin.</p>
                  )}
                </div>
              )}
            </Card>

            <Card padded={false} title="Map">
              <GisMap
                className="h-[360px] w-full rounded-b-lg"
                schools={active ? schools.filter((s) => s.id === active.id || s.lat !== null) : schools}
                settings={{ ...api.settings, clusterPins: false, showHeatmap: false }}
                selectedId={activeId}
                flyTarget={
                  draft
                    ? { lat: draft[0], lng: draft[1], zoom: 15, nonce: Math.round(draft[0] * 1e5) + Math.round(draft[1] * 1e5) }
                    : active
                    ? { ...(UPAZILA_BY_ID[active.upazila] ? { lat: UPAZILA_BY_ID[active.upazila].center[0], lng: UPAZILA_BY_ID[active.upazila].center[1] } : { lat: 24.8949, lng: 91.8687 }), zoom: 12, nonce: active.id.length * 1000 + active.id.charCodeAt(active.id.length - 1) }
                    : null
                }
                pickMode={picking}
                onPick={(lat, lng) => {
                  setDraft([lat, lng]);
                  setPicking(false);
                }}
                draftPin={draft}
                showUpazilas
              />
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
