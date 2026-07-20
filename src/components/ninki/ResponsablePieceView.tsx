import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, LogOut, Moon, Radio, Shield, Sun, UserRound, Zap } from "lucide-react";
import { toast } from "sonner";

import { Toaster } from "@/components/ui/sonner";
import { useNinki } from "@/lib/ninki/store";
import { useConfig } from "@/lib/api/hooks";
import type { Alerte, CommandeEnvoyee, Piece } from "@/lib/ninki/types";
import { useTheme } from "@/lib/theme/useTheme";

interface ResponsablePieceViewProps {
  piece: Piece;
  alertes: Alerte[];
  commandes: CommandeEnvoyee[];
  firing: boolean;
  wsConnected: boolean;
}

export function ResponsablePieceView({
  piece,
  alertes,
  commandes,
  firing,
  wsConnected,
}: ResponsablePieceViewProps) {
  const navigate = useNavigate();
  const logout = useNinki((s) => s.logout);
  const user = useNinki((s) => s.user);
  const { data: cfg } = useConfig();
  const { theme, toggleTheme } = useTheme();
  const tempCritique = cfg?.tempCritique ?? 85;
  const tempDegrade = cfg?.tempDegrade ?? 70;
  const [utcTime, setUtcTime] = useState("");
  const [readCommandIds, setReadCommandIds] = useState<Set<string>>(() => new Set());
  const initializedCommandToast = useRef(false);
  const latestCommandId = commandes[0]?.id;

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setUtcTime(
        `${d.getUTCHours().toString().padStart(2, "0")}:${d
          .getUTCMinutes()
          .toString()
          .padStart(2, "0")}:${d.getUTCSeconds().toString().padStart(2, "0")} UTC`,
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const latest = commandes[0];
    if (!latest) return;
    if (!initializedCommandToast.current) {
      initializedCommandToast.current = true;
      setReadCommandIds(new Set(commandes.map((c) => c.id)));
      return;
    }
    setReadCommandIds((current) => {
      if (current.has(latest.id)) return current;
      const next = new Set(current);
      next.delete(latest.id);
      return next;
    });
    toast(latest.urgent ? "Commande urgente reçue" : "Nouvelle commande reçue", {
      description: latest.commande,
      position: "top-right",
    });
  }, [latestCommandId, commandes]);

  // ── Alerte température critique ──────────────────────────────────────────
  const isCritical = piece.temperature >= tempCritique;
  const [acknowledgedAt, setAcknowledgedAt] = useState<number | null>(null);
  const showCriticalAlert = isCritical && acknowledgedAt === null;

  // Reset l'acquittement quand la température redescend sous le seuil
  useEffect(() => {
    if (!isCritical) setAcknowledgedAt(null);
  }, [isCritical]);

  // Re-déclenche l'alerte 60 secondes après acquittement si toujours critique
  useEffect(() => {
    if (acknowledgedAt === null) return;
    const timer = setTimeout(() => setAcknowledgedAt(null), 60_000);
    return () => clearTimeout(timer);
  }, [acknowledgedAt]);
  // ─────────────────────────────────────────────────────────────────────────

  const activeAlertes = alertes.filter((a) => !a.acquittee);
  const unreadCount = commandes.filter((c) => !readCommandIds.has(c.id)).length;
  const secondsSinceUpdate = Math.max(0, Math.floor((Date.now() - piece.derniereActivite) / 1000));
  const stockPercent = Math.round((piece.stockObus / piece.stockMax) * 100);

  const tempTone =
    piece.temperature >= tempCritique
      ? "danger"
      : piece.temperature >= tempDegrade
        ? "warning"
        : "ok";
  const stockTone = stockPercent < 20 ? "danger" : stockPercent < 35 ? "warning" : "ok";

  return (
    <div className="min-h-screen bg-[color:var(--bg-base)] text-[color:var(--text-primary)]">
      <Toaster richColors closeButton />

      {showCriticalAlert && (
        <CriticalTempAlert
          temperature={piece.temperature}
          seuil={tempCritique}
          onAcknowledge={() => setAcknowledgedAt(Date.now())}
        />
      )}

      {/* Barre de navigation */}
      <header className="sticky top-0 z-40 h-12 border-b border-[color:var(--border-steel)] bg-[color:var(--bg-secondary)]/90 backdrop-blur-md px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <Shield className="h-4 w-4 text-[color:var(--cyan-live)]" />
            <span className="font-bold uppercase tracking-[0.1em] text-sm">
              NINKI <span className="text-[color:var(--cyan-live)]">GATEWAY</span>
            </span>
          </div>
          <span className="rounded border border-[color:var(--cyan-live)]/20 bg-[color:var(--cyan-live)]/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-[color:var(--text-secondary)] truncate max-w-[120px]">
            {piece.batterie ?? cfg?.nom ?? "Batterie"}
          </span>
          <span
            className={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider shrink-0 ${
              wsConnected ? "text-[color:var(--success)]" : "text-[color:var(--danger)]"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current pulse-live" />
            {wsConnected ? "LIVE" : "DÉCONNECTÉ"}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-mono text-xs text-[color:var(--cyan-live)] tabular-nums">{utcTime}</span>
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border-steel)] bg-[color:var(--bg-card)] px-2.5 py-1 text-[11px]">
            <UserRound className="h-3 w-3 text-[color:var(--cyan-live)]" />
            {user?.grade ? `${user.grade} ${user.nom}` : (user?.nom ?? "—")}
          </span>
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Passer en mode jour' : 'Passer en mode nuit'}
            className="rounded border border-[color:var(--border-steel)] p-1.5 text-[color:var(--text-secondary)] hover:text-[color:var(--cyan-live)] hover:bg-[color:var(--bg-elevated)] transition-colors"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            onClick={() => { logout(); navigate({ to: "/login" }); }}
            className="rounded border border-[color:var(--border-steel)] p-1.5 text-[color:var(--text-secondary)] hover:border-[color:var(--danger)]/50 hover:text-[color:var(--danger)]"
            title="Déconnexion"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {!wsConnected && <Banner tone="warning" message="Reconnexion au réseau local en cours..." />}
      {piece.statut === "offline" && (
        <Banner tone="danger" message="Pièce hors service — liaison capteur perdue" />
      )}

      <main className="p-3 space-y-3 max-w-5xl mx-auto">

        {/* Barre d'info pièce — toutes les données condensées */}
        <div className="glass scanlines rounded-md px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex items-center gap-2.5 shrink-0">
            <h1 className="font-bold tracking-wide text-base">{piece.nom}</h1>
            <StatusPill status={piece.statut} />
          </div>

          <span className="font-mono text-lg text-[color:var(--cyan-live)] glow-cyan shrink-0">
            {piece.positionMGRS}
          </span>

          <span className="font-mono text-[10px] text-[color:var(--text-secondary)] shrink-0">
            MàJ il y a {secondsSinceUpdate}s
          </span>

          {/* Séparateur */}
          <div className="hidden sm:block h-4 w-px bg-[color:var(--border-steel)]" />

          {/* Chips données */}
          <InfoChip label="Temp." value={`${piece.temperature.toFixed(1)} °C`} tone={tempTone} flash={tempTone === "danger"} />
          <InfoChip label="Tirs" value={piece.nombreTirs.toString()} tone="live" flash={firing} />
          <InfoChip
            label="Stock"
            value={`${piece.stockObus}/${piece.stockMax}`}
            tone={stockTone}
          />
          {activeAlertes.length > 0 && (
            <InfoChip
              label="Alertes"
              value={activeAlertes.length.toString()}
              tone="danger"
            />
          )}
          {unreadCount > 0 && (
            <InfoChip label="Cmd" value={`${unreadCount} nouvelle${unreadCount > 1 ? "s" : ""}`} tone="warning" />
          )}
        </div>

        {/* Orientation XY — dominant, prend tout l'espace disponible */}
        <Panel title="Orientation XY">
          <OrientationXY piece={piece} />
        </Panel>

        {/* Commandes + Alertes côte à côte */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Panel
            title="Commandes reçues"
            action={
              unreadCount > 0 && (
                <span className="rounded-full bg-[color:var(--danger)] px-2 py-0.5 font-mono text-[10px] text-white">
                  {unreadCount} nouvelle{unreadCount > 1 ? "s" : ""}
                </span>
              )
            }
          >
            <CommandList
              commandes={commandes}
              readCommandIds={readCommandIds}
              onRead={(id) =>
                setReadCommandIds((prev) => {
                  const next = new Set(prev);
                  next.add(id);
                  return next;
                })
              }
            />
          </Panel>

          <Panel
            title="Alertes"
            action={
              activeAlertes.length > 0 && (
                <span className="rounded-full bg-[color:var(--danger)] px-2 py-0.5 font-mono text-[10px] text-white">
                  {activeAlertes.length}
                </span>
              )
            }
          >
            <AlertTimeline alertes={alertes} piece={piece} />
          </Panel>
        </div>
      </main>
    </div>
  );
}

// ─── Composants utilitaires ───────────────────────────────────────────────────

function StatusPill({ status }: { status: Piece["statut"] }) {
  const map = {
    operational: ["Opérationnel", "text-[color:var(--success)] border-[color:var(--success)]/40 bg-[color:var(--success)]/10"],
    degraded: ["Dégradé", "text-[color:var(--warning)] border-[color:var(--warning)]/40 bg-[color:var(--warning)]/10"],
    offline: ["Hors service", "text-[color:var(--danger)] border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 blink-danger"],
  } as const;
  const [label, className] = map[status];
  return (
    <span className={`shrink-0 rounded border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.15em] ${className}`}>
      {label}
    </span>
  );
}

function InfoChip({
  label,
  value,
  tone,
  flash,
}: {
  label: string;
  value: string;
  tone: "ok" | "warning" | "danger" | "live";
  flash?: boolean;
}) {
  const cssVar =
    tone === "danger" ? "var(--danger)"
    : tone === "warning" ? "var(--warning)"
    : tone === "ok" ? "var(--success)"
    : "var(--cyan-live)";
  return (
    <div
      className={`flex items-center gap-1.5 rounded border px-2.5 py-1 shrink-0 ${flash ? "ring-active" : ""}`}
      style={{
        borderColor: `color-mix(in srgb, ${cssVar} 40%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${cssVar} 8%, transparent)`,
      }}
    >
      <span className="text-[9px] uppercase tracking-wider text-[color:var(--text-secondary)]">{label}</span>
      <span className="font-mono text-sm tabular-nums font-semibold" style={{ color: cssVar }}>
        {value}
      </span>
    </div>
  );
}

// ─── Orientation XY ───────────────────────────────────────────────────────────

function OrientationXY({ piece }: { piece: Piece }) {
  const { data: cfg } = useConfig();
  const seuilWarning  = cfg?.azimutCorrection ?? 2;
  const seuilCritique = cfg?.azimutCritique   ?? 5;

  // Bug #3: wrap-around circulaire (consigne=350°, réel=5° → +15° et non -345°)
  const deltaAz = ((piece.azimutReel - piece.azimutConsigne + 540) % 360) - 180;
  const deltaGi = piece.giteReel - piece.giteConsigne;
  const delta = Math.max(Math.abs(deltaAz), Math.abs(deltaGi));
  // Bug #6: seuils issus de la config batterie
  const status = delta < seuilWarning ? "ok" : delta < seuilCritique ? "warning" : "danger";
  // Bug #5: message affiche az ET gîte
  const message =
    status === "ok"
      ? "Aligné"
      : status === "warning"
        ? `Correction Az:${deltaAz >= 0 ? "+" : ""}${deltaAz.toFixed(1)}° Gîte:${deltaGi >= 0 ? "+" : ""}${deltaGi.toFixed(1)}°`
        : "DÉSALIGNEMENT CRITIQUE";
  const color =
    status === "ok" ? "var(--success)" : status === "warning" ? "var(--warning)" : "var(--danger)";
  const target = polarPoint(piece.azimutConsigne, piece.giteConsigne);
  const real = polarPoint(piece.azimutReel, piece.giteReel);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Cercle — centré dans le panel */}
      <svg
        viewBox="0 0 280 280"
        className="w-full overflow-visible"
        style={{ aspectRatio: "1", maxHeight: "58vh", maxWidth: "58vh" }}
      >
        <defs>
          <radialGradient id="xy-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(0,212,255,0.14)" />
            <stop offset="100%" stopColor="rgba(0,212,255,0)" />
          </radialGradient>
        </defs>

        {/* Fond */}
        <circle cx="140" cy="140" r="118" fill="url(#xy-bg)" stroke="var(--border-steel)" strokeWidth="1" />
        <circle cx="140" cy="140" r="78" fill="none" stroke="var(--border-steel)" strokeDasharray="3 6" strokeWidth="0.8" />
        <circle cx="140" cy="140" r="39" fill="none" stroke="var(--border-steel)" strokeDasharray="2 6" strokeWidth="0.8" />

        {/* Graduations */}
        {Array.from({ length: 36 }).map((_, i) => {
          const deg = i * 10;
          const major = deg % 30 === 0;
          const a = (deg * Math.PI) / 180;
          return (
            <line
              key={deg}
              x1={140 + Math.sin(a) * 120} y1={140 - Math.cos(a) * 120}
              x2={140 + Math.sin(a) * (major ? 107 : 113)} y2={140 - Math.cos(a) * (major ? 107 : 113)}
              stroke={major ? "var(--cyan-live)" : "var(--text-disabled)"}
              strokeWidth={major ? 1.5 : 0.8}
              opacity={major ? 0.9 : 0.4}
            />
          );
        })}

        {/* Axe horizontal — Azimut */}
        <line x1="20" y1="140" x2="260" y2="140"
          stroke="var(--border-steel)" strokeWidth="1" strokeDasharray="3 3" />
        <text x="264" y="134" fill="var(--text-secondary)"
          fontSize="9" fontFamily="monospace">AZ</text>

        {/* Axe vertical — Gîte */}
        <line x1="140" y1="20" x2="140" y2="260"
          stroke="var(--border-steel)" strokeWidth="1" strokeDasharray="3 3" />
        <text x="144" y="18" fill="var(--text-secondary)"
          fontSize="9" fontFamily="monospace">GÎTE</text>

        {/* Valeur azimut réel au centre bas */}
        <text x="140" y="272" textAnchor="middle"
          fill="var(--text-secondary)" fontSize="9" fontFamily="monospace">
          {piece.azimutReel.toFixed(1)}°
        </text>

        {/* Valeur gîte réel à droite */}
        <text x="276" y="156" textAnchor="end"
          fill="var(--text-secondary)" fontSize="9" fontFamily="monospace">
          {piece.giteReel.toFixed(1)}°
        </text>

        {/* Ligne d'écart */}
        <line
          x1={target.x} y1={target.y} x2={real.x} y2={real.y}
          stroke={color} strokeWidth="2" strokeDasharray="5 4" opacity="0.8"
        />

        {/* Consigne */}
        <circle cx={target.x} cy={target.y} r="10" fill="var(--blue-signal)" opacity="0.9" />
        <circle cx={target.x} cy={target.y} r="18" fill="none" stroke="var(--blue-signal)" strokeWidth="1.5" opacity="0.6" />

        {/* Réel — Bug #4: couleur dynamique selon statut (non plus hardcodée danger) */}
        <circle cx={real.x} cy={real.y} r="10" fill={color} opacity="0.95" />
        <circle cx={real.x} cy={real.y} r="18" fill="none" stroke={color} strokeWidth="1.5" opacity="0.7" />
      </svg>

      {/* Données d'orientation — grille horizontale sous le cercle */}
      <div className="w-full max-w-[58vh] space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <OrientationRow label="Az. consigne" value={`${piece.azimutConsigne.toFixed(1)}°`} color="var(--blue-signal)" />
          <OrientationRow label="Az. réel" value={`${piece.azimutReel.toFixed(1)}°`} color="var(--danger)" />
          <OrientationRow label="Gîte consigne" value={`${piece.giteConsigne.toFixed(1)}°`} color="var(--blue-signal)" />
          <OrientationRow
            label="Gîte réel"
            value={`${piece.giteReel.toFixed(1)}°`}
            color={Math.abs(deltaGi) < 1 ? "var(--success)" : "var(--danger)"}
          />
        </div>
        <div className="flex items-center gap-3">
          <div
            className={`flex-1 rounded border px-3 py-2 font-mono text-xs uppercase tracking-[0.15em] text-center ${status === "danger" ? "blink-danger" : ""}`}
            style={{ color, borderColor: color, backgroundColor: `${toneHex(status)}14` }}
          >
            {message}
          </div>
          <div className="flex items-center gap-3 text-[10px] text-[color:var(--text-secondary)] font-mono shrink-0">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-[color:var(--blue-signal)]" />
              Consigne
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-[color:var(--danger)]" />
              Réel
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function polarPoint(azimut: number, gite: number) {
  // gite=0 → radius=0 → point au centre exact (intersection des axes)
  const radius = Math.max(0, Math.min(112, (Math.abs(gite) / 20) * 112));
  const angle = (azimut * Math.PI) / 180;
  return { x: 140 + Math.sin(angle) * radius, y: 140 - Math.cos(angle) * radius };
}

function OrientationRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded border border-[color:var(--border-steel)] bg-[color:var(--bg-base)]/50 px-3 py-2">
      <span className="text-[10px] uppercase tracking-wider text-[color:var(--text-secondary)] shrink-0">{label}</span>
      <span className="font-mono text-xl tabular-nums" style={{ color }}>{value}</span>
    </div>
  );
}

// ─── Alertes ──────────────────────────────────────────────────────────────────

function AlertTimeline({ alertes, piece }: { alertes: Alerte[]; piece: Piece }) {
  const items = alertes.slice(0, 6);
  if (items.length === 0) {
    return (
      <div className="rounded border border-[color:var(--border-steel)] bg-[color:var(--bg-base)]/50 p-4 text-sm text-[color:var(--text-secondary)]">
        Aucune alerte pour P{String(piece.numero).padStart(2, "0")} — {piece.nom}.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((alerte) => {
        const color =
          alerte.criticite === "critical" ? "var(--danger)"
          : alerte.criticite === "warning" ? "var(--warning)"
          : "var(--cyan-live)";
        return (
          <div
            key={alerte.id}
            className={`rounded border p-3 ${alerte.acquittee ? "opacity-50" : ""}`}
            style={{ borderColor: color, background: alerte.acquittee ? "var(--bg-card)" : `${color}12` }}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color }} />
              <div className="min-w-0">
                <div className="text-sm leading-snug">{alerte.message}</div>
                <div className="mt-1 font-mono text-[10px] text-[color:var(--text-secondary)]">
                  {new Date(alerte.timestamp).toLocaleTimeString()} · {alerte.acquittee ? "Acquittée" : "Active"}
                  {alerte.valeur && <span className="ml-2" style={{ color }}>{alerte.valeur}</span>}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Commandes ────────────────────────────────────────────────────────────────

function CommandList({
  commandes,
  readCommandIds,
  onRead,
}: {
  commandes: CommandeEnvoyee[];
  readCommandIds: Set<string>;
  onRead: (id: string) => void;
}) {
  if (commandes.length === 0) {
    return (
      <div className="rounded border border-[color:var(--border-steel)] bg-[color:var(--bg-base)]/50 p-4 text-sm text-[color:var(--text-secondary)]">
        Aucune commande reçue.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {commandes.map((commande) => {
        const read = readCommandIds.has(commande.id);
        return (
          <button
            key={commande.id}
            onClick={() => onRead(commande.id)}
            className={`w-full rounded border p-3 text-left transition ${
              read
                ? "border-[color:var(--border-steel)] bg-[color:var(--bg-base)]/50"
                : "border-[color:var(--danger)]/50 bg-[color:var(--danger)]/10 ring-active"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs text-[color:var(--cyan-live)]">
                {new Date(commande.timestamp).toLocaleTimeString()}
              </span>
              <span
                className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase ${
                  read
                    ? "bg-[color:var(--bg-elevated)] text-[color:var(--text-secondary)]"
                    : "bg-[color:var(--danger)] text-white"
                }`}
              >
                {read ? "Lu" : "Nouvelle"}
              </span>
            </div>
            <div className="mt-2 flex items-start gap-2 text-sm">
              {!read && <Zap className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--danger)]" />}
              <span className="font-medium">{commande.commande}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Alerte température critique ─────────────────────────────────────────────

// Singleton AudioContext déverrouillé au premier geste utilisateur sur la page.
// Le navigateur bloque tout AudioContext créé sans geste préalable.
let _sharedAudioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof AudioContext === "undefined") return null;
  try {
    if (!_sharedAudioCtx) _sharedAudioCtx = new AudioContext();
    return _sharedAudioCtx;
  } catch {
    return null;
  }
}

// Déverrouille le contexte audio sur le premier clic/toucher de la session
if (typeof document !== "undefined") {
  const unlock = () => {
    getAudioCtx()?.resume().catch(() => {});
    document.removeEventListener("pointerdown", unlock);
  };
  document.addEventListener("pointerdown", unlock, { once: true });
}

function playAlarm() {
  const ctx = getAudioCtx();
  // Ne joue que si le contexte est déjà déverrouillé par un geste utilisateur.
  // Évite toute erreur console — le visuel seul suffit si l'audio n'est pas prêt.
  if (!ctx || ctx.state !== "running") return;
  const play = (freq: number, t: number, dur: number) => {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.35, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + dur);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + dur + 0.05);
    } catch { /* sécurité */ }
  };
  for (let i = 0; i < 3; i++) {
    play(1200, i * 0.7, 0.28);
    play(800, i * 0.7 + 0.35, 0.28);
  }
}

function CriticalTempAlert({
  temperature,
  seuil,
  onAcknowledge,
}: {
  temperature: number;
  seuil: number;
  onAcknowledge: () => void;
}) {
  const [countdown, setCountdown] = useState(5);
  const [canDismiss, setCanDismiss] = useState(false);

  useEffect(() => {
    // Son d'alarme — fonctionne si le contexte a déjà été déverrouillé
    playAlarm();

    // Compte à rebours avant acquittement possible
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          setCanDismiss(true);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <style>{`
        @keyframes criticalOverlay {
          0%, 100% { background: rgba(0,0,0,0.88); }
          50% { background: rgba(60,0,10,0.93); }
        }
        @keyframes criticalGlow {
          0% { box-shadow: 0 0 40px rgba(255,45,85,0.5), inset 0 0 40px rgba(255,45,85,0.08); }
          100% { box-shadow: 0 0 90px rgba(255,45,85,0.9), inset 0 0 80px rgba(255,45,85,0.18); }
        }
        @keyframes criticalBlink {
          0%, 45% { opacity: 1; }
          50%, 95% { opacity: 0.15; }
          100% { opacity: 1; }
        }
        @keyframes criticalShake {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          15% { transform: translateX(-5px) rotate(-1deg); }
          30% { transform: translateX(5px) rotate(1deg); }
          45% { transform: translateX(-4px) rotate(-0.5deg); }
          60% { transform: translateX(4px) rotate(0.5deg); }
          75% { transform: translateX(-2px); }
        }
      `}</style>

      <div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        style={{ animation: "criticalOverlay 1.2s ease-in-out infinite" }}
      >
        <div
          className="w-full max-w-md rounded-2xl border-2 border-red-500 p-8 text-center"
          style={{
            background: "linear-gradient(160deg, #1c0005 0%, #300008 60%, #1c0005 100%)",
            animation: "criticalGlow 1s ease-in-out infinite alternate",
          }}
        >
          {/* Icône clignotante */}
          <div
            className="mb-3 text-[72px] leading-none select-none"
            style={{ animation: "criticalBlink 0.6s step-end infinite" }}
          >
            ⚠
          </div>

          {/* Titre */}
          <div
            className="mb-1 font-mono text-lg font-black uppercase tracking-[0.35em] text-red-400"
            style={{ animation: "criticalBlink 0.6s step-end infinite" }}
          >
            TEMPÉRATURE CRITIQUE
          </div>
          <div className="mb-5 font-mono text-[11px] uppercase tracking-[0.2em] text-red-600">
            DANGER MATÉRIEL — ARRÊT IMMÉDIAT
          </div>

          {/* Valeur température */}
          <div
            className="mb-5 font-mono font-black tabular-nums text-red-400"
            style={{
              fontSize: "clamp(3.5rem, 18vw, 6rem)",
              lineHeight: 1,
              textShadow: "0 0 30px rgba(255,45,85,0.8)",
              animation: "criticalBlink 1.1s step-end infinite",
            }}
          >
            {temperature.toFixed(1)} °C
          </div>

          {/* Info seuil */}
          <div className="mb-6 rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 space-y-1">
            <p className="font-mono text-sm text-gray-300">
              Seuil critique :{" "}
              <span className="font-bold text-red-400">{seuil} °C</span>
            </p>
            <p className="font-mono text-xs text-red-500 uppercase tracking-wider">
              Risque d'endommagement irréversible du matériel
            </p>
          </div>

          {/* Bouton acquittement */}
          <button
            disabled={!canDismiss}
            onClick={() => {
              navigator.vibrate?.([200, 100, 200]);
              onAcknowledge();
            }}
            className="w-full rounded-xl border-2 py-4 font-mono text-sm font-bold uppercase tracking-[0.25em] transition-all duration-300"
            style={
              canDismiss
                ? {
                    borderColor: "#FF2D55",
                    background: "#FF2D55",
                    color: "#fff",
                    animation: "criticalShake 0.6s ease-in-out infinite",
                    cursor: "pointer",
                  }
                : {
                    borderColor: "#4b1020",
                    background: "#1a0008",
                    color: "#6b2030",
                    cursor: "not-allowed",
                  }
            }
          >
            {canDismiss
              ? "⚡ J'ai pris connaissance — Acquitter"
              : `Lisez l'alerte… ${countdown}s`}
          </button>

          {/* Note de re-déclenchement */}
          <p className="mt-3 font-mono text-[9px] text-red-900 uppercase tracking-wider">
            L'alerte se réactivera dans 60s si la température reste critique
          </p>
        </div>
      </div>
    </>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="glass scanlines rounded-md p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-secondary)]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Banner({ tone, message }: { tone: "warning" | "danger"; message: string }) {
  const color = tone === "danger" ? "var(--danger)" : "var(--warning)";
  return (
    <div className="border-b px-4 py-2 font-mono text-xs uppercase tracking-wider" style={{ color, borderColor: color }}>
      <Radio className="mr-2 inline h-3.5 w-3.5" />
      {message}
    </div>
  );
}

function toneHex(status: "ok" | "warning" | "danger") {
  return status === "danger" ? "#FF2D55" : status === "warning" ? "#FFB800" : "#00FF88";
}
