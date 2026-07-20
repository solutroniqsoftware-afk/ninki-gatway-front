// Offline tile cache — IndexedDB storage for Leaflet tiles
// Keys: "z/x/y" (standard XYZ). Values: Blob (PNG image).

const DB_NAME = 'ninki-offline-tiles-v1';
const TILES_STORE = 'tiles';
const ZONES_STORE = 'zones';
const DB_VERSION = 1;

export interface ZoneInfo {
  id: string;
  nom: string;
  bboxNord: number;
  bboxSud: number;
  bboxEst: number;
  bboxOuest: number;
  zoomMin: number;
  zoomMax: number;
  tileKeys: string[];
  nbTuiles: number;
  tailleKo: number;
  createdAt: string;
}

// ─── Singleton IDB connection ─────────────────────────────────────────────────

let _db: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(new Error(`IDB open error: ${req.error?.message}`));
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(TILES_STORE)) {
        db.createObjectStore(TILES_STORE);
      }
      if (!db.objectStoreNames.contains(ZONES_STORE)) {
        db.createObjectStore(ZONES_STORE, { keyPath: 'id' });
      }
    };
    // If the connection is closed externally, reset the singleton
    req.onsuccess = () => {
      _db = req.result;
      _db.onclose = () => { _db = null; };
      resolve(_db);
    };
  });
}

// ─── In-memory key set for fast lookups ──────────────────────────────────────
// Avoids hitting IDB for every tile that isn't cached (the common case).

let _keySet: Set<string> | null = null;

async function getKeySet(): Promise<Set<string>> {
  if (_keySet) return _keySet;
  const zones = await getZones();
  _keySet = new Set(zones.flatMap((z) => z.tileKeys));
  return _keySet;
}

// Call this after a new zone is downloaded to refresh the key set.
export function invalidateKeySet() {
  _keySet = null;
}

// ─── Tile access ──────────────────────────────────────────────────────────────

// Fast path: checks in-memory set before touching IDB.
// Returns undefined immediately if the tile was never downloaded.
export async function getTileFast(key: string): Promise<Blob | undefined> {
  const keys = await getKeySet();
  if (!keys.has(key)) return undefined;
  return getTile(key);
}

export async function getTile(key: string): Promise<Blob | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(TILES_STORE, 'readonly').objectStore(TILES_STORE).get(key);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result as Blob | undefined);
  });
}

export async function saveTilesBatch(entries: Array<{ key: string; blob: Blob }>): Promise<void> {
  if (entries.length === 0) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TILES_STORE, 'readwrite');
    const store = tx.objectStore(TILES_STORE);
    for (const { key, blob } of entries) {
      store.put(blob, key);
    }
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
  });
}

// ─── Zone management ──────────────────────────────────────────────────────────

export async function getZones(): Promise<ZoneInfo[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(ZONES_STORE, 'readonly').objectStore(ZONES_STORE).getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve((req.result ?? []) as ZoneInfo[]);
  });
}

export async function saveZone(zone: ZoneInfo): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ZONES_STORE, 'readwrite');
    tx.objectStore(ZONES_STORE).put(zone);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
  });
}

export async function deleteZone(zone: ZoneInfo): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([TILES_STORE, ZONES_STORE], 'readwrite');
    const tileStore = tx.objectStore(TILES_STORE);
    const zoneStore = tx.objectStore(ZONES_STORE);
    for (const key of zone.tileKeys) tileStore.delete(key);
    zoneStore.delete(zone.id);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => { invalidateKeySet(); resolve(); };
  });
}

// ─── Storage info ─────────────────────────────────────────────────────────────

export async function getStorageStats(): Promise<{ usedMo: number; quotaMo: number } | null> {
  if (!navigator.storage?.estimate) return null;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return {
      usedMo: Math.round((usage ?? 0) / 1024 / 1024),
      quotaMo: Math.round((quota ?? 0) / 1024 / 1024),
    };
  } catch {
    return null;
  }
}

// ─── Tile math ────────────────────────────────────────────────────────────────

export function lon2tile(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, z));
}

export function lat2tile(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z),
  );
}

export function estimateTiles(opts: {
  bboxNord: number; bboxSud: number; bboxEst: number; bboxOuest: number;
  zoomMin: number; zoomMax: number;
}): { nbTuiles: number; tailleEstimeeKo: number } {
  let nbTuiles = 0;
  for (let z = opts.zoomMin; z <= opts.zoomMax; z++) {
    const xMin = lon2tile(opts.bboxOuest, z);
    const xMax = lon2tile(opts.bboxEst, z);
    const yMin = lat2tile(opts.bboxNord, z);
    const yMax = lat2tile(opts.bboxSud, z);
    nbTuiles += (Math.abs(xMax - xMin) + 1) * (Math.abs(yMax - yMin) + 1);
  }
  return { nbTuiles, tailleEstimeeKo: nbTuiles * 30 };
}
