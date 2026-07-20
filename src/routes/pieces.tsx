import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useNinki } from "@/lib/ninki/store";
import { StatusBadge } from "@/components/ninki/StatusBadge";
import { LiveValue } from "@/components/ninki/LiveValue";

export const Route = createFileRoute("/pieces")({
  component: PiecesLayout,
  head: () => ({ meta: [{ title: "Mes Pièces · NINKI GATEWAY" }] }),
});

function PiecesLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (path !== "/pieces") return <Outlet />;
  return <PiecesIndex />;
}

function PiecesIndex() {
  const pieces = useNinki((s) => s.pieces);
  return (
    <div className="p-5">
      <h1 className="text-xl font-semibold tracking-[0.15em] uppercase mb-4">
        Mes <span className="text-[color:var(--cyan-live)]">Pièces</span>
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {pieces.map((p) => (
          <Link
            key={p.id}
            to="/pieces/$pieceId"
            params={{ pieceId: p.id }}
            className="panel scanlines p-4 hover:ring-active transition group"
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-mono text-[color:var(--cyan-live)] glow-cyan">P{String(p.numero).padStart(2, "0")}</div>
                <div className="text-sm">{p.nom}</div>
              </div>
              <StatusBadge status={p.statut} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Box label="Temp">
                <LiveValue value={p.temperature} unit="°C" critical={p.temperature > 85} warning={p.temperature > 70} />
              </Box>
              <Box label="Tirs">
                <span className="font-mono text-[color:var(--text-primary)]">{p.nombreTirs}</span>
              </Box>
              <Box label="Stock">
                <span className={`font-mono ${p.stockObus < 20 ? "text-[color:var(--warning)] glow-warning" : "text-[color:var(--text-primary)]"}`}>
                  {p.stockObus}
                </span>
              </Box>
            </div>
            <div className="mt-3 text-[10px] font-mono text-[color:var(--text-secondary)] flex justify-between">
              <span>Az: {p.azimutReel.toFixed(1)}°</span>
              <span>{p.positionMGRS}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Box({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-[color:var(--border-steel)] bg-[color:var(--bg-base)]/60 py-2">
      <div className="text-[9px] uppercase tracking-wider text-[color:var(--text-secondary)]">{label}</div>
      <div className="text-base mt-0.5">{children}</div>
    </div>
  );
}