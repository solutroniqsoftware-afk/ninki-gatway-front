import { useEffect, useState, useCallback, useMemo } from "react";
import { apiClient } from "./client";
import { DEMO_MODE, DEMO_PIECES } from "../ninki/demo-data";
import type { BackendAlerte, BackendPiece } from "../ninki/types";

// ─── Fixtures démo — évite tout appel réseau quand VITE_DEMO_MODE=true ────────
// (il n'y a pas de backend derrière le déploiement Vercel statique)

const DEMO_BACKEND_PIECES: BackendPiece[] = DEMO_PIECES.map((p) => ({
  id: p.id,
  nom: p.nom,
  numero: p.numero,
  devEUI: `DEMO-${p.numero.toString().padStart(4, "0")}`,
  statut: p.statut === "operational" ? "OPERATIONAL" : p.statut === "degraded" ? "DEGRADED" : "OFFLINE",
  responsableId: null,
  responsable: null,
  stockObus: p.stockObus,
  cadenceStandard: p.cadenceTir,
}));

// ─── Config batterie ──────────────────────────────────────────────────────────

export interface ConfigBatterie {
  id: string;
  nom: string;
  identifiant: string;
  tempDegrade: number;
  tempCritique: number;
  stockAlerte: number;
  azimutCorrection: number;
  azimutCritique: number;
  timeoutOffline: number;
  cadenceAlerte: number;
  stockMax: number;
  retentionJours: number;
  updatedAt: string;
  simulationMode: boolean;
}

const DEMO_CONFIG: ConfigBatterie = {
  id: "demo-config",
  nom: "Batterie Démo",
  identifiant: "BTR-DEMO",
  tempDegrade: 40,
  tempCritique: 55,
  stockAlerte: 15,
  azimutCorrection: 2,
  azimutCritique: 5,
  timeoutOffline: 120,
  cadenceAlerte: 3,
  stockMax: 75,
  retentionJours: 30,
  updatedAt: new Date().toISOString(),
  simulationMode: true,
};

export function useConfig(enabled = true) {
  const [data, setData] = useState<ConfigBatterie | null>(DEMO_MODE ? DEMO_CONFIG : null);
  const [loading, setLoading] = useState(!DEMO_MODE);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || DEMO_MODE) {
      setLoading(false);
      return;
    }
    apiClient
      .get<ConfigBatterie>("/config")
      .then((res) => setData(res.data))
      .catch(() => setError("Impossible de charger la configuration"))
      .finally(() => setLoading(false));
  }, [enabled]);

  const updateSeuils = async (seuils: Partial<ConfigBatterie>) => {
    if (DEMO_MODE) {
      const next = { ...(data ?? DEMO_CONFIG), ...seuils };
      setData(next);
      return next;
    }
    const res = await apiClient.patch<ConfigBatterie>("/config/seuils", seuils);
    setData(res.data);
    return res.data;
  };

  const updateBatterie = async (info: Partial<ConfigBatterie>) => {
    if (DEMO_MODE) {
      const next = { ...(data ?? DEMO_CONFIG), ...info };
      setData(next);
      return next;
    }
    const res = await apiClient.patch<ConfigBatterie>("/config/batterie", info);
    setData(res.data);
    return res.data;
  };

  return { data, loading, error, updateSeuils, updateBatterie };
}

// ─── Pièces (liste complète avec infos statiques) ─────────────────────────────

export function usePieces() {
  const [data, setData] = useState<BackendPiece[]>(DEMO_MODE ? DEMO_BACKEND_PIECES : []);
  const [loading, setLoading] = useState(!DEMO_MODE);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    if (DEMO_MODE) {
      setData(DEMO_BACKEND_PIECES);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    apiClient
      .get<BackendPiece[]>("/pieces")
      .then((res) => setData(res.data))
      .catch(() => setError("Impossible de charger les pièces"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const create = async (dto: {
    nom: string;
    numero: number;
    devEUI: string;
    responsableId?: string;
  }) => {
    if (DEMO_MODE) {
      const result: BackendPiece = {
        id: `demo-piece-${Date.now()}`,
        nom: dto.nom,
        numero: dto.numero,
        devEUI: dto.devEUI,
        statut: "OFFLINE",
        responsableId: dto.responsableId ?? null,
        responsable: null,
      };
      setData((prev) => [...prev, result]);
      return result;
    }
    const { data: result } = await apiClient.post<BackendPiece>("/pieces", dto);
    refetch();
    return result;
  };

  const remove = async (id: string) => {
    if (DEMO_MODE) {
      setData((prev) => prev.filter((p) => p.id !== id));
      return;
    }
    await apiClient.delete(`/pieces/${id}`);
    refetch();
  };

  const update = async (
    id: string,
    dto: Partial<{ nom: string; numero: number; devEUI: string; responsableId: string | null }>,
  ) => {
    if (DEMO_MODE) {
      let result: BackendPiece | undefined;
      setData((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          result = { ...p, ...dto };
          return result;
        }),
      );
      return result as BackendPiece;
    }
    const { data: result } = await apiClient.patch<BackendPiece>(`/pieces/${id}`, dto);
    refetch();
    return result;
  };

  return { data, loading, error, refetch, create, remove, update };
}

// ─── Télémétrie historique ────────────────────────────────────────────────────

export interface TelemetryPoint {
  id: number;
  pieceId: string;
  temperature: number;
  nbTirs: number;
  stockObus: number;
  cadence: number;
  azimutReel: number | null;
  azimutConsigne: number | null;
  giteReel: number | null;
  giteConsigne: number | null;
  lat: number | null;
  lon: number | null;
  mgrs: string | null;
  time: string;
}

export function useTelemetryHistory(pieceId: string, limit = 60) {
  const [data, setData] = useState<TelemetryPoint[]>([]);
  const [loading, setLoading] = useState(!DEMO_MODE);

  useEffect(() => {
    if (!pieceId || DEMO_MODE) return;
    setLoading(true);
    apiClient
      .get<TelemetryPoint[]>(`/pieces/${pieceId}/telemetry?limit=${limit}`)
      .then((res) => setData(res.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [pieceId, limit]);

  return { data, loading };
}

// ─── Responsables ─────────────────────────────────────────────────────────────

export interface BackendUser {
  id: string;
  identifiant: string;
  nom: string;
  prenom: string;
  grade: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  pieces: Array<{ id: string; nom: string; numero: number }>;
}

const DEMO_RESPONSABLES: BackendUser[] = [
  {
    id: "demo-resp-1",
    identifiant: "a.diallo",
    nom: "Diallo",
    prenom: "Amadou",
    grade: "Sergent",
    role: "RESPONSABLE",
    isActive: true,
    mustChangePassword: false,
    pieces: [{ id: "1", nom: "ROVER-01", numero: 1 }],
  },
  {
    id: "demo-resp-2",
    identifiant: "f.sow",
    nom: "Sow",
    prenom: "Fatou",
    grade: "Caporal",
    role: "RESPONSABLE",
    isActive: true,
    mustChangePassword: true,
    pieces: [],
  },
];

function demoPieceRef(id: string) {
  const p = DEMO_BACKEND_PIECES.find((p) => p.id === id);
  return p ? { id: p.id, nom: p.nom, numero: p.numero } : { id, nom: id, numero: 0 };
}

export function useResponsables() {
  const [data, setData] = useState<BackendUser[]>(DEMO_MODE ? DEMO_RESPONSABLES : []);
  const [loading, setLoading] = useState(!DEMO_MODE);

  const refetch = useCallback(() => {
    if (DEMO_MODE) {
      setLoading(false);
      return;
    }
    setLoading(true);
    apiClient
      .get<BackendUser[]>("/users")
      .then((res) => setData(res.data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const create = async (dto: {
    identifiant: string;
    nom: string;
    prenom: string;
    grade: string;
    role: string;
    pieceIds?: string[];
  }) => {
    if (DEMO_MODE) {
      const result = { id: `demo-resp-${Date.now()}`, identifiant: dto.identifiant, tempPassword: "Demo1234!" };
      setData((prev) => [
        ...prev,
        {
          id: result.id,
          identifiant: dto.identifiant,
          nom: dto.nom,
          prenom: dto.prenom,
          grade: dto.grade,
          role: "RESPONSABLE",
          isActive: true,
          mustChangePassword: true,
          pieces: (dto.pieceIds ?? []).map(demoPieceRef),
        },
      ]);
      return result;
    }
    const { data: result } = await apiClient.post<{
      id: string;
      identifiant: string;
      tempPassword: string;
    }>("/users", { ...dto, role: "RESPONSABLE" });
    refetch();
    return result;
  };

  const update = async (
    id: string,
    dto: { nom?: string; prenom?: string; grade?: string; pieceIds?: string[] },
  ) => {
    if (DEMO_MODE) {
      setData((prev) =>
        prev.map((u) =>
          u.id === id
            ? {
                ...u,
                ...(dto.nom !== undefined && { nom: dto.nom }),
                ...(dto.prenom !== undefined && { prenom: dto.prenom }),
                ...(dto.grade !== undefined && { grade: dto.grade }),
                ...(dto.pieceIds !== undefined && { pieces: dto.pieceIds.map(demoPieceRef) }),
              }
            : u,
        ),
      );
      return;
    }
    await apiClient.patch(`/users/${id}`, dto);
    refetch();
  };

  const suspend = async (id: string) => {
    if (DEMO_MODE) {
      setData((prev) => prev.map((u) => (u.id === id ? { ...u, isActive: false } : u)));
      return;
    }
    await apiClient.patch(`/users/${id}/suspend`);
    refetch();
  };

  const reactivate = async (id: string) => {
    if (DEMO_MODE) {
      setData((prev) => prev.map((u) => (u.id === id ? { ...u, isActive: true } : u)));
      return;
    }
    await apiClient.patch(`/users/${id}/reactivate`);
    refetch();
  };

  const resetPassword = async (id: string) => {
    if (DEMO_MODE) {
      return { tempPassword: "Demo1234!" };
    }
    const { data: result } = await apiClient.patch<{ tempPassword: string }>(
      `/users/${id}/reset-password`,
    );
    refetch();
    return result;
  };

  const remove = async (id: string) => {
    if (DEMO_MODE) {
      setData((prev) => prev.filter((u) => u.id !== id));
      return;
    }
    await apiClient.delete(`/users/${id}`);
    refetch();
  };

  return { data, loading, refetch, create, update, remove, suspend, reactivate, resetPassword };
}

// ─── Alertes avec filtres ─────────────────────────────────────────────────────

const DEMO_ALERTES: BackendAlerte[] = [
  {
    id: "demo-alerte-1",
    pieceId: "2",
    type: "temperature",
    niveau: "CRITICAL",
    message: "Température moteur élevée sur ROVER-04",
    valeur: 44.2,
    acquittee: false,
    createdAt: new Date(Date.now() - 15 * 60_000).toISOString(),
  },
  {
    id: "demo-alerte-2",
    pieceId: "2",
    type: "azimut",
    niveau: "WARNING",
    message: "Désalignement azimut sur ROVER-04",
    valeur: 8.5,
    acquittee: false,
    createdAt: new Date(Date.now() - 40 * 60_000).toISOString(),
  },
  {
    id: "demo-alerte-3",
    pieceId: "1",
    type: "stock",
    niveau: "WARNING",
    message: "Stock d'obus bas sur ROVER-01",
    valeur: 42,
    acquittee: true,
    createdAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  },
];

export function useAlertesFull(acquittee?: boolean) {
  const [data, setData] = useState<BackendAlerte[]>(
    DEMO_MODE
      ? acquittee === undefined
        ? DEMO_ALERTES
        : DEMO_ALERTES.filter((a) => a.acquittee === acquittee)
      : [],
  );

  const refetch = useCallback(() => {
    if (DEMO_MODE) {
      setData(acquittee === undefined ? DEMO_ALERTES : DEMO_ALERTES.filter((a) => a.acquittee === acquittee));
      return;
    }
    apiClient.get<BackendAlerte[]>("/alertes").then((res) => {
      const filtered =
        acquittee === undefined ? res.data : res.data.filter((a) => a.acquittee === acquittee);
      setData(filtered);
    });
  }, [acquittee]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, refetch };
}

// ─── Health check ─────────────────────────────────────────────────────────────

export interface ServiceHealth {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

export interface HealthStatus {
  postgres: ServiceHealth;
  redis: ServiceHealth;
  chirpstack: ServiceHealth;
  timestamp: string;
}

function demoHealth(): HealthStatus {
  return {
    postgres: { ok: true, latencyMs: 3 },
    redis: { ok: true, latencyMs: 1 },
    chirpstack: { ok: true, latencyMs: 12 },
    timestamp: new Date().toISOString(),
  };
}

export function useHealth() {
  const [data, setData] = useState<HealthStatus | null>(DEMO_MODE ? demoHealth() : null);
  const [loading, setLoading] = useState(!DEMO_MODE);

  const refetch = useCallback(() => {
    if (DEMO_MODE) {
      setData(demoHealth());
      setLoading(false);
      return;
    }
    setLoading(true);
    apiClient
      .get<HealthStatus>("/health")
      .then((res) => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (DEMO_MODE) return;
    refetch();
    const id = setInterval(refetch, 30_000);
    return () => clearInterval(id);
  }, [refetch]);

  return { data, loading, refetch };
}

// ─── Admin (backup / reset / restart) ────────────────────────────────────────

export function useAdmin() {
  const backup = async () => {
    const filename = `ninki-backup-${new Date().toISOString().slice(0, 10)}.json`;
    if (DEMO_MODE) {
      const payload = JSON.stringify({ demo: true, generatedAt: new Date().toISOString(), pieces: DEMO_BACKEND_PIECES }, null, 2);
      const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const res = await apiClient.get("/admin/backup", { responseType: "blob" });
    const disposition = res.headers["content-disposition"] ?? "";
    const match = disposition.match(/filename="([^"]+)"/);
    const resolvedFilename = match ? match[1] : filename;
    const url = URL.createObjectURL(new Blob([res.data], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = resolvedFilename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = async () => {
    if (DEMO_MODE) return;
    await apiClient.post<{ message: string }>("/admin/reset");
  };

  const restart = async () => {
    if (DEMO_MODE) return;
    await apiClient.post<{ message: string }>("/admin/restart");
  };

  return { backup, reset, restart };
}

// ─── Audit log ────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  userId: string | null;
  identifiant: string | null;
  action: string;
  detail: string | null;
  ip: string | null;
  createdAt: string;
}

const DEMO_AUDIT_LOG: AuditEntry[] = [
  {
    id: "demo-audit-1",
    userId: "demo-user",
    identifiant: "demo",
    action: "LOGIN",
    detail: "Connexion réussie",
    ip: "127.0.0.1",
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  },
  {
    id: "demo-audit-2",
    userId: "demo-user",
    identifiant: "demo",
    action: "CONFIG_UPDATE",
    detail: "Mise à jour des seuils de température",
    ip: "127.0.0.1",
    createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  },
];

export function useAuditLog(page = 1, limit = 50) {
  const [data, setData] = useState<AuditEntry[]>(DEMO_MODE ? DEMO_AUDIT_LOG : []);
  const [total, setTotal] = useState(DEMO_MODE ? DEMO_AUDIT_LOG.length : 0);
  const [loading, setLoading] = useState(!DEMO_MODE);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (DEMO_MODE) {
      const start = (page - 1) * limit;
      setData(DEMO_AUDIT_LOG.slice(start, start + limit));
      setTotal(DEMO_AUDIT_LOG.length);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    apiClient
      .get<{ data: AuditEntry[]; total: number }>(`/config/audit-log?page=${page}&limit=${limit}`)
      .then((res) => {
        // Backend returns { data: [...], total: N } — handle both shapes defensively
        const payload = res.data;
        const entries: AuditEntry[] = Array.isArray(payload)
          ? (payload as unknown as AuditEntry[])
          : (payload.data ?? []);
        setData(entries);
        setTotal(Array.isArray(payload) ? entries.length : (payload.total ?? 0));
      })
      .catch(() => setError("Impossible de charger le journal d'audit"))
      .finally(() => setLoading(false));
  }, [page, limit]);

  return { data, total, loading, error };
}

// ─── Maintenance ──────────────────────────────────────────────────────────────

export interface MaintenanceTimeline {
  time: string;
  temperature: number;
  cadence: number;
  azimutDelta: number | null;
  stockObus: number;
  nbTirs: number;
}

export interface MaintenanceCanon {
  pieceId: string;
  nom: string;
  numero: number;
  statut: string;
  scoreGlobal: number;
  scoreTirs: number;
  scoreTemp: number;
  scoreAlerte: number;
  scoreDelta: number;
  maxTemp: number;
  totalTirs: number;
  lastStock: number;
  maxCadence: number;
  maxDelta: number;
  alertes: number;
  alertesCrit: number;
  timeline: MaintenanceTimeline[];
}

export interface MaintenanceSeuils {
  tempDegrade: number;
  tempCritique: number;
  stockAlerte: number;
  azimutCritique: number;
  cadenceAlerte: number;
}

export interface MaintenanceData {
  data: MaintenanceCanon[];
  seuils: MaintenanceSeuils;
  period: string;
  since: string;
}

export type MaintenancePeriod = "24h" | "7j" | "30j" | "operation";

const DEMO_MAINTENANCE_SEUILS: MaintenanceSeuils = {
  tempDegrade: 40,
  tempCritique: 55,
  stockAlerte: 15,
  azimutCritique: 5,
  cadenceAlerte: 3,
};

// Seules les pièces de type canon (ni éclaireur, ni station météo) ont un historique de maintenance
const DEMO_MAINTENANCE_CANONS: MaintenanceCanon[] = DEMO_PIECES.filter(
  (p) => p.nom !== "ECLAIREUR" && p.nom !== "STATION_METEO",
).map((p) => {
  const timeline: MaintenanceTimeline[] = Array.from({ length: 6 }, (_, i) => ({
    time: new Date(Date.now() - (5 - i) * 3_600_000).toISOString(),
    temperature: p.temperature - (5 - i) * 0.6,
    cadence: p.cadenceTir,
    azimutDelta: p.azimutReel - p.azimutConsigne,
    stockObus: p.stockObus + (5 - i) * 2,
    nbTirs: Math.max(0, p.nombreTirs - (5 - i)),
  }));
  return {
    pieceId: p.id,
    nom: p.nom,
    numero: p.numero,
    statut: p.statut === "operational" ? "OPERATIONAL" : p.statut === "degraded" ? "DEGRADED" : "OFFLINE",
    scoreGlobal: p.statut === "degraded" ? 62 : 91,
    scoreTirs: 88,
    scoreTemp: p.statut === "degraded" ? 55 : 90,
    scoreAlerte: p.statut === "degraded" ? 60 : 95,
    scoreDelta: p.statut === "degraded" ? 50 : 92,
    maxTemp: p.temperature,
    totalTirs: p.nombreTirs,
    lastStock: p.stockObus,
    maxCadence: p.cadenceTir,
    maxDelta: Math.abs(p.azimutReel - p.azimutConsigne),
    alertes: p.statut === "degraded" ? 2 : 0,
    alertesCrit: p.statut === "degraded" ? 1 : 0,
    timeline,
  };
});

function demoMaintenanceData(period: MaintenancePeriod): MaintenanceData {
  return {
    data: DEMO_MAINTENANCE_CANONS,
    seuils: DEMO_MAINTENANCE_SEUILS,
    period,
    since: new Date(Date.now() - 24 * 3_600_000).toISOString(),
  };
}

export function useMaintenanceData(period: MaintenancePeriod, pieceIds?: string[]) {
  const [data, setData] = useState<MaintenanceData | null>(DEMO_MODE ? demoMaintenanceData(period) : null);
  const [loading, setLoading] = useState(!DEMO_MODE);
  const [error, setError] = useState<string | null>(null);

  // Stable string key — avoids re-running the effect when a new array with same ids is passed
  const pieceIdsKey = useMemo(() => pieceIds?.slice().sort().join(",") ?? "", [pieceIds]);

  useEffect(() => {
    if (DEMO_MODE) {
      setData(demoMaintenanceData(period));
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ period });
    if (pieceIdsKey) params.set("pieceIds", pieceIdsKey);
    apiClient
      .get<MaintenanceData>(`/telemetry/maintenance?${params}`)
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch(() => {
        if (!cancelled) setError("Données indisponibles");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // Cancel stale responses when period or pieceIds change
    return () => {
      cancelled = true;
    };
  }, [period, pieceIdsKey]);

  return { data, loading, error };
}
