import { useRef, useState } from 'react';
import { AlertTriangle, Download, FileSpreadsheet, FileUp, RotateCcw, Upload } from 'lucide-react';
import type { AppApi, ColumnMapping, DbBackup } from '../../types/gis';
import {
  autoDetectColumns,
  downloadBlob,
  downloadText,
  parseFile,
  rowsToSchools,
  schoolsToCsv,
  schoolsToXlsx,
  type ImportResult,
  type ParsedSheet,
} from '../../services/fileParser';
import { exportBackup } from '../../services/db';
import { Card, Field, PageHeader, btn, inputCls } from '../ui';

const FIELDS: { key: keyof ColumnMapping; label: string; required?: boolean }[] = [
  { key: 'name', label: 'School name', required: true },
  { key: 'upazila', label: 'Upazila', required: true },
  { key: 'nameBn', label: 'Name (Bangla)' },
  { key: 'eiin', label: 'EIIN' },
  { key: 'level', label: 'Level' },
  { key: 'type', label: 'Type' },
  { key: 'union', label: 'Union' },
  { key: 'village', label: 'Village / area' },
  { key: 'address', label: 'Address' },
  { key: 'phone', label: 'Phone' },
  { key: 'students', label: 'Students' },
  { key: 'teachers', label: 'Teachers' },
  { key: 'lat', label: 'Latitude' },
  { key: 'lng', label: 'Longitude' },
  { key: 'notes', label: 'Notes' },
];

export default function ImportExportView({ api }: { api: AppApi }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setMsg(null);
    setResult(null);
    try {
      const parsed = await parseFile(file);
      if (parsed.rows.length === 0) throw new Error('The first sheet has no data rows.');
      setFileName(file.name);
      setSheet(parsed);
      setMapping(autoDetectColumns(parsed.headers));
    } catch (e) {
      setSheet(null);
      setMsg({ kind: 'err', text: `Could not read the file: ${(e as Error).message}` });
    }
  };

  const preview = sheet ? rowsToSchools(sheet.rows, mapping) : null;
  const canImport = !!sheet && !!mapping.name && !!mapping.upazila && !!preview && preview.schools.length > 0;

  const doImport = async () => {
    if (!preview) return;
    if (mode === 'replace' && !window.confirm(`Replace all ${api.schools.length} existing schools with ${preview.schools.length} imported?`)) return;
    setBusy(true);
    try {
      await api.importSchools(preview.schools, mode);
      setResult(preview);
      setSheet(null);
      setFileName('');
      setMsg({ kind: 'ok', text: `Imported ${preview.schools.length.toLocaleString()} schools.` });
    } catch (e) {
      setMsg({ kind: 'err', text: `Import failed: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  const restore = async (file: File | undefined) => {
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text()) as DbBackup;
      if (!window.confirm('Restoring replaces everything currently stored. Continue?')) return;
      await api.restoreBackup(backup);
      setMsg({ kind: 'ok', text: `Restored ${backup.schools.length.toLocaleString()} schools from backup.` });
    } catch (e) {
      setMsg({ kind: 'err', text: `Restore failed: ${(e as Error).message}` });
    }
  };

  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader title="Import & export" subtitle="Bring in an Excel/CSV list, take data out, back up or reset." />

      {msg && (
        <div className={`mb-4 rounded-md px-3 py-2 text-sm ${msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="1. Choose a file" className="lg:col-span-2">
          <div
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-6 py-8 text-center hover:border-emerald-500 hover:bg-emerald-50/40"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void onFile(e.dataTransfer.files[0]);
            }}
          >
            <FileSpreadsheet className="text-slate-400" size={28} />
            <div className="text-sm font-medium text-slate-800">{fileName || 'Drop an .xlsx, .xls or .csv file here, or click to browse'}</div>
            <div className="text-xs text-slate-500">The first sheet is used. Files stay in your browser.</div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
        </Card>

        {sheet && (
          <>
            <Card title="2. Match columns" className="lg:col-span-2">
              <p className="mb-3 text-xs text-slate-500">
                Detected automatically from {sheet.headers.length} column(s) in “{sheet.sheetName}”. Fix any that look wrong.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {FIELDS.map((f) => (
                  <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`}>
                    <select
                      className={inputCls}
                      value={mapping[f.key] ?? ''}
                      onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || undefined })}
                    >
                      <option value="">— not in file —</option>
                      {sheet.headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </Field>
                ))}
              </div>
            </Card>

            <Card title="3. Check and import" className="lg:col-span-2">
              {preview && (
                <div className="space-y-3 text-sm">
                  <div className="flex flex-wrap gap-x-6 gap-y-1">
                    <span><b>{preview.schools.length.toLocaleString()}</b> ready</span>
                    <span><b>{preview.withCoords.toLocaleString()}</b> with valid coordinates</span>
                    <span><b>{preview.withoutCoords.toLocaleString()}</b> to geocode</span>
                    <span className={preview.skipped.length ? 'text-amber-700' : ''}><b>{preview.skipped.length}</b> skipped</span>
                  </div>
                  {preview.skipped.length > 0 && (
                    <details className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                      <summary className="cursor-pointer font-medium">Why rows were skipped</summary>
                      <ul className="mt-1 max-h-32 overflow-y-auto">
                        {preview.skipped.slice(0, 100).map((s) => (
                          <li key={s.row}>Row {s.row}: {s.reason}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {(!mapping.name || !mapping.upazila) && (
                    <div className="flex items-center gap-1.5 text-amber-700">
                      <AlertTriangle size={14} /> Map both School name and Upazila to continue.
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    <select className={`${inputCls} w-auto`} value={mode} onChange={(e) => setMode(e.target.value as 'append' | 'replace')}>
                      <option value="append">Add to existing schools</option>
                      <option value="replace">Replace all existing schools</option>
                    </select>
                    <button className={btn.primary} disabled={!canImport || busy} onClick={doImport}>
                      <Upload size={14} /> {busy ? 'Importing…' : `Import ${preview.schools.length.toLocaleString()} schools`}
                    </button>
                    <button className={btn.ghost} onClick={() => { setSheet(null); setFileName(''); }}>Cancel</button>
                  </div>
                </div>
              )}
            </Card>
          </>
        )}

        {result && !sheet && (
          <Card title="Next step" className="lg:col-span-2">
            <p className="text-sm text-slate-600">
              {result.withoutCoords > 0
                ? `${result.withoutCoords.toLocaleString()} imported schools have no coordinates yet.`
                : 'All imported schools already have coordinates.'}
            </p>
            <div className="mt-3 flex gap-2">
              {result.withoutCoords > 0 && <button className={btn.primary} onClick={() => api.navigate('gps')}>Go to GPS verification</button>}
              <button className={btn.secondary} onClick={() => api.navigate('overview')}>View overview</button>
            </div>
          </Card>
        )}

        <Card title="Export">
          <div className="flex flex-wrap gap-2">
            <button className={btn.secondary} disabled={!api.schools.length} onClick={() => downloadText(`schools-${stamp}.csv`, schoolsToCsv(api.schools), 'text/csv')}>
              <Download size={14} /> CSV
            </button>
            <button className={btn.secondary} disabled={!api.schools.length} onClick={() => downloadBlob(`schools-${stamp}.xlsx`, schoolsToXlsx(api.schools))}>
              <Download size={14} /> Excel
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">{api.schools.length.toLocaleString()} schools, including GPS status.</p>
        </Card>

        <Card title="Backup & restore">
          <div className="flex flex-wrap gap-2">
            <button
              className={btn.secondary}
              onClick={async () => downloadText(`sylhet-gis-backup-${stamp}.json`, JSON.stringify(await exportBackup()), 'application/json')}
            >
              <Download size={14} /> Backup (JSON)
            </button>
            <button className={btn.secondary} onClick={() => backupRef.current?.click()}>
              <FileUp size={14} /> Restore…
            </button>
            <input ref={backupRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { void restore(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          <p className="mt-2 text-xs text-slate-500">Includes schools, POP nodes, routes and settings.</p>
        </Card>

        <Card title="Danger zone" className="border-red-200 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">Delete every school, node, route and setting stored in this browser.</p>
            <button
              className={btn.danger}
              onClick={async () => {
                if (window.confirm('Erase ALL data stored by this app in this browser? Download a backup first if unsure.')) {
                  await api.resetData();
                  setMsg({ kind: 'ok', text: 'Database reset.' });
                }
              }}
            >
              <RotateCcw size={14} /> Reset database
            </button>
          </div>
        </Card>
      </div>
    </>
  );
}
