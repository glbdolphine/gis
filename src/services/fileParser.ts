import * as XLSX from 'xlsx';
import { SYLHET_DISTRICT_BOUNDS, pointInBounds, resolveUpazilaId, upazilaAt } from '../data/sylhetGeoData';
import type { ColumnMapping, NetworkNode, NetworkRoute, SchoolRecord } from '../types/gis';
import { newId } from './db';

// ---------- reading Excel / CSV ----------

export interface ParsedSheet {
  headers: string[];
  rows: Record<string, unknown>[];
  sheetName: string;
}

export async function parseFile(file: File): Promise<ParsedSheet> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('The file has no sheets.');
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: true });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { headers, rows, sheetName };
}

// ---------- column auto-detection ----------

const SYNONYMS: Record<keyof ColumnMapping, string[]> = {
  name: ['schoolname', 'institutionname', 'nameofinstitution', 'name', 'institute', 'school', 'প্রতিষ্ঠানেরনাম', 'বিদ্যালয়েরনাম'],
  nameBn: ['namebn', 'banglaname', 'bengaliname', 'nameinbangla', 'বাংলানাম'],
  eiin: ['eiin', 'eiinno', 'eiinnumber', 'institutecode', 'code', 'ইআইআইএন'],
  level: ['level', 'educationlevel', 'category', 'stage', 'স্তর'],
  type: ['type', 'management', 'schooltype', 'institutiontype', 'ownership', 'ধরন'],
  upazila: ['upazila', 'upazilla', 'upazilaname', 'thana', 'উপজেলা'],
  union: ['union', 'unionname', 'ward', 'ইউনিয়ন'],
  village: ['village', 'villagename', 'mouza', 'area', 'locality', 'গ্রাম'],
  address: ['address', 'fulladdress', 'location', 'ঠিকানা'],
  phone: ['phone', 'mobile', 'contact', 'phoneno', 'mobileno', 'মোবাইল'],
  students: ['students', 'totalstudents', 'enrollment', 'enrolment', 'studentcount', 'শিক্ষার্থী'],
  teachers: ['teachers', 'totalteachers', 'teachercount', 'staff', 'শিক্ষক'],
  lat: ['lat', 'latitude', 'y', 'অক্ষাংশ'],
  lng: ['lng', 'lon', 'long', 'longitude', 'x', 'দ্রাঘিমাংশ'],
  notes: ['notes', 'remarks', 'remark', 'comment', 'comments', 'মন্তব্য'],
};

function headerKey(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9ঀ-৿]/g, '');
}

export function autoDetectColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  (Object.keys(SYNONYMS) as (keyof ColumnMapping)[]).forEach((field) => {
    // exact synonym match first, then "header contains synonym"
    let found = headers.find((h) => !used.has(h) && SYNONYMS[field].includes(headerKey(h)));
    if (!found) {
      found = headers.find(
        (h) =>
          !used.has(h) &&
          SYNONYMS[field].some((syn) => syn.length >= 4 && headerKey(h).includes(syn)),
      );
    }
    if (found) {
      mapping[field] = found;
      used.add(found);
    }
  });
  return mapping;
}

// ---------- rows -> SchoolRecord ----------

export interface ImportResult {
  schools: SchoolRecord[];
  skipped: { row: number; reason: string }[];
  withCoords: number;
  withoutCoords: number;
}

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function num(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

export function rowsToSchools(rows: Record<string, unknown>[], map: ColumnMapping): ImportResult {
  const schools: SchoolRecord[] = [];
  const skipped: { row: number; reason: string }[] = [];
  const now = Date.now();
  let withCoords = 0;

  rows.forEach((row, idx) => {
    const get = (f: keyof ColumnMapping) => (map[f] ? row[map[f] as string] : undefined);
    const name = str(get('name'));
    if (!name) {
      skipped.push({ row: idx + 2, reason: 'Missing school name' });
      return;
    }
    let lat = num(get('lat'));
    let lng = num(get('lng'));
    // tolerate swapped columns (Sylhet is ~24.9N, 91.9E)
    if (lat !== null && lng !== null && lat > 80 && lng < 40) [lat, lng] = [lng, lat];
    const coordsValid =
      lat !== null && lng !== null && pointInBounds(lat, lng, SYLHET_DISTRICT_BOUNDS);

    let upazila = resolveUpazilaId(str(get('upazila')));
    if (!upazila && coordsValid) upazila = upazilaAt(lat as number, lng as number)?.id ?? null;
    if (!upazila) {
      skipped.push({ row: idx + 2, reason: `Unrecognised upazila "${str(get('upazila'))}"` });
      return;
    }

    if (coordsValid) withCoords++;
    else if (lat !== null || lng !== null) {
      // coordinates present but outside Sylhet: keep the school, drop the bad point
    }

    schools.push({
      id: newId('sch'),
      name,
      nameBn: str(get('nameBn')) || undefined,
      eiin: str(get('eiin')) || undefined,
      level: str(get('level')) || undefined,
      type: str(get('type')) || undefined,
      upazila,
      union: str(get('union')) || undefined,
      village: str(get('village')) || undefined,
      address: str(get('address')) || undefined,
      phone: str(get('phone')) || undefined,
      students: num(get('students')) ?? undefined,
      teachers: num(get('teachers')) ?? undefined,
      lat: coordsValid ? (lat as number) : null,
      lng: coordsValid ? (lng as number) : null,
      geoStatus: coordsValid ? 'verified' : 'unverified',
      geoSource: coordsValid ? 'import' : undefined,
      geoConfidence: coordsValid ? 0.7 : undefined,
      notes: str(get('notes')) || undefined,
      createdAt: now,
      updatedAt: now,
    });
  });

  return { schools, skipped, withCoords, withoutCoords: schools.length - withCoords };
}

// ---------- exporters ----------

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  // BOM so Excel opens Bengali text correctly
  return '﻿' + [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function schoolsToCsv(schools: SchoolRecord[]): string {
  const headers = [
    'id', 'name', 'nameBn', 'eiin', 'level', 'type', 'upazila', 'union', 'village', 'address',
    'phone', 'students', 'teachers', 'lat', 'lng', 'geoStatus', 'geoSource', 'geoConfidence',
    'nearestPopKm', 'notes',
  ];
  return toCsv(
    headers,
    schools.map((s) => [
      s.id, s.name, s.nameBn, s.eiin, s.level, s.type, s.upazila, s.union, s.village, s.address,
      s.phone, s.students, s.teachers, s.lat, s.lng, s.geoStatus, s.geoSource, s.geoConfidence,
      s.nearestPopKm, s.notes,
    ]),
  );
}

export function schoolsToXlsx(schools: SchoolRecord[]): Blob {
  const data = schools.map((s) => ({
    Name: s.name,
    'Name (Bangla)': s.nameBn ?? '',
    EIIN: s.eiin ?? '',
    Level: s.level ?? '',
    Type: s.type ?? '',
    Upazila: s.upazila,
    Union: s.union ?? '',
    Village: s.village ?? '',
    Address: s.address ?? '',
    Phone: s.phone ?? '',
    Students: s.students ?? '',
    Teachers: s.teachers ?? '',
    Latitude: s.lat ?? '',
    Longitude: s.lng ?? '',
    'GPS status': s.geoStatus,
    Notes: s.notes ?? '',
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Schools');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function routesToGeoJson(nodes: NetworkNode[], routes: NetworkRoute[]): string {
  const features: unknown[] = [
    ...nodes.map((n) => ({
      type: 'Feature',
      properties: {
        id: n.id, name: n.name, kind: n.kind, status: n.status,
        capacityGbps: n.capacityGbps ?? null, radiusKm: n.radiusKm, upazila: n.upazila ?? null,
      },
      geometry: { type: 'Point', coordinates: [n.lng, n.lat] },
    })),
    ...routes.map((r) => ({
      type: 'Feature',
      properties: {
        id: r.id, name: r.name, from: r.fromNodeId, to: r.toNodeId, status: r.status,
        lengthKm: r.lengthKm, cores: r.cores ?? null, owner: r.owner ?? null,
      },
      // GeoJSON is [lng, lat]; app paths are [lat, lng]
      geometry: { type: 'LineString', coordinates: r.path.map(([la, ln]) => [ln, la]) },
    })),
  ];
  return JSON.stringify({ type: 'FeatureCollection', features }, null, 2);
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(filename: string, text: string, mime = 'text/plain') {
  downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }));
}
