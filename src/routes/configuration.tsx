import { createFileRoute, Link } from "@tanstack/react-router";
import { useConfig } from "@/lib/api/hooks";
import { useNinki } from "@/lib/ninki/store";
import { Settings, Thermometer, Target, Package, Clock, Gauge, CalendarDays } from "lucide-react";

export const Route = createFileRoute("/configuration")({
  component: ConfigurationPage,
  head: () => ({ meta: [{ title: "Configuration · NINKI GATEWAY" }] }),
});

interface SeuilRowProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  unit?: string;
  tone?: "danger" | "warning" | "neutral";
}

function SeuilRow({ icon, label, value, unit, tone = "neutral" }: SeuilRowProps) {
  const color =
    tone === "danger" ? "var(--danger)" : tone === "warning" ? "var(--warning)" : "var(--cyan-live)";
  return (
    <div className="flex items-center justify-between py-3 border-b border-[color:var(--border-steel)]/40 last:border-0">
      <div className="flex items-center gap-3 text-[color:var(--text-secondary)]">
        <span className="h-4 w-4 shrink-0">{icon}</span>
        <span className="text-xs font-mono uppercase tracking-wider">{label}</span>
      </div>
      <span className="font-mono text-sm font-semibold tabular-nums" style={{ color }}>
        {value}
        {unit && <span className="text-[10px] ml-1 text-[color:var(--text-secondary)]">{unit}</span>}
      </span>
    </div>
  );
}

function ConfigurationPage() {
  const { data, loading, error } = useConfig();
  const user = useNinki((s) => s.user);
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

  if (loading) {
    return (
      <div className="p-5 flex items-center justify-center h-full">
        <span className="text-xs font-mono text-[color:var(--text-secondary)] animate-pulse">
          Chargement…
        </span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-5">
        <div className="panel p-6 text-sm font-mono text-[color:var(--danger)]">
          Impossible de charger la configuration.
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 flex flex-col gap-4 max-w-xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-[0.15em] uppercase">Configuration</h1>
        {isAdmin && (
          <Link
            to="/admin/configuration"
            className="text-[10px] font-mono uppercase tracking-wider px-3 py-1.5 rounded border transition"
            style={{ borderColor: "var(--cyan-live)", color: "var(--cyan-live)" }}
          >
            <Settings className="inline h-3 w-3 mr-1.5" />
            Modifier
          </Link>
        )}
      </div>

      <div className="panel p-4">
        <div className="text-[9px] uppercase tracking-[0.2em] text-[color:var(--text-secondary)] font-mono mb-3">
          Batterie · {data.nom}
        </div>
        <div className="text-xs font-mono text-[color:var(--text-secondary)] space-y-1">
          <div>Identifiant : <span className="text-[color:var(--text-primary)]">{data.identifiant}</span></div>
        </div>
      </div>

      <div className="panel p-4">
        <div className="text-[9px] uppercase tracking-[0.2em] text-[color:var(--text-secondary)] font-mono mb-1">
          Seuils température
        </div>
        <SeuilRow
          icon={<Thermometer className="h-4 w-4" />}
          label="Seuil dégradé"
          value={data.tempDegrade}
          unit="°C"
          tone="warning"
        />
        <SeuilRow
          icon={<Thermometer className="h-4 w-4" />}
          label="Seuil critique"
          value={data.tempCritique}
          unit="°C"
          tone="danger"
        />
      </div>

      <div className="panel p-4">
        <div className="text-[9px] uppercase tracking-[0.2em] text-[color:var(--text-secondary)] font-mono mb-1">
          Seuils opérationnels
        </div>
        <SeuilRow
          icon={<Package className="h-4 w-4" />}
          label="Alerte stock obus"
          value={data.stockAlerte}
          unit="coups"
          tone="warning"
        />
        <SeuilRow
          icon={<Target className="h-4 w-4" />}
          label="Écart azimut critique"
          value={data.azimutCritique}
          unit="mils"
          tone="danger"
        />
        <SeuilRow
          icon={<Gauge className="h-4 w-4" />}
          label="Alerte cadence"
          value={data.cadenceAlerte}
          unit="cps/min"
          tone="warning"
        />
      </div>

      <div className="panel p-4">
        <div className="text-[9px] uppercase tracking-[0.2em] text-[color:var(--text-secondary)] font-mono mb-1">
          Système
        </div>
        <SeuilRow
          icon={<Clock className="h-4 w-4" />}
          label="Timeout hors ligne"
          value={data.timeoutOffline}
          unit="s"
        />
        <SeuilRow
          icon={<CalendarDays className="h-4 w-4" />}
          label="Rétention journal"
          value={data.retentionJours}
          unit="jours"
        />
      </div>

      {!isAdmin && (
        <p className="text-[10px] font-mono text-[color:var(--text-secondary)] text-center">
          Vue lecture seule · Contacter l'administrateur pour modifier.
        </p>
      )}
    </div>
  );
}
