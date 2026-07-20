import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polygon, Polyline, Popup, useMap, useMapEvents, ZoomControl } from "react-leaflet";
import { getTileFast } from "@/lib/ninki/tiles-cache";
import L, { type LatLngTuple } from "leaflet";
import * as Mgrs from "mgrs";
import type { Piece, WeatherData, Alerte } from "@/lib/ninki/types";
import { useNinki, isEclaireur, isStationMeteo } from "@/lib/ninki/store";
import { useConfig, type ConfigBatterie } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Crosshair,
  Grid3x3,
  Maximize2,
  Minimize2,
  Tag,
  Target,
  Thermometer,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────


// ─── Bounds ───────────────────────────────────────────────────────────────────

// Sénégal complet — vue par défaut quand aucune pièce n'a de GPS
const SENEGAL_BOUNDS = L.latLngBounds([[10.5, -17.8], [16.7, -11.0]]);
const SENEGAL_CENTER: [number, number] = [14.4, -14.4];

function hasValidGps(p: Piece) { return p.lat !== 0 || p.lng !== 0; }

function getTacticalBounds(pieces: Piece[]) {
  const valid = pieces.filter(hasValidGps);
  if (valid.length === 0) return SENEGAL_BOUNDS;
  const raw = L.latLngBounds(valid.map((p) => [p.lat, p.lng]));
  const latPad = Math.max((raw.getNorth() - raw.getSouth()) * 0.35, 0.008);
  const lngPad = Math.max((raw.getEast() - raw.getWest()) * 0.35, 0.008);
  return L.latLngBounds([
    [raw.getSouth() - latPad, raw.getWest() - lngPad],
    [raw.getNorth() + latPad, raw.getEast() + lngPad],
  ]);
}

// ─── Theme color helper ───────────────────────────────────────────────────────
// Lit les CSS vars résolues au moment de l'appel — utilisé par les fonctions
// qui génèrent des SVG/HTML strings (pas d'accès direct aux CSS vars).

function getThemeColors() {
  const s = getComputedStyle(document.documentElement);
  const get = (v: string) => s.getPropertyValue(v).trim();
  return {
    isDark:      document.documentElement.getAttribute('data-theme') !== 'light',
    cyan:        get('--cyan-live'),
    success:     get('--success'),
    warning:     get('--warning'),
    danger:      get('--danger'),
    textPrim:    get('--text-primary'),
    textSec:     get('--text-secondary'),
    bgElevated:  get('--bg-elevated'),
    borderSteel: get('--border-steel'),
  };
}

// ─── Canon SVG builder — diamant HUD tactique ────────────────────────────────

function buildCanonSVG(_azimut: number, color: string, numero: string, showNumero: boolean): string {
  const numText = showNumero
    ? `<text x="18" y="22" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="7" font-weight="700" fill="${color}">P${numero}</text>`
    : "";
  return `
    <svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" style="display:block;">
      <polygon points="18,2 34,18 18,34 2,18" fill="none" stroke="${color}" stroke-width="1.5"/>
      <polygon points="18,8 28,18 18,28 8,18" fill="${color}22" stroke="${color}" stroke-width="1"/>
      <circle cx="18" cy="18" r="2" fill="${color}"/>
      <line x1="0"  y1="18" x2="6"  y2="18" stroke="${color}" stroke-width="1" opacity="0.6"/>
      <line x1="30" y1="18" x2="36" y2="18" stroke="${color}" stroke-width="1" opacity="0.6"/>
      <line x1="18" y1="0"  x2="18" y2="6"  stroke="${color}" stroke-width="1" opacity="0.6"/>
      <line x1="18" y1="30" x2="18" y2="36" stroke="${color}" stroke-width="1" opacity="0.6"/>
      ${numText}
    </svg>`;
}

// ─── Label HTML builder ───────────────────────────────────────────────────────

function buildLabelHTML(piece: Piece, cfg: ConfigBatterie): string {
  const tc = getThemeColors();

  // Couleur statut — doit correspondre à l'icône SVG (même appel tc.xxx)
  const color =
    piece.statut === "operational" ? tc.cyan :
    piece.statut === "degraded"   ? (tc.isDark ? "#FF6B00" : "#8C3A00") : tc.danger;

  // Fond panel
  const panelBg = tc.isDark
    ? "rgba(10,14,26,0.93)"
    : "rgba(255,255,255,0.95)";

  // Bordure selon statut (shorthand complet — utilisé directement dans border:${borderColor})
  const borderColor = tc.isDark
    ? (piece.statut === "operational"
        ? "1px solid rgba(0,212,255,0.28)"
        : piece.statut === "degraded"
          ? "1px solid rgba(255,107,0,0.28)"
          : "1px solid rgba(255,45,85,0.22)")
    : (piece.statut === "operational"
        ? `2px solid ${tc.cyan}`
        : piece.statut === "degraded"
          ? "2px solid #8C3A00"
          : `2px solid ${tc.danger}`);

  // Séparateur
  const separator = tc.isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";

  // Textes
  const textSec  = tc.isDark ? "#7A9CC0" : tc.textSec;
  const textPrim = tc.isDark ? "#E8F4FD" : tc.textPrim;

  // Halo panel : dark seulement
  const glowStyle = piece.statut === "operational" && tc.isDark
    ? `box-shadow:0 0 3px rgba(0,255,136,0.15);` : "";

  const numero = String(piece.numero).padStart(2, "0");

  let content: string;

  if (piece.statut === "offline") {
    const lastSeen = new Date(piece.derniereActivite).toLocaleTimeString("fr-FR", {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    content = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
        <span style="color:${textSec};font-size:9px;letter-spacing:0.08em;">STATUT</span>
        <span style="color:${tc.danger};font-size:10px;font-weight:600;">HORS LIGNE</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="color:${textSec};font-size:9px;letter-spacing:0.08em;">DERNIÈRE</span>
        <span style="color:${textSec};font-size:10px;">${lastSeen}</span>
      </div>`;
  } else {
    const temp = piece.temperature ?? 0;
    const tempColor =
      temp >= cfg.tempCritique ? tc.danger :
      temp >= cfg.tempDegrade  ? tc.warning : tc.success;

    const stockColor = piece.stockObus <= cfg.stockAlerte ? tc.danger : textPrim;

    const deltaAz   = (piece.azimutReel ?? 0) - (piece.azimutConsigne ?? 0);
    const absDelta  = Math.abs(deltaAz);
    const deltaColor =
      absDelta >= cfg.azimutCritique   ? tc.danger :
      absDelta >= cfg.azimutCorrection ? tc.warning : tc.success;
    const deltaSign  = deltaAz >= 0 ? "+" : "";
    const deltaWarn  = absDelta >= cfg.azimutCorrection;
    const deltaCrit  = absDelta >= cfg.azimutCritique;

    content = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
        <span style="color:${textSec};font-size:9px;letter-spacing:0.08em;">TEMP</span>
        <span style="color:${tempColor};font-size:10px;">${temp.toFixed(0)}°C${temp >= cfg.tempDegrade ? "&nbsp;!" : ""}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
        <span style="color:${textSec};font-size:9px;letter-spacing:0.08em;">TIRS</span>
        <span style="color:${textPrim};font-size:10px;">${piece.nombreTirs}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
        <span style="color:${textSec};font-size:9px;letter-spacing:0.08em;">STOCK</span>
        <span style="color:${stockColor};font-size:10px;">${piece.stockObus}${piece.stockObus <= cfg.stockAlerte ? "&nbsp;!" : ""}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="color:${textSec};font-size:9px;letter-spacing:0.08em;">ΔAZ</span>
        <span style="color:${deltaColor};font-size:10px;">${deltaSign}${deltaAz.toFixed(1)}°${deltaCrit ? "&nbsp;!" : deltaWarn ? "&nbsp;▲" : ""}</span>
      </div>`;
  }

  return `
    <div style="
      background:${panelBg};
      border:${borderColor};
      border-radius:3px;
      padding:5px 8px 5px;
      min-width:128px;
      max-width:148px;
      font-family:'JetBrains Mono',monospace;
      pointer-events:none;
      ${glowStyle}
    ">
      <div style="
        display:flex;align-items:center;justify-content:space-between;
        padding-bottom:4px;margin-bottom:4px;
        border-bottom:1px solid ${separator};
      ">
        <span style="font-weight:600;color:${color};font-size:10px;letter-spacing:0.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:110px;">
          P${numero}&nbsp;·&nbsp;${piece.nom}
        </span>
        <span style="width:6px;height:6px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0;margin-left:4px;${piece.statut === "operational" ? `box-shadow:0 0 4px ${color};` : ""}"></span>
      </div>
      <div style="min-height:64px;">
        ${content}
      </div>
    </div>`;
}

// ─── Icon factory ─────────────────────────────────────────────────────────────

// Label geometry:
//   label ~105px tall (padding 10 + header 22 + content-min 64 + separator-margin 9)
//   connector 6px → diamond top at 111px → diamond center at 129px from icon top
const LABEL_ICON_SIZE: [number, number]   = [152, 152];
const LABEL_ICON_ANCHOR: [number, number] = [76, 129];
const LABEL_POPUP_ANCHOR: [number, number] = [0, -140];

const SIMPLE_ICON_SIZE: [number, number]   = [36, 36];
const SIMPLE_ICON_ANCHOR: [number, number] = [18, 18];
const SIMPLE_POPUP_ANCHOR: [number, number] = [0, -22];

function makeCanonIcon(
  piece: Piece,
  firing: boolean,
  showLabel: boolean,
  config: ConfigBatterie | null,
): L.DivIcon {
  const tc = getThemeColors();

  const color =
    piece.statut === "operational" ? tc.cyan :
    piece.statut === "degraded"   ? (tc.isDark ? "#FF6B00" : "#8C3A00") : tc.danger;

  const numero = String(piece.numero).padStart(2, "0");

  const fireRing = firing
    ? `<div style="position:absolute;inset:-10px;border-radius:50%;background:radial-gradient(circle,rgba(255,184,0,0.9) 0%,rgba(255,80,0,0.3) 55%,transparent 80%);pointer-events:none;"></div>`
    : "";

  const effectiveLabel = showLabel && config !== null;

  if (!effectiveLabel) {
    const svg = buildCanonSVG(piece.azimutReel, color, numero, true);
    return L.divIcon({
      html: `<div style="position:relative;width:36px;height:36px;">${fireRing}${svg}</div>`,
      className: "",
      iconSize: SIMPLE_ICON_SIZE,
      iconAnchor: SIMPLE_ICON_ANCHOR,
      popupAnchor: SIMPLE_POPUP_ANCHOR,
    });
  }

  const svg = buildCanonSVG(piece.azimutReel, color, numero, false);
  const label = buildLabelHTML(piece, config);
  const opacity = piece.statut === "offline" ? "0.55" : "1";

  return L.divIcon({
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;opacity:${opacity};">
        ${label}
        <div style="width:1px;height:6px;background:${tc.isDark ? "rgba(0,212,255,0.25)" : "rgba(0,95,140,0.4)"};flex-shrink:0;"></div>
        <div style="position:relative;width:36px;height:36px;flex-shrink:0;">${fireRing}${svg}</div>
      </div>`,
    className: "",
    iconSize: LABEL_ICON_SIZE,
    iconAnchor: LABEL_ICON_ANCHOR,
    popupAnchor: LABEL_POPUP_ANCHOR,
  });
}

// ─── ROVER icon builder ───────────────────────────────────────────────────────

function buildRoverLabelHTML(piece: Piece): string {
  const tc = getThemeColors();

  const azDeg = piece.azimutReel ?? 0;
  const azMil = azDeg ? Math.round(azDeg * 17.7778) : '—';

  // Dot statut : panel toujours sombre → neon visible dans les deux thèmes
  const dotColor =
    piece.statut === "operational" ? "#00FF88" :
    piece.statut === "degraded"   ? "#FFB800" : "#FF2D55";

  // Fond panel
  const panelBg = tc.isDark
    ? "rgba(10,14,26,0.94)"
    : "rgba(255,255,255,0.95)";

  // Bordure principale (shorthand complet)
  const panelBorder = tc.isDark
    ? "1px solid rgba(255,184,0,0.35)"
    : `2px solid ${tc.cyan}`;

  // Séparateur header
  const panelSep = tc.isDark
    ? "rgba(255,184,0,0.15)"
    : "rgba(0,0,0,0.08)";

  // Textes
  const roverName = tc.isDark ? "#FFB800" : tc.textPrim;
  const textSec   = tc.isDark ? "#7A9CC0" : tc.textSec;
  const textPrim  = tc.isDark ? "#E8F4FD" : tc.textPrim;

  // Couleurs mesures
  const azColor   = tc.isDark ? "#FFB800" : tc.cyan;
  const measColor = tc.isDark ? "#00D4FF" : tc.cyan;

  const row = (label: string, value: string, valueColor = textPrim) =>
    `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
       <span style="color:${textSec};font-size:9px;letter-spacing:0.08em;">${label}</span>
       <span style="color:${valueColor};font-size:10px;font-variant-numeric:tabular-nums;">${value}</span>
     </div>`;

  return `
    <div style="
      background:${panelBg};
      border:${panelBorder};
      border-radius:3px;
      padding:5px 9px 6px;
      min-width:152px;
      font-family:'JetBrains Mono',monospace;
      pointer-events:none;
    ">
      <div style="display:flex;align-items:center;gap:6px;padding-bottom:4px;margin-bottom:4px;border-bottom:1px solid ${panelSep};">
        <span style="font-size:13px;line-height:1;">🔭</span>
        <span style="color:${roverName};font-size:10px;font-weight:700;letter-spacing:0.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:115px;">
          ${piece.nom}
        </span>
        <span style="width:6px;height:6px;border-radius:50%;background:${dotColor};display:inline-block;margin-left:auto;flex-shrink:0;${piece.statut === "operational" ? `box-shadow:0 0 4px ${dotColor};` : ""}"></span>
      </div>
      ${row("AZ", azMil !== '—' ? `${azDeg.toFixed(1)}° / ${azMil} mil` : "—", azColor)}
      ${row("EL", piece.elevationReel != null ? `${(piece.elevationReel).toFixed(2)}°` : "—", measColor)}
      ${row("RH", piece.distanceHorizontale != null ? `${piece.distanceHorizontale} m` : "—", measColor)}
      ${row("RS", piece.distanceSurface != null ? `${piece.distanceSurface} m` : "—", measColor)}
      ${row("LAT", (piece.lat ?? 0).toFixed(6))}
      ${row("LON", (piece.lng ?? 0).toFixed(6))}
    </div>`;
}

// Label ~140px tall (header 30 + 6×15 + padding 10) + connector 6 + crosshair SVG 20
const ROVER_ICON_SIZE: [number, number]   = [168, 170];
const ROVER_ICON_ANCHOR: [number, number] = [84, 156];
const ROVER_POPUP_ANCHOR: [number, number] = [0, -160];

function makeRoverIcon(piece: Piece): L.DivIcon {
  const tc = getThemeColors();
  const label = buildRoverLabelHTML(piece);

  // Crosshair SVG — exposé sur le fond de carte (Positron ou Dark Matter)
  const dotColor =
    piece.statut === "operational" ? (tc.isDark ? "#FFB800" : tc.warning) :
    piece.statut === "degraded"   ? (tc.isDark ? "#FF8800" : "#8C4A00") : tc.danger;

  const crosshair = `
    <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="10" r="4.5" fill="none" stroke="${dotColor}" stroke-width="1.5"/>
      <circle cx="10" cy="10" r="1.5" fill="${dotColor}"/>
      <line x1="0" y1="10" x2="5" y2="10" stroke="${dotColor}" stroke-width="1"/>
      <line x1="15" y1="10" x2="20" y2="10" stroke="${dotColor}" stroke-width="1"/>
      <line x1="10" y1="0" x2="10" y2="5" stroke="${dotColor}" stroke-width="1"/>
      <line x1="10" y1="15" x2="10" y2="20" stroke="${dotColor}" stroke-width="1"/>
    </svg>`;

  return L.divIcon({
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;opacity:${piece.statut === "offline" ? "0.55" : "1"};">
        ${label}
        <div style="width:1px;height:6px;background:${tc.isDark ? "rgba(255,184,0,0.3)" : "rgba(140,82,0,0.4)"};flex-shrink:0;"></div>
        <div style="flex-shrink:0;">${crosshair}</div>
      </div>`,
    className: "",
    iconSize: ROVER_ICON_SIZE,
    iconAnchor: ROVER_ICON_ANCHOR,
    popupAnchor: ROVER_POPUP_ANCHOR,
  });
}

// ─── Leaflet sub-components ───────────────────────────────────────────────────

// ─── Smart tile layer ─────────────────────────────────────────────────────────

// ─── Classe Leaflet au niveau module ─────────────────────────────────────────
// getTileFast : Set en mémoire d'abord → IDB seulement si la clé est connue.
// Évite tout aller-retour IDB pour les tuiles hors cache (cas majoritaire).

// Tuiles locales SBC (offline) — dark et light, zoom 0-13, Sénégal complet
const LOCAL_DARK_URL  = '/tiles/data/senegal-dark/{z}/{x}/{y}.png';
const LOCAL_LIGHT_URL = '/tiles/data/senegal-light/{z}/{x}/{y}.png';

// Fallback internet — CartoDB (sans clé API, couverture mondiale)
const CDN_DARK_URL  = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';
const CDN_LIGHT_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';

// Vérifie si tileserver-gl est up et contient des tuiles Sénégal.
// Probe sur le TileJSON (disponible même avec MBTiles vide) puis sur une tuile réelle.
let _localAvailable: boolean | null = null;
async function checkLocalServer(): Promise<boolean> {
  try {
    // Étape 1 : tileserver-gl répond ?
    const info = await fetch("/tiles/data/senegal-dark.json", {
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    });
    if (!info.ok) { _localAvailable = false; return false; }
    // Étape 2 : au moins une tuile zoom 5 disponible ?
    const probe = await fetch("/tiles/data/senegal-dark/5/14/15.png", {
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    });
    _localAvailable = probe.ok && probe.headers.get("content-type")?.startsWith("image/") === true;
  } catch {
    _localAvailable = false;
  }
  return _localAvailable ?? false;
}
checkLocalServer();
setInterval(checkLocalServer, 60_000);

class NinkiOfflineTileLayer extends L.TileLayer {
  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const img = document.createElement("img");
    img.setAttribute("role", "presentation");
    const key = `${coords.z}/${coords.x}/${coords.y}`;

    getTileFast(key)
      .then((blob) => {
        if (blob) {
          // 1. Cache IDB — aucun réseau, fonctionne hors ligne
          const blobUrl = URL.createObjectURL(blob);
          img.onload  = () => { URL.revokeObjectURL(blobUrl); done(undefined, img); };
          img.onerror = () => { URL.revokeObjectURL(blobUrl); done(new Error("tile"), img); };
          img.src = blobUrl;
        } else {
          // 2. Réseau : serveur local d'abord, ESRI en fallback
          img.crossOrigin = "";
          img.onload  = () => done(undefined, img);
          img.onerror = () => done(new Error("tile"), img);
          img.src = this.getTileUrl(coords);
        }
      })
      .catch(() => {
        img.crossOrigin = "";
        img.onload  = () => done(undefined, img);
        img.onerror = () => done(new Error("tile"), img);
        img.src = this.getTileUrl(coords);
      });

    return img;
  }
}

// ─── Composant React wrapper ──────────────────────────────────────────────────

function OfflineCacheTileLayer({ url, maxNativeZoom, subdomains }: { url: string; maxNativeZoom: number; subdomains?: string }) {
  const map = useMap();
  const layerRef = useRef<NinkiOfflineTileLayer | null>(null);

  useEffect(() => {
    const layer = new NinkiOfflineTileLayer(url, {
      maxZoom: 22,
      maxNativeZoom,
      keepBuffer: 8,
      subdomains: subdomains ?? "abc",
      errorTileUrl:
        "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    });
    map.addLayer(layer);
    layerRef.current = layer;
    return () => {
      map.removeLayer(layer);
      layerRef.current = null;
    };
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    (layer.options as L.TileLayerOptions).maxNativeZoom = maxNativeZoom;
    layer.setUrl(url);
  }, [url, maxNativeZoom]);

  return null;
}

// ─── SmartTileLayer ───────────────────────────────────────────────────────────
// Priorité : 1) IDB cache (offline-ready) → 2) serveur local tileserver-gl
//            → 3) ESRI (internet requis)
// L'IDB cache est alimenté par admin/cartes (téléchargement Sénégal complet).

function SmartTileLayer({ themeKey }: { themeKey: number }) {
  const [localAvail, setLocalAvail] = useState(_localAvailable === true);

  // Synchronise l'état React avec le probe de module (mis à jour toutes les 60s)
  useEffect(() => {
    const id = setInterval(() => setLocalAvail(_localAvailable === true), 5000);
    return () => clearInterval(id);
  }, []);

  // Ordre de préférence : 1) IDB cache (offline-ready, vérifié dans createTile)
  //                        2) tileserver local dark ou light selon le thème
  //                        3) CartoDB CDN (internet requis, fallback si ni local ni IDB)
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const tileUrl = localAvail
    ? (isDark ? LOCAL_DARK_URL : LOCAL_LIGHT_URL)
    : (isDark ? CDN_DARK_URL   : CDN_LIGHT_URL);
  const maxNativeZoom = localAvail ? 13 : 19;
  const subdomains    = localAvail ? undefined : "abcd";

  // key={themeKey} force le remontage de OfflineCacheTileLayer à chaque changement
  // de thème — garantit le rechargement des tuiles avec la nouvelle URL
  return (
    <OfflineCacheTileLayer key={themeKey} url={tileUrl} maxNativeZoom={maxNativeZoom} subdomains={subdomains} />
  );
}

// ─── MGRS grid overlay ────────────────────────────────────────────────────────

interface MgrsLine { positions: LatLngTuple[]; label?: string; labelPos?: LatLngTuple }


function mgrsToLatLon(prefix: string, e: number, n: number): LatLngTuple | null {
  try {
    const ref = `${prefix}${e.toString().padStart(2,"0")}${n.toString().padStart(2,"0")}`;
    const [lon, lat] = Mgrs.toPoint(ref);
    if (!isFinite(lat) || !isFinite(lon)) return null;
    return [lat, lon];
  } catch { return null; }
}

function MgrsGrid({ themeKey }: { themeKey?: number }) {
  const map = useMap();
  const [vLines, setVLines] = useState<MgrsLine[]>([]);
  const [hLines, setHLines] = useState<MgrsLine[]>([]);
  const [labels, setLabels] = useState<{ pos: LatLngTuple; text: string }[]>([]);

  const rebuild = useCallback(() => {
    const zoom  = map.getZoom();
    if (zoom < 10) { setVLines([]); setHLines([]); setLabels([]); return; }

    const b   = map.getBounds();
    const sw  = b.getSouthWest();
    const ne  = b.getNorthEast();

    // 10km grid at zoom < 12, 1km grid at zoom >= 12
    const step = zoom >= 12 ? 1 : 10;

    // Extract 2-digit E and N from 4-digit MGRS suffix
    const extract = (ref: string) => {
      const digits = ref.slice(5); // after "28PBB"
      const half = Math.floor(digits.length / 2);
      return { prefix: ref.slice(0,5), e: parseInt(digits.slice(0,half),10), n: parseInt(digits.slice(half),10) };
    };

    let sw4: ReturnType<typeof extract>, ne4: ReturnType<typeof extract>;
    try {
      const swFull = Mgrs.forward([sw.lng, sw.lat], 2);
      const neFull = Mgrs.forward([ne.lng, ne.lat], 2);
      sw4 = extract(swFull);
      ne4 = extract(neFull);
    } catch { return; }

    const prefix = sw4.prefix;
    const eMin   = Math.floor(sw4.e / step) * step;
    const eMax   = Math.ceil(ne4.e  / step) * step;
    const nMin   = Math.floor(sw4.n / step) * step;
    const nMax   = Math.ceil(ne4.n  / step) * step;

    // Safety: limit grid cells
    if ((eMax - eMin) / step > 50 || (nMax - nMin) / step > 50) { return; }

    const newVLines: MgrsLine[] = [];
    const newHLines: MgrsLine[] = [];
    const newLabels: { pos: LatLngTuple; text: string }[] = [];

    for (let e = eMin; e <= eMax; e += step) {
      const pts: LatLngTuple[] = [];
      for (let n = nMin; n <= nMax; n += step) {
        const pt = mgrsToLatLon(prefix, e, n);
        if (pt) pts.push(pt);
      }
      if (pts.length >= 2) newVLines.push({ positions: pts });
    }

    for (let n = nMin; n <= nMax; n += step) {
      const pts: LatLngTuple[] = [];
      for (let e = eMin; e <= eMax; e += step) {
        const pt = mgrsToLatLon(prefix, e, n);
        if (pt) pts.push(pt);
      }
      if (pts.length >= 2) newHLines.push({ positions: pts });
    }

    if (zoom >= 12) {
      for (let e = eMin; e <= eMax; e += step) {
        for (let n = nMin; n <= nMax; n += step) {
          const pt = mgrsToLatLon(prefix, e, n);
          if (pt) {
            newLabels.push({
              pos: [pt[0] + 0.0008, pt[1] + 0.0005] as LatLngTuple,
              text: `${e.toString().padStart(2,"0")}${n.toString().padStart(2,"0")}`,
            });
          }
        }
      }
    }

    setVLines(newVLines);
    setHLines(newHLines);
    setLabels(newLabels);
  }, [map]);

  useEffect(() => { rebuild(); }, [rebuild]);
  // Rebuild on theme change to update line/label colors
  useEffect(() => { rebuild(); }, [themeKey, rebuild]);
  useMapEvents({ moveend: rebuild, zoomend: rebuild });

  const tc = getThemeColors();
  const gridColor   = tc.isDark ? "#4a7c4a" : "#2E5A2E";
  const gridOpacity = tc.isDark ? 0.6 : 0.7;
  const labelColor  = tc.isDark ? "rgba(74,200,74,0.7)" : "rgba(30,90,30,0.85)";
  const lineOpts = { color: gridColor, weight: 0.7, opacity: gridOpacity, dashArray: "6 6" };

  return (
    <>
      {vLines.map((l, i) => <Polyline key={`v${i}`} positions={l.positions} pathOptions={lineOpts} />)}
      {hLines.map((l, i) => <Polyline key={`h${i}`} positions={l.positions} pathOptions={lineOpts} />)}
      {labels.map((lb, i) => (
        <Marker
          key={`lbl${i}`}
          position={lb.pos}
          icon={L.divIcon({
            html: `<span style="font-family:'JetBrains Mono',monospace;font-size:9px;color:${labelColor};white-space:nowrap;pointer-events:none;text-shadow:0 0 4px rgba(0,0,0,0.9)">${lb.text}</span>`,
            className: "",
            iconSize: [36, 12],
            iconAnchor: [0, 0],
          })}
          interactive={false}
          zIndexOffset={-1000}
        />
      ))}
    </>
  );
}

function FitBounds({ pieces }: { pieces: Piece[] }) {
  const map = useMap();
  const gpsAcquired = useRef(false);
  const mountFit = useRef(false);

  useEffect(() => {
    // Premier rendu : centrer sur Sénégal (ou sur les pièces si GPS dispo)
    if (!mountFit.current) {
      mountFit.current = true;
      map.fitBounds(getTacticalBounds(pieces), { padding: [40, 40] });
      if (pieces.some(hasValidGps)) gpsAcquired.current = true;
    }
    // Première acquisition GPS : recentrer sur les vraies positions
    if (!gpsAcquired.current && pieces.some(hasValidGps)) {
      gpsAcquired.current = true;
      map.fitBounds(getTacticalBounds(pieces), { padding: [40, 40] });
    }
  }, [map, pieces]);
  return null;
}

function FitOnTrigger({ pieces, trigger }: { pieces: Piece[]; trigger: number }) {
  const map = useMap();
  const prev = useRef(0);
  useEffect(() => {
    if (trigger === prev.current) return;
    prev.current = trigger;
    map.fitBounds(getTacticalBounds(pieces), { padding: [40, 40] });
  }, [trigger, map, pieces]);
  return null;
}

function SizeInvalidator({ fullscreen }: { fullscreen: boolean }) {
  const map = useMap();
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 60);
    return () => clearTimeout(id);
  }, [fullscreen, map]);
  return null;
}

// Stoppe les animations Leaflet avant le démontage du MapContainer pour éviter
// le crash "_leaflet_pos undefined" déclenché par transitionend après unmount.
function MapAnimationGuard() {
  const map = useMap();
  useEffect(() => {
    return () => {
      try { map.stop(); } catch { /* ignore */ }
    };
  }, [map]);
  return null;
}

// Écoute les événements de zoom et notifie le parent si le zoom est trop faible
function ZoomLabelController({
  onZoomChange,
}: {
  onZoomChange: (tooLow: boolean) => void;
}) {
  const map = useMap();
  useEffect(() => {
    const handle = () => onZoomChange(map.getZoom() < 10);
    map.on("zoomend", handle);
    return () => { map.off("zoomend", handle); };
  }, [map, onZoomChange]);
  return null;
}

function FireSector({ piece }: { piece: Piece }) {
  const positions = useMemo<[number, number][]>(() => {
    const rangeDeg = 0.009;
    const halfAngle = 15;
    const pts: [number, number][] = [[piece.lat, piece.lng]];
    for (let da = -halfAngle; da <= halfAngle; da += 2) {
      const azRad = ((piece.azimutConsigne + da) * Math.PI) / 180;
      const dlat = rangeDeg * Math.cos(azRad);
      const dlng = (rangeDeg * Math.sin(azRad)) / Math.cos((piece.lat * Math.PI) / 180);
      pts.push([piece.lat + dlat, piece.lng + dlng]);
    }
    return pts;
  }, [piece.lat, piece.lng, piece.azimutConsigne]);

  const tc = getThemeColors();
  const fireSectorColor = tc.cyan;

  return (
    <Polygon positions={positions}
      pathOptions={{ color: fireSectorColor, weight: 1, opacity: 0.4, fillColor: fireSectorColor, fillOpacity: 0.07 }}
    />
  );
}

// ─── Popup enrichie ───────────────────────────────────────────────────────────

function EnrichedPopup({ piece, onDetails }: { piece: Piece; onDetails: () => void }) {
  const color =
    piece.statut === "operational" ? "var(--cyan-live)" :
    piece.statut === "degraded"   ? "var(--warning)" : "var(--danger)";
  const statusLabel =
    piece.statut === "operational" ? "OPÉRATIONNEL" :
    piece.statut === "degraded"   ? "DÉGRADÉ" : "HORS LIGNE";

  const deltaAz   = piece.azimutReel - piece.azimutConsigne;
  const deltaSign = deltaAz >= 0 ? "+" : "";
  const deltaColor = Math.abs(deltaAz) > 5 ? "var(--danger)" : Math.abs(deltaAz) > 2 ? "var(--warning)" : "var(--success)";
  const sep = { borderBottom: "1px solid var(--border-cyan)" };

  return (
    <div style={{ minWidth: "210px", fontFamily: "'JetBrains Mono', monospace", fontSize: "11px" }}>
      <div style={{ padding: "10px 12px 8px", display: "flex", alignItems: "center", gap: "8px", ...sep }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block" }} />
        <span style={{ color, fontSize: "9px", letterSpacing: "0.2em", fontWeight: 700 }}>{statusLabel}</span>
      </div>
      <div style={{ padding: "8px 12px", ...sep }}>
        <div style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: "12px" }}>{piece.nom}</div>
        <div style={{ color: "var(--text-secondary)", fontSize: "10px", marginTop: 2 }}>
          {piece.positionMGRS || piece.id}
        </div>
      </div>
      <div style={{ padding: "8px 12px", display: "grid", gridTemplateColumns: "auto 1fr auto 1fr", gap: "5px 10px", alignItems: "center", ...sep }}>
        <Thermometer size={10} color="var(--text-secondary)" />
        <span style={{ color: (piece.temperature ?? 0) > 85 ? "var(--danger)" : (piece.temperature ?? 0) > 70 ? "var(--warning)" : "var(--text-primary)" }}>
          {(piece.temperature ?? 0).toFixed(0)}°C
        </span>
        <Target size={10} color="var(--text-secondary)" />
        <span style={{ color: "var(--text-primary)" }}>{piece.nombreTirs} tirs</span>
        <Tag size={10} color="var(--text-secondary)" />
        <span style={{ color: piece.stockObus < 10 ? "var(--danger)" : piece.stockObus < 20 ? "var(--warning)" : "var(--text-primary)" }}>
          {piece.stockObus} obus
        </span>
      </div>
      <div style={{ padding: "8px 12px", ...sep }}>
        <div style={{ color: "var(--text-secondary)", fontSize: "9px", letterSpacing: "0.1em", marginBottom: 4 }}>AZIMUT</div>
        <div style={{ color: "var(--text-primary)", display: "flex", gap: 6, alignItems: "center" }}>
          <span>{(piece.azimutConsigne ?? 0).toFixed(1)}°</span>
          <span style={{ color: "var(--text-secondary)" }}>→</span>
          <span>{(piece.azimutReel ?? 0).toFixed(1)}°</span>
          <span style={{ color: deltaColor, marginLeft: 4 }}>Δ{deltaSign}{deltaAz.toFixed(1)}°</span>
        </div>
      </div>
      <div style={{ padding: "8px 12px" }}>
        <button
          onClick={onDetails}
          style={{
            width: "100%", padding: "6px 0",
            background: "color-mix(in srgb, var(--cyan-live) 8%, transparent)", border: "1px solid var(--border-cyan)",
            color: "var(--cyan-live)", fontSize: "9px", letterSpacing: "0.25em",
            textTransform: "uppercase", cursor: "pointer", borderRadius: "2px",
            fontFamily: "inherit",
          }}
        >
          Voir Détails
        </button>
      </div>
    </div>
  );
}

// ─── HUD overlay ─────────────────────────────────────────────────────────────

function MapHUD({ pieces, alertes, nomBatterie }: { pieces: Piece[]; alertes: Alerte[]; nomBatterie: string }) {
  const wsConnected = useNinki((s) => s.wsConnected);
  const [time, setTime] = useState("");

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTime(
        `${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")}:${d.getUTCSeconds().toString().padStart(2, "0")}`,
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const active        = pieces.filter((p) => p.statut !== "offline").length;
  const totalTirs     = pieces.reduce((s, p) => s + p.nombreTirs, 0);
  const stockTotal    = pieces.reduce((s, p) => s + p.stockObus, 0);
  const activeAlertes = alertes.filter((a) => !a.acquittee && a.criticite !== "info").length;
  const pct           = pieces.length > 0 ? Math.round((active / pieces.length) * 100) : 0;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="absolute top-3 left-3 z-[450] pointer-events-auto"
      style={{
        background: "color-mix(in srgb, var(--bg-elevated) 90%, transparent)", border: "1px solid color-mix(in srgb, var(--cyan-live) 20%, transparent)",
        borderRadius: "3px", padding: "10px 14px",
        fontFamily: "'JetBrains Mono', monospace", fontSize: "11px",
        color: "var(--text-primary)", minWidth: "210px", backdropFilter: "blur(6px)",
      }}
    >
      <div style={{ color: "var(--cyan-live)", fontWeight: 700, fontSize: "10px", letterSpacing: "0.15em" }}>
        {nomBatterie || "BATTERIE ALPHA"}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, color: "var(--text-secondary)", fontSize: "9px", letterSpacing: "0.1em" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: wsConnected ? "var(--success)" : "var(--danger)",
            display: "inline-block",
            boxShadow: "none",
          }} />
          {wsConnected ? "LIVE" : "OFFLINE"}
        </span>
        <span style={{ color: "var(--cyan-live)", fontVariantNumeric: "tabular-nums" }}>{time} UTC</span>
      </div>
      <div style={{ borderTop: "1px solid color-mix(in srgb, var(--cyan-live) 12%, transparent)", margin: "8px 0" }} />
      <div style={{ fontSize: "10px", color: "var(--text-secondary)", letterSpacing: "0.1em" }}>
        {active}/{pieces.length} PIÈCES ACTIVES
      </div>
      <div style={{ marginTop: 5, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          background: pct > 80 ? "var(--success)" : pct > 50 ? "var(--warning)" : "var(--danger)",
          transition: "width 600ms ease",
        }} />
      </div>
      <div style={{ borderTop: "1px solid color-mix(in srgb, var(--cyan-live) 12%, transparent)", margin: "8px 0" }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", rowGap: 3, fontSize: "10px" }}>
        <span style={{ color: "var(--text-secondary)" }}>TIRS TOTAL</span>
        <span style={{ color: "var(--text-primary)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
          {totalTirs.toLocaleString("fr-FR")}
        </span>
        <span style={{ color: "var(--text-secondary)" }}>STOCK TOTAL</span>
        <span style={{ color: "var(--text-primary)", textAlign: "right" }}>{stockTotal} obus</span>
        <span style={{ color: "var(--text-secondary)" }}>ALERTES</span>
        <span style={{
          color: activeAlertes > 0 ? "var(--warning)" : "var(--text-secondary)", textAlign: "right",
          display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4,
        }}>
          {activeAlertes > 0 && <AlertTriangle size={9} />}
          {activeAlertes}
        </span>
      </div>
    </div>
  );
}

// ─── Météo overlay ────────────────────────────────────────────────────────────

function WeatherOverlay({ data, loaded, offline }: { data: WeatherData | null; loaded: boolean; offline: boolean }) {
  if (!loaded || !data) return (
    <div style={{
      background: 'color-mix(in srgb, var(--bg-elevated) 85%, transparent)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '6px',
      padding: '10px 14px',
      fontFamily: 'monospace',
      fontSize: '11px',
      color: 'var(--text-secondary)',
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{ textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 4 }}>
        🌤 Météo
      </div>
      <div>Indisponible</div>
    </div>
  );

  const windDirText = (dir: number | null) => {
    if (dir === null || dir === undefined) return '—';
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
    return dirs[Math.round(dir / 22.5) % 16];
  };

  const rows = [
    { icon: '🌡', label: 'Température',  value: data.temperature  != null ? `${data.temperature.toFixed(1)} °C`  : '—' },
    { icon: '💧', label: 'Humidité',     value: data.humidity     != null ? `${data.humidity.toFixed(0)} %`      : '—' },
    { icon: '⏱', label: 'Pression',     value: data.pressure     != null ? `${data.pressure.toFixed(0)} hPa`    : '—' },
    { icon: '💨', label: 'Vent',         value: data.windSpeed    != null ? `${data.windSpeed.toFixed(1)} m/s`   : '—' },
    { icon: '🧭', label: 'Direction',    value: data.windDirection != null
      ? `${windDirText(data.windDirection)} (${data.windDirection.toFixed(0)}°)`
      : '—' },
  ];

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        background: 'color-mix(in srgb, var(--bg-elevated) 90%, transparent)',
        border: '1px solid color-mix(in srgb, var(--cyan-live) 20%, transparent)',
        borderRadius: '6px',
        padding: '10px 14px',
        fontFamily: 'monospace',
        backdropFilter: 'blur(6px)',
        minWidth: '180px',
        pointerEvents: 'auto',
      }}
    >
      <div style={{
        fontSize: '10px',
        textTransform: 'uppercase',
        letterSpacing: '0.2em',
        color: 'var(--cyan-live)',
        marginBottom: '8px',
        borderBottom: '1px solid color-mix(in srgb, var(--cyan-live) 15%, transparent)',
        paddingBottom: '6px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}>
        🌤 Météo terrain
        {offline && (
          <span style={{ color: 'var(--warning)', fontSize: '9px' }}>OFFLINE</span>
        )}
      </div>
      {rows.map(({ icon, label, value }) => (
        <div key={label} style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '4px',
          gap: '12px',
        }}>
          <div style={{
            fontSize: '10px',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}>
            <span>{icon}</span>
            <span style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
          </div>
          <div style={{
            fontSize: '12px',
            fontWeight: '600',
            color: 'var(--text-primary)',
            textAlign: 'right',
          }}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Overlay controls ─────────────────────────────────────────────────────────

type OverlayProps = {
  showGrid: boolean;    setShowGrid: (v: boolean) => void;
  showMgrs: boolean;    setShowMgrs: (v: boolean) => void;
  showSectors: boolean; setShowSectors: (v: boolean) => void;
  showLabels: boolean;  setShowLabels: (v: boolean) => void;
  fullscreen: boolean;  setFullscreen: (v: boolean) => void;
  zoomTooLow: boolean;
  onCenter: () => void;
};

function OverlayControls({
  showGrid, setShowGrid,
  showMgrs, setShowMgrs,
  showSectors, setShowSectors,
  showLabels, setShowLabels,
  fullscreen, setFullscreen,
  zoomTooLow,
  onCenter,
}: OverlayProps) {
  const base: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 5,
    padding: "5px 8px",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-steel)",
    borderRadius: "2px",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase",
    cursor: "pointer", transition: "all 150ms ease",
    backdropFilter: "blur(4px)", whiteSpace: "nowrap" as const,
  };
  const on:  React.CSSProperties = { borderColor: "var(--border-cyan)", background: "rgba(0,212,255,0.08)", color: "var(--cyan-live)" };
  const off: React.CSSProperties = { color: "var(--text-secondary)" };
  const dim: React.CSSProperties = { color: "var(--text-disabled)", cursor: "default" };

  const labelsActive = showLabels && !zoomTooLow;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="absolute top-3 right-3 z-[450] flex items-center gap-1.5 pointer-events-auto"
    >
      <button style={{ ...base, ...(showGrid ? on : off) }} onClick={() => setShowGrid(!showGrid)}>
        <Grid3x3 size={10} /> Grille
      </button>
      <button style={{ ...base, ...(showMgrs ? on : off) }} onClick={() => setShowMgrs(!showMgrs)}>
        <Crosshair size={10} /> MGRS
      </button>
      <button style={{ ...base, ...(showSectors ? on : off) }} onClick={() => setShowSectors(!showSectors)}>
        <Target size={10} /> Secteurs
      </button>
      <button
        style={{ ...base, ...(zoomTooLow ? dim : labelsActive ? on : off) }}
        onClick={() => !zoomTooLow && setShowLabels(!showLabels)}
        title={zoomTooLow ? "Dézoomez pour afficher les étiquettes" : undefined}
      >
        <Tag size={10} />
        Étiquettes
        {zoomTooLow && <span style={{ fontSize: "8px", color: "#3a5a70" }}>zoom↑</span>}
      </button>
      <button style={{ ...base, ...off }} onClick={onCenter}>
        <Crosshair size={10} /> Centrer
      </button>
      <button style={{ ...base, ...(fullscreen ? on : off) }} onClick={() => setFullscreen(!fullscreen)}>
        {fullscreen ? <Minimize2 size={10} /> : <Maximize2 size={10} />}
      </button>
    </div>
  );
}

// ─── Popup CSS ────────────────────────────────────────────────────────────────

function getPopupStyle(): string {
  const s = getComputedStyle(document.documentElement);
  const bgElevated  = s.getPropertyValue('--bg-elevated').trim();
  const bgBase      = s.getPropertyValue('--bg-base').trim();
  const textPrimary = s.getPropertyValue('--text-primary').trim();
  const borderCyan  = s.getPropertyValue('--border-steel').trim();

  return `
    .ninki-popup .leaflet-popup-content-wrapper {
      background: ${bgElevated} !important;
      border: 1px solid ${borderCyan} !important;
      border-radius: 2px !important;
      padding: 0 !important;
      box-shadow: 0 4px 24px rgba(0,0,0,0.4) !important;
      color: ${textPrimary} !important;
    }
    .ninki-popup .leaflet-popup-tip-container {
      display: none !important;
    }
    .ninki-popup .leaflet-popup-content { margin: 0 !important; width: auto !important; }
    .ninki-popup .leaflet-popup-close-button {
      color: ${textPrimary} !important;
      top: 6px !important;
      right: 8px !important;
      font-size: 18px !important;
      width: 20px !important;
      height: 20px !important;
      line-height: 20px !important;
    }
    .ninki-popup .leaflet-popup-close-button:hover {
      color: ${textPrimary} !important;
    }
    .ninki-tactical-map {
      background: ${bgBase} !important;
    }
  `;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PiecesMap({ onSelectPiece }: { onSelectPiece?: (id: string) => void }) {
  const allPieces     = useNinki((s) => s.pieces);
  const pieces        = useMemo(() => allPieces.filter((p) => !isStationMeteo(p.nom)), [allPieces]);
  const fireEvents    = useNinki((s) => s.fireEvents);
  const alertes       = useNinki((s) => s.alertes);
  const weather        = useNinki((s) => s.weather);
  const weatherLoaded  = useNinki((s) => s.weatherLoaded);
  const weatherOffline = useNinki((s) => s.weatherOffline);

  const { data: config } = useConfig();

  const [showGrid,    setShowGrid]    = useState(true);
  const [showMgrs,    setShowMgrs]    = useState(true);
  const [showSectors, setShowSectors] = useState(false);
  const [showLabels,  setShowLabels]  = useState(true);
  const [fullscreen,  setFullscreen]  = useState(false);
  const [zoomTooLow,  setZoomTooLow]  = useState(false);
  const [fitTrigger,  setFitTrigger]  = useState(0);
  const [themeKey,    setThemeKey]    = useState(0);

  const markerRefs = useRef<Record<string, L.Marker>>({});

  const center = useMemo<[number, number]>(() => {
    const valid = pieces.filter(hasValidGps);
    if (valid.length === 0) return SENEGAL_CENTER;
    const b = getTacticalBounds(valid);
    return [b.getCenter().lat, b.getCenter().lng];
  }, [pieces]);

  const initialZoom = pieces.some(hasValidGps) ? 14 : 7;

  // État effectif des étiquettes (intention utilisateur ET zoom suffisant)
  const effectiveShowLabels = showLabels && !zoomTooLow;

  // Callback stable pour le ZoomLabelController
  const handleZoomChange = useCallback((tooLow: boolean) => {
    setZoomTooLow(tooLow);
  }, []);

  // Mise à jour impérative des icônes (pièces, feu, étiquettes, config)
  useEffect(() => {
    pieces.forEach((p) => {
      const m = markerRefs.current[p.id];
      if (!m) return;
      if (isEclaireur(p.nom)) {
        m.setIcon(makeRoverIcon(p));
      } else {
        const firing = !!fireEvents[p.id] && Date.now() - fireEvents[p.id] < 3000;
        m.setIcon(makeCanonIcon(p, firing, effectiveShowLabels, config));
      }
    });
  }, [pieces, fireEvents, effectiveShowLabels, config, themeKey]);

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        if (m.type === 'attributes' && m.attributeName === 'data-theme') {
          setThemeKey(k => k + 1);
        }
      });
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  const nomBatterie = config?.nom ?? "BATTERIE ALPHA";
  const tc = getThemeColors();

  return (
    <>
      <style key={themeKey}>{getPopupStyle()}</style>
      <div
        className={cn(
          "relative h-full w-full panel overflow-hidden ninki-offline-map",
          fullscreen && "fixed inset-0 z-[9999]",
        )}
      >
        {/* Overlays HTML (hors MapContainer) */}
        <MapHUD pieces={pieces} alertes={alertes} nomBatterie={nomBatterie} />
        <OverlayControls
          showGrid={showGrid}       setShowGrid={setShowGrid}
          showMgrs={showMgrs}       setShowMgrs={setShowMgrs}
          showSectors={showSectors} setShowSectors={setShowSectors}
          showLabels={showLabels}   setShowLabels={setShowLabels}
          fullscreen={fullscreen}   setFullscreen={setFullscreen}
          zoomTooLow={zoomTooLow}
          onCenter={() => setFitTrigger((n) => n + 1)}
        />

        <MapContainer
          center={center}
          zoom={initialZoom}
          className="h-full w-full ninki-tactical-map"
          zoomControl={false}
          attributionControl={false}
        >
          <ZoomControl position="bottomleft" />
          <SmartTileLayer themeKey={themeKey} />
          {showMgrs && <MgrsGrid themeKey={themeKey} />}

          <FitBounds pieces={pieces} />
          <FitOnTrigger pieces={pieces} trigger={fitTrigger} />
          <SizeInvalidator fullscreen={fullscreen} />
          <ZoomLabelController onZoomChange={handleZoomChange} />
          <MapAnimationGuard />

          {showSectors && pieces.filter((p) => !isEclaireur(p.nom)).map((p) => <FireSector key={p.id} piece={p} />)}

          {pieces.map((p) => {
            if (isEclaireur(p.nom)) {
              return (
                <Marker
                  key={p.id}
                  position={[p.lat, p.lng]}
                  icon={makeRoverIcon(p)}
                  ref={(ref) => { if (ref) markerRefs.current[p.id] = ref; }}
                  eventHandlers={{ click: () => onSelectPiece?.(p.id) }}
                />
              );
            }
            const firing = !!fireEvents[p.id] && Date.now() - fireEvents[p.id] < 3000;
            return (
              <Marker
                key={p.id}
                position={[p.lat, p.lng]}
                icon={makeCanonIcon(p, firing, effectiveShowLabels, config)}
                ref={(ref) => { if (ref) markerRefs.current[p.id] = ref; }}
                eventHandlers={{ click: () => onSelectPiece?.(p.id) }}
              >
                <Popup className="ninki-popup" maxWidth={240} minWidth={210}>
                  <EnrichedPopup piece={p} onDetails={() => onSelectPiece?.(p.id)} />
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        <div className="absolute z-[450] left-16 bottom-3 panel bg-[color:var(--bg-card)]/90 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[color:var(--success)] flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--success)] pulse-live" />
          Carte offline
        </div>

        <div className="absolute z-[450] bottom-3 right-3 flex flex-col items-end gap-2 pointer-events-none">
          <div className="panel px-3 py-2 text-[10px] font-mono space-y-1 bg-[color:var(--bg-card)]/90">
            <Legend color={tc.cyan} label="Opérationnel" />
            <Legend color={tc.isDark ? "#FF6B00" : "#8C3A00"} label="Dégradé" />
            <Legend color={tc.danger} label="Hors service" />
            {pieces.some((p) => isEclaireur(p.nom)) && (
              <Legend color={tc.isDark ? "#FFB800" : tc.warning} label="Éclaireur" />
            )}
          </div>
          <WeatherOverlay data={weather} loaded={weatherLoaded} offline={weatherOffline} />
        </div>

        {fullscreen && (
          <button
            onClick={() => setFullscreen(false)}
            className="absolute bottom-4 right-36 z-[9999] flex items-center gap-2 px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-[color:var(--cyan-live)] border border-[color:var(--cyan-live)]/40 bg-[color:var(--bg-card)]/90 hover:bg-[color:var(--bg-elevated)] transition"
            style={{ backdropFilter: "blur(6px)" }}
          >
            <Minimize2 className="h-3.5 w-3.5" />
            Quitter plein écran
          </button>
        )}
      </div>
    </>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
      <span>{label}</span>
    </div>
  );
}
