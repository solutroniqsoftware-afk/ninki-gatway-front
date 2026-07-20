import { useConfig } from "@/lib/api/hooks";

const DEG_TO_MIL = 17.7778;

interface Props {
  azimutConsigne: number;
  azimutReel: number;
  giteConsigne: number;
  giteReel: number;
  azimutMil?: number | null;
  giteMil?: number | null;
  size?: number;
}

export function MilitaryGrid({ azimutConsigne, azimutReel, giteConsigne, giteReel, azimutMil, giteMil, size = 280 }: Props) {
  const { data: cfg } = useConfig();
  const seuilWarning  = cfg?.azimutCorrection ?? 2;
  const seuilCritique = cfg?.azimutCritique   ?? 5;

  const dAz   = +(((azimutReel - azimutConsigne + 540) % 360) - 180).toFixed(2);
  const dGite = +(giteReel - giteConsigne).toFixed(2);

  const statusAz   = Math.abs(dAz)   <= seuilWarning ? 'ok' : Math.abs(dAz)   <= seuilCritique ? 'warn' : 'crit';
  const statusGite = Math.abs(dGite) <= seuilWarning ? 'ok' : Math.abs(dGite) <= seuilCritique ? 'warn' : 'crit';
  const statusGlobal = statusAz === 'crit' || statusGite === 'crit' ? 'crit'
    : statusAz === 'warn' || statusGite === 'warn' ? 'warn' : 'ok';

  const toCssVar = (s: 'ok' | 'warn' | 'crit') =>
    s === 'ok' ? 'var(--success)' : s === 'warn' ? 'var(--warning)' : 'var(--danger)';
  const toHex = (s: 'ok' | 'warn' | 'crit') =>
    s === 'ok' ? '#00FF88' : s === 'warn' ? '#F59E0B' : '#FF2D55';

  const color    = toCssVar(statusGlobal);
  const colorHex = toHex(statusGlobal);

  const cx      = size / 2;
  const cy      = size / 2;
  const padding = 22;
  const inner   = cx - 18;
  const maxR    = inner * 0.92;

  // AZ+ = haut, GÎT+ = droite, 20° = maxR*0.85
  const pixelsPerDeg = (maxR * 0.85) / 20;
  const realX = Math.max(padding, Math.min(size - padding, cx + dGite * pixelsPerDeg));
  const realY = Math.max(padding, Math.min(size - padding, cy - dAz   * pixelsPerDeg));

  const ticks = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5];

  return (
    <div className="flex flex-col items-center w-full">
      <svg width={size} height={size} className="overflow-visible">
        <defs>
          <radialGradient id="mg-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(0,212,255,0.08)" />
            <stop offset="100%" stopColor="rgba(10,14,26,0)" />
          </radialGradient>
          <filter id="mg-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Cercles concentriques */}
        <circle cx={cx} cy={cy} r={inner + 2} fill="url(#mg-bg)" stroke="var(--border-steel)" />
        <circle cx={cx} cy={cy} r={inner * 0.66} fill="none" stroke="var(--border-steel)" strokeDasharray="2 4" />
        <circle cx={cx} cy={cy} r={inner * 0.33} fill="none" stroke="var(--border-steel)" strokeDasharray="2 4" />

        {/* Croix d'axes */}
        <line x1={cx} y1={padding} x2={cx} y2={size - padding}
          stroke="var(--border-steel)" strokeWidth={1} strokeDasharray="4,4" />
        <line x1={padding} y1={cy} x2={size - padding} y2={cy}
          stroke="var(--border-steel)" strokeWidth={1} strokeDasharray="4,4" />

        {/* Tick marks — AZ (vertical) */}
        {ticks.map(deg => (
          <line key={`az-${deg}`}
            x1={cx - 4} y1={cy - deg * pixelsPerDeg}
            x2={cx + 4} y2={cy - deg * pixelsPerDeg}
            stroke="var(--border-steel)" strokeWidth={0.5} />
        ))}

        {/* Tick marks — GÎT (horizontal) */}
        {ticks.map(deg => (
          <line key={`gi-${deg}`}
            x1={cx + deg * pixelsPerDeg} y1={cy - 4}
            x2={cx + deg * pixelsPerDeg} y2={cy + 4}
            stroke="var(--border-steel)" strokeWidth={0.5} />
        ))}

        {/* Labels axes */}
        <text x={cx} y={padding - 7} textAnchor="middle"
          fill="var(--text-secondary)" fontSize={10} fontFamily="monospace">AZ+</text>
        <text x={cx} y={size - padding + 16} textAnchor="middle"
          fill="var(--text-secondary)" fontSize={10} fontFamily="monospace">AZ-</text>
        <text x={padding - 7} y={cy + 4} textAnchor="end"
          fill="var(--text-secondary)" fontSize={10} fontFamily="monospace">GÎT-</text>
        <text x={size - padding + 7} y={cy + 4} textAnchor="start"
          fill="var(--text-secondary)" fontSize={10} fontFamily="monospace">GÎT+</text>

        {/* Ligne consigne → réel */}
        <line x1={cx} y1={cy} x2={realX} y2={realY}
          stroke={color} strokeWidth={1.5} strokeOpacity={0.7} />

        {/* Consigne — cercle gris centré */}
        <circle cx={cx} cy={cy} r={10}
          fill="none" stroke="var(--text-disabled)" strokeWidth={2} />

        {/* Réel — point coloré avec glow */}
        <circle cx={realX} cy={realY} r={7}
          fill={colorHex} stroke="rgba(0,0,0,0.6)" strokeWidth={1.5}
          filter="url(#mg-glow)" />

      </svg>

      <div className="grid grid-cols-2 gap-2 mt-2 w-full">

        <div className="panel p-2 text-center">
          <div className="text-[9px] uppercase tracking-wider text-[color:var(--text-secondary)] mb-1">
            Azimut
          </div>
          <div className="font-mono text-[color:var(--cyan-live)] text-lg leading-none">
            {azimutMil != null ? azimutMil : Math.round(azimutReel * DEG_TO_MIL)} mils
          </div>
          <div className="font-mono text-[10px] text-[color:var(--text-secondary)] mt-1">
            csg {Math.round(azimutConsigne * DEG_TO_MIL)} mils
          </div>
          <div className="font-mono text-[11px] font-bold mt-1" style={{ color: toCssVar(statusAz) }}>
            Δ {dAz > 0 ? '+' : ''}{Math.round(dAz * DEG_TO_MIL)} mils
          </div>
        </div>

        <div className="panel p-2 text-center">
          <div className="text-[9px] uppercase tracking-wider text-[color:var(--text-secondary)] mb-1">
            Gîte
          </div>
          <div className="font-mono text-[color:var(--cyan-live)] text-lg leading-none">
            {giteMil != null ? giteMil : Math.round(giteReel * DEG_TO_MIL)} mils
          </div>
          <div className="font-mono text-[10px] text-[color:var(--text-secondary)] mt-1">
            csg {Math.round(giteConsigne * DEG_TO_MIL)} mils
          </div>
          <div className="font-mono text-[11px] font-bold mt-1" style={{ color: toCssVar(statusGite) }}>
            Δ {dGite > 0 ? '+' : ''}{Math.round(dGite * DEG_TO_MIL)} mils
          </div>
        </div>

      </div>
    </div>
  );
}
