import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Map, Crosshair, AlertTriangle, History, Settings, UsersRound,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { useNinki } from "@/lib/ninki/store";
import { cn } from "@/lib/utils";

type NavItem = {
  to:
    | "/"
    | "/pieces"
    | "/alertes"
    | "/historique"
    | "/configuration"
    | "/admin/responsables"
    | "/admin/configuration";
  label: string;
  icon: typeof Map;
  badge?: boolean;
  adminOnly?: boolean;
};

const NAV: NavItem[] = [
  { to: "/", label: "Vue Globale", icon: Map },
  { to: "/pieces", label: "Mes Pièces", icon: Crosshair },
  { to: "/alertes", label: "Alertes", icon: AlertTriangle, badge: true },
  { to: "/historique", label: "Historique", icon: History },
  { to: "/admin/responsables", label: "Responsables", icon: UsersRound, adminOnly: true },
  { to: "/admin/configuration", label: "Configuration", icon: Settings, adminOnly: true },
];

export function Sidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const pieces = useNinki((s) => s.pieces);
  const alertes = useNinki((s) => s.alertes);
  const user = useNinki((s) => s.user);

  const [collapsed, setCollapsed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("ninki_sidebar_collapsed") === "true",
  );

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("ninki_sidebar_collapsed", String(next));
    }
  };

  const unreadAlertes = alertes.filter((a) => !a.acquittee && a.criticite !== "info").length;
  const active = pieces.filter((p) => p.statut !== "offline").length;

  return (
    <aside
      style={{ width: collapsed ? "52px" : "220px", transition: "width 300ms ease" }}
      className="shrink-0 border-r border-[color:var(--border-steel)] bg-[color:var(--bg-secondary)]/60 backdrop-blur-xl flex flex-col overflow-hidden"
    >
      {/* Toggle */}
      <button
        onClick={toggle}
        title={collapsed ? "Développer" : "Réduire"}
        className="flex items-center justify-center h-10 shrink-0 border-b border-[color:var(--border-steel)] text-[color:var(--text-secondary)] hover:text-[color:var(--cyan-live)] hover:bg-[color:var(--bg-elevated)]/40 transition"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-hidden">
        {NAV.map((item) => {
          if (item.adminOnly && user?.role !== "ADMIN") return null;
          const isActive = item.to === "/" ? path === "/" : path.startsWith(item.to);
          return (
            <div key={item.to} className="relative group">
              <Link
                to={item.to}
                className={cn(
                  "flex items-center rounded text-sm transition relative border border-transparent",
                  collapsed ? "justify-center py-3 px-0" : "gap-3 px-3 py-2.5",
                  isActive
                    ? "bg-[color:var(--bg-elevated)] text-[color:var(--cyan-live)] ring-active border-[color:var(--cyan-live)]/30"
                    : "text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-card)] hover:text-[color:var(--text-primary)]",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && (
                  <span className="font-medium uppercase tracking-wider text-[11px] flex-1">
                    {item.label}
                  </span>
                )}
                {!collapsed && item.badge && unreadAlertes > 0 && (
                  <span className="px-1.5 min-w-[20px] text-center rounded-full bg-[color:var(--danger)] text-white font-mono text-[10px] pulse-live">
                    {unreadAlertes > 99 ? "99+" : unreadAlertes}
                  </span>
                )}
                {collapsed && item.badge && unreadAlertes > 0 && (
                  <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[color:var(--danger)] pulse-live" />
                )}
                {isActive && !collapsed && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r bg-[color:var(--cyan-live)] glow-cyan" />
                )}
              </Link>

              {/* Tooltip collapsed */}
              {collapsed && (
                <div className="pointer-events-none absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 z-[500] bg-[color:var(--bg-elevated)] border border-[color:var(--border-steel)] px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider whitespace-nowrap text-[color:var(--text-primary)] opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  {item.label}
                  {item.badge && unreadAlertes > 0 && (
                    <span className="ml-1.5 px-1 py-0.5 rounded bg-[color:var(--danger)] text-white text-[9px]">
                      {unreadAlertes}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* État Réseau */}
      {collapsed ? (
        <div className="mx-2 mb-2 panel p-2 text-center">
          <div className="font-mono text-sm text-[color:var(--cyan-live)] glow-cyan leading-tight">
            {active}/{pieces.length}
          </div>
          <div className="text-[8px] uppercase tracking-wider text-[color:var(--text-secondary)] mt-0.5">
            actif
          </div>
        </div>
      ) : (
        <div className="m-3 panel p-3">
          <div className="text-[9px] uppercase tracking-[0.2em] text-[color:var(--text-secondary)] mb-1">
            État Réseau
          </div>
          <div className="font-mono text-lg text-[color:var(--cyan-live)] glow-cyan">
            {active} / {pieces.length}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-secondary)]">
            Pièces actives
          </div>
          <div className="mt-2 h-1 rounded-full bg-[color:var(--bg-base)] overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[color:var(--success)] to-[color:var(--cyan-live)]"
              style={{ width: `${(active / Math.max(pieces.length, 1)) * 100}%` }}
            />
          </div>
        </div>
      )}
    </aside>
  );
}
