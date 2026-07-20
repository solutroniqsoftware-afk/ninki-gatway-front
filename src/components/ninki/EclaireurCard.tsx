import { StatusBadge } from "@/components/ninki/StatusBadge";
import type { Piece } from "@/lib/ninki/types";

interface Props {
  eclaireur: Piece;
}

export function EclaireurCard({ eclaireur }: Props) {
  const azDeg = eclaireur.azimutReel;
  const azMil = Math.round(azDeg * 17.7778);

  return (
    <div className="panel scanlines p-4 border border-[color:var(--warning)]/30">
      {/* En-tête */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-2xl">🔭</span>
        <div className="min-w-0">
          <div className="font-mono text-[color:var(--warning)] text-sm font-bold tracking-wider truncate">
            {eclaireur.nom}
          </div>
          <div className="text-[10px] text-[color:var(--text-secondary)] uppercase tracking-wider truncate">
            Éclaireur —{" "}
            {eclaireur.positionMGRS || `${eclaireur.lat?.toFixed(4)}, ${eclaireur.lng?.toFixed(4)}`}
          </div>
        </div>
        <div className="ml-auto shrink-0">
          <StatusBadge status={eclaireur.statut} />
        </div>
      </div>

      {/* Données vecteur */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="panel p-2 text-center">
          <div className="text-[9px] uppercase tracking-wider text-[color:var(--text-secondary)]">
            Azimut
          </div>
          <div className="font-mono text-[color:var(--warning)] text-lg">
            {azDeg.toFixed(1)}°
          </div>
          <div className="text-[9px] text-[color:var(--text-secondary)]">{azMil} mil</div>
        </div>
        <div className="panel p-2 text-center">
          <div className="text-[9px] uppercase tracking-wider text-[color:var(--text-secondary)]">
            Élévation
          </div>
          <div className="font-mono text-[color:var(--cyan-live)] text-lg">
            {eclaireur.elevationReel != null ? `${eclaireur.elevationReel.toFixed(2)}°` : "—"}
          </div>
        </div>
        <div className="panel p-2 text-center">
          <div className="text-[9px] uppercase tracking-wider text-[color:var(--text-secondary)]">
            Distance H
          </div>
          <div className="font-mono text-[color:var(--cyan-live)] text-lg">
            {eclaireur.distanceHorizontale != null
              ? `${eclaireur.distanceHorizontale} m`
              : "—"}
          </div>
        </div>
        <div className="panel p-2 text-center">
          <div className="text-[9px] uppercase tracking-wider text-[color:var(--text-secondary)]">
            Distance S
          </div>
          <div className="font-mono text-[color:var(--cyan-live)] text-lg">
            {eclaireur.distanceSurface != null ? `${eclaireur.distanceSurface} m` : "—"}
          </div>
        </div>
      </div>

      {/* Position */}
      <div className="text-[10px] font-mono text-[color:var(--text-secondary)] border-t border-[color:var(--border-steel)] pt-2">
        <span className="text-[color:var(--text-primary)]">LAT</span>{" "}
        {eclaireur.lat?.toFixed(6)}
        <span className="ml-3 text-[color:var(--text-primary)]">LON</span>{" "}
        {eclaireur.lng?.toFixed(6)}
        {eclaireur.derniereActivite > 0 && (
          <span className="ml-3 text-[color:var(--text-secondary)]">
            MAJ {Math.floor((Date.now() - eclaireur.derniereActivite) / 1000)}s
          </span>
        )}
      </div>
    </div>
  );
}
