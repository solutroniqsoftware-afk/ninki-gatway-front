import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  Wrench, Download, RefreshCw,
  Thermometer, Package, Target, Crosshair,
  AlertTriangle, CheckCircle, XCircle, Clock,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { useNinki } from "@/lib/ninki/store";
import { useMaintenanceData, useConfig } from "@/lib/api/hooks";
import type { MaintenancePeriod, MaintenanceCanon, MaintenanceSeuils } from "@/lib/api/hooks";

export const Route = createFileRoute("/admin/maintenance")({
  component: MaintenancePage,
  head: () => ({ meta: [{ title: "Maintenance · NINKI GATEWAY" }] }),
  beforeLoad: ({ context }: any) => {
    const user = context?.user ?? useNinki.getState().user;
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      throw redirect({ to: user ? "/" : "/login" });
    }
  },
});

// ─── Constants ────────────────────────────────────────────────────────────────

const PERIODS: { value: MaintenancePeriod; label: string }[] = [
  { value: "24h",       label: "24 h" },
  { value: "7j",        label: "7 jours" },
  { value: "30j",       label: "30 jours" },
  { value: "operation", label: "Opération" },
];

const DEFAULT_SEUILS: MaintenanceSeuils = {
  tempDegrade: 70, tempCritique: 85,
  stockAlerte: 15, azimutCritique: 5, cadenceAlerte: 10,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Niveau = "ok" | "attention" | "critique";

const NIVEAU_META: Record<Niveau, { label: string; color: string; Icon: typeof CheckCircle }> = {
  ok:        { label: "OPÉRATIONNEL", color: "var(--success)", Icon: CheckCircle },
  attention: { label: "ATTENTION",    color: "var(--warning)", Icon: AlertTriangle },
  critique:  { label: "CRITIQUE",     color: "var(--danger)",  Icon: XCircle },
};

function niveauCanon(c: MaintenanceCanon, s: MaintenanceSeuils): Niveau {
  if (
    c.maxTemp >= s.tempCritique ||
    c.lastStock <= s.stockAlerte ||
    c.maxDelta >= s.azimutCritique ||
    c.alertesCrit >= 3
  ) return "critique";
  if (
    c.maxTemp >= s.tempDegrade ||
    c.lastStock <= s.stockAlerte * 2 ||
    c.maxDelta >= s.azimutCritique * 0.6 ||
    c.alertes >= 2
  ) return "attention";
  return "ok";
}

function scoreColor(score: number): string {
  if (score >= 75) return "var(--success)";
  if (score >= 50) return "var(--warning)";
  return "var(--danger)";
}

// ─── Actions ─────────────────────────────────────────────────────────────────

interface Action {
  niveau: Niveau;
  canon: string;
  Icon: typeof Thermometer;
  action: string;
  detail: string;
}

function buildActions(canons: MaintenanceCanon[], s: MaintenanceSeuils): Action[] {
  const actions: Action[] = [];
  for (const c of canons) {
    const tag = `Canon ${c.numero}`;
    if (c.maxTemp >= s.tempCritique)
      actions.push({ niveau: "critique", canon: tag, Icon: Thermometer, action: "Refroidissement urgent", detail: `${c.maxTemp.toFixed(0)}°C — arrêt de tir requis` });
    else if (c.maxTemp >= s.tempDegrade)
      actions.push({ niveau: "attention", canon: tag, Icon: Thermometer, action: "Température élevée", detail: `${c.maxTemp.toFixed(0)}°C — réduire la cadence` });

    if (c.lastStock <= s.stockAlerte)
      actions.push({ niveau: "critique", canon: tag, Icon: Package, action: "Réapprovisionnement urgent", detail: `${c.lastStock} obus — seuil critique atteint` });
    else if (c.lastStock <= s.stockAlerte * 2)
      actions.push({ niveau: "attention", canon: tag, Icon: Package, action: "Stock bas", detail: `${c.lastStock} obus — planifier réapprovisionnement` });

    if (c.maxDelta >= s.azimutCritique)
      actions.push({ niveau: "critique", canon: tag, Icon: Target, action: "Vérifier alignement azimut", detail: `Écart de ${c.maxDelta.toFixed(1)}° (tolérance ${s.azimutCritique}°)` });

    if (c.alertesCrit >= 3)
      actions.push({ niveau: "critique", canon: tag, Icon: AlertTriangle, action: "Inspection complète", detail: `${c.alertesCrit} alertes critiques — intervention immédiate` });
    else if (c.alertes >= 2 && c.alertesCrit === 0)
      actions.push({ niveau: "attention", canon: tag, Icon: AlertTriangle, action: "Vérification préventive", detail: `${c.alertes} alertes sur la période` });
  }
  const order: Record<Niveau, number> = { critique: 0, attention: 1, ok: 2 };
  return actions.sort((a, b) => order[a.niveau] - order[b.niveau]);
}

// ─── Export CSV ───────────────────────────────────────────────────────────────

function exportCsv(canons: MaintenanceCanon[], seuils: MaintenanceSeuils, period: string) {
  const headers = [
    "Canon", "N°", "Niveau", "Score global",
    "Temp max (°C)", "Stock obus", "Écart azimut (°)",
    "Total tirs", "Alertes", "Alertes critiques",
  ];
  const rows = canons.map((c) => [
    c.nom, c.numero,
    niveauCanon(c, seuils).toUpperCase(),
    c.scoreGlobal,
    c.maxTemp.toFixed(1), c.lastStock, c.maxDelta.toFixed(2),
    c.totalTirs, c.alertes, c.alertesCrit,
  ]);
  const csv = ["﻿" + headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `maintenance-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h2 className="text-[10px] uppercase tracking-[0.3em] text-[color:var(--cyan-live)] font-mono flex items-center gap-1.5 shrink-0">
        {children}
      </h2>
      <span className="h-px flex-1 bg-[color:var(--border-steel)]" />
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = scoreColor(score);
  return (
    <div className="flex items-center gap-2.5 w-32">
      <div className="flex-1 h-1.5 rounded-full bg-[color:var(--bg-elevated)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
      <span className="font-mono text-[11px] font-bold tabular-nums w-7 text-right leading-none" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

function CanonCard({ canon, seuils }: { canon: MaintenanceCanon; seuils: MaintenanceSeuils }) {
  const [open, setOpen] = useState(false);
  const niv = niveauCanon(canon, seuils);
  const { label, color, Icon } = NIVEAU_META[niv];

  const tempNiv: Niveau = canon.maxTemp >= seuils.tempCritique ? "critique" : canon.maxTemp >= seuils.tempDegrade ? "attention" : "ok";
  const stockNiv: Niveau = canon.lastStock <= seuils.stockAlerte ? "critique" : canon.lastStock <= seuils.stockAlerte * 2 ? "attention" : "ok";
  const azNiv: Niveau = canon.maxDelta >= seuils.azimutCritique ? "critique" : canon.maxDelta >= seuils.azimutCritique * 0.6 ? "attention" : "ok";
  const alerteNiv: Niveau = canon.alertesCrit >= 3 ? "critique" : canon.alertes >= 2 ? "attention" : "ok";

  const miniStats = [
    { SIcon: Thermometer, label: "Temp",   value: `${canon.maxTemp.toFixed(0)}°C`,    niv: tempNiv },
    { SIcon: Package,     label: "Stock",  value: `${canon.lastStock}`,                niv: stockNiv },
    { SIcon: Target,      label: "Azimut", value: `±${canon.maxDelta.toFixed(1)}°`,    niv: azNiv },
    { SIcon: Crosshair,   label: "Tirs",   value: `${canon.totalTirs}`,                niv: alerteNiv },
  ];

  return (
    <div
      className="glass rounded-md overflow-hidden"
      style={{
        // box-shadow inset évite le conflit React entre border (shorthand du .glass) et borderLeft*
        boxShadow: `inset 3px 0 0 ${niv === "ok" ? "rgba(0,255,136,0.3)" : color}, 0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)`,
      }}
    >
      {/* Clickable header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.025] transition-colors"
      >
        <Icon className="h-4 w-4 shrink-0" style={{ color }} />

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-mono font-bold text-[color:var(--text-primary)] text-sm">Canon {canon.numero}</span>
            <span className="font-mono text-[color:var(--text-secondary)] text-xs truncate">{canon.nom}</span>
          </div>
        </div>

        {/* Score bar — hidden on small screens */}
        <div className="hidden sm:block">
          <ScoreBar score={canon.scoreGlobal} />
        </div>

        {/* Niveau badge */}
        <span
          className="shrink-0 hidden xs:inline text-[9px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded border"
          style={{ color, borderColor: `${color}44`, background: `${color}15` }}
        >
          {label}
        </span>

        {open
          ? <ChevronUp className="h-4 w-4 text-[color:var(--text-secondary)] shrink-0" />
          : <ChevronDown className="h-4 w-4 text-[color:var(--text-secondary)] shrink-0" />
        }
      </button>

      {/* Mini stats row — always visible */}
      <div className="grid grid-cols-4 border-t border-[color:var(--border-steel)]">
        {miniStats.map(({ SIcon, label: sl, value, niv: sNiv }, idx) => {
          const sc = NIVEAU_META[sNiv].color;
          return (
            <div
              key={idx}
              className={`flex flex-col items-center py-2.5 gap-1 ${idx > 0 ? "border-l border-[color:var(--border-steel)]" : ""}`}
            >
              <SIcon className="h-3 w-3" style={{ color: sc }} />
              <span className="font-mono font-bold text-xs tabular-nums" style={{ color: sc }}>{value}</span>
              <span className="text-[9px] font-mono uppercase tracking-wider text-[color:var(--text-secondary)]">{sl}</span>
            </div>
          );
        })}
      </div>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-[color:var(--border-steel)] bg-[color:var(--bg-card)] px-5 py-4 space-y-4">
          <MetricRow
            Icon={Thermometer} label="Température maximale"
            value={`${canon.maxTemp.toFixed(1)} °C`}
            niv={tempNiv}
            barPct={Math.min(100, (canon.maxTemp / (seuils.tempCritique + 20)) * 100)}
            note={
              canon.maxTemp >= seuils.tempCritique ? `Dépasse le seuil critique (${seuils.tempCritique}°C)` :
              canon.maxTemp >= seuils.tempDegrade   ? `Dépasse le seuil dégradé (${seuils.tempDegrade}°C)` :
              "Dans les tolérances"
            }
          />
          <MetricRow
            Icon={Package} label="Stock obus"
            value={`${canon.lastStock} obus`}
            niv={stockNiv}
            barPct={Math.min(100, (canon.lastStock / 75) * 100)}
            note={
              canon.lastStock <= seuils.stockAlerte     ? `Seuil critique atteint (≤ ${seuils.stockAlerte})` :
              canon.lastStock <= seuils.stockAlerte * 2 ? "Stock bas — prévoir réapprovisionnement" :
              "Stock suffisant"
            }
          />
          <MetricRow
            Icon={Target} label="Écart azimut max"
            value={`± ${canon.maxDelta.toFixed(2)} °`}
            niv={azNiv}
            barPct={Math.min(100, (canon.maxDelta / (seuils.azimutCritique * 2)) * 100)}
            note={
              canon.maxDelta >= seuils.azimutCritique       ? `Hors tolérance (max ${seuils.azimutCritique}°)` :
              canon.maxDelta >= seuils.azimutCritique * 0.6 ? "Surveiller l'alignement" :
              "Alignement correct"
            }
          />
          <MetricRow
            Icon={Crosshair} label="Tirs effectués"
            value={`${canon.totalTirs} tirs`}
            niv={alerteNiv}
            note={
              canon.alertesCrit > 0 ? `${canon.alertesCrit} alerte(s) critique(s) déclenchée(s)` :
              canon.alertes > 0     ? `${canon.alertes} alerte(s) au total` :
              "Aucune alerte sur la période"
            }
          />

          {/* Score breakdown */}
          <div className="pt-2 border-t border-[color:var(--border-steel)] space-y-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--text-secondary)] font-mono">Score de santé</span>
            {[
              { label: "Tirs",    score: canon.scoreTirs },
              { label: "Thermie", score: canon.scoreTemp },
              { label: "Alertes", score: canon.scoreAlerte },
              { label: "Azimut",  score: canon.scoreDelta },
            ].map(({ label: sl, score }) => (
              <div key={sl} className="flex items-center gap-3">
                <span className="w-16 text-[10px] font-mono text-[color:var(--text-secondary)] uppercase tracking-wider shrink-0">{sl}</span>
                <div className="flex-1 h-1 rounded-full bg-[color:var(--bg-elevated)] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${score}%`, background: scoreColor(score) }}
                  />
                </div>
                <span className="w-7 text-right font-mono text-[10px] tabular-nums" style={{ color: scoreColor(score) }}>
                  {score}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricRow({
  Icon, label, value, niv, barPct, note,
}: {
  Icon: typeof Thermometer;
  label: string;
  value: string;
  niv: Niveau;
  barPct?: number;
  note?: string;
}) {
  const color = NIVEAU_META[niv].color;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[color:var(--text-secondary)]">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="text-[11px] font-mono uppercase tracking-wider">{label}</span>
        </div>
        <span className="font-mono font-bold text-sm tabular-nums" style={{ color }}>{value}</span>
      </div>
      {barPct !== undefined && (
        <div className="h-1 rounded-full bg-[color:var(--bg-elevated)] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${barPct}%`, background: color }}
          />
        </div>
      )}
      {note && (
        <p className="text-[10px] font-mono pl-5" style={{ color: niv === "ok" ? "var(--text-secondary)" : color }}>
          {note}
        </p>
      )}
    </div>
  );
}

function ActionItem({ a }: { a: Action }) {
  const { color, Icon: NivIcon } = NIVEAU_META[a.niveau];
  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded border transition-all"
      style={{ borderColor: `${color}33`, background: `${color}0d` }}
    >
      <NivIcon className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider" style={{ color }}>
            {a.canon}
          </span>
          <span className="text-xs font-mono font-semibold text-[color:var(--text-primary)]">{a.action}</span>
        </div>
        <p className="text-[11px] font-mono text-[color:var(--text-secondary)] mt-0.5">{a.detail}</p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function MaintenancePage() {
  const [period, setPeriod] = useState<MaintenancePeriod>("7j");

  const { data: cfg } = useConfig();
  const { data: backendData, loading } = useMaintenanceData(period);

  const seuils: MaintenanceSeuils = useMemo(() => cfg ?? DEFAULT_SEUILS, [cfg]);

  const canons: MaintenanceCanon[] = backendData?.data ?? [];

  const sortedCanons = useMemo(() => {
    const order: Record<Niveau, number> = { critique: 0, attention: 1, ok: 2 };
    return [...canons].sort((a, b) => order[niveauCanon(a, seuils)] - order[niveauCanon(b, seuils)]);
  }, [canons, seuils]);

  const actions = useMemo(() => buildActions(canons, seuils), [canons, seuils]);
  const critCount = actions.filter((a) => a.niveau === "critique").length;

  const counts = useMemo(() => ({
    ok:        canons.filter((c) => niveauCanon(c, seuils) === "ok").length,
    attention: canons.filter((c) => niveauCanon(c, seuils) === "attention").length,
    critique:  canons.filter((c) => niveauCanon(c, seuils) === "critique").length,
  }), [canons, seuils]);

  const timeStr = useMemo(
    () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    // refresh time label when loading state changes (i.e. after a fetch completes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loading],
  );

  return (
    <div className="min-h-full bg-[color:var(--bg-base)] p-5 text-[color:var(--text-primary)]">

      {/* ── Page header ────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col gap-4 border-b border-[color:var(--border-steel)] pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-[color:var(--cyan-live)] mb-1.5">
            Tableau de bord · NINKI GATEWAY
          </div>
          <h1 className="text-2xl font-semibold uppercase tracking-[0.14em] flex items-center gap-3">
            <Wrench className="h-6 w-6 text-[color:var(--cyan-live)]" />
            Maintenance des Canons
          </h1>
          <div className="mt-2 flex items-center gap-3 text-[11px] text-[color:var(--text-secondary)] font-mono">
            <Clock className="h-3.5 w-3.5" />
            <span>Mis à jour à {timeStr}</span>
            {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-[color:var(--cyan-live)]" />}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Period selector — button group */}
          <div className="flex rounded border border-[color:var(--border-steel)] overflow-hidden">
            {PERIODS.map((p, idx) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-2 text-xs font-mono uppercase tracking-wider transition-colors ${
                  idx < PERIODS.length - 1 ? "border-r border-[color:var(--border-steel)]" : ""
                } ${
                  period === p.value
                    ? "bg-[color:var(--cyan-live)]/15 text-[color:var(--cyan-live)]"
                    : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-white/5"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => exportCsv(sortedCanons, seuils, period)}
            disabled={canons.length === 0}
            className="btn-secondary inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="h-4 w-4" />
            Exporter CSV
          </button>
        </div>
      </div>

      {/* ── Loading state ───────────────────────────────────────────────── */}
      {loading && canons.length === 0 && (
        <div className="flex items-center justify-center h-48 gap-2 text-[color:var(--text-secondary)] font-mono text-sm">
          <RefreshCw className="h-5 w-5 animate-spin" />
          Chargement des données…
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {!loading && canons.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-[color:var(--text-secondary)] font-mono">
          <Wrench className="h-10 w-10 opacity-20" />
          <span className="text-sm">Aucun canon enregistré</span>
          <span className="text-xs text-[color:var(--text-disabled)]">Ajoutez des pièces dans la configuration</span>
        </div>
      )}

      {/* ── Main content ────────────────────────────────────────────────── */}
      {canons.length > 0 && (
        <div className="space-y-6">

          {/* Compteurs globaux */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Critique",   count: counts.critique,   color: "var(--danger)",  Icon: XCircle,       glow: "glow-danger" },
              { label: "Attention",  count: counts.attention,  color: "var(--warning)", Icon: AlertTriangle,  glow: "glow-warning" },
              { label: "Nominal",    count: counts.ok,         color: "var(--success)", Icon: CheckCircle,   glow: "glow-success" },
            ].map(({ label, count, color, Icon, glow }) => (
              <div key={label} className="glass rounded-md p-4 flex flex-col items-center gap-1.5 text-center">
                <Icon className="h-5 w-5" style={{ color }} />
                <span className={`font-mono text-3xl font-bold tabular-nums ${count > 0 ? glow : ""}`} style={{ color }}>
                  {count}
                </span>
                <span className="text-[10px] font-mono uppercase tracking-widest text-[color:var(--text-secondary)]">{label}</span>
              </div>
            ))}
          </div>

          {/* 2-column layout: actions | canons */}
          <div className="grid gap-5 xl:grid-cols-[370px_1fr]">

            {/* ── Actions requises ── */}
            <div>
              <SectionTitle>
                Actions requises
                {critCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[color:var(--danger)] text-white text-[9px] font-mono tabular-nums pulse-live">
                    {critCount}
                  </span>
                )}
              </SectionTitle>

              {actions.length === 0 ? (
                <div className="glass rounded-md p-6 flex flex-col items-center gap-2 text-center">
                  <CheckCircle className="h-8 w-8 text-[color:var(--success)] glow-success" />
                  <p className="text-sm font-mono text-[color:var(--success)]">Tous les systèmes sont nominaux</p>
                  <p className="text-xs font-mono text-[color:var(--text-secondary)]">Aucune action requise</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {actions.map((a, i) => <ActionItem key={i} a={a} />)}
                </div>
              )}
            </div>

            {/* ── Détail par canon ── */}
            <div>
              <SectionTitle>Détail par canon</SectionTitle>
              <div className="space-y-2">
                {sortedCanons.map((c) => (
                  <CanonCard key={c.pieceId} canon={c} seuils={seuils} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
