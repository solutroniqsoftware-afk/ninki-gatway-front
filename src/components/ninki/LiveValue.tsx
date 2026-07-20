import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function LiveValue({
  value,
  unit,
  critical,
  warning,
  digits = 1,
  className,
}: {
  value: number;
  unit?: string;
  critical?: boolean;
  warning?: boolean;
  digits?: number;
  className?: string;
}) {
  const prev = useRef(value);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (prev.current !== value) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 350);
      prev.current = value;
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <span
      className={cn(
        "font-mono tabular-nums transition-colors",
        critical && "text-[color:var(--danger)] glow-danger",
        warning && !critical && "text-[color:var(--warning)] glow-warning",
        !critical && !warning && "text-[color:var(--cyan-live)] glow-cyan",
        pulse && "scale-[1.04]",
        className,
      )}
    >
      {value.toFixed(digits)}
      {unit && <span className="ml-1 text-[0.7em] text-[color:var(--text-secondary)]">{unit}</span>}
    </span>
  );
}