import { Link } from "@tanstack/react-router";
import { ArrowLeft, Compass, Gauge, MapPin, Navigation, Thermometer, Wind } from "lucide-react";
import { useNinki } from "@/lib/ninki/store";
import { StatusBadge } from "@/components/ninki/StatusBadge";
import { MgrsDisplay } from "@/components/ninki/MgrsDisplay";
import { LiveValue } from "@/components/ninki/LiveValue";
import type { Piece } from "@/lib/ninki/types";

interface Props {
  piece: Piece;
}

function DataRow({
  label,
  value,
  unit,
  accent = false,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[color:var(--border-steel)] last:border-b-0">
      <span className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--text-secondary)] font-mono">
        {label}
      </span>
      <span
        className={`font-mono text-sm font-semibold ${accent ? "text-[color:var(--warning)] glow-warning" : "text-[color:var(--text-primary)]"}`}
      >
        {value}
        {unit && (
          <span className="ml-1 text-[10px] text-[color:var(--text-secondary)]">{unit}</span>
        )}
      </span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-[color:var(--text-secondary)] mb-3">
      {children}
    </h3>
  );
}

export function EclaireurDetailView({ piece }: Props) {
  const weather = useNinki((s) => s.weather);
  const weatherLoaded = useNinki((s) => s.weatherLoaded);

  const azDeg = piece.azimutReel ?? 0;
  const azMil = piece.azimutMil ?? (azDeg ? Math.round(azDeg * 17.7778) : null);
  const sinceUpdate = Math.floor((Date.now() - piece.derniereActivite) / 1000);

  return (
    <div className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <Link
          to="/"
          className="p-2 rounded border border-[color:var(--border-steel)] hover:border-[color:var(--warning)] transition"
        >
          <ArrowLeft className="h-4 w-4 text-[color:var(--warning)]" />
        </Link>
        <div>
          <div className="font-mono text-[color:var(--warning)] text-sm tracking-wider">
            🔭 ÉCLAIREUR
          </div>
          <h1 className="text-2xl font-semibold tracking-[0.1em]">{piece.nom}</h1>
        </div>
        <div className="ml-auto flex items-center gap-4 flex-wrap">
          <MgrsDisplay coordinates={piece.positionMGRS} />
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[color:var(--text-secondary)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--warning)] pulse-live" />
            Maj il y a {sinceUpdate}s
          </div>
          <StatusBadge status={piece.statut} large />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Vecteur directionnel */}
        <div className="col-span-12 lg:col-span-4 panel scanlines p-4">
          <SectionTitle>
            <Compass className="h-3 w-3 inline-block mr-1.5 align-text-top" />
            Vecteur directionnel
          </SectionTitle>

          {/* Azimut large */}
          <div className="flex flex-col items-center justify-center py-6 gap-1">
            <div className="font-mono text-[color:var(--warning)] text-5xl font-bold leading-none">
              {azMil != null ? azMil : '---'} <span className="text-2xl">mils</span>
            </div>
            <div className="text-[color:var(--text-secondary)] font-mono text-sm mt-1">
              {azDeg.toFixed(1)}°
            </div>
            <div className="text-[9px] uppercase tracking-[0.15em] text-[color:var(--text-secondary)] mt-2">
              Azimut
            </div>
          </div>

          {/* Compass ring SVG */}
          <div className="flex justify-center">
            <svg width="80" height="80" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,184,0,0.15)" strokeWidth="1" />
              <circle cx="40" cy="40" r="30" fill="none" stroke="rgba(255,184,0,0.08)" strokeWidth="0.5" />
              {["N","E","S","O"].map((d, i) => {
                const angle = i * 90 * (Math.PI / 180);
                const r = 32;
                return (
                  <text
                    key={d}
                    x={40 + r * Math.sin(angle)}
                    y={40 - r * Math.cos(angle) + 3}
                    textAnchor="middle"
                    fontSize="6"
                    fill="rgba(255,184,0,0.5)"
                    fontFamily="monospace"
                  >
                    {d}
                  </text>
                );
              })}
              {/* Direction needle */}
              <g transform={`rotate(${azDeg}, 40, 40)`}>
                <line x1="40" y1="40" x2="40" y2="12" stroke="#FFB800" strokeWidth="2" strokeLinecap="round" />
                <circle cx="40" cy="40" r="2.5" fill="#FFB800" />
              </g>
            </svg>
          </div>
        </div>

        {/* Distances & élévation */}
        <div className="col-span-12 lg:col-span-4 panel scanlines p-4">
          <SectionTitle>
            <Navigation className="h-3 w-3 inline-block mr-1.5 align-text-top" />
            Distances &amp; Élévation
          </SectionTitle>
          <DataRow
            label="Élévation"
            value={piece.elevationReel != null ? piece.elevationReel.toFixed(2) : "—"}
            unit="°"
            accent
          />
          <DataRow
            label="Distance horizontale"
            value={piece.distanceHorizontale != null ? piece.distanceHorizontale.toFixed(0) : "—"}
            unit="m"
          />
          <DataRow
            label="Distance surface"
            value={piece.distanceSurface != null ? piece.distanceSurface.toFixed(0) : "—"}
            unit="m"
          />
          {piece.distanceHorizontale != null && piece.distanceSurface != null && (
            <DataRow
              label="Dénivelé (Δ)"
              value={Math.abs(piece.distanceSurface - piece.distanceHorizontale).toFixed(0)}
              unit="m"
            />
          )}
        </div>

        {/* Position GPS */}
        <div className="col-span-12 lg:col-span-4 panel scanlines p-4">
          <SectionTitle>
            <MapPin className="h-3 w-3 inline-block mr-1.5 align-text-top" />
            Position GPS
          </SectionTitle>
          <DataRow label="Latitude" value={piece.lat?.toFixed(6) ?? "—"} />
          <DataRow label="Longitude" value={piece.lng?.toFixed(6) ?? "—"} />
          {piece.positionMGRS && (
            <div className="mt-3 pt-3 border-t border-[color:var(--border-steel)]">
              <div className="text-[9px] uppercase tracking-[0.12em] text-[color:var(--text-secondary)] font-mono mb-1">
                MGRS
              </div>
              <div className="font-mono text-[color:var(--cyan-live)] text-sm break-all">
                {piece.positionMGRS}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Météo terrain */}
      <div className="panel scanlines p-4">
        <SectionTitle>
          <Thermometer className="h-3 w-3 inline-block mr-1.5 align-text-top" />
          Météo terrain (capteur embarqué)
        </SectionTitle>
        {!weatherLoaded || !weather ? (
          <div className="text-[11px] font-mono text-[color:var(--text-secondary)] py-2">
            En attente des données météo…
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <MeteoKpi
              label="Température"
              value={<LiveValue value={weather.temperature ?? 0} unit="°C" className="text-2xl" />}
              icon={<Thermometer className="h-3 w-3 text-[color:var(--warning)]" />}
            />
            <MeteoKpi
              label="Humidité"
              value={<LiveValue value={weather.humidity ?? 0} unit="%" className="text-2xl" />}
              icon={<Gauge className="h-3 w-3 text-[color:var(--cyan-live)]" />}
            />
            <MeteoKpi
              label="Pression"
              value={<LiveValue value={weather.pressure ?? 0} unit="hPa" digits={1} className="text-2xl" />}
              icon={<Gauge className="h-3 w-3 text-[color:var(--blue-signal)]" />}
            />
            {weather.windSpeed != null && weather.windSpeed > 0 && (
              <MeteoKpi
                label="Vent vitesse"
                value={<LiveValue value={weather.windSpeed} unit="m/s" digits={1} className="text-2xl" />}
                icon={<Wind className="h-3 w-3 text-[color:var(--success)]" />}
              />
            )}
            {weather.windDirection != null && weather.windDirection > 0 && (
              <MeteoKpi
                label="Vent direction"
                value={
                  <span className="font-mono text-2xl text-[color:var(--text-primary)]">
                    {weather.windDirection.toFixed(0)}°
                  </span>
                }
                icon={<Navigation className="h-3 w-3 text-[color:var(--success)]" />}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MeteoKpi({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <div className="panel p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] text-[color:var(--text-secondary)] font-mono">
        {icon}
        {label}
      </div>
      <div className="flex items-end gap-1">{value}</div>
    </div>
  );
}
