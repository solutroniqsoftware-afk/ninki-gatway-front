import { useEffect, useState, useCallback, useMemo } from "react";
import { apiClient } from "./client";
import type { BackendAlerte, BackendPiece } from "../ninki/types";

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

export function useConfig(enabled = true) {
  const [data, setData] = useState<ConfigBatterie | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
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
    const res = await apiClient.patch<ConfigBatterie>("/config/seuils", seuils);
    setData(res.data);
    return res.data;
  };

  const updateBatterie = async (info: Partial<ConfigBatterie>) => {
    const res = await apiClient.patch<ConfigBatterie>("/config/batterie", info);
    setData(res.data);
    return res.data;
  };

  return { data, loading, error, updateSeuils, updateBatterie };
}

// ─── Pièces (liste complète avec infos statiques) ─────────────────────────────

export function usePieces() {
  const [data, setData] = useState<BackendPiece[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
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
    const { data: result } = await apiClient.post<BackendPiece>("/pieces", dto);
    refetch();
    return result;
  };

  const remove = async (id: string) => {
    await apiClient.delete(`/pieces/${id}`);
    refetch();
  };

  const update = async (
    id: string,
    dto: Partial<{ nom: string; numero: number; devEUI: string; responsableId: string | null }>,
  ) => {
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pieceId) return;
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

export function useResponsables() {
  const [data, setData] = useState<BackendUser[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
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
    await apiClient.patch(`/users/${id}`, dto);
    refetch();
  };

  const suspend = async (id: string) => {
    await apiClient.patch(`/users/${id}/suspend`);
    refetch();
  };

  const reactivate = async (id: string) => {
    await apiClient.patch(`/users/${id}/reactivate`);
    refetch();
  };

  const resetPassword = async (id: string) => {
    const { data: result } = await apiClient.patch<{ tempPassword: string }>(
      `/users/${id}/reset-password`,
    );
    refetch();
    return result;
  };

  const remove = async (id: string) => {
    await apiClient.delete(`/users/${id}`);
    refetch();
  };

  return { data, loading, refetch, create, update, remove, suspend, reactivate, resetPassword };
}

// ─── Alertes avec filtres ─────────────────────────────────────────────────────

export function useAlertesFull(acquittee?: boolean) {
  const [data, setData] = useState<BackendAlerte[]>([]);

  const refetch = useCallback(() => {
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

export function useHealth() {
  const [data, setData] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    setLoading(true);
    apiClient
      .get<HealthStatus>("/health")
      .then((res) => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refetch();
    const id = setInterval(refetch, 30_000);
    return () => clearInterval(id);
  }, [refetch]);

  return { data, loading, refetch };
}

// ─── Admin (backup / reset / restart) ────────────────────────────────────────

export function useAdmin() {
  const backup = async () => {
    const res = await apiClient.get("/admin/backup", { responseType: "blob" });
    const disposition = res.headers["content-disposition"] ?? "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match
      ? match[1]
      : `ninki-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const url = URL.createObjectURL(new Blob([res.data], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = async () => {
    await apiClient.post<{ message: string }>("/admin/reset");
  };

  const restart = async () => {
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

export function useAuditLog(page = 1, limit = 50) {
  const [data, setData] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

export function useMaintenanceData(period: MaintenancePeriod, pieceIds?: string[]) {
  const [data, setData] = useState<MaintenanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stable string key — avoids re-running the effect when a new array with same ids is passed
  const pieceIdsKey = useMemo(() => pieceIds?.slice().sort().join(",") ?? "", [pieceIds]);

  useEffect(() => {
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
