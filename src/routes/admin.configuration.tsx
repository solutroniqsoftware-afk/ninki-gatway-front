import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseBackup,
  Download,
  Edit3,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Toaster } from "@/components/ui/sonner";
import { useConfig, usePieces, useAuditLog, useHealth, useAdmin } from "@/lib/api/hooks";
import { useNinki } from "@/lib/ninki/store";
import { clearServerUrl, isConfigured } from "@/lib/serverConfig";

export const Route = createFileRoute("/admin/configuration")({
  component: AdminConfigurationPage,
  head: () => ({ meta: [{ title: "Configuration du système · NINKI GATEWAY" }] }),
});

type TabKey = "battery" | "pieces" | "thresholds" | "system" | "danger";
type Connexion = "online" | "offline" | "never";
type ModalState =
  | { type: "piece" }
  | { type: "edit-piece"; id: string; nom: string; numero: number; devEUI: string; stockObus: number; cadenceStandard: number }
  | { type: "delete-piece"; id: string; nom: string }
  | { type: "apply-thresholds" }
  | { type: "reset-data"; step: 1 | 2 }
  | { type: "restart-services" }
  | null;

const initialSeuils = {
  temperature: { degrade: 70, critique: 85 },
  stockObus: { alerte: 15, stockMax: 75 },
  deltaAzimut: { correction: 2, critique: 5 },
  timeout: { offline: 30 },
  cadence: { anormal: 10 },
};

const tabs: { key: TabKey; label: string }[] = [
  { key: "battery", label: "Batterie" },
  { key: "pieces", label: "Pièces" },
  { key: "thresholds", label: "Seuils d'alerte" },
  { key: "system", label: "Système" },
  { key: "danger", label: "Zone danger" },
];

function AdminConfigurationPage() {
  const { data: config, updateSeuils, updateBatterie } = useConfig();
  const {
    data: apiPieces,
    create: createPiece,
    remove: removePiece,
    update: updatePiece,
  } = usePieces();
  const admin = useAdmin();
  const applyStockMax = useNinki((s) => s.applyStockMax);

  const [activeTab, setActiveTab] = useState<TabKey>("battery");
  const [modal, setModal] = useState<ModalState>(null);

  const [thresholds, setThresholds] = useState(initialSeuils);
  useEffect(() => {
    if (!config) return;
    setThresholds({
      temperature: { degrade: config.tempDegrade, critique: config.tempCritique },
      stockObus: { alerte: config.stockAlerte, stockMax: config.stockMax ?? 75 },
      deltaAzimut: { correction: config.azimutCorrection, critique: config.azimutCritique },
      timeout: { offline: config.timeoutOffline },
      cadence: { anormal: config.cadenceAlerte },
    });
  }, [config]);

  const pieces = apiPieces.map((p) => ({
    id: p.id,
    numero: p.numero,
    nom: p.nom,
    devEUI: p.devEUI,
    responsable: p.responsable ? `${p.responsable.prenom} ${p.responsable.nom}` : null,
    connexion: (p.statut === "OPERATIONAL"
      ? "online"
      : p.statut === "OFFLINE"
        ? "offline"
        : "never") as Connexion,
    stockObus: p.stockObus ?? 0,
    cadenceStandard: p.cadenceStandard ?? 6,
  }));

  const handleApplyThresholds = async () => {
    try {
      await updateSeuils({
        tempDegrade: thresholds.temperature.degrade,
        tempCritique: thresholds.temperature.critique,
        stockAlerte: thresholds.stockObus.alerte,
        stockMax: thresholds.stockObus.stockMax,
        azimutCorrection: thresholds.deltaAzimut.correction,
        azimutCritique: thresholds.deltaAzimut.critique,
        timeoutOffline: thresholds.timeout.offline,
        cadenceAlerte: thresholds.cadence.anormal,
      });
      applyStockMax(thresholds.stockObus.stockMax);
      toast.success("Seuils appliqués avec succès");
    } catch {
      toast.error("Erreur lors de l'application des seuils");
    }
    setModal(null);
  };

  const content = {
    battery: <BatteryTab config={config} updateBatterie={updateBatterie} />,
    pieces: <PiecesTab pieces={pieces} openModal={setModal} />,
    thresholds: (
      <ThresholdsTab thresholds={thresholds} setThresholds={setThresholds} openModal={setModal} />
    ),
    system: <SystemTab config={config} updateSeuils={updateSeuils} onBackup={admin.backup} />,
    danger: <DangerTab openModal={setModal} />,
  }[activeTab];

  return (
    <div className="min-h-full bg-[color:var(--bg-base)] p-5 text-[color:var(--text-primary)]">
      <Toaster richColors closeButton />
      <div className="mb-5 flex flex-col gap-4 border-b border-[color:var(--border-steel)] pb-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-[color:var(--cyan-live)]">
            Admin batterie · NINKI GATEWAY
          </div>
          <h1 className="mt-2 text-2xl font-semibold uppercase tracking-[0.14em]">
            Configuration du système
          </h1>
        </div>
        <nav className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                activeTab === tab.key
                  ? "border-[color:var(--cyan-live)] bg-[color:var(--cyan-live)]/12 text-[color:var(--cyan-live)] shadow-none"
                  : "border-[color:var(--border-steel)] bg-transparent text-[color:var(--text-secondary)] hover:border-[color:var(--cyan-live)] hover:text-[color:var(--text-primary)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      {content}
      <ModalHost
        modal={modal}
        setModal={setModal}
        onApplyThresholds={handleApplyThresholds}
        onCreatePiece={createPiece}
        onUpdatePiece={updatePiece}
        onDeletePiece={removePiece}
        onReset={admin.reset}
        onRestart={admin.restart}
      />
    </div>
  );
}

function BatteryTab({
  config,
  updateBatterie,
}: {
  config: import("@/lib/api/hooks").ConfigBatterie | null;
  updateBatterie: (
    dto: Partial<import("@/lib/api/hooks").ConfigBatterie>,
  ) => Promise<import("@/lib/api/hooks").ConfigBatterie>;
}) {
  const [nom, setNom] = useState(config?.nom ?? "");

  useEffect(() => {
    if (config?.nom) setNom(config.nom);
  }, [config?.nom]);

  const handleSaveBatterie = async () => {
    try {
      await updateBatterie({ nom });
      toast.success("Informations batterie enregistrées");
    } catch {
      toast.error("Erreur lors de l'enregistrement");
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SectionCard title="Informations batterie">
        <Field label="Nom batterie">
          <input className="form-input" value={nom} onChange={(e) => setNom(e.target.value)} />
        </Field>
        <Field label="Identifiant batterie">
          <input
            className="form-input font-mono text-[color:var(--cyan-live)]"
            value={config?.identifiant ?? "—"}
            readOnly
          />
        </Field>
        <button onClick={handleSaveBatterie} className="btn-primary inline-flex items-center gap-2">
          <Save className="h-4 w-4" />
          Enregistrer les modifications
        </button>
      </SectionCard>

      <SectionCard title="Changement mot de passe Admin">
        <PasswordChangeForm />
      </SectionCard>
    </div>
  );
}

function EyeToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      tabIndex={-1}
      className="ml-2 text-[color:var(--text-secondary)] hover:text-[color:var(--cyan-live)] transition flex-shrink-0"
    >
      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}

function PasswordChangeForm() {
  const [ancien, setAncien] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAncien, setShowAncien] = useState(false);
  const [showNouveau, setShowNouveau] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const strength = nouveau.length >= 14 ? "fort" : nouveau.length >= 10 ? "moyen" : "faible";
  const strengthColor =
    strength === "fort" ? "bg-[color:var(--success)]" : strength === "moyen" ? "bg-[color:var(--warning)]" : "bg-[color:var(--danger)]";
  const match = nouveau === confirmation;
  const canSubmit = ancien && nouveau.length >= 10 && match && !busy;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await import("@/lib/api/client").then(({ apiClient }) =>
        apiClient.patch("/auth/change-password", {
          ancienPassword: ancien,
          nouveauPassword: nouveau,
        }),
      );
      toast.success("Mot de passe changé avec succès");
      setAncien("");
      setNouveau("");
      setConfirmation("");
    } catch (err: unknown) {
      const status = (err as { response?: { status: number } })?.response?.status;
      toast.error(status === 403 ? "Ancien mot de passe incorrect" : "Erreur lors du changement");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Field label="Mot de passe actuel">
        <div className="flex items-center form-input">
          <input
            className="flex-1 bg-transparent outline-none font-mono"
            type={showAncien ? "text" : "password"}
            value={ancien}
            onChange={(e) => setAncien(e.target.value)}
          />
          <EyeToggle show={showAncien} onToggle={() => setShowAncien((v) => !v)} />
        </div>
      </Field>
      <Field label="Nouveau mot de passe">
        <div className="flex items-center form-input">
          <input
            className="flex-1 bg-transparent outline-none font-mono"
            type={showNouveau ? "text" : "password"}
            value={nouveau}
            onChange={(e) => setNouveau(e.target.value)}
          />
          <EyeToggle show={showNouveau} onToggle={() => setShowNouveau((v) => !v)} />
        </div>
        <div className="mt-2 text-xs text-[color:var(--text-secondary)]">10 caractères minimum</div>
      </Field>
      <Field label="Confirmation">
        <div
          className={`flex items-center form-input ${confirmation && !match ? "border-[color:var(--danger)]" : ""}`}
        >
          <input
            className="flex-1 bg-transparent outline-none font-mono"
            type={showConfirm ? "text" : "password"}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
          <EyeToggle show={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />
        </div>
        {confirmation && !match && (
          <div className="mt-1 text-xs text-[color:var(--danger)]">Les mots de passe ne correspondent pas</div>
        )}
      </Field>
      <div>
        <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.16em]">
          <span className="text-[color:var(--text-secondary)]">Force</span>
          <span className="font-mono text-[color:var(--text-primary)]">{strength}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[color:var(--bg-base)]">
          <div
            className={`h-full ${strengthColor} transition-all`}
            style={{ width: strength === "fort" ? "100%" : strength === "moyen" ? "62%" : "30%" }}
          />
        </div>
      </div>
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="btn-primary mt-2 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Changement…" : "Changer le mot de passe"}
      </button>
    </div>
  );
}

type DisplayPiece = {
  id: string;
  numero: number;
  nom: string;
  devEUI: string;
  responsable: string | null;
  connexion: Connexion;
  stockObus: number;
  cadenceStandard: number;
};

function PiecesTab({
  pieces,
  openModal,
}: {
  pieces: DisplayPiece[];
  openModal: (modal: ModalState) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => openModal({ type: "piece" })}
          className="btn-primary inline-flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Ajouter une pièce
        </button>
      </div>
      <SectionCard title="Tableau des pièces">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="border-b border-[color:var(--border-steel)] text-xs uppercase tracking-[0.14em] text-[color:var(--text-secondary)]">
              <tr>
                <th className="py-3">N°</th>
                <th>Nom</th>
                <th>DevEUI</th>
                <th>Responsable assigné</th>
                <th>Connexion</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border-steel)]">
              {pieces.map((piece) => (
                <tr key={piece.id}>
                  <td className="py-3 font-mono text-[color:var(--cyan-live)]">{piece.numero}</td>
                  <td className="font-medium">{piece.nom}</td>
                  <td className="max-w-[170px] truncate font-mono text-[color:var(--text-primary)]">
                    {piece.devEUI}
                  </td>
                  <td>
                    {piece.responsable ?? (
                      <span className="rounded border border-[color:var(--warning)] bg-[color:var(--warning)]/10 px-2 py-1 text-xs text-[color:var(--warning)]">
                        Non assigné
                      </span>
                    )}
                  </td>
                  <td>
                    <ConnectionStatus status={piece.connexion} />
                  </td>
                  <td>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() =>
                          openModal({
                            type: "edit-piece",
                            id: piece.id,
                            nom: piece.nom,
                            numero: piece.numero,
                            devEUI: piece.devEUI,
                            stockObus: piece.stockObus,
                            cadenceStandard: piece.cadenceStandard,
                          })
                        }
                        className="rounded border border-[color:var(--border-steel)] p-2 text-[color:var(--cyan-live)] hover:bg-[color:var(--cyan-live)]/10"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() =>
                          openModal({ type: "delete-piece", id: piece.id, nom: piece.nom })
                        }
                        className="rounded border border-[color:var(--danger)] p-2 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

function ThresholdsTab({
  thresholds,
  setThresholds,
  openModal,
}: {
  thresholds: typeof initialSeuils;
  setThresholds: React.Dispatch<React.SetStateAction<typeof initialSeuils>>;
  openModal: (modal: ModalState) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Température">
          <RangeControl
            label="Seuil dégradé"
            value={thresholds.temperature.degrade}
            min={0}
            max={100}
            unit="°C"
            tone="warning"
            onChange={(value) =>
              setThresholds((current) => ({
                ...current,
                temperature: {
                  degrade: value,
                  critique: Math.max(value + 1, current.temperature.critique),
                },
              }))
            }
          />
          <RangeControl
            label="Seuil critique"
            value={thresholds.temperature.critique}
            min={0}
            max={150}
            unit="°C"
            tone="danger"
            onChange={(value) =>
              setThresholds((current) => ({
                ...current,
                temperature: { ...current.temperature, critique: value },
              }))
            }
          />
          <DangerPreview
            degrade={thresholds.temperature.degrade}
            critique={thresholds.temperature.critique}
          />
        </SectionCard>

        <SectionCard title="Stock obus">
          <RangeControl
            label="Stock maximum"
            value={thresholds.stockObus.stockMax}
            min={10}
            max={200}
            unit="unités"
            tone="live"
            onChange={(value) =>
              setThresholds((current) => ({
                ...current,
                stockObus: {
                  ...current.stockObus,
                  stockMax: value,
                  alerte: Math.min(current.stockObus.alerte, value - 1),
                },
              }))
            }
          />
          <RangeControl
            label="Seuil alerte"
            value={thresholds.stockObus.alerte}
            min={0}
            max={thresholds.stockObus.stockMax - 1}
            unit="unités"
            tone="warning"
            onChange={(value) =>
              setThresholds((current) => ({
                ...current,
                stockObus: { ...current.stockObus, alerte: value },
              }))
            }
          />
          <AlertText>
            Capacité max : {thresholds.stockObus.stockMax} · Alerte si stock &lt;{" "}
            {thresholds.stockObus.alerte} unités
          </AlertText>
        </SectionCard>

        <SectionCard title="Delta azimut">
          <RangeControl
            label="Seuil correction"
            value={thresholds.deltaAzimut.correction}
            min={0}
            max={10}
            unit="°"
            tone="warning"
            onChange={(value) =>
              setThresholds((current) => ({
                ...current,
                deltaAzimut: {
                  correction: value,
                  critique: Math.max(value + 1, current.deltaAzimut.critique),
                },
              }))
            }
          />
          <RangeControl
            label="Seuil critique"
            value={thresholds.deltaAzimut.critique}
            min={0}
            max={15}
            unit="°"
            tone="danger"
            onChange={(value) =>
              setThresholds((current) => ({
                ...current,
                deltaAzimut: { ...current.deltaAzimut, critique: value },
              }))
            }
          />
          <AlertText>
            Correction si delta &gt; {thresholds.deltaAzimut.correction}° · Critique si delta &gt;{" "}
            {thresholds.deltaAzimut.critique}°
          </AlertText>
        </SectionCard>

        <SectionCard title="Timeout déconnexion">
          <RangeControl
            label="Timeout offline"
            value={thresholds.timeout.offline}
            min={10}
            max={120}
            unit="s"
            tone="live"
            onChange={(value) =>
              setThresholds((current) => ({ ...current, timeout: { offline: value } }))
            }
          />
          <AlertText>
            Pièce déclarée offline après {thresholds.timeout.offline}s sans signal
          </AlertText>
        </SectionCard>

        <SectionCard title="Cadence de tir">
          <RangeControl
            label="Seuil anormal"
            value={thresholds.cadence.anormal}
            min={1}
            max={20}
            unit="tirs/min"
            tone="warning"
            onChange={(value) =>
              setThresholds((current) => ({ ...current, cadence: { anormal: value } }))
            }
          />
          <AlertText>
            Alerte surchauffe si cadence &gt; {thresholds.cadence.anormal} tirs/min
          </AlertText>
        </SectionCard>
      </div>
      <div className="flex justify-end">
        <button
          onClick={() => openModal({ type: "apply-thresholds" })}
          className="btn-primary inline-flex items-center gap-2"
        >
          <CheckCircle2 className="h-4 w-4" />
          Appliquer tous les seuils
        </button>
      </div>
    </div>
  );
}

const RETENTION_OPTIONS: { label: string; jours: number | null }[] = [
  { label: "7 jours", jours: 7 },
  { label: "30 jours", jours: 30 },
  { label: "90 jours", jours: 90 },
  { label: "Illimité", jours: null },
];

function SystemTab({
  config,
  updateSeuils,
  onBackup,
}: {
  config: import("@/lib/api/hooks").ConfigBatterie | null;
  updateSeuils: (
    seuils: Partial<import("@/lib/api/hooks").ConfigBatterie>,
  ) => Promise<import("@/lib/api/hooks").ConfigBatterie>;
  onBackup: () => Promise<void>;
}) {
  const currentJours = config?.retentionJours ?? 30;
  const currentLabel = RETENTION_OPTIONS.find((o) => o.jours === currentJours)?.label ?? "Illimité";
  const [retention, setRetention] = useState(currentLabel);
  const [exporting, setExporting] = useState(false);
  const [typeFilter, setTypeFilter] = useState("Tous");
  const { data: auditEntries } = useAuditLog(1, 50);
  const { data: health, loading: healthLoading, refetch: refetchHealth } = useHealth();

  useEffect(() => {
    setRetention(currentLabel);
  }, [currentLabel]);

  const filteredAudit = useMemo(
    () =>
      auditEntries.filter(
        (row) =>
          typeFilter === "Tous" || row.action.toLowerCase().includes(typeFilter.toLowerCase()),
      ),
    [auditEntries, typeFilter],
  );

  const handleSaveRetention = async () => {
    const opt = RETENTION_OPTIONS.find((o) => o.label === retention);
    try {
      await updateSeuils({ retentionJours: opt?.jours ?? 0 });
      toast.success("Rétention mise à jour");
    } catch {
      toast.error("Erreur lors de la mise à jour");
    }
  };

  const handleBackup = async () => {
    setExporting(true);
    try {
      await onBackup();
      toast.success("Sauvegarde exportée");
    } catch {
      toast.error("Erreur lors de l'export");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title="Statut des services"
        action={
          <button
            onClick={refetchHealth}
            disabled={healthLoading}
            className="btn-secondary inline-flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${healthLoading ? "animate-spin" : ""}`} />
            Rafraîchir
          </button>
        }
      >
        {health && (
          <div className="font-mono text-[10px] text-[color:var(--text-secondary)] mb-3">
            Dernière vérification : {new Date(health.timestamp).toLocaleTimeString()}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px] text-left text-sm">
            <thead className="border-b border-[color:var(--border-steel)] text-xs uppercase tracking-[0.14em] text-[color:var(--text-secondary)]">
              <tr>
                <th className="py-3">Service</th>
                <th>Statut</th>
                <th>Latence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border-steel)]">
              {[
                { key: "postgres" as const, label: "PostgreSQL" },
                { key: "redis" as const, label: "Redis" },
                { key: "chirpstack" as const, label: "ChirpStack" },
              ].map(({ key, label }) => {
                const svc = health?.[key];
                return (
                  <tr key={key}>
                    <td className="py-3 font-medium">{label}</td>
                    <td>
                      {healthLoading || !health ? (
                        <span className="font-mono text-xs text-[color:var(--text-secondary)]">—</span>
                      ) : (
                        <ConnectionStatus status={svc?.ok ? "online" : "offline"} />
                      )}
                    </td>
                    <td className="font-mono text-[color:var(--text-primary)]">
                      {svc?.latencyMs != null ? `${svc.latencyMs} ms` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Rétention des données">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {RETENTION_OPTIONS.map(({ label }) => (
              <label
                key={label}
                className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm ${
                  retention === label
                    ? "border-[color:var(--cyan-live)] bg-[color:var(--cyan-live)]/10 text-[color:var(--cyan-live)]"
                    : "border-[color:var(--border-steel)] text-[color:var(--text-secondary)]"
                }`}
              >
                <input
                  type="radio"
                  name="retention"
                  checked={retention === label}
                  onChange={() => setRetention(label)}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="rounded border border-[color:var(--border-steel)] bg-[color:var(--bg-card)] p-3 text-sm text-[color:var(--text-secondary)]">
            Rétention active :{" "}
            <span className="font-mono text-[color:var(--text-primary)]">
              {config?.retentionJours ? `${config.retentionJours} jours` : "Illimité"}
            </span>
          </div>
          <button onClick={handleSaveRetention} className="btn-primary w-fit">
            Enregistrer
          </button>
        </SectionCard>

        <SectionCard title="Sauvegarde manuelle">
          <div className="flex items-center gap-3 rounded border border-[color:var(--border-steel)] bg-[color:var(--bg-card)] p-3">
            <DatabaseBackup className="h-5 w-5 text-[color:var(--cyan-live)]" />
            <span className="text-sm text-[color:var(--text-secondary)]">
              Export complet : télémétrie, alertes, commandes, config
            </span>
          </div>
          <button
            onClick={handleBackup}
            className="btn-primary inline-flex w-fit items-center gap-2"
            disabled={exporting}
          >
            <Download className="h-4 w-4" />
            {exporting ? "Export en cours…" : "Exporter la base de données"}
          </button>
        </SectionCard>
      </div>

      <SectionCard
        title="Audit log"
        action={
          <button className="btn-secondary inline-flex items-center gap-2">
            <Download className="h-4 w-4" />
            Exporter en CSV
          </button>
        }
      >
        <div className="flex flex-wrap gap-2">
          <input className="form-input max-w-[190px]" type="date" />
          <select
            className="form-input max-w-[220px]"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
          >
            {["Tous", "Connexion", "Commande", "Création", "Alerte"].map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-[color:var(--border-steel)] text-xs uppercase tracking-[0.14em] text-[color:var(--text-secondary)]">
              <tr>
                <th className="py-3">Heure</th>
                <th>Utilisateur</th>
                <th>Action</th>
                <th>Détail</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border-steel)]">
              {filteredAudit.map((row) => (
                <tr key={row.id}>
                  <td className="py-3 font-mono text-[color:var(--cyan-live)]">
                    {new Date(row.createdAt).toLocaleTimeString()}
                  </td>
                  <td className="font-mono">{row.identifiant ?? "—"}</td>
                  <td>{row.action}</td>
                  <td className="text-[color:var(--text-secondary)]">{row.detail ?? "—"}</td>
                  <td className="font-mono text-[color:var(--text-secondary)]">{row.ip ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-[color:var(--border-steel)] pt-3 text-xs text-[color:var(--text-secondary)]">
          <span>20 lignes par page</span>
          <span className="font-mono">Page 1 / 1</span>
        </div>
      </SectionCard>
    </div>
  );
}

function DangerTab({ openModal }: { openModal: (modal: ModalState) => void }) {
  const serverConfigured = isConfigured();

  return (
    <div className="rounded border border-[color:var(--danger)] bg-[color:var(--danger)]/6 p-4">
      <div className="mb-4 flex items-center gap-3 text-[color:var(--danger)]">
        <ShieldAlert className="h-6 w-6" />
        <h2 className="text-xl font-semibold uppercase tracking-[0.14em]">Zone danger</h2>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {/* Changer d'adresse serveur — visible seulement en mode Tauri */}
        {serverConfigured && (
          <div className="rounded border border-[color:var(--warning)] bg-[color:var(--warning)]/10 p-5">
            <h3 className="font-semibold text-[color:var(--warning)]">Changer d'adresse serveur</h3>
            <p className="mt-3 text-sm leading-6 text-[color:var(--text-primary)]">
              Reconfigurer l'adresse IP du SBC. L'application se rechargera et demandera la nouvelle
              adresse au prochain démarrage.
            </p>
            <button
              onClick={() => {
                clearServerUrl();
                window.location.reload();
              }}
              className="mt-5 rounded border border-[color:var(--warning)] bg-[color:var(--warning)]/18 px-4 py-2 text-sm font-semibold uppercase tracking-[0.12em] text-[color:var(--warning)] hover:bg-[color:var(--warning)]/25"
            >
              Changer d'adresse serveur
            </button>
          </div>
        )}
        <div className="rounded border border-[color:var(--danger)] bg-[color:var(--danger)]/10 p-5">
          <h3 className="font-semibold text-[color:var(--danger)]">Réinitialiser les données</h3>
          <p className="mt-3 text-sm leading-6 text-[color:var(--text-primary)]">
            Efface tout l'historique, les alertes et les logs. Les comptes utilisateurs et les
            pièces sont conservés.
          </p>
          <button
            onClick={() => openModal({ type: "reset-data", step: 1 })}
            className="mt-5 rounded border border-[color:var(--danger)] bg-[color:var(--danger)]/18 px-4 py-2 text-sm font-semibold uppercase tracking-[0.12em] text-[color:var(--danger)] hover:bg-[color:var(--danger)]/25"
          >
            Réinitialiser les données
          </button>
        </div>
        <div className="rounded border border-[color:var(--warning)] bg-[color:var(--warning)]/10 p-5">
          <h3 className="font-semibold text-[color:var(--warning)]">Redémarrer les services</h3>
          <p className="mt-3 text-sm leading-6 text-[color:var(--text-primary)]">
            Redémarre tous les services Docker. Tous les responsables seront déconnectés (30-60
            secondes).
          </p>
          <button
            onClick={() => openModal({ type: "restart-services" })}
            className="mt-5 rounded border border-[color:var(--warning)] bg-[color:var(--warning)]/18 px-4 py-2 text-sm font-semibold uppercase tracking-[0.12em] text-[color:var(--warning)] hover:bg-[color:var(--warning)]/25"
          >
            Redémarrer les services
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalHost({
  modal,
  setModal,
  onApplyThresholds,
  onCreatePiece,
  onUpdatePiece,
  onDeletePiece,
  onReset,
  onRestart,
}: {
  modal: ModalState;
  setModal: (modal: ModalState) => void;
  onApplyThresholds: () => Promise<void>;
  onCreatePiece: (dto: { nom: string; numero: number; devEUI: string }) => Promise<unknown>;
  onUpdatePiece: (
    id: string,
    dto: Partial<{ nom: string; numero: number; devEUI: string; stockObus: number; cadenceStandard: number }>,
  ) => Promise<unknown>;
  onDeletePiece: (id: string) => Promise<void>;
  onReset: () => Promise<void>;
  onRestart: () => Promise<void>;
}) {
  const [pieceForm, setPieceForm] = useState({ numero: "", nom: "", devEUI: "", stockObus: "0", cadenceStandard: "6" });
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const devEuiValid = /^[0-9A-F]{16}$/.test(pieceForm.devEUI);

  useEffect(() => {
    if (!modal || modal.type !== "edit-piece") return;
    setPieceForm({ numero: String(modal.numero), nom: modal.nom, devEUI: modal.devEUI, stockObus: String(modal.stockObus), cadenceStandard: String(modal.cadenceStandard) });
  }, [modal]);

  if (!modal) return null;

  const close = () => {
    setModal(null);
    setConfirmText("");
    setPieceForm({ numero: "", nom: "", devEUI: "", stockObus: "0", cadenceStandard: "6" });
  };

  const run = async (action: () => Promise<void>, successMsg: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(successMsg);
      close();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || "Erreur inattendue");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="glass w-full max-w-lg rounded-md p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold uppercase tracking-[0.14em]">
            {modal.type === "piece" && "Ajouter une pièce"}
            {modal.type === "edit-piece" && "Modifier la pièce"}
            {modal.type === "delete-piece" && "Supprimer la pièce"}
            {modal.type === "apply-thresholds" && "Appliquer les seuils"}
            {modal.type === "reset-data" && "Réinitialisation"}
            {modal.type === "restart-services" && "Redémarrage services"}
          </h2>
          <button onClick={close} className="rounded border border-[color:var(--border-steel)] p-1 text-[color:var(--text-secondary)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {modal.type === "piece" && (
          <div className="space-y-4">
            <Field label="Numéro pièce">
              <input
                className="form-input font-mono"
                type="number"
                min={1}
                value={pieceForm.numero}
                onChange={(e) => setPieceForm({ ...pieceForm, numero: e.target.value })}
              />
            </Field>
            <Field label="Nom pièce">
              <input
                className="form-input"
                placeholder="ex: Canon Alpha 1"
                value={pieceForm.nom}
                onChange={(e) => setPieceForm({ ...pieceForm, nom: e.target.value })}
              />
            </Field>
            <Field label="DevEUI LoRaWAN">
              <input
                className="form-input font-mono uppercase"
                maxLength={16}
                placeholder="16 caractères hexadécimaux"
                value={pieceForm.devEUI}
                onChange={(e) =>
                  setPieceForm({ ...pieceForm, devEUI: e.target.value.toUpperCase() })
                }
              />
              <div
                className={`mt-2 inline-flex rounded border px-2 py-1 text-xs ${devEuiValid ? "border-[color:var(--success)] bg-[color:var(--success)]/10 text-[color:var(--success)]" : "border-[color:var(--danger)] bg-[color:var(--danger)]/10 text-[color:var(--danger)]"}`}
              >
                {devEuiValid ? "Valide" : "Format invalide — 16 hex majuscules"}
              </div>
            </Field>
            <button
              disabled={!devEuiValid || !pieceForm.numero || !pieceForm.nom || busy}
              onClick={() =>
                run(
                  () =>
                    onCreatePiece({
                      nom: pieceForm.nom,
                      numero: Number(pieceForm.numero),
                      devEUI: pieceForm.devEUI,
                    }).then(() => {}),
                  "Pièce enregistrée avec succès",
                )
              }
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        )}

        {modal.type === "edit-piece" &&
          (() => {
            const editPieceId = modal.id;
            return (
              <div className="space-y-4">
                <Field label="Numéro pièce">
                  <input
                    className="form-input font-mono"
                    type="number"
                    min={1}
                    value={pieceForm.numero}
                    onChange={(e) => setPieceForm({ ...pieceForm, numero: e.target.value })}
                  />
                </Field>
                <Field label="Nom pièce">
                  <input
                    className="form-input"
                    value={pieceForm.nom}
                    onChange={(e) => setPieceForm({ ...pieceForm, nom: e.target.value })}
                  />
                </Field>
                <Field label="DevEUI LoRaWAN">
                  <input
                    className="form-input font-mono uppercase"
                    maxLength={16}
                    value={pieceForm.devEUI}
                    onChange={(e) =>
                      setPieceForm({ ...pieceForm, devEUI: e.target.value.toUpperCase() })
                    }
                  />
                  <div
                    className={`mt-2 inline-flex rounded border px-2 py-1 text-xs ${devEuiValid ? "border-[color:var(--success)] bg-[color:var(--success)]/10 text-[color:var(--success)]" : "border-[color:var(--danger)] bg-[color:var(--danger)]/10 text-[color:var(--danger)]"}`}
                  >
                    {devEuiValid ? "Valide" : "Format invalide — 16 hex majuscules"}
                  </div>
                </Field>
                <Field label="Stock obus">
                  <input
                    className="form-input font-mono"
                    type="number"
                    min={0}
                    value={pieceForm.stockObus}
                    onChange={(e) => setPieceForm({ ...pieceForm, stockObus: e.target.value })}
                  />
                </Field>
                <Field label="Cadence standard (coups/min)">
                  <input
                    className="form-input font-mono"
                    type="number"
                    min={1}
                    value={pieceForm.cadenceStandard}
                    onChange={(e) => setPieceForm({ ...pieceForm, cadenceStandard: e.target.value })}
                  />
                </Field>
                <button
                  disabled={!devEuiValid || !pieceForm.numero || !pieceForm.nom || busy}
                  onClick={() =>
                    run(
                      () =>
                        onUpdatePiece(editPieceId, {
                          nom: pieceForm.nom,
                          numero: Number(pieceForm.numero),
                          devEUI: pieceForm.devEUI,
                          stockObus: Number(pieceForm.stockObus),
                          cadenceStandard: Number(pieceForm.cadenceStandard),
                        }).then(() => {}),
                      "Pièce mise à jour avec succès",
                    )
                  }
                  className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? "Enregistrement…" : "Enregistrer les modifications"}
                </button>
              </div>
            );
          })()}

        {modal.type === "delete-piece" && (
          <ConfirmBody
            text={`Supprimer définitivement « ${modal.nom} » ? Cette action est irréversible.`}
            tone="danger"
            actionLabel={busy ? "Suppression…" : "Supprimer"}
            onConfirm={() => run(() => onDeletePiece(modal.id), "Pièce supprimée")}
          />
        )}

        {modal.type === "apply-thresholds" && (
          <ConfirmBody
            text="Les nouveaux seuils seront appliqués en temps réel sur l'ensemble de la batterie."
            tone="live"
            actionLabel="Appliquer"
            onConfirm={() => onApplyThresholds()}
          />
        )}

        {modal.type === "reset-data" && modal.step === 1 && (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-[color:var(--text-secondary)]">
              Tapez <span className="font-mono text-[color:var(--danger)]">CONFIRMER</span> pour continuer.
            </p>
            <input
              className="form-input font-mono"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
            <button
              disabled={confirmText !== "CONFIRMER"}
              onClick={() => setModal({ type: "reset-data", step: 2 })}
              className="rounded border border-[color:var(--danger)] bg-[color:var(--danger)]/18 px-4 py-2 text-sm font-semibold uppercase tracking-[0.12em] text-[color:var(--danger)] disabled:opacity-40"
            >
              Continuer
            </button>
          </div>
        )}

        {modal.type === "reset-data" && modal.step === 2 && (
          <ConfirmBody
            text="Télémétrie, alertes et commandes seront effacées. Utilisateurs et pièces conservés."
            tone="danger"
            actionLabel={busy ? "Réinitialisation…" : "Réinitialiser"}
            onConfirm={() => run(onReset, "Données réinitialisées avec succès")}
          />
        )}

        {modal.type === "restart-services" && (
          <ConfirmBody
            text="Les services Docker vont redémarrer. Toutes les sessions seront coupées pendant 30-60 secondes."
            tone="warning"
            actionLabel={busy ? "Redémarrage…" : "Redémarrer"}
            onConfirm={() => run(onRestart, "Redémarrage lancé — reconnexion dans 30-60s")}
          />
        )}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="panel rounded-md p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--text-primary)]">
          {title}
        </h2>
        {action}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-[color:var(--text-secondary)]">{label}</span>
      {children}
    </label>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  unit,
  tone,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  tone: "live" | "warning" | "danger";
  onChange: (value: number) => void;
}) {
  const color = tone === "danger" ? "var(--danger)" : tone === "warning" ? "var(--warning)" : "var(--cyan-live)";
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-sm text-[color:var(--text-secondary)]">{label}</span>
        <span
          className="rounded border px-2 py-1 font-mono text-xs"
          style={{ color, borderColor: `${color}66`, background: `${color}18` }}
        >
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[color:var(--cyan-live)]"
      />
      <div className="mt-1 flex justify-between font-mono text-[10px] text-[color:var(--text-secondary)]">
        <span>
          {min}
          {unit}
        </span>
        <span>
          {max}
          {unit}
        </span>
      </div>
    </div>
  );
}

function DangerPreview({ degrade, critique }: { degrade: number; critique: number }) {
  const green = Math.max(0, Math.min(100, (degrade / 150) * 100));
  const orange = Math.max(0, Math.min(100, ((critique - degrade) / 150) * 100));
  const red = Math.max(0, 100 - green - orange);
  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-secondary)]">
        Visualisation zone de danger
      </div>
      <div className="flex h-4 overflow-hidden rounded-full border border-[color:var(--border-steel)] bg-[color:var(--bg-base)]">
        <div className="bg-[color:var(--success)]" style={{ width: `${green}%` }} />
        <div className="bg-[color:var(--warning)]" style={{ width: `${orange}%` }} />
        <div className="bg-[color:var(--danger)]" style={{ width: `${red}%` }} />
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-[color:var(--text-secondary)]">
        <span>0</span>
        <span>vert 0-{degrade}</span>
        <span>
          orange {degrade}-{critique}
        </span>
        <span>rouge {critique}-150</span>
      </div>
    </div>
  );
}

function ConnectionStatus({ status }: { status: Connexion }) {
  const meta = {
    online: { label: "Online", color: "var(--success)" },
    offline: { label: "Offline", color: "var(--danger)" },
    never: { label: "Jamais vu", color: "var(--text-secondary)" },
  }[status];
  return (
    <span
      className="inline-flex items-center gap-2 font-mono text-xs"
      style={{ color: meta.color }}
    >
      <span className="h-2 w-2 rounded-full bg-current" />
      {meta.label}
    </span>
  );
}

function AlertText({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-[color:var(--border-steel)] bg-[color:var(--bg-card)] p-3 font-mono text-sm text-[color:var(--text-primary)]">
      {children}
    </div>
  );
}

function ConfirmBody({
  text,
  tone,
  actionLabel,
  onConfirm,
}: {
  text: string;
  tone: "live" | "warning" | "danger";
  actionLabel: string;
  onConfirm: () => void;
}) {
  const color = tone === "danger" ? "var(--danger)" : tone === "warning" ? "var(--warning)" : "var(--cyan-live)";
  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded border border-[color:var(--border-steel)] bg-[color:var(--bg-card)] p-3 text-sm leading-6 text-[color:var(--text-primary)]">
        <AlertTriangle className="mt-1 h-4 w-4 shrink-0" style={{ color }} />
        {text}
      </div>
      <button
        onClick={onConfirm}
        className="rounded border px-4 py-2 text-sm font-semibold uppercase tracking-[0.12em]"
        style={{ borderColor: color, color, background: `${color}1f` }}
      >
        {actionLabel}
      </button>
    </div>
  );
}
