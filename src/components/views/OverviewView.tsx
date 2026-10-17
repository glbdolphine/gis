import { useMemo } from 'react';
import { ArrowRight, Upload } from 'lucide-react';
import type { AppApi } from '../../types/gis';
import GisMap from '../map/GisMap';
import { Bar, Card, EmptyState, KpiCard, PageHeader, btn } from '../ui';
import { hasCoords, isCovered, upazilaStats } from '../../services/coverage';

export default function OverviewView({ api }: { api: AppApi }) {
  const { schools, nodes, settings } = api;

  const stats = useMemo(() => upazilaStats(schools), [schools]);
  const kpi = useMemo(() => {
    const located = schools.filter(hasCoords).length;
    const verified = schools.filter((s) => s.geoStatus === 'verified' || s.geoStatus === 'manual').length;
    const review = schools.filter((s) => s.geoStatus === 'candidates').length;
    const covered = schools.filter((s) => isCovered(s, nodes)).length;
    const students = schools.reduce((a, s) => a + (s.students ?? 0), 0);
    return { located, verified, review, covered, students, noGps: schools.length - located };
  }, [schools, nodes]);

  const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '–');
  const maxTotal = Math.max(1, ...stats.map((s) => s.total));
  const popCount = nodes.filter((n) => n.kind === 'pop').length;

  if (schools.length === 0) {
    return (
      <>
        <PageHeader title="Overview" subtitle="Sylhet district school coverage at a glance" />
        <EmptyState
          title="No schools yet"
          body="Import an Excel or CSV list of schools to see coverage, GPS quality and distance-to-POP statistics here."
          action={
            <button className={btn.primary} onClick={() => api.navigate('import')}>
              <Upload size={14} /> Import schools
            </button>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="Sylhet district school coverage at a glance"
        actions={
          <button className={btn.secondary} onClick={() => api.navigate('coverage')}>
            Open full map <ArrowRight size={14} />
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <KpiCard label="Schools" value={schools.length.toLocaleString()} hint={`${kpi.students.toLocaleString()} students`} />
        <KpiCard label="With GPS" value={pct(kpi.located, schools.length)} hint={`${kpi.located.toLocaleString()} located`} tone="emerald" />
        <KpiCard label="Verified" value={kpi.verified.toLocaleString()} hint="Auto-accepted or manual" tone="emerald" />
        <KpiCard label="Needs review" value={kpi.review.toLocaleString()} hint="Candidates waiting" tone="amber" />
        <KpiCard label="No GPS" value={kpi.noGps.toLocaleString()} hint="Not yet placed" tone={kpi.noGps ? 'red' : 'slate'} />
        <KpiCard
          label="Inside POP zone"
          value={popCount ? pct(kpi.covered, schools.length) : '–'}
          hint={popCount ? `${popCount} POP node${popCount > 1 ? 's' : ''}` : 'Add POPs in Network'}
          tone="blue"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Card title="Map preview" className="xl:col-span-3" padded={false}>
          <GisMap
            className="h-[380px] w-full rounded-b-lg"
            schools={schools}
            nodes={nodes}
            routes={api.routes}
            settings={settings}
            selectedId={api.selectedId}
            onSelect={api.setSelectedId}
            showUpazilas
            fitToData
          />
        </Card>

        <Card title="By upazila" className="xl:col-span-2" padded={false}>
          <div className="max-h-[380px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Upazila</th>
                  <th className="px-2 py-2 text-right font-medium">Schools</th>
                  <th className="px-2 py-2 text-right font-medium">GPS</th>
                  <th className="w-24 px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-800">{u.name}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{u.total}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-500">{pct(u.located, u.total)}</td>
                    <td className="px-4 py-2">
                      <Bar value={u.total} max={maxTotal} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
