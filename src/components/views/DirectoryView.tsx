import { useMemo, useState, type ChangeEvent } from 'react';
import { ArrowDown, ArrowUp, Crosshair, Download, MapPin, Plus, Search, Trash2 } from 'lucide-react';
import type { AppApi, GeoStatus, SchoolRecord } from '../../types/gis';
import { UPAZILAS, UPAZILA_BY_ID, pointInBounds, SYLHET_DISTRICT_BOUNDS } from '../../data/sylhetGeoData';
import { downloadText, schoolsToCsv } from '../../services/fileParser';
import { levelsIn, withNearestPop } from '../../services/coverage';
import { newId } from '../../services/db';
import { Field, Modal, PageHeader, StatusBadge, btn, inputCls } from '../ui';

type SortKey = 'name' | 'upazila' | 'level' | 'students' | 'geoStatus' | 'nearestPopKm';
const PAGE = 50;

function blankSchool(): SchoolRecord {
  const now = Date.now();
  return {
    id: newId('sch'),
    name: '',
    upazila: 'sylhet-sadar',
    lat: null,
    lng: null,
    geoStatus: 'unverified',
    createdAt: now,
    updatedAt: now,
  };
}

export default function DirectoryView({ api }: { api: AppApi }) {
  const [q, setQ] = useState('');
  const [upazila, setUpazila] = useState('');
  const [status, setStatus] = useState<GeoStatus | ''>('');
  const [level, setLevel] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [asc, setAsc] = useState(true);
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ school: SchoolRecord; isNew: boolean } | null>(null);

  const rows = useMemo(() => withNearestPop(api.schools, api.nodes), [api.schools, api.nodes]);
  const levels = useMemo(() => levelsIn(api.schools), [api.schools]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((s) => {
      if (upazila && s.upazila !== upazila) return false;
      if (status && s.geoStatus !== status) return false;
      if (level && (s.level || 'Unspecified') !== level) return false;
      if (!needle) return true;
      return (
        s.name.toLowerCase().includes(needle) ||
        (s.nameBn ?? '').includes(q.trim()) ||
        (s.eiin ?? '').toLowerCase().includes(needle) ||
        (s.village ?? '').toLowerCase().includes(needle) ||
        (s.union ?? '').toLowerCase().includes(needle)
      );
    });
    const dir = asc ? 1 : -1;
    out.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      // empty values always sink to the bottom
      if (av === undefined || av === null || av === '') return 1;
      if (bv === undefined || bv === null || bv === '') return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return out;
  }, [rows, q, upazila, status, level, sortKey, asc]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const safePage = Math.min(page, pages - 1);
  const view = filtered.slice(safePage * PAGE, safePage * PAGE + PAGE);

  const setSort = (k: SortKey) => {
    if (k === sortKey) setAsc(!asc);
    else {
      setSortKey(k);
      setAsc(true);
    }
  };

  const allOnPage = view.length > 0 && view.every((s) => picked.has(s.id));
  const togglePage = () => {
    const next = new Set(picked);
    if (allOnPage) view.forEach((s) => next.delete(s.id));
    else view.forEach((s) => next.add(s.id));
    setPicked(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  const upzName = (id: string) => UPAZILA_BY_ID[id]?.name ?? id;
  const chosen = api.schools.filter((s) => picked.has(s.id));

  const Th = ({ k, children, right = false }: { k: SortKey; children: string; right?: boolean }) => (
    <th className={`px-3 py-2 font-medium ${right ? 'text-right' : 'text-left'}`}>
      <button className="inline-flex items-center gap-1 uppercase hover:text-slate-800" onClick={() => setSort(k)}>
        {children}
        {sortKey === k && (asc ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </button>
    </th>
  );

  return (
    <>
      <PageHeader
        title="Directory"
        subtitle={`${filtered.length.toLocaleString()} of ${api.schools.length.toLocaleString()} schools`}
        actions={
          <>
            <button className={btn.secondary} onClick={() => downloadText('schools.csv', schoolsToCsv(filtered), 'text/csv')}>
              <Download size={14} /> Export filtered
            </button>
            <button className={btn.primary} onClick={() => setEditing({ school: blankSchool(), isNew: true })}>
              <Plus size={14} /> Add school
            </button>
          </>
        }
      />

      <div className="mb-3 grid gap-2 md:grid-cols-5">
        <div className="relative md:col-span-2">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            className={`${inputCls} pl-8`}
            placeholder="Search name, EIIN, village, union…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <select className={inputCls} value={upazila} onChange={(e) => { setUpazila(e.target.value); setPage(0); }}>
          <option value="">All upazilas</option>
          {UPAZILAS.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <select className={inputCls} value={level} onChange={(e) => { setLevel(e.target.value); setPage(0); }}>
          <option value="">All levels</option>
          {levels.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <select className={inputCls} value={status} onChange={(e) => { setStatus(e.target.value as GeoStatus | ''); setPage(0); }}>
          <option value="">Any GPS status</option>
          <option value="verified">Verified</option>
          <option value="manual">Manual pin</option>
          <option value="candidates">Needs review</option>
          <option value="unverified">No GPS</option>
          <option value="failed">Not found</option>
        </select>
      </div>

      {picked.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
          <span className="font-medium text-emerald-900">{picked.size} selected</span>
          <button
            className={btn.secondary}
            onClick={() => {
              api.queueGeocode(chosen.filter((s) => s.geoStatus !== 'manual').map((s) => s.id));
              api.navigate('gps');
            }}
          >
            <Crosshair size={14} /> Geocode
          </button>
          <button className={btn.secondary} onClick={() => downloadText('selected-schools.csv', schoolsToCsv(chosen), 'text/csv')}>
            <Download size={14} /> Export
          </button>
          <button
            className={btn.danger}
            onClick={async () => {
              if (window.confirm(`Delete ${picked.size} school record(s)? This cannot be undone.`)) {
                await api.removeSchools(Array.from(picked));
                setPicked(new Set());
              }
            }}
          >
            <Trash2 size={14} /> Delete
          </button>
          <button className={btn.ghost} onClick={() => setPicked(new Set())}>Clear</button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="w-9 px-3 py-2">
                <input type="checkbox" className="accent-emerald-600" checked={allOnPage} onChange={togglePage} aria-label="Select page" />
              </th>
              <Th k="name">Name</Th>
              <Th k="upazila">Upazila</Th>
              <Th k="level">Level</Th>
              <Th k="students" right>Students</Th>
              <Th k="geoStatus">GPS</Th>
              <Th k="nearestPopKm" right>Nearest POP</Th>
              <th className="w-20 px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {view.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-3 py-2">
                  <input type="checkbox" className="accent-emerald-600" checked={picked.has(s.id)} onChange={() => toggleOne(s.id)} aria-label={`Select ${s.name}`} />
                </td>
                <td className="px-3 py-2">
                  <button className="text-left font-medium text-slate-800 hover:text-emerald-700" onClick={() => setEditing({ school: s, isNew: false })}>
                    {s.name}
                  </button>
                  {(s.nameBn || s.eiin) && (
                    <div className="text-xs text-slate-500">{[s.nameBn, s.eiin && `EIIN ${s.eiin}`].filter(Boolean).join(' · ')}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600">{upzName(s.upazila)}</td>
                <td className="px-3 py-2 text-slate-600">{s.level || '–'}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">{s.students ?? '–'}</td>
                <td className="px-3 py-2"><StatusBadge status={s.geoStatus} /></td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                  {s.nearestPopKm !== null && s.nearestPopKm !== undefined ? `${s.nearestPopKm} km` : '–'}
                </td>
                <td className="px-3 py-2 text-right">
                  {s.lat !== null && (
                    <button className={btn.ghost} title="Show on map" onClick={() => api.goToSchool(s.id)}>
                      <MapPin size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {view.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                  {api.schools.length === 0 ? 'No schools yet. Import a spreadsheet or add one.' : 'No schools match these filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
        <span>Page {safePage + 1} of {pages}</span>
        <div className="flex gap-2">
          <button className={btn.secondary} disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button>
          <button className={btn.secondary} disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>Next</button>
        </div>
      </div>

      {editing && (
        <SchoolForm
          initial={editing.school}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
          onSave={async (s) => {
            await api.upsertSchool(s);
            setEditing(null);
          }}
          onDelete={
            editing.isNew
              ? undefined
              : async () => {
                  if (window.confirm(`Delete "${editing.school.name}"?`)) {
                    await api.removeSchools([editing.school.id]);
                    setEditing(null);
                  }
                }
          }
        />
      )}
    </>
  );
}

function SchoolForm({
  initial,
  isNew,
  onClose,
  onSave,
  onDelete,
}: {
  initial: SchoolRecord;
  isNew: boolean;
  onClose: () => void;
  onSave: (s: SchoolRecord) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [f, setF] = useState({
    name: initial.name,
    nameBn: initial.nameBn ?? '',
    eiin: initial.eiin ?? '',
    level: initial.level ?? '',
    type: initial.type ?? '',
    upazila: initial.upazila,
    union: initial.union ?? '',
    village: initial.village ?? '',
    address: initial.address ?? '',
    phone: initial.phone ?? '',
    students: initial.students?.toString() ?? '',
    teachers: initial.teachers?.toString() ?? '',
    lat: initial.lat?.toString() ?? '',
    lng: initial.lng?.toString() ?? '',
    notes: initial.notes ?? '',
  });
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    if (!f.name.trim()) return setErr('School name is required.');
    const lat = f.lat.trim() === '' ? null : parseFloat(f.lat);
    const lng = f.lng.trim() === '' ? null : parseFloat(f.lng);
    if ((lat === null) !== (lng === null)) return setErr('Enter both latitude and longitude, or leave both empty.');
    if (lat !== null && lng !== null) {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return setErr('Coordinates must be numbers.');
      if (!pointInBounds(lat, lng, SYLHET_DISTRICT_BOUNDS)) return setErr('Those coordinates are outside Sylhet district.');
    }
    const moved = lat !== initial.lat || lng !== initial.lng;
    const next: SchoolRecord = {
      ...initial,
      name: f.name.trim(),
      nameBn: f.nameBn.trim() || undefined,
      eiin: f.eiin.trim() || undefined,
      level: f.level.trim() || undefined,
      type: f.type.trim() || undefined,
      upazila: f.upazila,
      union: f.union.trim() || undefined,
      village: f.village.trim() || undefined,
      address: f.address.trim() || undefined,
      phone: f.phone.trim() || undefined,
      students: f.students.trim() === '' ? undefined : Number(f.students),
      teachers: f.teachers.trim() === '' ? undefined : Number(f.teachers),
      lat,
      lng,
      notes: f.notes.trim() || undefined,
      geoStatus: lat === null ? (initial.geoStatus === 'verified' || initial.geoStatus === 'manual' ? 'unverified' : initial.geoStatus) : moved ? 'manual' : initial.geoStatus,
      geoSource: lat !== null && moved ? 'manual' : initial.geoSource,
      geoConfidence: lat !== null && moved ? 1 : initial.geoConfidence,
      updatedAt: Date.now(),
    };
    await onSave(next);
  };

  return (
    <Modal
      wide
      title={isNew ? 'Add school' : 'Edit school'}
      onClose={onClose}
      footer={
        <>
          {onDelete && <button className={`${btn.danger} mr-auto`} onClick={onDelete}><Trash2 size={14} /> Delete</button>}
          <button className={btn.secondary} onClick={onClose}>Cancel</button>
          <button className={btn.primary} onClick={submit}>Save</button>
        </>
      }
    >
      {err && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="School name *"><input className={inputCls} value={f.name} onChange={set('name')} /></Field>
        <Field label="Name (Bangla)"><input className={`${inputCls} font-bn`} value={f.nameBn} onChange={set('nameBn')} /></Field>
        <Field label="EIIN"><input className={inputCls} value={f.eiin} onChange={set('eiin')} /></Field>
        <Field label="Upazila *">
          <select className={inputCls} value={f.upazila} onChange={set('upazila')}>
            {UPAZILAS.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
        <Field label="Level"><input className={inputCls} value={f.level} onChange={set('level')} placeholder="Primary, Secondary, College…" /></Field>
        <Field label="Type"><input className={inputCls} value={f.type} onChange={set('type')} placeholder="Government, Non-government…" /></Field>
        <Field label="Union"><input className={inputCls} value={f.union} onChange={set('union')} /></Field>
        <Field label="Village / area"><input className={inputCls} value={f.village} onChange={set('village')} /></Field>
        <Field label="Address"><input className={inputCls} value={f.address} onChange={set('address')} /></Field>
        <Field label="Phone"><input className={inputCls} value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Students"><input className={inputCls} type="number" min={0} value={f.students} onChange={set('students')} /></Field>
        <Field label="Teachers"><input className={inputCls} type="number" min={0} value={f.teachers} onChange={set('teachers')} /></Field>
        <Field label="Latitude"><input className={inputCls} value={f.lat} onChange={set('lat')} placeholder="24.8949" /></Field>
        <Field label="Longitude"><input className={inputCls} value={f.lng} onChange={set('lng')} placeholder="91.8687" /></Field>
      </div>
      <div className="mt-3">
        <Field label="Notes"><textarea className={inputCls} rows={2} value={f.notes} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}
