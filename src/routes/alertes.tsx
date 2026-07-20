import { createFileRoute, Link } from "@tanstack/react-router";
import { useNinki } from "@/lib/ninki/store";
import { useState } from "react";
import { AlertTriangle, Check, Eye } from "lucide-react";

export const Route = createFileRoute("/alertes")({
  component: AlertesPage,
  head: () => ({ meta: [{ title: "Alertes · NINKI GATEWAY" }] }),
});

const TYPES = ["all", "temperature", "desalignement", "stock_bas", "hors_ligne", "cadence", "tir"] as const;
const CRITS = ["all", "warning", "critical"] as const;

function AlertesPage() {
  const alertes = useNinki((s) => s.alertes);
  const acknowledge = useNinki((s) => s.acknowledge);
  const [acking, setAcking] = useState<string | null>(null);
  const [type, setType] = useState<(typeof TYPES)[number]>("all");
  const [crit, setCrit] = useState<(typeof CRITS)[number]>("all");

  const filtered = alertes.filter(
    (a) => (type === "all" || a.type === type) && (crit === "all" || a.criticite === crit),
  );

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold tracking-[0.15em] uppercase">
          <AlertTriangle className="inline h-5 w-5 text-[color:var(--danger)] mr-2" />
          Alertes <span className="text-[color:var(--cyan-live)]">({filtered.length})</span>
        </h1>
        <div className="flex gap-2 flex-wrap">
          <Filter label="Type" value={type} options={[...TYPES]} onChange={(v) => setType(v as any)} />
          <Filter label="Criticité" value={crit} options={[...CRITS]} onChange={(v) => setCrit(v as any)} />
        </div>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="panel p-8 text-center text-[color:var(--text-secondary)] font-mono text-xs">
            Aucune alerte.
          </div>
        )}
        {filtered.map((a) => {
          const c =
            a.criticite === "critical"
              ? "var(--danger)"
              : a.criticite === "warning"
                ? "var(--warning)"
                : "var(--cyan-live)";
          return (
            <div
              key={a.id}
              className={`panel scanlines p-3 flex items-center gap-3 ${a.acquittee ? "opacity-50" : ""}`}
              style={{ borderLeft: `3px solid ${c}` }}
            >
              <div className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded" style={{ background: `${c}22`, color: c }}>
                {a.criticite}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm">{a.message}{a.valeur && <span className="font-mono text-[color:var(--cyan-live)] ml-2">{a.valeur}</span>}</div>
                <div className="text-[10px] font-mono text-[color:var(--text-secondary)] mt-0.5">
                  {new Date(a.timestamp).toLocaleString()} · {a.type}
                </div>
              </div>
              <Link
                to="/pieces/$pieceId"
                params={{ pieceId: a.pieceId }}
                className="p-2 rounded border border-[color:var(--border-steel)] hover:border-[color:var(--cyan-live)] text-[color:var(--cyan-live)]"
                title="Voir la pièce"
              >
                <Eye className="h-3.5 w-3.5" />
              </Link>
              {!a.acquittee && (
                <button
                  disabled={acking === a.id}
                  onClick={async () => {
                    setAcking(a.id);
                    try { await acknowledge(a.id); } finally { setAcking(null); }
                  }}
                  className="p-2 rounded border border-[color:var(--success)]/40 hover:bg-[color:var(--success)]/10 text-[color:var(--success)] disabled:opacity-40"
                  title="Acquitter"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Filter({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 panel px-3 py-1.5">
      <span className="text-[9px] uppercase tracking-wider text-[color:var(--text-secondary)]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-xs font-mono text-[color:var(--cyan-live)] outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-[color:var(--bg-elevated)]">{o}</option>
        ))}
      </select>
    </div>
  );
}