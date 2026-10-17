import { useMemo, useState } from 'react';
import { Download, Plus, Trash2 } from 'lucide-react';
import type { AppApi, LatLng, NetworkNode, NetworkRoute } from '../../types/gis';
import { SYLHET_DISTRICT_BOUNDS, haversineKm, pointInBounds } from '../../data/sylhetGeoData';
import { newId } from '../../services/db';
import { downloadText, routesToGeoJson } from '../../services/fileParser';
import { hasCoords } from '../../services/coverage';
import GisMap from '../map/GisMap';
import { Card, EmptyState, Field, Modal, PageHeader, btn, inputCls } from '../ui';

function pathLength(path: LatLng[]): number {
  let km = 0;
  for (let i = 1; i < path.length; i++) km += haversineKm(path[i - 1], path[i]);
  return Math.round(km * 100) / 100;
}

// "24.89,91.87" per line -> LatLng[]; returns an error string on a bad line
function parseWaypoints(text: string): LatLng[] | string {
  const out: LatLng[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const [i, line] of lines.entries()) {
    const parts = line.split(/[,\s]+/).map(Number);
    if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) return `Waypoint line ${i + 1} must look like "24.89, 91.87".`;
    if (!pointInBounds(parts[0], parts[1], SYLHET_DISTRICT_BOUNDS)) return `Waypoint line ${i + 1} is outside Sylhet district.`;
    out.push([parts[0], parts[1]]);
  }
  return out;
}

export default function NetworkRoutesView({ api }: { api: AppApi }) {
  const { nodes, routes, schools, settings } = api;
  const [nodeForm, setNodeForm] = useState<NetworkNode | null>(null);
  const [routeForm, setRouteForm] = useState<NetworkRoute | null>(null);
  const [waypoints, setWaypoints] = useState('');
  const [err, setErr] = useState('');

  const located = useMemo(() => schools.filter(hasCoords), [schools]);
  const coverageByNode = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of nodes) {
      if (n.kind !== 'pop') continue;
      m.set(n.id, located.filter((s) => haversineKm([s.lat, s.lng], [n.lat, n.lng]) <= n.radiusKm).length);
    }
    return m;
  }, [nodes, located]);

  const nodeName = (id: string) => nodes.find((n) => n.id === id)?.name ?? '(deleted)';

  const newNode = (): NetworkNode => ({
    id: newId('node'), name: '', kind: 'pop', lat: 24.8949, lng: 91.8687,
    radiusKm: settings.defaultRadiusKm, status: 'active', capacityGbps: undefined,
  });

  const saveNode = async () => {
    if (!nodeForm) return;
    if (!nodeForm.name.trim()) return setErr('Name is required.');
    if (!Number.isFinite(nodeForm.lat) || !Number.isFinite(nodeForm.lng) || !pointInBounds(nodeForm.lat, nodeForm.lng, SYLHET_DISTRICT_BOUNDS))
      return setErr('Coordinates must be inside Sylhet district.');
    if (!(nodeForm.radiusKm > 0)) return setErr('Radius must be greater than 0.');
    await api.upsertNode({ ...nodeForm, name: nodeForm.name.trim() });
    setNodeForm(null);
    setErr('');
  };

  const openRoute = (r?: NetworkRoute) => {
    setErr('');
    if (r) {
      setRouteForm(r);
      setWaypoints(r.path.slice(1, -1).map((p) => `${p[0]}, ${p[1]}`).join('\n'));
    } else {
      setRouteForm({
        id: newId('route'), name: '', fromNodeId: nodes[0]?.id ?? '', toNodeId: nodes[1]?.id ?? '',
        path: [], lengthKm: 0, status: 'active',
      });
      setWaypoints('');
    }
  };

  const saveRoute = async () => {
    if (!routeForm) return;
    const a = nodes.find((n) => n.id === routeForm.fromNodeId);
    const b = nodes.find((n) => n.id === routeForm.toNodeId);
    if (!routeForm.name.trim()) return setErr('Name is required.');
    if (!a || !b || a.id === b.id) return setErr('Choose two different end nodes.');
    const mid = parseWaypoints(waypoints);
    if (typeof mid === 'string') return setErr(mid);
    const path: LatLng[] = [[a.lat, a.lng], ...mid, [b.lat, b.lng]];
    await api.upsertRoute({ ...routeForm, name: routeForm.name.trim(), path, lengthKm: pathLength(path) });
    setRouteForm(null);
    setErr('');
  };

  return (
    <>
      <PageHeader
        title="Network & routes"
        subtitle="Documented fiber trunks and POP hubs. Only enter infrastructure you have records for."
        actions={
          <>
            <button
              className={btn.secondary}
              disabled={nodes.length === 0 && routes.length === 0}
              onClick={() => downloadText('network.geojson', routesToGeoJson(nodes, routes), 'application/geo+json')}
            >
              <Download size={14} /> GeoJSON
            </button>
            <button className={btn.primary} onClick={() => { setErr(''); setNodeForm(newNode()); }}>
              <Plus size={14} /> Add node
            </button>
          </>
        }
      />

      <Card padded={false} className="mb-4">
        <GisMap
          className="h-[340px] w-full rounded-lg"
          schools={located}
          nodes={nodes}
          routes={routes}
          settings={{ ...settings, clusterPins: true }}
          showUpazilas
          fitToData
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`POP & cluster nodes (${nodes.length})`} padded={false}>
          {nodes.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No nodes yet" body="Add a POP to see influence zones and distance-to-POP statistics." />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {nodes.map((n) => (
                <li key={n.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <button className="min-w-0 text-left" onClick={() => { setErr(''); setNodeForm(n); }}>
                    <div className="truncate text-sm font-medium text-slate-800">{n.name}</div>
                    <div className="text-xs text-slate-500">
                      {n.kind === 'pop' ? 'POP' : 'Cluster'} · {n.status} · {n.radiusKm} km
                      {n.kind === 'pop' && ` · ${coverageByNode.get(n.id) ?? 0} schools in zone`}
                    </div>
                  </button>
                  <button
                    className={btn.ghost}
                    aria-label={`Delete ${n.name}`}
                    onClick={async () => {
                      const used = routes.some((r) => r.fromNodeId === n.id || r.toNodeId === n.id);
                      if (used && !window.confirm('Routes use this node. Delete it and those routes?')) return;
                      if (!used && !window.confirm(`Delete "${n.name}"?`)) return;
                      for (const r of routes.filter((r) => r.fromNodeId === n.id || r.toNodeId === n.id)) await api.removeRoute(r.id);
                      await api.removeNode(n.id);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title={`Fiber routes (${routes.length})`}
          padded={false}
          right={<button className={btn.secondary} disabled={nodes.length < 2} onClick={() => openRoute()}><Plus size={13} /> Add route</button>}
        >
          {routes.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No routes yet" body={nodes.length < 2 ? 'Add at least two nodes first.' : 'Connect two nodes with a documented trunk.'} />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {routes.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <button className="min-w-0 text-left" onClick={() => openRoute(r)}>
                    <div className="truncate text-sm font-medium text-slate-800">{r.name}</div>
                    <div className="text-xs text-slate-500">
                      {nodeName(r.fromNodeId)} → {nodeName(r.toNodeId)} · {r.lengthKm} km · {r.status}
                      {r.cores ? ` · ${r.cores} cores` : ''}
                    </div>
                  </button>
                  <button
                    className={btn.ghost}
                    aria-label={`Delete ${r.name}`}
                    onClick={() => window.confirm(`Delete route "${r.name}"?`) && api.removeRoute(r.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {nodeForm && (
        <Modal
          title={nodes.some((n) => n.id === nodeForm.id) ? 'Edit node' : 'Add node'}
          onClose={() => setNodeForm(null)}
          footer={
            <>
              <button className={btn.secondary} onClick={() => setNodeForm(null)}>Cancel</button>
              <button className={btn.primary} onClick={saveNode}>Save</button>
            </>
          }
        >
          {err && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name *"><input className={inputCls} value={nodeForm.name} onChange={(e) => setNodeForm({ ...nodeForm, name: e.target.value })} /></Field>
            <Field label="Kind">
              <select className={inputCls} value={nodeForm.kind} onChange={(e) => setNodeForm({ ...nodeForm, kind: e.target.value as NetworkNode['kind'] })}>
                <option value="pop">POP</option>
                <option value="cluster">Cluster</option>
              </select>
            </Field>
            <Field label="Latitude"><input className={inputCls} type="number" step="any" value={nodeForm.lat} onChange={(e) => setNodeForm({ ...nodeForm, lat: parseFloat(e.target.value) })} /></Field>
            <Field label="Longitude"><input className={inputCls} type="number" step="any" value={nodeForm.lng} onChange={(e) => setNodeForm({ ...nodeForm, lng: parseFloat(e.target.value) })} /></Field>
            <Field label="Influence radius (km)"><input className={inputCls} type="number" step="0.5" min={0.5} value={nodeForm.radiusKm} onChange={(e) => setNodeForm({ ...nodeForm, radiusKm: parseFloat(e.target.value) })} /></Field>
            <Field label="Capacity (Gbps)"><input className={inputCls} type="number" min={0} value={nodeForm.capacityGbps ?? ''} onChange={(e) => setNodeForm({ ...nodeForm, capacityGbps: e.target.value === '' ? undefined : Number(e.target.value) })} /></Field>
            <Field label="Status">
              <select className={inputCls} value={nodeForm.status} onChange={(e) => setNodeForm({ ...nodeForm, status: e.target.value as NetworkNode['status'] })}>
                <option value="active">Active</option>
                <option value="planned">Planned</option>
                <option value="offline">Offline</option>
              </select>
            </Field>
          </div>
        </Modal>
      )}

      {routeForm && (
        <Modal
          wide
          title={routes.some((r) => r.id === routeForm.id) ? 'Edit route' : 'Add route'}
          onClose={() => setRouteForm(null)}
          footer={
            <>
              <button className={btn.secondary} onClick={() => setRouteForm(null)}>Cancel</button>
              <button className={btn.primary} onClick={saveRoute}>Save</button>
            </>
          }
        >
          {err && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name *"><input className={inputCls} value={routeForm.name} onChange={(e) => setRouteForm({ ...routeForm, name: e.target.value })} /></Field>
            <Field label="Status">
              <select className={inputCls} value={routeForm.status} onChange={(e) => setRouteForm({ ...routeForm, status: e.target.value as NetworkRoute['status'] })}>
                <option value="active">Active</option>
                <option value="planned">Planned</option>
                <option value="offline">Offline</option>
              </select>
            </Field>
            <Field label="From node">
              <select className={inputCls} value={routeForm.fromNodeId} onChange={(e) => setRouteForm({ ...routeForm, fromNodeId: e.target.value })}>
                {nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </Field>
            <Field label="To node">
              <select className={inputCls} value={routeForm.toNodeId} onChange={(e) => setRouteForm({ ...routeForm, toNodeId: e.target.value })}>
                {nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </Field>
            <Field label="Cores"><input className={inputCls} type="number" min={1} value={routeForm.cores ?? ''} onChange={(e) => setRouteForm({ ...routeForm, cores: e.target.value === '' ? undefined : Number(e.target.value) })} /></Field>
            <Field label="Owner / operator"><input className={inputCls} value={routeForm.owner ?? ''} onChange={(e) => setRouteForm({ ...routeForm, owner: e.target.value || undefined })} /></Field>
          </div>
          <div className="mt-3">
            <Field label="Waypoints between the two nodes (optional)" hint='One "lat, lng" per line, in order. Length is the sum of straight segments.'>
              <textarea className={`${inputCls} font-mono`} rows={4} value={waypoints} onChange={(e) => setWaypoints(e.target.value)} placeholder={'24.9012, 91.9120\n24.9230, 91.9650'} />
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}
