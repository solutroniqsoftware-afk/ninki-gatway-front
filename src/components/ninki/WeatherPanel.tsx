import type { WeatherData } from "@/lib/ninki/types";
import { Droplets, Gauge, Thermometer, Wind } from "lucide-react";

export function WeatherPanel({ data }: { data: WeatherData }) {
  return (
    <div className="panel scanlines p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-mono uppercase tracking-[0.2em] text-[color:var(--text-secondary)]">
          Conditions Météo
        </h3>
        <span className="text-[10px] font-mono text-[color:var(--cyan-live)]">LIVE</span>
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-4">
        <WindRose direction={data.windDirection} speed={data.windSpeed} />
        <div className="grid grid-cols-1 gap-2 self-center">
          <Stat icon={<Thermometer className="h-3 w-3" />} label="Temp" value={`${data.temperature.toFixed(1)} °C`} />
          <Stat icon={<Droplets className="h-3 w-3" />} label="Humidité" value={`${data.humidity} %`} />
          <Stat icon={<Gauge className="h-3 w-3" />} label="Pression" value={`${data.pressure} hPa`} />
          <Stat icon={<Wind className="h-3 w-3" />} label="Vent" value={`${(data.windSpeed * 3.6).toFixed(1)} km/h`} />
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[color:var(--border-steel)]/50 pb-1.5">
      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[color:var(--text-secondary)]">
        {icon} {label}
      </span>
      <span className="font-mono text-sm text-[color:var(--cyan-live)] glow-cyan">{value}</span>
    </div>
  );
}

function WindRose({ direction, speed }: { direction: number; speed: number }) {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="55" fill="rgba(0,212,255,0.04)" stroke="var(--border-steel)" />
      <circle cx="60" cy="60" r="40" fill="none" stroke="var(--border-steel)" strokeDasharray="2 3" />
      {["N", "E", "S", "O"].map((l, i) => {
        const a = (i * 90 * Math.PI) / 180;
        const x = 60 + Math.sin(a) * 50;
        const y = 60 - Math.cos(a) * 50 + 4;
        return (
          <text key={l} x={x} y={y} textAnchor="middle" fontSize="10" fontFamily="JetBrains Mono" fill="var(--cyan-live)">
            {l}
          </text>
        );
      })}
      <g style={{ transformOrigin: "60px 60px", transform: `rotate(${direction}deg)`, transition: "transform 0.5s" }}>
        <polygon points="60,20 54,55 60,48 66,55" fill="var(--cyan-live)" />
        <polygon points="60,100 54,65 60,72 66,65" fill="var(--text-disabled)" />
      </g>
      <circle cx="60" cy="60" r="4" fill="var(--cyan-live)" />
      <text x="60" y="115" textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono" fill="var(--text-secondary)">
        {Math.round(direction)}° · {(speed * 3.6).toFixed(0)} km/h
      </text>
    </svg>
  );
}