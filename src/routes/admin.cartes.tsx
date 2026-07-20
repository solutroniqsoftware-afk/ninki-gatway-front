import { createFileRoute } from "@tanstack/react-router";
import { createClientOnlyFn } from "@tanstack/react-start";
import { lazy, Suspense, useState, useCallback, useEffect, useRef } from "react";
import {
  Download, Map, Trash2, Archive, CheckCircle, AlertTriangle,
  HardDrive, Wifi, WifiOff, Loader2,
} from "lucide-react";
import {
  estimateTiles, getZones, saveZone, deleteZone, saveTilesBatch,
  getStorageStats, lon2tile, lat2tile, invalidateKeySet,
  type ZoneInfo,
} from "@/lib/ninki/tiles-cache";

export const Route = createFileRoute("/admin/cartes")({
  component: CartesPage,
});

// ─── Dynamic Leaflet import (SSR-safe) ───────────────────────────────────────

const loadCarteSelector = createClientOnlyFn(
  () => import("@/components/ninki/CarteSelector.client"),
);

const CarteSelectorLazy = lazy(async () => {
  const mod = await loadCarteSelector();
  return { default: mod.CarteSelector };
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface Bbox { nord: number; sud: number; est: number; ouest: number }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtSize(ko: number): string {
  return ko < 1024 ? `${ko} Ko` : `${(ko / 1024).toFixed(1)} Mo`;
}

function zoomLabel(z: number): string {
  const m: Record<number, string> = { 8:"Région", 9:"Région", 10:"Zone", 11:"Zone", 12:"Tactique", 13:"Tactique", 14:"Précision", 15:"Précision", 16:"Détail" };
  return m[z] ?? `Z${z}`;
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ─── Download engine ─────────────────────────────────────────────────────────

// CartoDB Dark Matter — même source que la carte affichée → cohérence online/offline
const CARTO_TILE = "https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all";
const OSM_TILE   = "https://tile.openstreetmap.org";       // fallback si CartoDB indisponible
const ESRI_TILE  = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";
const CONCURRENCY = 8;
const MAX_TILES = 5000;

// Bounding box Sénégal entier (WGS84)
const SENEGAL_BBOX: Bbox = { nord: 16.7, sud: 10.5, ouest: -17.8, est: -11.0 };
const SENEGAL_ZOOM_MIN = 5;
const SENEGAL_ZOOM_MAX = 13;

// Fetch avec timeout compatible tous navigateurs (pas de AbortSignal.timeout).
function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  return fetch(url, { signal: ac.signal }).finally(() => clearTimeout(timer));
}

async function fetchTileBlob(z: number, x: number, y: number): Promise<Blob | null> {
  const sources = [
    // Source 1 : CartoDB Dark Matter — même style que la carte affichée
    `${CARTO_TILE}/${z}/${x}/${y}.png`,
    // Source 2 : OSM fallback
    `${OSM_TILE}/${z}/${x}/${y}.png`,
    // Source 3 : ESRI fallback (z/row/col = z/y/x)
    `${ESRI_TILE}/${z}/${y}/${x}`,
    // Source 4 : tileserver-gl local si disponible
    `${window.location.origin}/tiles/data/senegal/${z}/${x}/${y}.png`,
  ];
  for (const url of sources) {
    try {
      const res = await fetchWithTimeout(url, 8000);
      if (!res.ok) continue;
      const blob = await res.blob();
      if (blob.size > 0) return blob; // ignorer les réponses vides
    } catch {
      // source indisponible → essayer la suivante
    }
  }
  return null;
}

async function downloadZone(
  nom: string,
  bbox: Bbox,
  zoomMin: number,
  zoomMax: number,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<ZoneInfo> {
  // Build tile list
  const tiles: Array<{ z: number; x: number; y: number; key: string }> = [];
  for (let z = zoomMin; z <= zoomMax; z++) {
    const xMin = lon2tile(bbox.ouest, z);
    const xMax = lon2tile(bbox.est,   z);
    const yMin = lat2tile(bbox.nord,  z);
    const yMax = lat2tile(bbox.sud,   z);
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tiles.push({ z, x, y, key: `${z}/${x}/${y}` });
      }
    }
  }

  let done = 0;
  let totalKo = 0;
  const tileKeys: string[] = [];
  const batch: Array<{ key: string; blob: Blob }> = [];

  // Concurrency queue
  let idx = 0;
  async function worker() {
    while (idx < tiles.length) {
      if (signal.aborted) return;
      const tile = tiles[idx++];
      const blob = await fetchTileBlob(tile.z, tile.x, tile.y);
      if (blob) {
        batch.push({ key: tile.key, blob });
        tileKeys.push(tile.key);
        totalKo += Math.ceil(blob.size / 1024);

        // Flush to IndexedDB every 50 tiles to avoid memory pressure
        if (batch.length >= 50) {
          await saveTilesBatch([...batch]);
          batch.length = 0;
        }
      }
      onProgress(++done, tiles.length);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (signal.aborted) throw new DOMException("Annulé", "AbortError");

  // Flush du batch restant en IDB
  if (batch.length > 0) await saveTilesBatch(batch);

  // Aucune tuile récupérée → les deux sources sont inaccessibles
  if (tileKeys.length === 0) {
    throw new Error(
      "Aucune tuile n'a pu être téléchargée.\n" +
      "Vérifiez que la plateforme est accessible et que le réseau est actif.",
    );
  }

  const zone: ZoneInfo = {
    id: uid(),
    nom,
    bboxNord:  bbox.nord,
    bboxSud:   bbox.sud,
    bboxEst:   bbox.est,
    bboxOuest: bbox.ouest,
    zoomMin,
    zoomMax,
    tileKeys,
    nbTuiles:  tileKeys.length,
    tailleKo:  totalKo,
    createdAt: new Date().toISOString(),
  };
  await saveZone(zone);
  invalidateKeySet(); // recharger le Set en mémoire pour la carte principale
  return zone;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function CartesPage() {
  const [bbox, setBbox]         = useState<Bbox | null>(null);
  const [nom, setNom]           = useState("");
  const [zoomMin, setZoomMin]   = useState(10);
  const [zoomMax, setZoomMax]   = useState(14);
  const [zones, setZones]       = useState<ZoneInfo[]>([]);
  const [storage, setStorage]   = useState<{ usedMo: number; quotaMo: number } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState<string | null>(null);
  const abortRef                = useRef<AbortController | null>(null);

  const estimation = bbox
    ? estimateTiles({ bboxNord: bbox.nord, bboxSud: bbox.sud, bboxEst: bbox.est, bboxOuest: bbox.ouest, zoomMin, zoomMax })
    : null;

  const loadData = useCallback(async () => {
    const [z, s] = await Promise.all([getZones(), getStorageStats()]);
    setZones(z.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    setStorage(s);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSelect = useCallback((b: Bbox) => {
    setBbox(b);
    setError(null);
    setSuccess(null);
  }, []);

  const handleDownload = async () => {
    if (!bbox)         { setError("Tracez une zone sur la carte."); return; }
    if (!nom.trim())   { setError("Donnez un nom à la zone."); return; }
    if (zoomMin > zoomMax) { setError("Zoom min doit être ≤ zoom max."); return; }
    if (estimation && estimation.nbTuiles > MAX_TILES) {
      setError(`Zone trop grande (${estimation.nbTuiles} tuiles max ${MAX_TILES}). Réduisez la zone.`);
      return;
    }

    const ac = new AbortController();
    abortRef.current = ac;
    setDownloading(true);
    setError(null);
    setSuccess(null);
    setProgress({ done: 0, total: estimation?.nbTuiles ?? 0 });

    try {
      const zone = await downloadZone(
        nom.trim(), bbox, zoomMin, zoomMax,
        (d, t) => setProgress({ done: d, total: t }),
        ac.signal,
      );
      setSuccess(`Zone "${zone.nom}" disponible hors ligne — ${zone.nbTuiles} tuiles (${fmtSize(zone.tailleKo)}).`);
      setNom("");
      setBbox(null);
      await loadData();
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setError("Téléchargement annulé.");
      } else {
        setError("Erreur lors du téléchargement. Vérifiez la connexion réseau.");
        console.error(e);
      }
    } finally {
      setDownloading(false);
      abortRef.current = null;
    }
  };

  const handleDelete = async (zone: ZoneInfo) => {
    await deleteZone(zone);
    await loadData();
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const handleDownloadSenegal = async () => {
    const ac = new AbortController();
    abortRef.current = ac;
    setDownloading(true);
    setError(null);
    setSuccess(null);
    const total = estimateTiles({
      bboxNord: SENEGAL_BBOX.nord, bboxSud: SENEGAL_BBOX.sud,
      bboxEst: SENEGAL_BBOX.est, bboxOuest: SENEGAL_BBOX.ouest,
      zoomMin: SENEGAL_ZOOM_MIN, zoomMax: SENEGAL_ZOOM_MAX,
    });
    setProgress({ done: 0, total: total.nbTuiles });
    try {
      const zone = await downloadZone(
        "Sénégal Complet", SENEGAL_BBOX, SENEGAL_ZOOM_MIN, SENEGAL_ZOOM_MAX,
        (d, t) => setProgress({ done: d, total: t }),
        ac.signal,
      );
      setSuccess(`Sénégal disponible hors ligne — ${zone.nbTuiles.toLocaleString()} tuiles (${fmtSize(zone.tailleKo)}).`);
      await loadData();
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setError("Téléchargement annulé.");
      } else {
        setError("Erreur réseau — vérifiez la connexion internet avant de partir sur le terrain.");
      }
    } finally {
      setDownloading(false);
      abortRef.current = null;
    }
  };

  const canDownload = !!bbox && !!nom.trim() && !downloading
    && (!estimation || estimation.nbTuiles <= MAX_TILES);

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="flex flex-col h-full bg-[#0a0e1a] overflow-auto">

      {/* ── Header ── */}
      <div className="px-6 pt-5 pb-4 border-b border-[#1e3a5f]/60 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Map className="h-5 w-5 text-[#00d4ff]" />
          <div>
            <h1 className="text-sm font-mono uppercase tracking-widest text-[#00d4ff]">
              Cartes Hors Ligne
            </h1>
            <p className="text-[10px] text-[#8899aa] mt-0.5 font-mono">
              Téléchargez une zone avant de partir sur le terrain — fonctionne sans réseau
            </p>
          </div>
        </div>

        {/* Indicateur connexion + stockage */}
        <div className="flex items-center gap-4">
          <OnlineIndicator />
          {storage && (
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#8899aa]">
              <HardDrive className="h-3 w-3" />
              {storage.usedMo} Mo utilisés
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* ── Left panel ── */}
        <aside className="w-72 shrink-0 border-r border-[#1e3a5f]/60 flex flex-col overflow-y-auto">
          <div className="p-4 space-y-5">

            {/* ── Preset Sénégal complet ── */}
            <div className="rounded border border-[#00d4ff]/25 bg-[#00d4ff]/5 p-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-[#00d4ff] mb-1">
                Preset · Sénégal Complet
              </div>
              <p className="text-[10px] text-[#8899aa] mb-3 leading-relaxed">
                Télécharge tout le Sénégal (zoom 5→13, ~24 000 tuiles).
                À faire <span className="text-[#c8d8e8]">une seule fois</span> avant le déploiement terrain.
                Durée estimée : 15-30 min.
              </p>
              <button
                onClick={handleDownloadSenegal}
                disabled={downloading}
                className="w-full flex items-center justify-center gap-2 bg-[#00d4ff]/15 border border-[#00d4ff]/50 text-[#00d4ff] font-mono text-xs uppercase tracking-widest px-3 py-2 hover:bg-[#00d4ff]/25 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="h-3.5 w-3.5" />
                Télécharger Sénégal Complet
              </button>
            </div>

            <div className="border-t border-[#1e3a5f]/60 pt-4">
              <div className="text-[10px] font-mono uppercase tracking-widest text-[#8899aa] mb-3">
                Zone personnalisée
              </div>
            </div>

            {/* Nom */}
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-[#8899aa] mb-1.5">
                Nom de la zone
              </label>
              <input
                type="text"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="Ex : Zone Dakar Nord"
                maxLength={60}
                disabled={downloading}
                className="w-full bg-[#0d1b2e] border border-[#1e3a5f] text-[#c8d8e8] font-mono text-xs px-3 py-2 focus:outline-none focus:border-[#00d4ff] placeholder-[#4a6a8a] transition disabled:opacity-50"
              />
            </div>

            {/* Zoom */}
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-[#8899aa] mb-2">
                Niveaux de zoom
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(["min", "max"] as const).map((k) => (
                  <div key={k}>
                    <div className="text-[9px] font-mono uppercase text-[#4a6a8a] mb-1">
                      {k === "min" ? "Vue large" : "Détail"}
                    </div>
                    <select
                      value={k === "min" ? zoomMin : zoomMax}
                      onChange={(e) => k === "min" ? setZoomMin(+e.target.value) : setZoomMax(+e.target.value)}
                      disabled={downloading}
                      className="w-full bg-[#0d1b2e] border border-[#1e3a5f] text-[#c8d8e8] font-mono text-xs px-2 py-1.5 focus:outline-none focus:border-[#00d4ff] transition disabled:opacity-50"
                    >
                      {[8,9,10,11,12,13,14,15,16].map((z) => (
                        <option key={z} value={z}>Z{z} — {zoomLabel(z)}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <p className="text-[9px] text-[#4a6a8a] font-mono mt-1.5">
                Recommandé : Z10 (zone) → Z14 (précision)
              </p>
            </div>

            {/* Estimation */}
            {estimation && (
              <div className="border border-[#1e3a5f] bg-[#0d1b2e] p-3 space-y-1.5">
                <div className="text-[9px] font-mono uppercase tracking-widest text-[#4a6a8a] mb-2">Estimation</div>
                <div className="flex justify-between font-mono text-[11px]">
                  <span className="text-[#8899aa]">Tuiles</span>
                  <span className={estimation.nbTuiles > MAX_TILES ? "text-[#ff2d55]" : "text-[#00ff88]"}>
                    {estimation.nbTuiles.toLocaleString("fr-FR")}
                    {estimation.nbTuiles > MAX_TILES && " — trop grand"}
                  </span>
                </div>
                <div className="flex justify-between font-mono text-[11px]">
                  <span className="text-[#8899aa]">Taille approx.</span>
                  <span className="text-[#00d4ff]">{fmtSize(estimation.tailleEstimeeKo)}</span>
                </div>
              </div>
            )}

            {/* Progression */}
            {downloading && (
              <div className="border border-[#00d4ff]/30 bg-[#00d4ff]/5 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[10px] font-mono text-[#00d4ff]">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Téléchargement…
                  </div>
                  <span className="font-mono text-[10px] text-[#8899aa]">{pct}%</span>
                </div>
                <div className="h-1 bg-[#0d1b2e] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#00d4ff] transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-[9px] font-mono text-[#4a6a8a] text-right">
                  {progress.done} / {progress.total} tuiles
                </div>
                <button
                  onClick={handleCancel}
                  className="w-full text-[9px] font-mono uppercase tracking-widest text-[#ff2d55]/70 hover:text-[#ff2d55] border border-[#ff2d55]/20 hover:border-[#ff2d55]/50 py-1 transition"
                >
                  Annuler
                </button>
              </div>
            )}

            {/* Messages */}
            {error && !downloading && (
              <div className="flex items-start gap-2 border border-[#ff2d55]/40 bg-[#ff2d55]/8 p-3">
                <AlertTriangle className="h-3.5 w-3.5 text-[#ff2d55] shrink-0 mt-0.5" />
                <p className="text-[10px] font-mono text-[#ff2d55]">{error}</p>
              </div>
            )}
            {success && (
              <div className="flex items-start gap-2 border border-[#00ff88]/40 bg-[#00ff88]/8 p-3">
                <CheckCircle className="h-3.5 w-3.5 text-[#00ff88] shrink-0 mt-0.5" />
                <p className="text-[10px] font-mono text-[#00ff88]">{success}</p>
              </div>
            )}

            {/* Bouton */}
            {!downloading && (
              <button
                onClick={handleDownload}
                disabled={!canDownload}
                className={`w-full flex items-center justify-center gap-2 py-3 font-mono text-xs uppercase tracking-widest border transition ${
                  canDownload
                    ? "bg-[#00d4ff]/10 border-[#00d4ff] text-[#00d4ff] hover:bg-[#00d4ff]/20 cursor-pointer"
                    : "bg-[#0d1b2e] border-[#1e3a5f] text-[#4a6a8a] cursor-not-allowed"
                }`}
              >
                <Download className="h-3.5 w-3.5" />
                {bbox ? "Télécharger la zone" : "Tracez une zone sur la carte"}
              </button>
            )}

            {/* Aide */}
            <div className="border-t border-[#1e3a5f]/40 pt-4 space-y-1.5">
              <div className="text-[9px] font-mono uppercase tracking-widest text-[#4a6a8a] mb-2">Comment utiliser</div>
              {[
                "1. Tracez la zone sur la carte (cliquer–glisser)",
                "2. Choisissez les niveaux de zoom",
                "3. Téléchargez avant de partir",
                "4. Éteignez le wifi sur le terrain",
                "5. La carte reste disponible sur cet appareil",
              ].map((s) => (
                <div key={s} className="text-[9px] font-mono text-[#8899aa] flex gap-1.5">
                  <span className="text-[#4a6a8a] shrink-0">{s.slice(0, 2)}</span>
                  <span>{s.slice(3)}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* ── Map ── */}
        <div className="flex-1 relative">
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full bg-[#0a0e1a]">
                <div className="text-center">
                  <Map className="h-8 w-8 text-[#1e3a5f] mx-auto mb-3" />
                  <p className="text-xs font-mono text-[#4a6a8a] uppercase tracking-widest">
                    Chargement de la carte…
                  </p>
                </div>
              </div>
            }
          >
            <CarteSelectorLazy onSelect={handleSelect} />
          </Suspense>
        </div>
      </div>

      {/* ── Zones téléchargées ── */}
      <div className="shrink-0 border-t border-[#1e3a5f]/60" style={{ maxHeight: 240 }}>
        <div className="px-5 py-2.5 flex items-center gap-2 border-b border-[#1e3a5f]/40">
          <Archive className="h-3.5 w-3.5 text-[#8899aa]" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#8899aa]">
            Zones disponibles hors ligne ({zones.length})
          </span>
        </div>
        <div className="overflow-auto" style={{ maxHeight: 188 }}>
          {zones.length === 0 ? (
            <div className="flex items-center gap-2 px-5 py-4 text-[10px] font-mono text-[#4a6a8a]">
              <WifiOff className="h-3.5 w-3.5" />
              Aucune zone téléchargée. La carte de la plateforme nécessite le réseau.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1e3a5f]/30">
                  {["Zone", "Zoom", "Tuiles", "Taille", "Date", ""].map((h) => (
                    <th key={h} className="px-4 py-2 text-left text-[9px] font-mono uppercase tracking-widest text-[#4a6a8a]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {zones.map((z) => (
                  <tr key={z.id} className="border-b border-[#1e3a5f]/20 hover:bg-[#1e3a5f]/10 transition group">
                    <td className="px-4 py-2 font-mono text-[11px] text-[#c8d8e8] font-medium">{z.nom}</td>
                    <td className="px-4 py-2 font-mono text-[10px] text-[#8899aa]">Z{z.zoomMin}→Z{z.zoomMax}</td>
                    <td className="px-4 py-2 font-mono text-[10px] text-[#00d4ff]">{z.nbTuiles.toLocaleString("fr-FR")}</td>
                    <td className="px-4 py-2 font-mono text-[10px] text-[#00ff88]">{fmtSize(z.tailleKo)}</td>
                    <td className="px-4 py-2 font-mono text-[10px] text-[#8899aa] whitespace-nowrap">
                      {new Date(z.createdAt).toLocaleDateString("fr-FR", { day:"2-digit", month:"2-digit", year:"2-digit" })}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => handleDelete(z)}
                        title="Supprimer du cache"
                        className="opacity-0 group-hover:opacity-100 text-[#ff2d55]/50 hover:text-[#ff2d55] transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Online indicator ─────────────────────────────────────────────────────────

function OnlineIndicator() {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  useEffect(() => {
    const on  = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online",  on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  return (
    <div className={`flex items-center gap-1.5 text-[10px] font-mono ${online ? "text-[#00ff88]" : "text-[#ffb800]"}`}>
      {online
        ? <><Wifi className="h-3 w-3" /> En ligne</>
        : <><WifiOff className="h-3 w-3" /> Hors ligne — cache actif</>
      }
    </div>
  );
}
