import { cn } from "@/lib/utils";

export function MgrsDisplay({ coordinates, className }: { coordinates: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-mono text-[color:var(--cyan-live)] glow-cyan",
        className,
      )}
    >
      <span className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--text-secondary)]">MGRS</span>
      <span className="tracking-wider">{coordinates}</span>
    </span>
  );
}