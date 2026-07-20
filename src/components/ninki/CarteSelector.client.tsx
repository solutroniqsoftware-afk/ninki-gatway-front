import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, Rectangle, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L, { type LatLng } from "leaflet";
import * as Mgrs from "mgrs";
import { Crosshair, MousePointer2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Bbox {
  nord: number;
  sud: number;
  est: number;
  ouest: number;
}

interface Props {
  onSelect: (bbox: Bbox) => void;
  initialCenter?: [number, number];
  initialZoom?: number;
}

// ─── Tile layer (offline → online) ───────────────────────────────────────────

function SmartTileLayer() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  if (offline) {
    return (
      <TileLayer
        url="/tiles/data/terrain/{z}/{x}/{y}.png"
        attribution="Local tiles"
        maxZoom={17}
      />
    );
  }
  return (
    <TileLayer
      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      attribution="ESRI World Imagery"
      maxZoom={17}
    />
  );
}

// ─── Rectangle draw interaction ───────────────────────────────────────────────

interface DrawProps {
  active: boolean;
  onComplete: (bbox: Bbox) => void;
}

function DrawTool({ active, onComplete }: DrawProps) {
  const map = useMap();
  const startRef = useRef<LatLng | null>(null);
  const [rect, setRect] = useState<[number, number][]>([]);

  useEffect(() => {
    if (active) {
      map.dragging.disable();
      map.getContainer().style.cursor = "crosshair";
    } else {
      map.dragging.enable();
      map.getContainer().style.cursor = "";
      startRef.current = null;
      setRect([]);
    }
  }, [active, map]);

  useMapEvents({
    mousedown(e) {
      if (!active) return;
      startRef.current = e.latlng;
    },
    mousemove(e) {
      if (!active || !startRef.current) return;
      const s = startRef.current;
      setRect([
        [Math.max(s.lat, e.latlng.lat), Math.min(s.lng, e.latlng.lng)],
        [Math.min(s.lat, e.latlng.lat), Math.max(s.lng, e.latlng.lng)],
      ]);
    },
    mouseup(e) {
      if (!active || !startRef.current) return;
      const s = startRef.current;
      const nord = Math.max(s.lat, e.latlng.lat);
      const sud = Math.min(s.lat, e.latlng.lat);
      const ouest = Math.min(s.lng, e.latlng.lng);
      const est = Math.max(s.lng, e.latlng.lng);
      startRef.current = null;
      if (Math.abs(nord - sud) > 0.001 && Math.abs(est - ouest) > 0.001) {
        onComplete({ nord, sud, est, ouest });
      }
    },
  });

  if (rect.length !== 2) return null;
  return (
    <Rectangle
      bounds={rect as [[number, number], [number, number]]}
      pathOptions={{ color: "#00d4ff", weight: 2, fillColor: "#00d4ff", fillOpacity: 0.12 }}
    />
  );
}

// ─── Confirmed selection display ──────────────────────────────────────────────

function SelectionRect({ bbox }: { bbox: Bbox | null }) {
  if (!bbox) return null;
  return (
    <Rectangle
      bounds={[
        [bbox.nord, bbox.ouest],
        [bbox.sud, bbox.est],
      ]}
      pathOptions={{ color: "#00ff88", weight: 2, dashArray: "6 4", fillColor: "#00ff88", fillOpacity: 0.1 }}
    />
  );
}

// ─── MGRS corner label ────────────────────────────────────────────────────────

function mgrs(lat: number, lon: number): string {
  try {
    return Mgrs.forward([lon, lat], 4);
  } catch {
    return `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function CarteSelector({ onSelect, initialCenter = [14.7, -17.44], initialZoom = 12 }: Props) {
  const [drawMode, setDrawMode] = useState(false);
  const [selection, setSelection] = useState<Bbox | null>(null);

  const handleComplete = useCallback(
    (bbox: Bbox) => {
      setSelection(bbox);
      setDrawMode(false);
      onSelect(bbox);
    },
    [onSelect],
  );

  const reset = () => {
    setSelection(null);
    setDrawMode(false);
  };

  return (
    <div className="relative w-full h-full rounded overflow-hidden" style={{ minHeight: 400 }}>
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        style={{ width: "100%", height: "100%" }}
        zoomControl={false}
        attributionControl={false}
      >
        <SmartTileLayer />
        <DrawTool active={drawMode} onComplete={handleComplete} />
        <SelectionRect bbox={selection} />
      </MapContainer>

      {/* Controls overlay */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2">
        <button
          onClick={() => { setDrawMode((v) => !v); if (drawMode) reset(); }}
          title={drawMode ? "Annuler la sélection" : "Tracer la zone de téléchargement"}
          className={`flex items-center gap-2 px-3 py-2 text-[11px] font-mono uppercase tracking-widest border transition ${
            drawMode
              ? "bg-[#00d4ff]/20 border-[#00d4ff] text-[#00d4ff]"
              : "bg-[#0a0e1a]/80 border-[#1e3a5f] text-[#8899aa] hover:border-[#00d4ff] hover:text-[#00d4ff]"
          }`}
        >
          {drawMode ? <MousePointer2 className="h-3.5 w-3.5" /> : <Crosshair className="h-3.5 w-3.5" />}
          {drawMode ? "Cliquer–glisser" : "Sélectionner zone"}
        </button>

        {selection && (
          <button
            onClick={reset}
            className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest border border-[#ff2d55]/40 text-[#ff2d55]/70 hover:border-[#ff2d55] hover:text-[#ff2d55] bg-[#0a0e1a]/80 transition"
          >
            Effacer
          </button>
        )}
      </div>

      {/* MGRS corners */}
      {selection && (
        <>
          <div className="absolute top-3 left-3 z-[1000] bg-[#0a0e1a]/90 border border-[#1e3a5f] px-2 py-1 font-mono text-[9px] text-[#00ff88]">
            NW {mgrs(selection.nord, selection.ouest)}
          </div>
          <div className="absolute bottom-3 right-3 z-[1000] bg-[#0a0e1a]/90 border border-[#1e3a5f] px-2 py-1 font-mono text-[9px] text-[#00ff88]">
            SE {mgrs(selection.sud, selection.est)}
          </div>
        </>
      )}

      {/* Help overlay when draw mode is active */}
      {drawMode && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] bg-[#0a0e1a]/90 border border-[#00d4ff]/30 px-4 py-2 font-mono text-[10px] text-[#00d4ff] uppercase tracking-widest pointer-events-none">
          Cliquer et glisser pour délimiter la zone
        </div>
      )}
    </div>
  );
}
