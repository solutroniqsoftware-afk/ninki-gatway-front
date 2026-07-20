import { create } from "zustand";
import { apiClient } from "../api/client";
import { getSocket, disconnectSocket } from "../ws/socket";
import { DEMO_MODE, DEMO_USER, DEMO_PIECES, DEMO_METEO, DEMO_FLAKY_PIECE_ID } from "./demo-data";
import type {
  Alerte,
  BackendAlerte,
  BackendPiece,
  BackendTelemetry,
  CommandeEnvoyee,
  Piece,
  PieceStatut,
  User,
  WeatherData,
} from "./types";

// ─── History type (used by RealtimeChart) ────────────────────────────────────
export interface HistoryPoint {
  t: number;
  temp: number;
  azReel: number;
  azCons: number;
  cadence: number;
}

// ─── Mapping helpers ──────────────────────────────────────────────────────────

function mapStatut(s: string): PieceStatut {
  if (s === "OPERATIONAL") return "operational";
  if (s === "DEGRADED") return "degraded";
  return "offline";
}

function mapAlerteType(type: string): Alerte["type"] {
  switch (type) {
    case "temperature": return "temperature";
    case "azimut":      return "desalignement";
    case "stock":       return "stock_bas";
    case "offline":     return "hors_ligne";
    case "cadence":     return "cadence";
    default:            return "tir";
  }
}

function mapAlerte(a: BackendAlerte): Alerte {
  return {
    id: a.id,
    pieceId: a.pieceId,
    type: mapAlerteType(a.type),
    criticite: a.niveau === "CRITICAL" ? "critical" : "warning",
    message: a.message,
    valeur: a.valeur != null ? String(a.valeur) : undefined,
    timestamp: new Date(a.createdAt).getTime(),
    acquittee: a.acquittee,
  };
}

const DEFAULT_STOCK_MAX = 75; // fallback until config is loaded

// ─── Demo simulation (no backend, no WebSocket) ────────────────────────────────

let demoInterval: ReturnType<typeof setInterval> | null = null;

function startDemoSimulation(set: (fn: (state: NinkiState) => Partial<NinkiState>) => void) {
  let tick = 0;
  demoInterval = setInterval(() => {
    tick += 1;
    const flipFlakyStatus = tick % 15 === 0; // toutes les 30s (intervalle 2s)
    set((state) => ({
      pieces: state.pieces.map((p) => {
        const jitteredAzimut = p.azimutReel + (Math.random() * 0.6 - 0.3);
        const jitteredTemp = p.temperature + (Math.random() * 0.2 - 0.1);
        const statut =
          p.id === DEMO_FLAKY_PIECE_ID && flipFlakyStatus
            ? p.statut === "degraded"
              ? "operational"
              : "degraded"
            : p.statut;
        return {
          ...p,
          azimutReel: Math.round(jitteredAzimut * 10) / 10,
          temperature: Math.round(jitteredTemp * 10) / 10,
          statut,
          derniereActivite: Date.now(),
        };
      }),
    }));
  }, 2000);
}

function stopDemoSimulation() {
  if (demoInterval) {
    clearInterval(demoInterval);
    demoInterval = null;
  }
}

// ─── Offline weather ──────────────────────────────────────────────────────────

function syntheticWeather(lat: number): WeatherData {
  const now = new Date();
  const hour = now.getUTCHours();
  const month = now.getUTCMonth(); // 0–11

  // Tropical/subtropical base profile driven by latitude and season
  const isNorthernSummer = month >= 4 && month <= 9;
  const baseTemp = 30 - Math.abs(lat - 15) * 0.4 + (isNorthernSummer ? 3 : -2);
  // Diurnal cycle: coolest at 6h UTC, hottest at 14h UTC
  const diurnal = Math.sin(((hour - 6) / 24) * 2 * Math.PI) * 4;
  const temperature = Math.round((baseTemp + diurnal) * 10) / 10;

  // Humidity: higher in wet season (Jun–Sep for Sahel), inversely correlated with day heat
  const wetSeason = month >= 5 && month <= 8;
  const humidity = Math.round(wetSeason ? 65 + diurnal * -2 : 35 + diurnal * -1);

  // Pressure: fairly stable in tropics
  const pressure = Math.round(1012 + Math.sin(hour / 12) * 1.5);

  // Harmattan/trade winds: NE in dry season, SW in wet season
  const windDirection = wetSeason ? 225 : 45;
  const windSpeed = Math.round((wetSeason ? 12 : 18) + Math.random() * 4);

  return { temperature, humidity, pressure, windSpeed, windDirection };
}

function loadOfflineWeather(lat: number): WeatherData | null {
  try {
    const raw = localStorage.getItem("ninki_weather_cache");
    if (raw) {
      const { weather, ts } = JSON.parse(raw) as { weather: WeatherData; ts: number; lat: number; lng: number };
      // Use cache if it's less than 6 hours old
      if (Date.now() - ts < 6 * 3600 * 1000) return weather;
    }
  } catch {}
  // No valid cache — synthesize from coordinates
  return syntheticWeather(lat ?? 15);
}

function mergePiece(piece: BackendPiece, tel?: BackendTelemetry, batterieName?: string, stockMax = DEFAULT_STOCK_MAX): Piece {
  return {
    id: piece.id,
    numero: piece.numero,
    nom: piece.nom,
    devEUI: piece.devEUI,
    batterie: batterieName ?? "Batterie",
    statut: mapStatut(piece.statut),
    temperature: tel?.temperature ?? 0,
    nombreTirs: tel?.nbTirs ?? 0,
    stockObus: tel?.stockObus ?? 75,
    stockMax,
    cadenceTir: tel?.cadence ?? 0,
    positionMGRS: tel?.mgrs ?? "",
    lat: tel?.lat ?? 0,
    lng: tel?.lon ?? 0,
    azimutConsigne: tel?.azimutConsigne ?? 0,
    azimutReel: tel?.azimutReel ?? 0,
    giteConsigne: tel?.giteConsigne ?? 0,
    giteReel: tel?.giteReel ?? 0,
    dernierTir: tel ? new Date(tel.time).getTime() : Date.now(),
    enTirEnCours: false,
    derniereActivite: tel ? new Date(tel.time).getTime() : Date.now(),
    elevationReel:       tel?.elevationReel       ?? undefined,
    distanceHorizontale: tel?.distanceHorizontale ?? undefined,
    distanceSurface:     tel?.distanceSurface     ?? undefined,
    azimutMil:    undefined,
    giteMil:      undefined,
    elevationMil: undefined,
    azimutMag:    undefined,
  };
}

// ─── Store interface ──────────────────────────────────────────────────────────

interface NinkiState {
  user: User | null;
  pieces: Piece[];
  alertes: Alerte[];
  commandes: CommandeEnvoyee[];
  weather: WeatherData;
  weatherLoaded: boolean;
  weatherOffline: boolean;
  totalTirs: number;
  wsConnected: boolean;
  history: Record<string, HistoryPoint[]>;
  fireEvents: Record<string, number>;

  // Auth
  login: (identifiant: string, password: string) => Promise<{ mustChangePassword: boolean }>;
  logout: () => Promise<void>;

  // Data
  loadInitialData: () => Promise<void>;
  connectWebSocket: () => void;
  disconnectWebSocket: () => void;
  fetchWeather: () => Promise<void>;

  // Actions
  acknowledge: (id: string) => Promise<void>;
  sendCommand: (pieceId: string, commande: string) => Promise<void>;

  // Config
  applyStockMax: (stockMax: number) => void;

  // Internal (kept for backward compat with AppShell)
  _tick: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useNinki = create<NinkiState>((set, get) => ({
  user: DEMO_MODE ? DEMO_USER : null,
  pieces: [],
  alertes: [],
  commandes: [],
  weather: {
    temperature: 0,
    humidity: 0,
    pressure: 0,
    windSpeed: 0,
    windDirection: 0,
  },
  weatherLoaded: false,
  weatherOffline: false,
  totalTirs: 0,
  wsConnected: false,
  history: {},
  fireEvents: {},

  // ─── AUTH ─────────────────────────────────────────────────────────────────

  login: async (identifiant, password) => {
    if (DEMO_MODE) {
      set({ user: DEMO_USER });
      return { mustChangePassword: false };
    }

    const { data } = await apiClient.post("/auth/login", { identifiant, password });

    if (typeof window !== "undefined") {
      localStorage.setItem("ninki_access_token", data.access_token);
      localStorage.setItem("ninki_refresh_token", data.refresh_token);
    }

    // Fetch full user with pieces
    const { data: me } = await apiClient.get<User>("/auth/me");
    const role = me.role === "SUPER_ADMIN" ? "ADMIN" : me.role;
    set({ user: { ...me, role } });

    return { mustChangePassword: data.mustChangePassword };
  },

  logout: async () => {
    if (!DEMO_MODE) {
      try {
        await apiClient.post("/auth/logout");
      } catch {}
      if (typeof window !== "undefined") {
        localStorage.removeItem("ninki_access_token");
        localStorage.removeItem("ninki_refresh_token");
      }
    }
    disconnectSocket();
    set({
      user: null,
      wsConnected: false,
      pieces: [],
      alertes: [],
      commandes: [],
      history: {},
      fireEvents: {},
      weatherLoaded: false,
      weatherOffline: false,
    });
  },

  // ─── INITIAL LOAD ─────────────────────────────────────────────────────────

  loadInitialData: async () => {
    if (DEMO_MODE) {
      const totalTirs = DEMO_PIECES.reduce((sum, p) => sum + p.nombreTirs, 0);
      set({
        pieces: DEMO_PIECES,
        alertes: [],
        totalTirs,
        weather: DEMO_METEO,
        weatherLoaded: true,
        weatherOffline: false,
      });
      return;
    }

    const [{ data: rawPieces }, { data: rawAlertes }, configRes] = await Promise.all([
      apiClient.get<BackendPiece[]>("/pieces"),
      apiClient.get<BackendAlerte[]>("/alertes"),
      apiClient.get<{ nom: string; stockMax?: number }>("/config").catch(() => ({ data: null })),
    ]);
    const configData = (configRes as { data: { nom: string; stockMax?: number } | null }).data;
    const batterieName = configData?.nom;
    const stockMax = configData?.stockMax ?? DEFAULT_STOCK_MAX;

    // Fetch latest telemetry for each piece in parallel
    const telMap: Record<string, BackendTelemetry> = {};
    await Promise.all(
      rawPieces.map(async (piece) => {
        try {
          const { data } = await apiClient.get<BackendTelemetry[]>(
            `/pieces/${piece.id}/telemetry?limit=1`,
          );
          if (data[0]) telMap[piece.id] = data[0];
        } catch {}
      }),
    );

    const pieces = rawPieces.map((p) => mergePiece(p, telMap[p.id], batterieName, stockMax));
    const alertes = rawAlertes.map(mapAlerte);
    const totalTirs = pieces.reduce((sum, p) => sum + p.nombreTirs, 0);

    set({ pieces, alertes, totalTirs });

    // Charger la météo depuis le dernier payload NINKI reçu par le backend
    const meteoData = await apiClient
      .get<WeatherData | null>('/telemetry/meteo')
      .then((r) => r.data)
      .catch(() => null);
    if (meteoData) {
      set({ weather: meteoData, weatherLoaded: true, weatherOffline: false });
    }
  },

  // ─── WEATHER ──────────────────────────────────────────────────────────────

  fetchWeather: async () => {
    if (DEMO_MODE) {
      set({ weather: DEMO_METEO, weatherLoaded: true, weatherOffline: false });
      return;
    }

    const { pieces } = get();
    const valid = pieces.filter((p) => p.lat !== 0 && p.lng !== 0);
    if (valid.length === 0) return;
    const lat = valid.reduce((s, p) => s + p.lat, 0) / valid.length;
    const lng = valid.reduce((s, p) => s + p.lng, 0) / valid.length;

    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current_weather=true&hourly=relativehumidity_2m,surface_pressure&timezone=UTC&forecast_days=1`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!res.ok) throw new Error("non-ok");
      const json = await res.json();
      const cw = json.current_weather;
      const humidity = json.hourly?.relativehumidity_2m?.[0] ?? 0;
      const pressure = json.hourly?.surface_pressure?.[0] ?? 0;
      const weather: WeatherData = {
        temperature: cw.temperature,
        humidity,
        pressure,
        windSpeed: cw.windspeed,
        windDirection: cw.winddirection,
      };
      // Persist for offline use
      try { localStorage.setItem("ninki_weather_cache", JSON.stringify({ weather, ts: Date.now(), lat, lng })); } catch {}
      set({ weather, weatherLoaded: true, weatherOffline: false });
    } catch {
      // Offline — try cache first, then synthesize from GPS + local time
      const weather = loadOfflineWeather(lat);
      if (weather) set({ weather, weatherLoaded: true, weatherOffline: true });
    }
  },

  // ─── WEBSOCKET ────────────────────────────────────────────────────────────

  connectWebSocket: () => {
    if (typeof window === "undefined") return;

    if (DEMO_MODE) {
      set({ wsConnected: true });
      startDemoSimulation(set);
      return;
    }

    const socket = getSocket();

    // Remove any stale handlers before registering fresh ones (guards against double-mount)
    socket.off("connect");
    socket.off("disconnect");
    socket.off("piece:update");
    socket.off("piece:offline");
    socket.off("alertes:update");
    socket.off("commande:received");
    socket.off("meteo:update");

    socket.on("connect", () => {
      console.log("[WS] connecté — id:", socket.id);
      set({ wsConnected: true });
    });
    socket.on("disconnect", (reason) => {
      console.log("[WS] déconnecté —", reason);
      set({ wsConnected: false });
    });

    socket.on("piece:update", (data: BackendTelemetry) => {
      console.log("[WS] piece:update reçu — pieceId:", data.pieceId, "temp:", data.temperature);
      const now = Date.now();
      set((state) => {
        const pieces = state.pieces.map((p) => {
          if (p.id !== data.pieceId) return p;
          const fired = data.nbTirs > p.nombreTirs;
          return {
            ...p,
            temperature: data.temperature ?? p.temperature,
            nombreTirs: data.nbTirs ?? p.nombreTirs,
            stockObus: data.stockObus ?? p.stockObus,
            cadenceTir: data.cadence ?? p.cadenceTir,
            positionMGRS: data.mgrs ?? p.positionMGRS,
            lat: data.lat ?? p.lat,
            lng: data.lon ?? p.lng,
            azimutReel: data.azimutReel ?? p.azimutReel,
            azimutConsigne: data.azimutConsigne ?? p.azimutConsigne,
            giteReel: data.giteReel ?? p.giteReel,
            giteConsigne: data.giteConsigne ?? p.giteConsigne,
            elevationReel:       data.elevationReel       ?? p.elevationReel,
            distanceHorizontale: data.distanceHorizontale ?? p.distanceHorizontale,
            distanceSurface:     data.distanceSurface     ?? p.distanceSurface,
            azimutMil:    data.azimutMil    ?? p.azimutMil,
            giteMil:      data.giteMil      ?? p.giteMil,
            elevationMil: data.elevationMil ?? p.elevationMil,
            azimutMag:    data.azimutMag    ?? p.azimutMag,
            statut: data.statut ? mapStatut(data.statut) : p.statut,
            enTirEnCours: fired,
            dernierTir: fired ? now : p.dernierTir,
            derniereActivite: new Date(data.time).getTime(),
          };
        });

        const prevHist = state.history[data.pieceId] ?? [];
        const newPoint: HistoryPoint = {
          t: now,
          temp: data.temperature ?? 0,
          azReel: data.azimutReel ?? 0,
          azCons: data.azimutConsigne ?? 0,
          cadence: data.cadence ?? 0,
        };
        const history = {
          ...state.history,
          [data.pieceId]: [...prevHist, newPoint].filter((h) => now - h.t <= 60_000),
        };

        const fired = pieces.find((p) => p.id === data.pieceId)?.enTirEnCours ?? false;
        const fireEvents = fired
          ? { ...state.fireEvents, [data.pieceId]: now }
          : state.fireEvents;

        // Schedule automatic cleanup of fire event after 3s to avoid stale animations
        if (fired) {
          setTimeout(() => {
            useNinki.setState((s) => {
              const { [data.pieceId]: _, ...rest } = s.fireEvents;
              return { fireEvents: rest };
            });
          }, 3000);
        }

        const totalTirs = pieces.reduce((sum, p) => sum + p.nombreTirs, 0);

        return { pieces, history, fireEvents, totalTirs };
      });
    });

    socket.on("piece:offline", ({ pieceId }: { pieceId: string }) => {
      set((state) => ({
        pieces: state.pieces.map((p) =>
          p.id === pieceId ? { ...p, statut: "offline" as PieceStatut } : p,
        ),
      }));
    });

    socket.on("alertes:update", (rawAlertes: BackendAlerte[]) => {
      const incoming = rawAlertes.map(mapAlerte);
      set((state) => {
        // Merge: keep acknowledged ones from local state, replace unacknowledged
        const acknowledged = state.alertes.filter((a) => a.acquittee);
        const merged = [
          ...incoming,
          ...acknowledged.filter((a) => !incoming.some((i) => i.id === a.id)),
        ];
        return { alertes: merged.slice(0, 200) };
      });
    });

    socket.on("meteo:update", (data: WeatherData) => {
      set({ weather: data, weatherLoaded: true, weatherOffline: false });
    });

    socket.on("commande:received", (raw: { id: string; pieceId: string; texte: string; createdAt: string }) => {
      const commande: CommandeEnvoyee = {
        id: raw.id,
        pieceId: raw.pieceId,
        commande: raw.texte,
        timestamp: new Date(raw.createdAt).getTime(),
      };
      set((state) => ({
        commandes: [commande, ...state.commandes].slice(0, 20),
      }));
    });
  },

  disconnectWebSocket: () => {
    if (DEMO_MODE) {
      stopDemoSimulation();
      set({ wsConnected: false });
      return;
    }

    const socket = getSocket();
    socket.off("connect");
    socket.off("disconnect");
    socket.off("piece:update");
    socket.off("piece:offline");
    socket.off("alertes:update");
    socket.off("commande:received");
    socket.off("meteo:update");
    disconnectSocket();
    set({ wsConnected: false });
  },

  // ─── ACTIONS ──────────────────────────────────────────────────────────────

  acknowledge: async (id) => {
    await apiClient.patch(`/alertes/${id}/acquitter`);
    set((state) => ({
      alertes: state.alertes.map((a) => (a.id === id ? { ...a, acquittee: true } : a)),
    }));
  },

  sendCommand: async (pieceId, commande) => {
    // Mapper les libellés frontend → TypeCommande valides en DB
    // HALT n'existe pas dans l'enum → STOP
    // Texte libre ou inconnu → LIBRE
    const TYPE_MAP: Record<string, string> = {
      FEU:           'FEU',
      HALT:          'STOP',
      RECHARGER:     'RECHARGER',
      REPOSITIONNER: 'REPOSITIONNER',
    };
    const type = TYPE_MAP[commande] ?? 'LIBRE';
    await apiClient.post("/commandes", { pieceId, texte: commande, type });
    // Optimistically add to local history
    set((state) => ({
      commandes: [
        {
          id: crypto.randomUUID(),
          pieceId,
          commande,
          timestamp: Date.now(),
          urgent: commande === "FEU" || commande === "HALT",
        },
        ...state.commandes,
      ].slice(0, 20),
    }));
  },

  applyStockMax: (stockMax) => {
    set((state) => ({
      pieces: state.pieces.map((p) => ({ ...p, stockMax })),
    }));
  },

  // no-op — simulation replaced by real data
  _tick: () => {},
}));

// ─── Session restore (client only) ───────────────────────────────────────────

export async function restoreSession(): Promise<void> {
  if (typeof window === "undefined") return;
  const token = localStorage.getItem("ninki_access_token");
  if (!token) return;
  try {
    const { data: me } = await apiClient.get<User>("/auth/me");
    const role = me.role === "SUPER_ADMIN" ? "ADMIN" : me.role;
    useNinki.setState({ user: { ...me, role } });
  } catch {
    localStorage.removeItem("ninki_access_token");
    localStorage.removeItem("ninki_refresh_token");
  }
}

// Kept as no-op so AppShell import doesn't break until it's updated
export function startNinkiSimulation() {}

export const isEclaireur = (nom: string): boolean =>
  nom.toUpperCase() === 'ECLAIREUR';

export const isStationMeteo = (nom: string): boolean =>
  nom.toUpperCase() === 'STATION_METEO';
