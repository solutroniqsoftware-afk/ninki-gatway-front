import { useEffect, useState } from "react";
import { useNinki } from "@/lib/ninki/store";
import { LogOut, Moon, Radio, Shield, Sun } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useTheme } from "@/lib/theme/useTheme";

export function Topbar() {
  const user = useNinki((s) => s.user);
  const wsConnected = useNinki((s) => s.wsConnected);
  const pieces = useNinki((s) => s.pieces);
  const logout = useNinki((s) => s.logout);
  const navigate = useNavigate();
  const [time, setTime] = useState("");
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTime(
        `${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")}:${d.getUTCSeconds().toString().padStart(2, "0")} UTC`,
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const offlineCount  = pieces.filter((p) => p.statut === "offline").length;
  const degradedCount = pieces.filter((p) => p.statut === "degraded").length;

  // Même logique que le KPI "Statut Général" dans index.tsx
  const sysStatus: "attente" | "hors-ligne" | "degrade" | "critique" | "ok" =
    pieces.length === 0
      ? "attente"
      : offlineCount === pieces.length
        ? "hors-ligne"
        : offlineCount >= 3 || offlineCount / pieces.length >= 0.4
          ? "critique"
          : degradedCount > 0 || offlineCount > 0
            ? "degrade"
            : "ok";

  const sysLabel: Record<typeof sysStatus, string> = {
    "attente":    "En attente",
    "hors-ligne": "Hors ligne",
    "degrade":    "Dégradé",
    "critique":   "Critique",
    "ok":         "Opérationnel",
  };

  const sysColor: Record<typeof sysStatus, string> = {
    "attente":    "var(--text-secondary)",
    "hors-ligne": "var(--danger)",
    "degrade":    "var(--warning)",
    "critique":   "var(--danger)",
    "ok":         "var(--success)",
  };

  const color = sysColor[sysStatus];

  return (
    <header className="h-14 flex items-center justify-between px-5 border-b border-[color:var(--border-steel)] bg-[color:var(--bg-secondary)]/80 backdrop-blur-xl relative z-30">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2.5">
          <Shield className="h-5 w-5 text-[color:var(--cyan-live)]" />
          <span className="font-bold tracking-[0.35em] text-[color:var(--text-primary)]">
            NINKI <span className="text-[color:var(--cyan-live)]">GATEWAY</span>
          </span>
        </div>
        <div
          className="flex items-center gap-2 px-3 py-1 rounded border"
          style={{ borderColor: `color-mix(in srgb, ${color} 40%, transparent)`, background: `color-mix(in srgb, ${color} 8%, transparent)` }}
        >
          <span className="h-1.5 w-1.5 rounded-full pulse-live" style={{ background: color }} />
          <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color }}>
            Système {sysLabel[sysStatus]}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-5">
        <span className="font-mono text-sm text-[color:var(--cyan-live)] glow-cyan tabular-nums">{time}</span>
        <div className="flex items-center gap-1.5">
          <Radio className={`h-3.5 w-3.5 ${wsConnected ? "text-[color:var(--success)]" : "text-[color:var(--danger)]"}`} />
          <span className={`text-[10px] font-mono uppercase tracking-wider ${wsConnected ? "text-[color:var(--success)]" : "text-[color:var(--danger)]"}`}>
            {wsConnected ? "● Live" : "● Déconnecté"}
          </span>
        </div>
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Passer en mode jour' : 'Passer en mode nuit'}
          className="p-1.5 rounded text-[color:var(--text-secondary)] hover:text-[color:var(--cyan-live)] hover:bg-[color:var(--bg-elevated)] transition-colors"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        {user && (
          <div className="flex items-center gap-2 pl-4 border-l border-[color:var(--border-steel)]">
            <div className="h-8 w-8 rounded bg-[color:var(--bg-elevated)] border border-[color:var(--cyan-live)]/30 flex items-center justify-center font-mono text-xs text-[color:var(--cyan-live)]">
              {user.identifiant.slice(0, 2).toUpperCase()}
            </div>
            <div className="leading-tight">
              <div className="text-xs">{user.identifiant}</div>
              <div className="text-[9px] uppercase tracking-wider text-[color:var(--cyan-live)]">{user.role}</div>
            </div>
            <button
              onClick={() => {
                logout().finally(() => navigate({ to: "/login" }));
              }}
              className="ml-2 p-1.5 rounded hover:bg-[color:var(--danger)]/10 hover:text-[color:var(--danger)] text-[color:var(--text-secondary)] transition"
              title="Déconnexion"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

