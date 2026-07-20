import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useAlertesFull } from "@/lib/api/hooks";
import { usePieces } from "@/lib/api/hooks";
import type { BackendAlerte } from "@/lib/ninki/types";

export const Route = createFileRoute("/historique")({
  component: HistoriquePage,
  head: () => ({ meta: [{ title: "Historique · NINKI GATEWAY" }] }),
});

const NIVEAU_LABEL: Record<string, string> = {
  CRITICAL: "CRITIQUE",
  WARNING: "ATTENTION",
};

const TYPE_LABEL: Record<string, string> = {
  temperature: "Température",
  desalignement: "Désalignement",
  stock_bas: "Stock bas",
  hors_ligne: "Hors ligne",
  tir: "Tir",
  cadence: "Cadence",
};

function NiveauBadge({ niveau }: { niveau: string }) {
  const isCrit = niveau === "CRITICAL";
  return (
    <span
      className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border"
      style={
        isCrit
          ? { color: "var(--danger)", borderColor: "rgba(255,45,85,.4)", backgroundColor: "rgba(255,45,85,.08)" }
          : { color: "var(--warning)", borderColor: "rgba(255,184,0,.4)", backgroundColor: "rgba(255,184,0,.08)" }
      }
    >
      {NIVEAU_LABEL[niveau] ?? niveau}
    </span>
  );
}

function AlerteRow({ alerte, pieceName }: { alerte: BackendAlerte; pieceName: string }) {
  const date = new Date(alerte.createdAt);
  const dateStr = date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  const timeStr = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="grid grid-cols-[90px_80px_110px_1fr_auto] gap-3 items-center text-xs font-mono py-2 border-b border-[color:var(--border-steel)]/30 hover:bg-[color:var(--bg-elevated)]/30 transition-colors px-1">
      <span className="text-[color:var(--text-secondary)] tabular-nums">
        {dateStr} {timeStr}
      </span>
      <span className="text-[color:var(--cyan-live)] truncate">{pieceName}</span>
      <span className="text-[color:var(--text-secondary)]">{TYPE_LABEL[alerte.type] ?? alerte.type}</span>
      <span className="text-[color:var(--text-primary)] truncate">{alerte.message}</span>
      <NiveauBadge niveau={alerte.niveau} />
    </div>
  );
}

function HistoriquePage() {
  const [filterNiveau, setFilterNiveau] = useState<"ALL" | "CRITICAL" | "WARNING">("ALL");
  const [filterAcq, setFilterAcq] = useState<"ALL" | "NON" | "OUI">("ALL");
  const [filterPiece, setFilterPiece] = useState<string>("ALL");

  const { data: alertes } = useAlertesFull();
  const { data: pieces } = usePieces();

  const pieceMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of pieces) m[p.id] = `P${p.numero} ${p.nom}`;
    return m;
  }, [pieces]);

  const filtered = useMemo(() => {
    return alertes
      .filter((a) => filterNiveau === "ALL" || a.niveau === filterNiveau)
      .filter((a) => filterAcq === "ALL" || (filterAcq === "OUI" ? a.acquittee : !a.acquittee))
      .filter((a) => filterPiece === "ALL" || a.pieceId === filterPiece)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [alertes, filterNiveau, filterAcq, filterPiece]);

  const critCount = alertes.filter((a) => a.niveau === "CRITICAL").length;
  const nonAcqCount = alertes.filter((a) => !a.acquittee).length;

  return (
    <div className="p-5 flex flex-col gap-4 h-full overflow-hidden">
      <div className="flex items-center justify-between shrink-0">
        <h1 className="text-xl font-semibold tracking-[0.15em] uppercase">Historique des alertes</h1>
        <div className="flex gap-4 text-xs font-mono text-[color:var(--text-secondary)]">
          <span>
            <span className="text-[color:var(--danger)] font-semibold">{critCount}</span> critiques
          </span>
          <span>
            <span className="text-[color:var(--warning)] font-semibold">{nonAcqCount}</span> non acquittées
          </span>
          <span className="text-[color:var(--text-secondary)]">{alertes.length} total</span>
        </div>
      </div>

      {/* Filtres */}
      <div className="panel p-3 flex flex-wrap gap-3 items-center shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-wider text-[color:var(--text-secondary)] font-mono">Niveau</span>
          {(["ALL", "CRITICAL", "WARNING"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setFilterNiveau(v)}
              className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border transition"
              style={
                filterNiveau === v
                  ? { borderColor: "var(--cyan-live)", color: "var(--cyan-live)", backgroundColor: "rgba(0,212,255,.08)" }
                  : { borderColor: "var(--border-steel)", color: "var(--text-secondary)" }
              }
            >
              {v === "ALL" ? "Tous" : v === "CRITICAL" ? "Critique" : "Attention"}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-[color:var(--border-steel)]" />

        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-wider text-[color:var(--text-secondary)] font-mono">Statut</span>
          {(["ALL", "NON", "OUI"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setFilterAcq(v)}
              className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border transition"
              style={
                filterAcq === v
                  ? { borderColor: "var(--cyan-live)", color: "var(--cyan-live)", backgroundColor: "rgba(0,212,255,.08)" }
                  : { borderColor: "var(--border-steel)", color: "var(--text-secondary)" }
              }
            >
              {v === "ALL" ? "Tous" : v === "OUI" ? "Acquittées" : "Non acq."}
            </button>
          ))}
        </div>

        {pieces.length > 0 && (
          <>
            <div className="h-4 w-px bg-[color:var(--border-steel)]" />
            <div className="flex items-center gap-2">
              <span className="text-[9px] uppercase tracking-wider text-[color:var(--text-secondary)] font-mono">Pièce</span>
              <select
                value={filterPiece}
                onChange={(e) => setFilterPiece(e.target.value)}
                className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border bg-[color:var(--bg-card)] text-[color:var(--text-primary)] border-[color:var(--border-steel)] focus:outline-none focus:border-[color:var(--cyan-live)]"
              >
                <option value="ALL">Toutes</option>
                {pieces.map((p) => (
                  <option key={p.id} value={p.id}>
                    P{p.numero} {p.nom}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {/* Table */}
      <div className="panel flex-1 overflow-auto">
        <div className="grid grid-cols-[90px_80px_110px_1fr_auto] gap-3 text-[9px] uppercase tracking-wider text-[color:var(--text-secondary)] font-mono py-2 border-b border-[color:var(--border-steel)] px-1 sticky top-0 bg-[color:var(--bg-card)]">
          <span>Horodatage</span>
          <span>Pièce</span>
          <span>Type</span>
          <span>Message</span>
          <span>Niveau</span>
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center text-xs font-mono text-[color:var(--text-secondary)]">
            Aucun événement correspondant aux filtres.
          </div>
        ) : (
          filtered.map((a) => (
            <AlerteRow key={a.id} alerte={a} pieceName={pieceMap[a.pieceId] ?? a.pieceId.slice(0, 8)} />
          ))
        )}
      </div>
    </div>
  );
}
