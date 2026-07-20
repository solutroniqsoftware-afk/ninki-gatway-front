import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useNinki } from "@/lib/ninki/store";
import { StatusBadge } from "@/components/ninki/StatusBadge";
import type { Piece } from "@/lib/ninki/types";

function windDirText(dir: number): string {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
  return dirs[Math.round(dir / 22.5) % 16];
}

export function StationMeteoView({ piece }: { piece: Piece }) {
  const weather = useNinki((s) => s.weather);
  const weatherLoaded = useNinki((s) => s.weatherLoaded);
  const since = Math.floor((Date.now() - piece.derniereActivite) / 1000);

  return (
    <div className="p-5 space-y-4">

      {/* En-tête */}
      <div className="flex items-center gap-4 flex-wrap">
        <Link to="/pieces" className="p-2 rounded border border-[color:var(--border-steel)] hover:border-[color:var(--cyan-live)] transition">
          <ArrowLeft className="h-4 w-4 text-[color:var(--cyan-live)]" />
        </Link>
        <div>
          <div className="font-mono text-[color:var(--cyan-live)] text-xs uppercase tracking-wider">
            🌤 Station Météo
          </div>
          <h1 className="text-2xl font-semibold tracking-[0.1em]">{piece.nom}</h1>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="font-mono text-[10px] text-[color:var(--text-secondary)]">
            MAJ {since}s
          </span>
          <StatusBadge status={piece.statut} large />
        </div>
      </div>

      {!weatherLoaded || !weather ? (
        <div className="panel scanlines p-6 text-center">
          <div className="text-[color:var(--text-secondary)] text-sm font-mono">
            En attente des données météo...
          </div>
        </div>
      ) : (
        <>
          {/* Conditions atmosphériques */}
          <div className="panel scanlines p-4">
            <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-[color:var(--text-secondary)] mb-3">
              Conditions atmosphériques
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="panel p-3 text-center">
                <div className="text-2xl mb-1">🌡</div>
                <div className="text-[9px] uppercase tracking-wider text-[color:var(--text-secondary)]">Température</div>
                <div className="font-mono text-[color:var(--cyan-live)] text-2xl mt-1">
                  {weather.temperature != null ? `${weather.temperature.toFixed(1)}°C` : '—'}
                </div>
              </div>
              <div className="panel p-3 text-center">
                <div className="text-2xl mb-1">💧</div>
                <div className="text-[9px] uppercase tracking-wider text-[color:var(--text-secondary)]">Humidité</div>
                <div className="font-mono text-[color:var(--cyan-live)] text-2xl mt-1">
                  {weather.humidity != null ? `${weather.humidity.toFixed(0)}%` : '—'}
                </div>
              </div>
              <div className="panel p-3 text-center">
                <div className="text-2xl mb-1">⏱</div>
                <div className="text-[9px] uppercase tracking-wider text-[color:var(--text-secondary)]">Pression</div>
                <div className="font-mono text-[color:var(--cyan-live)] text-xl mt-1">
                  {weather.pressure != null ? `${weather.pressure.toFixed(0)} hPa` : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Vent */}
          <div className="panel scanlines p-4">
            <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-[color:var(--text-secondary)] mb-3">
              Vent
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="panel p-3 text-center">
                <div className="text-2xl mb-1">💨</div>
                <div className="text-[9px] uppercase tracking-wider text-[color:var(--text-secondary)]">Vitesse</div>
                <div className="font-mono text-[color:var(--warning)] text-2xl mt-1">
                  {weather.windSpeed != null ? `${weather.windSpeed.toFixed(1)} m/s` : '—'}
                </div>
                {weather.windSpeed != null && (
                  <div className="text-[9px] text-[color:var(--text-secondary)] mt-1">
                    {(weather.windSpeed * 3.6).toFixed(1)} km/h
                  </div>
                )}
              </div>
              <div className="panel p-3 text-center">
                <div className="text-2xl mb-1">🧭</div>
                <div className="text-[9px] uppercase tracking-wider text-[color:var(--text-secondary)]">Direction</div>
                <div className="font-mono text-[color:var(--warning)] text-2xl mt-1">
                  {weather.windDirection != null ? windDirText(weather.windDirection) : '—'}
                </div>
                {weather.windDirection != null && (
                  <div className="text-[9px] text-[color:var(--text-secondary)] mt-1">
                    {weather.windDirection.toFixed(0)}°
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Infos capteur */}
          <div className="panel scanlines p-4">
            <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-[color:var(--text-secondary)] mb-3">
              Informations capteur
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="panel p-3">
                <div className="text-[9px] uppercase tracking-wider text-[color:var(--text-secondary)]">DevEUI</div>
                <div className="font-mono text-[color:var(--text-primary)] text-xs mt-1 break-all">{piece.devEUI}</div>
              </div>
              <div className="panel p-3">
                <div className="text-[9px] uppercase tracking-wider text-[color:var(--text-secondary)]">Dernière mise à jour</div>
                <div className="font-mono text-[color:var(--cyan-live)] text-xs mt-1">
                  il y a {since}s
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
