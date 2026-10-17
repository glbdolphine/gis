import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Crosshair,
  FileSpreadsheet,
  LayoutDashboard,
  Map as MapIcon,
  Menu,
  Network,
  Settings as SettingsIcon,
  Table2,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  DEFAULT_SETTINGS,
  type AppApi,
  type AppSettings,
  type DbBackup,
  type GeocodeCandidate,
  type GeocodeJob,
  type NetworkNode,
  type NetworkRoute,
  type SchoolRecord,
  type ViewId,
} from './types/gis';
import * as db from './services/db';
import { GeocodingQueue, applyCandidate, applyManualPin } from './services/geocoding';
import OverviewView from './components/views/OverviewView';
import CoverageMapView from './components/views/CoverageMapView';
import DirectoryView from './components/views/DirectoryView';
import GpsVerificationView from './components/views/GpsVerificationView';
import AnalyticsView from './components/views/AnalyticsView';
import NetworkRoutesView from './components/views/NetworkRoutesView';
import ImportExportView from './components/views/ImportExportView';
import SettingsView from './components/views/SettingsView';

const NAV: { id: ViewId; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'coverage', label: 'Coverage map', icon: MapIcon },
  { id: 'directory', label: 'Directory', icon: Table2 },
  { id: 'gps', label: 'GPS verification', icon: Crosshair },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'network', label: 'Network & routes', icon: Network },
  { id: 'import', label: 'Import / export', icon: FileSpreadsheet },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

export default function App() {
  const [currentSection, setCurrentSection] = useState<ViewId>('overview');
  const [navOpen, setNavOpen] = useState(false);

  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [nodes, setNodes] = useState<NetworkNode[]>([]);
  const [routes, setRoutes] = useState<NetworkRoute[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<AppApi['flyTarget']>(null);
  const [jobs, setJobs] = useState<Record<string, GeocodeJob>>({});
  const [queueProgress, setQueueProgress] = useState({ done: 0, total: 0 });

  // latest state for the long-lived geocoding queue
  const schoolsRef = useRef(schools);
  const settingsRef = useRef(settings);
  schoolsRef.current = schools;
  settingsRef.current = settings;
  const autoAccepted = useRef<Set<string>>(new Set());

  // ---- initial load ----
  const loadAll = useCallback(async () => {
    const [s, n, r, st] = await Promise.all([db.getSchools(), db.getNodes(), db.getRoutes(), db.getSettings()]);
    setSchools(s);
    setNodes(n);
    setRoutes(r);
    setSettings(st);
  }, []);

  useEffect(() => {
    loadAll()
      .catch((e: Error) => setError(`Could not open local storage: ${e.message}`))
      .finally(() => setLoaded(true));
  }, [loadAll]);

  // run a persistence action and surface failures instead of swallowing them
  const guard = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      setError(`Save failed: ${(e as Error).message}`);
    }
  }, []);

  const mergeSchool = useCallback((s: SchoolRecord) => {
    setSchools((prev) => {
      const i = prev.findIndex((x) => x.id === s.id);
      if (i < 0) return [...prev, s];
      const next = prev.slice();
      next[i] = s;
      return next;
    });
  }, []);

  const persistSchool = useCallback(
    (s: SchoolRecord) => {
      mergeSchool(s);
      return guard(() => db.putSchool(s));
    },
    [mergeSchool, guard],
  );

  // ---- geocoding queue (created once) ----
  const queueRef = useRef<GeocodingQueue | null>(null);
  if (!queueRef.current) {
    queueRef.current = new GeocodingQueue(
      (id) => schoolsRef.current.find((s) => s.id === id),
      () => settingsRef.current,
      {
        onJob: (job) => {
          setJobs((prev) => ({ ...prev, [job.schoolId]: job }));
          if (job.state === 'running') return;
          if (autoAccepted.current.delete(job.schoolId)) return;
          const s = schoolsRef.current.find((x) => x.id === job.schoolId);
          if (!s || s.geoStatus === 'verified' || s.geoStatus === 'manual') return;
          void persistSchool({
            ...s,
            geoStatus: job.state === 'done' && job.candidates.length > 0 ? 'candidates' : 'failed',
            updatedAt: Date.now(),
          });
        },
        onAutoAccept: (school, candidate) => {
          autoAccepted.current.add(school.id);
          void persistSchool(applyCandidate(school, candidate));
        },
        onProgress: (done, total) => setQueueProgress({ done, total }),
        onFinish: () => setQueueProgress((p) => (p.total === 0 ? p : { done: 0, total: 0 })),
      },
    );
  }

  // ---- the API handed to every view ----
  const api: AppApi = useMemo(
    () => ({
      schools,
      nodes,
      routes,
      settings,
      selectedId,
      setSelectedId,

      upsertSchool: (s) => persistSchool(s),
      upsertSchools: async (list) => {
        setSchools((prev) => {
          const byId = new Map(prev.map((x) => [x.id, x]));
          list.forEach((s) => byId.set(s.id, s));
          return Array.from(byId.values());
        });
        await guard(() => db.putSchools(list));
      },
      removeSchools: async (ids) => {
        const drop = new Set(ids);
        setSchools((prev) => prev.filter((s) => !drop.has(s.id)));
        setSelectedId((cur) => (cur && drop.has(cur) ? null : cur));
        await guard(() => db.deleteSchools(ids));
      },
      upsertNode: async (n) => {
        setNodes((prev) => (prev.some((x) => x.id === n.id) ? prev.map((x) => (x.id === n.id ? n : x)) : [...prev, n]));
        await guard(() => db.putNode(n));
      },
      removeNode: async (id) => {
        setNodes((prev) => prev.filter((x) => x.id !== id));
        await guard(() => db.deleteNode(id));
      },
      upsertRoute: async (r) => {
        setRoutes((prev) => (prev.some((x) => x.id === r.id) ? prev.map((x) => (x.id === r.id ? r : x)) : [...prev, r]));
        await guard(() => db.putRoute(r));
      },
      removeRoute: async (id) => {
        setRoutes((prev) => prev.filter((x) => x.id !== id));
        await guard(() => db.deleteRoute(id));
      },
      updateSettings: async (patch) => {
        const next = { ...settingsRef.current, ...patch };
        setSettings(next);
        await guard(() => db.saveSettings(next));
      },
      importSchools: async (list, mode) => {
        if (mode === 'replace') {
          await db.clearSchools();
          setSchools(list);
          setJobs({});
          await db.putSchools(list);
        } else {
          // skip rows whose EIIN already exists so re-importing a file doesn't duplicate schools
          const known = new Set(schoolsRef.current.map((s) => s.eiin).filter((e): e is string => !!e));
          const fresh = list.filter((s) => !s.eiin || !known.has(s.eiin));
          setSchools((prev) => [...prev, ...fresh]);
          await db.putSchools(fresh);
        }
      },
      restoreBackup: async (b: DbBackup) => {
        await db.importBackup(b, 'replace');
        setJobs({});
        await loadAll();
      },
      resetData: async () => {
        queueRef.current?.stop();
        await db.resetAll();
        setSchools([]);
        setNodes([]);
        setRoutes([]);
        setSettings(DEFAULT_SETTINGS);
        setJobs({});
        setSelectedId(null);
      },

      navigate: (v) => {
        setCurrentSection(v);
        setNavOpen(false);
      },
      goToSchool: (id) => {
        const s = schoolsRef.current.find((x) => x.id === id);
        if (!s || s.lat === null || s.lng === null) return;
        setSelectedId(id);
        setFlyTarget({ lat: s.lat, lng: s.lng, zoom: 17, nonce: Date.now() });
        setCurrentSection('coverage');
        setNavOpen(false);
      },
      flyTarget,
      flyTo: (lat, lng, zoom) => setFlyTarget({ lat, lng, zoom, nonce: Date.now() }),

      jobs,
      queueProgress,
      queueGeocode: (ids) => {
        // never overwrite a hand-placed pin
        const manual = new Set(schoolsRef.current.filter((s) => s.geoStatus === 'manual').map((s) => s.id));
        const todo = ids.filter((id) => !manual.has(id));
        if (todo.length === 0) return;
        setJobs((prev) => {
          const next = { ...prev };
          todo.forEach((id) => delete next[id]);
          return next;
        });
        queueRef.current?.enqueue(todo);
      },
      stopGeocode: () => queueRef.current?.stop(),
      acceptCandidate: async (schoolId: string, c: GeocodeCandidate) => {
        const s = schoolsRef.current.find((x) => x.id === schoolId);
        if (!s) return;
        setJobs((prev) => {
          const next = { ...prev };
          delete next[schoolId];
          return next;
        });
        await persistSchool(applyCandidate(s, c));
      },
      setManualPin: async (schoolId, lat, lng) => {
        const s = schoolsRef.current.find((x) => x.id === schoolId);
        if (!s) return;
        setJobs((prev) => {
          const next = { ...prev };
          delete next[schoolId];
          return next;
        });
        await persistSchool(applyManualPin(s, lat, lng));
      },
      clearPin: async (schoolId) => {
        const s = schoolsRef.current.find((x) => x.id === schoolId);
        if (!s) return;
        await persistSchool({
          ...s,
          lat: null,
          lng: null,
          geoStatus: 'unverified',
          geoSource: undefined,
          geoConfidence: undefined,
          updatedAt: Date.now(),
        });
      },
    }),
    [schools, nodes, routes, settings, selectedId, flyTarget, jobs, queueProgress, persistSchool, guard, loadAll],
  );

  const needsGps = useMemo(
    () => schools.filter((s) => s.geoStatus !== 'verified' && s.geoStatus !== 'manual').length,
    [schools],
  );

  const fullBleed = currentSection === 'coverage';

  const navList = (
    <nav className="flex-1 space-y-0.5 p-3">
      {NAV.map(({ id, label, icon: Icon }) => {
        const active = currentSection === id;
        return (
          <button
            key={id}
            onClick={() => api.navigate(id)}
            className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
              active ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Icon size={16} />
            <span className="flex-1">{label}</span>
            {id === 'gps' && needsGps > 0 && (
              <span className={`rounded-full px-1.5 text-xs ${active ? 'bg-white/25' : 'bg-amber-500/90 text-slate-900'}`}>
                {needsGps > 999 ? '999+' : needsGps}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900">
      {/* desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col bg-slate-900 md:flex">
        <div className="border-b border-slate-800 px-5 py-4">
          <div className="text-sm font-semibold text-white">Sylhet School GIS</div>
          <div className="font-bn text-xs text-slate-400">সিলেট বিদ্যালয় মানচিত্র</div>
        </div>
        {navList}
        <div className="border-t border-slate-800 px-5 py-3 text-xs text-slate-500">
          {schools.length.toLocaleString()} schools · stored locally
        </div>
      </aside>

      {/* mobile drawer */}
      {navOpen && (
        <div className="fixed inset-0 z-[3000] md:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setNavOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <span className="text-sm font-semibold text-white">Sylhet School GIS</span>
              <button className="text-slate-400" onClick={() => setNavOpen(false)} aria-label="Close menu">
                <X size={18} />
              </button>
            </div>
            {navList}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5 md:hidden">
          <button onClick={() => setNavOpen(true)} aria-label="Open menu" className="text-slate-700">
            <Menu size={20} />
          </button>
          <span className="text-sm font-semibold">{NAV.find((n) => n.id === currentSection)?.label}</span>
        </header>

        {error && (
          <div className="flex items-start justify-between gap-3 bg-red-50 px-4 py-2 text-sm text-red-700">
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        )}

        <main className={fullBleed ? 'min-h-0 flex-1 overflow-hidden' : 'min-h-0 flex-1 overflow-y-auto p-4 md:p-6'}>
          {!loaded ? (
            <div className="p-8 text-sm text-slate-500">Loading…</div>
          ) : (
            <div className={fullBleed ? 'h-full' : 'mx-auto max-w-7xl'}>
              {currentSection === 'overview' && <OverviewView api={api} />}
              {currentSection === 'coverage' && <CoverageMapView api={api} />}
              {currentSection === 'directory' && <DirectoryView api={api} />}
              {currentSection === 'gps' && <GpsVerificationView api={api} />}
              {currentSection === 'analytics' && <AnalyticsView api={api} />}
              {currentSection === 'network' && <NetworkRoutesView api={api} />}
              {currentSection === 'import' && <ImportExportView api={api} />}
              {currentSection === 'settings' && <SettingsView api={api} />}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
