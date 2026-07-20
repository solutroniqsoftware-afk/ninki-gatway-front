import type { PieceStatut } from "@/lib/ninki/types";
import { cn } from "@/lib/utils";

const MAP: Record<PieceStatut, { label: string; cls: string; dot: string }> = {
  operational: {
    label: "OPÉRATIONNEL",
    cls: "bg-[color:var(--success)]/10 text-[color:var(--success)] border-[color:var(--success)]/40",
    dot: "bg-[color:var(--success)]",
  },
  degraded: {
    label: "DÉGRADÉ",
    cls: "bg-[color:var(--warning)]/10 text-[color:var(--warning)] border-[color:var(--warning)]/40",
    dot: "bg-[color:var(--warning)]",
  },
  offline: {
    label: "HORS SERVICE",
    cls: "bg-[color:var(--danger)]/10 text-[color:var(--danger)] border-[color:var(--danger)]/40",
    dot: "bg-[color:var(--danger)]",
  },
};

export function StatusBadge({ status, large = false }: { status: PieceStatut; large?: boolean }) {
  const m = MAP[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded border font-mono uppercase tracking-wider",
        m.cls,
        large ? "px-3 py-1.5 text-sm" : "px-2 py-0.5 text-[10px]",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full pulse-live", m.dot)} />
      {m.label}
    </span>
  );
}