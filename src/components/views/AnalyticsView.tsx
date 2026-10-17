import { useMemo } from 'react';
import { Download } from 'lucide-react';
import type { AppApi, QualityTier } from '../../types/gis';
import { downloadText, toCsv } from '../../services/fileParser';
import { distanceBuckets, DISTANCE_BUCKETS, levelsIn, qualityTier, upazilaStats } from '../../services/coverage';
import { Bar, Card, EmptyState, PageHeader, btn } from '../ui';

const TIER_META: Record<QualityTier, { label: string; color: string; hint: string }> = {
  high: { label: 'High', color: '#059669', hint: 'Manual pin or verified at ≥ 85% confidence' },
  medium: { label: 'Medium', color: '#d97706', hint: 'Verified at 55–84% confidence' },
  low: { label: 'Low', color: '#dc2626', hint: 'Imported or low-confidence point' },
  none: { label: 'No GPS', color: '#6b7280', hint: 'No coordinates yet' },
};

export default function AnalyticsView({ api }: { api: AppApi }) {
  const { schools, nodes } = api;
  const stats = useMemo(() => upazilaStats(schools), [schools]);
  const levels = useMemo(() => levelsIn(schools), [schools]);
  const tiers = useMemo(() => {
    const t: Record<QualityTier, number> = { high: 0, medium: 0, low: 0, none: 0 };
    schools.forEach((s) => t[qualityTier(s)]++);
    return t;
  }, [schools]);
  const dist = useMemo(() => distanceBuckets(schools, nodes), [schools, nodes]);

  if (schools.length === 0) {
    return (
      <>
        <PageHeader title="Analytics" />
        <EmptyState title="Nothing to analyse yet" body="Import schools to see concentration and GPS quality." />
      </>
    );
  }

  const maxTotal = Math.max(1, ...stats.map((s) => s.total));
  const sumLocated = schools.length - tiers.none;
  const distTotal = dist.counts.reduce((a, b) => a + b, 0);

  const exportMatrix = () => {
    const headers = ['Upazila', 'Schools', 'Share %', 'Located', 'Verified', 'Needs review', 'No GPS', 'Students', 'Teachers', ...levels];
    const rows = stats.map((u) => [
      u.name,
      u.total,
      ((u.total / schools.length) * 100).toFixed(1),
      u.located,
      u.verified,
      u.needsReview,
      u.noGps,
      u.students,
      u.teachers,
      ...levels.map((l) => u.byLevel[l] ?? 0),
    ]);
    downloadText('upazila-matrix.csv', toCsv(headers, rows), 'text/csv');
  };

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Where schools concentrate and how trustworthy their coordinates are"
        actions={
          <button className={btn.secondary} onClick={exportMatrix}>
            <Download size={14} /> Export matrix CSV
          </button>
        }
      />

      <Card title="Upazila concentration matrix" padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Upazila</th>
                <th className="px-2 py-2 text-right font-medium">Schools</th>
                <th className="w-40 px-2 py-2 text-left font-medium">Share</th>
                <th className="px-2 py-2 text-right font-medium">GPS</th>
                <th className="px-2 py-2 text-right font-medium">Verified</th>
                <th className="px-2 py-2 text-right font-medium">Students</th>
                {levels.map((l) => (
                  <th key={l} className="px-2 py-2 text-right font-medium">{l}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...stats].sort((a, b) => b.total - a.total).map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-800">{u.name}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{u.total}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-24"><Bar value={u.total} max={maxTotal} /></div>
                      <span className="text-xs tabular-nums text-slate-500">{((u.total / schools.length) * 100).toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-600">{u.located}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-600">{u.verified}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-600">{u.students.toLocaleString()}</td>
                  {levels.map((l) => (
                    <td key={l} className="px-2 py-2 text-right tabular-nums text-slate-600">{u.byLevel[l] ?? 0}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="GPS quality tiers">
          <div className="space-y-3">
            {(Object.keys(TIER_META) as QualityTier[]).map((t) => (
              <div key={t}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium text-slate-800">{TIER_META[t].label}</span>
                  <span className="tabular-nums text-slate-600">
                    {tiers[t].toLocaleString()} <span className="text-slate-400">({((tiers[t] / schools.length) * 100).toFixed(0)}%)</span>
                  </span>
                </div>
                <Bar value={tiers[t]} max={schools.length} color={TIER_META[t].color} />
                <div className="mt-0.5 text-xs text-slate-400">{TIER_META[t].hint}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Distance to nearest POP">
          {nodes.some((n) => n.kind === 'pop') ? (
            <div className="space-y-3">
              {DISTANCE_BUCKETS.map((b, i) => (
                <div key={b.label}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium text-slate-800">{b.label}</span>
                    <span className="tabular-nums text-slate-600">{dist.counts[i].toLocaleString()}</span>
                  </div>
                  <Bar value={dist.counts[i]} max={Math.max(1, distTotal)} color="#2563eb" />
                </div>
              ))}
              <div className="text-xs text-slate-500">
                {dist.noGps.toLocaleString()} school(s) excluded for missing GPS · {sumLocated.toLocaleString()} measured
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Add at least one POP in the Network view to see how far schools are from the fiber network.
              Distances are straight-line (haversine), not along the road or fiber path.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
