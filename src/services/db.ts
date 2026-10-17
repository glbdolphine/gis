import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type DbBackup,
  type NetworkNode,
  type NetworkRoute,
  type SchoolRecord,
} from '../types/gis';

// IndexedDB persistence layer. Everything lives in the browser so the app
// works fully offline. Stores: schools, nodes, routes, meta (settings).

const DB_NAME = 'sylhet-school-gis';
const DB_VERSION = 1;

type StoreName = 'schools' | 'nodes' | 'routes' | 'meta';

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('schools')) {
        const s = db.createObjectStore('schools', { keyPath: 'id' });
        s.createIndex('upazila', 'upazila', { unique: false });
        s.createIndex('geoStatus', 'geoStatus', { unique: false });
      }
      if (!db.objectStoreNames.contains('nodes')) db.createObjectStore('nodes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('routes')) db.createObjectStore('routes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return reqToPromise(db.transaction(store, 'readonly').objectStore(store).getAll() as IDBRequest<T[]>);
}

async function putMany<T>(store: StoreName, items: T[]): Promise<void> {
  if (items.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const it of items) os.put(it);
  await txDone(tx);
}

async function deleteMany(store: StoreName, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const id of ids) os.delete(id);
  await txDone(tx);
}

async function clearStore(store: StoreName): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).clear();
  await txDone(tx);
}

export function newId(prefix = 'id'): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${rnd}`;
}

// ---- Schools ----
export const getSchools = () => getAll<SchoolRecord>('schools');
export const putSchool = (s: SchoolRecord) => putMany('schools', [{ ...s, updatedAt: Date.now() }]);
export const putSchools = (list: SchoolRecord[]) => putMany('schools', list);
export const deleteSchools = (ids: string[]) => deleteMany('schools', ids);
export const clearSchools = () => clearStore('schools');

// ---- Nodes ----
export const getNodes = () => getAll<NetworkNode>('nodes');
export const putNode = (n: NetworkNode) => putMany('nodes', [n]);
export const putNodes = (n: NetworkNode[]) => putMany('nodes', n);
export const deleteNode = (id: string) => deleteMany('nodes', [id]);

// ---- Routes ----
export const getRoutes = () => getAll<NetworkRoute>('routes');
export const putRoute = (r: NetworkRoute) => putMany('routes', [r]);
export const putRoutes = (r: NetworkRoute[]) => putMany('routes', r);
export const deleteRoute = (id: string) => deleteMany('routes', [id]);

// ---- Settings ----
export async function getSettings(): Promise<AppSettings> {
  const db = await openDb();
  const row = await reqToPromise(
    db.transaction('meta', 'readonly').objectStore('meta').get('settings') as IDBRequest<
      { key: string; value: Partial<AppSettings> } | undefined
    >,
  );
  return { ...DEFAULT_SETTINGS, ...(row?.value ?? {}) };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await putMany('meta', [{ key: 'settings', value: settings }]);
}

// ---- Backup / restore / reset ----
export async function exportBackup(): Promise<DbBackup> {
  const [schools, nodes, routes, settings] = await Promise.all([
    getSchools(),
    getNodes(),
    getRoutes(),
    getSettings(),
  ]);
  return { version: 1, exportedAt: Date.now(), schools, nodes, routes, settings };
}

export async function importBackup(backup: DbBackup, mode: 'replace' | 'merge' = 'replace'): Promise<void> {
  if (!backup || backup.version !== 1 || !Array.isArray(backup.schools)) {
    throw new Error('Not a valid Sylhet GIS backup file.');
  }
  if (mode === 'replace') {
    await Promise.all([clearStore('schools'), clearStore('nodes'), clearStore('routes')]);
  }
  await putMany('schools', backup.schools);
  await putMany('nodes', backup.nodes ?? []);
  await putMany('routes', backup.routes ?? []);
  if (backup.settings) await saveSettings({ ...DEFAULT_SETTINGS, ...backup.settings });
}

export async function resetAll(): Promise<void> {
  await Promise.all([clearStore('schools'), clearStore('nodes'), clearStore('routes'), clearStore('meta')]);
}
