import { createFileRoute } from "@tanstack/react-router";
import { createClientOnlyFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useNinki } from "@/lib/ninki/store";
import { useConfig, type ConfigBatterie } from "@/lib/api/hooks";
import { useNavigate } from "@tanstack/react-router";
import { LiveValue } from "@/components/ninki/LiveValue";
import { Activity, Crosshair, Flame, Package, AlertTriangle } from "lucide-react";
import type { Piece } from "@/lib/ninki/types";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [{ title: "Vue Globale · NINKI GATEWAY" }],
  }),
});

type PiecesMapComponent = React.ComponentType<{ onSelectPiece?: (id: string) => void }>;

const loadPiecesMap = createClientOnlyFn(() => import("@/components/ninki/PiecesMap.client"));

// ─── Status dot ───────────────────────────────────────────────────────────────

function StatusDot({ statut }: { statut: Piece["statut"] }) {
  if (statut === "operational") {
    return (
      <span
        title="Opérationnel"
        className="inline-block h-2.5 w-2.5 rounded-full pulse-live"
        style={{ background: "var(--success)" }}
      />
    );
  }
  if (statut === "degraded") {
    return (
      <span
        title="Dégradé"
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{
          background: "linear-gradient(135deg, var(--warning) 50%, transparent 50%)",
          border: "1px solid var(--warning)",
        }}
      />
    );
  }
  return (
    <span
      title="Hors ligne"
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ border: "1.5px solid var(--danger)" }}
    />
  );
}

// ─── Delta azimut ──────────────────────────────────────────────────────────────

function DeltaAz({ delta, critThresh = 5, warnThresh = 2 }: { delta: number; critThresh?: number; warnThresh?: number }) {
  const abs = Math.abs(delta);
  const sign = delta >= 0 ? "+" : "";
  if (abs > critThresh) {
    return (
      <span className="font-mono flex items-center gap-1" style={{ color: "var(--danger)" }}>
        {sign}{delta.toFixed(1)}°
        <AlertTriangle size={9} />
      </span>
    );
  }
  if (abs > warnThresh) {
    return (
      <span className="font-mono" style={{ color: "var(--warning)" }}>
        {sign}{delta.toFixed(1)}°
      </span>
    );
  }
  return (
    <span className="font-mono" style={{ color: "var(--success)" }}>
      {sign}{delta.toFixed(1)}°
    </span>
  );
}

// ─── Piece row ────────────────────────────────────────────────────────────────

function PieceRow({ piece, onNavigate, cfg }: { piece: Piece; onNavigate: () => void; cfg?: ConfigBatterie | null }) {
  const isOff = piece.statut === "offline";
  const numero = String(piece.numero).padStart(2, "0");
  const deltaAz = ((piece.azimutReel - piece.azimutConsigne + 540) % 360) - 180;
  const stockAlerte = cfg?.stockAlerte ?? 20;
  const tempCritique = cfg?.tempCritique ?? 85;
  const tempDegrade = cfg?.tempDegrade ?? 70;
  const azCritique = cfg?.azimutCritique ?? 5;
  const azCorrection = cfg?.azimutCorrection ?? 2;

  return (
    <tr
      onClick={onNavigate}
      className="cursor-pointer border-b border-[color:var(--border-steel)]/30 transition group"
      style={{
        opacity: isOff ? 0.45 : 1,
        background: isOff ? "rgba(255,45,85,0.04)" : undefined,
      }}
    >
      {/* N° */}
      <td className="px-3 py-2 font-mono text-[10px] text-[color:var(--text-secondary)] group-hover:text-[color:var(--cyan-live)] transition whitespace-nowrap">
        {numero}
      </td>
      {/* NOM */}
      <td className="px-3 py-2 font-mono text-[11px] text-[color:var(--text-primary)] whitespace-nowrap max-w-[140px] truncate group-hover:text-[color:var(--cyan-live)] transition">
        {piece.nom}
      </td>
      {/* STATUS */}
      <td className="px-3 py-2 text-center">
        <StatusDot statut={piece.statut} />
      </td>
      {/* TEMP */}
      <td className="px-3 py-2 font-mono text-[11px] whitespace-nowrap">
        {isOff ? (
          <span className="text-[color:var(--text-secondary)]">—</span>
        ) : (
          <LiveValue value={piece.temperature} unit="°C" critical={piece.temperature > tempCritique} warning={piece.temperature > tempDegrade} />
        )}
      </td>
      {/* TIRS */}
      <td className="px-3 py-2 font-mono text-[11px] text-[color:var(--text-primary)] text-right tabular-nums">
        {isOff ? <span className="text-[color:var(--text-secondary)]">—</span> : piece.nombreTirs}
      </td>
      {/* STOCK */}
      <td className="px-3 py-2 font-mono text-[11px] text-right tabular-nums whitespace-nowrap">
        {isOff ? (
          <span className="text-[color:var(--text-secondary)]">—</span>
        ) : (
          <span style={{
            color: piece.stockObus < stockAlerte ? "var(--danger)" : piece.stockObus < stockAlerte * 2 ? "var(--warning)" : "inherit",
          }}>
            {piece.stockObus}
            {piece.stockObus < stockAlerte * 2 && (
              <AlertTriangle size={9} className="inline ml-1" />
            )}
          </span>
        )}
      </td>
      {/* AZIMUT CONSIGNE → RÉEL */}
      <td className="px-3 py-2 font-mono text-[11px] whitespace-nowrap">
        {isOff ? (
          <span className="text-[color:var(--text-secondary)]">—</span>
        ) : (
          <span className="text-[color:var(--text-secondary)]">
            {Math.round(piece.azimutConsigne * 17.7778)}
            <span className="mx-1 text-[color:var(--border-steel)]">→</span>
            <span className="text-[color:var(--text-primary)]">
              {piece.azimutMil != null ? piece.azimutMil : Math.round(piece.azimutReel * 17.7778)}
            </span>
            <span className="ml-1 text-[9px] text-[color:var(--text-secondary)]">mils</span>
          </span>
        )}
      </td>
      {/* ΔAZIMUT */}
      <td className="px-3 py-2">
        {isOff ? (
          <span className="font-mono text-[color:var(--text-secondary)]">—</span>
        ) : (
          <DeltaAz delta={deltaAz} critThresh={azCritique} warnThresh={azCorrection} />
        )}
      </td>
      {/* ACTIVITÉ */}
      <td className="px-3 py-2 font-mono text-[10px] text-[color:var(--text-secondary)] text-right tabular-nums">
        {isOff ? "—" : `${Math.floor((Date.now() - piece.derniereActivite) / 1000)}s`}
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function Index() {
  const pieces    = useNinki((s) => s.pieces);
  const totalTirs = useNinki((s) => s.totalTirs);
  const navigate  = useNavigate();
  const { data: cfg } = useConfig();

  const canons = pieces;

  const stockTotal   = pieces.reduce((acc, p) => acc + p.stockObus, 0);
  const stockMax     = pieces.reduce((acc, p) => acc + p.stockMax, 0);
  const operational  = pieces.filter((p) => p.statut === "operational").length;
  const offline      = pieces.filter((p) => p.statut === "offline").length;
  const degraded     = pieces.filter((p) => p.statut === "degraded").length;
  const overallStatus =
    pieces.length === 0
      ? "EN ATTENTE"
      : offline === pieces.length
        ? "HORS LIGNE"
        : offline >= 3
          ? "CRITIQUE"
          : degraded > 0 || offline > 0
            ? "DÉGRADÉ"
            : "OPÉRATIONNEL";

  return (
    <div className="p-5 space-y-4 h-full flex flex-col">
      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-4 shrink-0">
        <Kpi
          icon={<Flame className="h-4 w-4" />}
          label="Tirs Total"
          value={<LiveValue value={totalTirs} digits={0} className="text-3xl" />}
        />
        <Kpi
          icon={<Package className="h-4 w-4" />}
          label="Stock Munitions · Total Batterie"
          value={
            <div>
              <div className="flex items-baseline gap-1">
                <LiveValue value={stockTotal} digits={0} className="text-3xl" />
                <span className="text-[color:var(--text-secondary)] text-xs">
                  obus / {stockMax} cap.
                </span>
              </div>
              <div className="mt-2 h-1 rounded bg-[color:var(--bg-base)] overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[color:var(--cyan-live)] to-[color:var(--blue-signal)]"
                  style={{ width: `${Math.min((stockTotal / Math.max(stockMax, 1)) * 100, 100)}%` }}
                />
              </div>
              <div className="mt-1 font-mono text-[9px] text-[color:var(--text-secondary)] uppercase tracking-[0.15em]">
                {stockMax > 0 ? `${Math.round((stockTotal / stockMax) * 100)} % capacité` : "—"}
              </div>
            </div>
          }
        />
        <Kpi
          icon={<Crosshair className="h-4 w-4" />}
          label="Pièces Opérationnelles"
          value={
            <div className="flex items-center gap-3">
              <div className="text-3xl font-mono text-[color:var(--cyan-live)] glow-cyan">
                {operational}/{pieces.length}
              </div>
              <Donut ok={operational} warn={degraded} bad={offline} />
            </div>
          }
        />
        <Kpi
          icon={<Activity className="h-4 w-4" />}
          label="Statut Général"
          value={
            <div
              className={`inline-flex items-center gap-2 mt-1 px-3 py-2 rounded border font-mono uppercase tracking-[0.2em] text-base ${
                overallStatus === "OPÉRATIONNEL"
                  ? "border-[color:var(--success)]/40 bg-[color:var(--success)]/10 text-[color:var(--success)]"
                  : overallStatus === "DÉGRADÉ"
                    ? "border-[color:var(--warning)]/40 bg-[color:var(--warning)]/10 text-[color:var(--warning)]"
                    : overallStatus === "EN ATTENTE"
                      ? "border-[color:var(--text-secondary)]/40 bg-[color:var(--text-secondary)]/10 text-[color:var(--text-secondary)]"
                      : "border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 text-[color:var(--danger)]"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-current pulse-live" />
              {overallStatus}
            </div>
          }
        />
      </div>

      {/* Carte tactique — prend le reste de l'espace */}
      <div className="flex-1 min-h-[380px]">
        <ClientPiecesMap
          onSelectPiece={(id) => navigate({ to: "/pieces/$pieceId", params: { pieceId: id } })}
        />
      </div>

      {/* Tableau pièces compact — style liste de vol */}
      <div className="shrink-0 panel scanlines">
        {/* En-tête */}
        <div className="px-4 py-2.5 border-b border-[color:var(--border-steel)] flex items-center justify-between">
          <h3 className="text-[10px] font-mono uppercase tracking-[0.25em] text-[color:var(--text-secondary)]">
            Tableau des Pièces
          </h3>
          <div className="flex items-center gap-4 font-mono text-[10px] text-[color:var(--text-secondary)]">
            <span><span style={{ color: "var(--success)" }}>●</span> {operational} op.</span>
            {degraded > 0 && <span><span style={{ color: "var(--warning)" }}>◐</span> {degraded} dég.</span>}
            {offline > 0 && <span><span style={{ color: "var(--danger)" }}>○</span> {offline} hs</span>}
            <span className="text-[color:var(--cyan-live)]">{canons.length} canons</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-[color:var(--border-steel)]">
                {[
                  ["N°", "w-10"],
                  ["Nom", "w-36"],
                  ["", "w-8 text-center"],
                  ["Temp", "w-20"],
                  ["Tirs", "w-14 text-right"],
                  ["Stock", "w-16 text-right"],
                  ["Az. Cons → Réel", "w-36"],
                  ["ΔAzimut", "w-24"],
                  ["Activ.", "w-16 text-right"],
                ].map(([label, cls]) => (
                  <th
                    key={label}
                    className={`px-3 py-2 text-left font-medium text-[9px] uppercase tracking-[0.15em] text-[color:var(--text-secondary)] ${cls}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {canons.map((p) => (
                <PieceRow
                  key={p.id}
                  piece={p}
                  cfg={cfg}
                  onNavigate={() => navigate({ to: "/pieces/$pieceId", params: { pieceId: p.id } })}
                />
              ))}
              {canons.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-[color:var(--text-secondary)] font-mono text-[11px] uppercase tracking-wider">
                    Aucune pièce connectée
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Client-only map loader ────────────────────────────────────────────────────

function ClientPiecesMap({ onSelectPiece }: { onSelectPiece?: (id: string) => void }) {
  const [PiecesMap, setPiecesMap] = useState<PiecesMapComponent | null>(null);

  useEffect(() => {
    let mounted = true;
    loadPiecesMap()?.then((module) => {
      if (mounted) setPiecesMap(() => module.default);
    });
    return () => { mounted = false; };
  }, []);

  if (!PiecesMap) {
    return (
      <div className="panel h-full grid place-items-center text-[color:var(--text-secondary)] font-mono text-xs uppercase tracking-wider">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--cyan-live)] pulse-live" />
          Chargement carte tactique...
        </div>
      </div>
    );
  }

  return <PiecesMap onSelectPiece={onSelectPiece} />;
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="panel scanlines p-4 relative overflow-hidden">
      <div className="flex items-center gap-2 text-[color:var(--text-secondary)] text-[10px] uppercase tracking-[0.2em]">
        <span className="text-[color:var(--cyan-live)]">{icon}</span>
        {label}
      </div>
      <div className="mt-2">{value}</div>
    </div>
  );
}

// ─── Donut ─────────────────────────────────────────────────────────────────────

function Donut({ ok, warn, bad }: { ok: number; warn: number; bad: number }) {
  const total = ok + warn + bad || 1;
  const r = 22, c = 2 * Math.PI * r;
  const okLen = (ok / total) * c;
  const warnLen = (warn / total) * c;
  const badLen = (bad / total) * c;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r={r} stroke="var(--bg-elevated)" strokeWidth="6" fill="none" />
      <circle cx="28" cy="28" r={r} stroke="var(--success)" strokeWidth="6" fill="none"
        strokeDasharray={`${okLen} ${c}`} transform="rotate(-90 28 28)" />
      <circle cx="28" cy="28" r={r} stroke="var(--warning)" strokeWidth="6" fill="none"
        strokeDasharray={`${warnLen} ${c}`} strokeDashoffset={-okLen} transform="rotate(-90 28 28)" />
      <circle cx="28" cy="28" r={r} stroke="var(--danger)" strokeWidth="6" fill="none"
        strokeDasharray={`${badLen} ${c}`} strokeDashoffset={-(okLen + warnLen)} transform="rotate(-90 28 28)" />
    </svg>
  );
}
