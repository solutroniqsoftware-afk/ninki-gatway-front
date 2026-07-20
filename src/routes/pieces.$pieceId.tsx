import { createFileRoute, Link } from "@tanstack/react-router";
import { useNinki, isEclaireur, isStationMeteo } from "@/lib/ninki/store";
import { useConfig } from "@/lib/api/hooks";
import { StatusBadge } from "@/components/ninki/StatusBadge";
import { LiveValue } from "@/components/ninki/LiveValue";
import { MgrsDisplay } from "@/components/ninki/MgrsDisplay";
import { MilitaryGrid } from "@/components/ninki/MilitaryGrid";
import { CanonSvg } from "@/components/ninki/CanonSvg";
import { FireAnimation } from "@/components/ninki/FireAnimation";
import { RealtimeChart } from "@/components/ninki/RealtimeChart";
import { ResponsablePieceView } from "@/components/ninki/ResponsablePieceView";
import { EclaireurDetailView } from "@/components/ninki/EclaireurDetailView";
import { StationMeteoView } from "@/components/ninki/StationMeteoView";
import { ArrowLeft, Flame, Package, Target, Thermometer } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import type { CommandeEnvoyee } from "@/lib/ninki/types";
import type { HistoryPoint } from "@/lib/ninki/store";

export const Route = createFileRoute("/pieces/$pieceId")({
  component: PieceDetail,
  head: ({ params }) => ({
    meta: [{ title: `${params.pieceId} · NINKI GATEWAY` }],
  }),
});

const EMPTY_HISTORY: HistoryPoint[] = [];

function getSeriesColors() {
  const s = getComputedStyle(document.documentElement);
  return {
    cyan:    s.getPropertyValue('--cyan-live').trim()    || '#00D4FF',
    blue:    s.getPropertyValue('--blue-signal').trim()  || '#0066FF',
    danger:  s.getPropertyValue('--danger').trim()       || '#FF2D55',
    success: s.getPropertyValue('--success').trim()      || '#00FF88',
  };
}

function PieceDetail() {
  const { pieceId } = Route.useParams();
  const piece = useNinki((s) => s.pieces.find((p) => p.id === pieceId));
  const history = useNinki((s) => s.history[pieceId] ?? EMPTY_HISTORY);
  const fireEvents = useNinki((s) => s.fireEvents);
  const user = useNinki((s) => s.user);
  const allAlertes = useNinki((s) => s.alertes);
  const wsConnected = useNinki((s) => s.wsConnected);
  const sendCommand = useNinki((s) => s.sendCommand);
  const allCommandes = useNinki((s) => s.commandes);
  const commandes = useMemo<CommandeEnvoyee[]>(
    () => allCommandes.filter((c) => c.pieceId === pieceId).slice(0, 5),
    [allCommandes, pieceId],
  );
  const pieceAlertes = useMemo(
    () => allAlertes.filter((a) => a.pieceId === pieceId),
    [allAlertes, pieceId],
  );
  const [pending, setPending] = useState<string | null>(null);
  const [recommandation, setRec] = useState("");
  const [themeKey, setThemeKey] = useState(0);
  const { data: cfg } = useConfig();

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        if (m.type === 'attributes' && m.attributeName === 'data-theme') {
          setThemeKey(k => k + 1);
        }
      });
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  if (!piece) {
    return (
      <div className="p-8">
        <Link to="/pieces" className="text-[color:var(--cyan-live)] text-sm">
          ← Retour
        </Link>
        <p className="mt-4">Pièce introuvable.</p>
      </div>
    );
  }

  if (isStationMeteo(piece.nom)) {
    return <StationMeteoView piece={piece} />;
  }

  if (isEclaireur(piece.nom)) {
    if (user?.role !== "ADMIN") {
      return (
        <div className="p-8 flex flex-col items-center justify-center gap-4 text-center">
          <div className="text-4xl">🔒</div>
          <div className="font-mono text-[color:var(--warning)] text-sm uppercase tracking-[0.2em]">
            Accès restreint
          </div>
          <p className="text-[color:var(--text-secondary)] text-sm max-w-xs">
            Les données de l&apos;éclaireur <span className="text-[color:var(--text-primary)] font-semibold">{piece.nom}</span> sont réservées aux administrateurs.
          </p>
          <Link to="/" className="text-[color:var(--cyan-live)] text-xs font-mono hover:underline">
            ← Retour tableau de bord
          </Link>
        </div>
      );
    }
    return <EclaireurDetailView piece={piece} />;
  }

  const firing = !!(fireEvents[piece.id] && Date.now() - fireEvents[piece.id] < 3000);
  const tempCritical = piece.temperature > (cfg?.tempCritique ?? 85);
  const tempWarning = piece.temperature > (cfg?.tempDegrade ?? 70);
  const stockLow = piece.stockObus < (cfg?.stockAlerte ?? 20);

  if (user?.role === "RESPONSABLE") {
    return (
      <ResponsablePieceView
        piece={piece}
        alertes={pieceAlertes}
        commandes={commandes}
        firing={firing}
        wsConnected={wsConnected}
      />
    );
  }

  const colors = getSeriesColors();
  const tempSeries = [
    {
      label: "Température",
      color: colors.cyan,
      fill: true,
      data: history.map((h) => ({ x: h.t, y: h.temp })),
    },
  ];
  const azimutSeries = [
    {
      label: "Consigne",
      color: colors.blue,
      dashed: true,
      data: history.map((h) => ({ x: h.t, y: h.azCons })),
    },
    { label: "Réel", color: colors.danger, data: history.map((h) => ({ x: h.t, y: h.azReel })) },
  ];
  const cadenceSeries = [
    {
      label: "Cadence",
      color: colors.success,
      data: history.map((h) => ({ x: h.t, y: h.cadence })),
    },
  ];

  const sinceUpdate = Math.floor((Date.now() - piece.derniereActivite) / 1000);

  return (
    <div className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <Link
          to="/pieces"
          className="p-2 rounded border border-[color:var(--border-steel)] hover:border-[color:var(--cyan-live)] transition"
        >
          <ArrowLeft className="h-4 w-4 text-[color:var(--cyan-live)]" />
        </Link>
        <div>
          <div className="font-mono text-[color:var(--cyan-live)] glow-cyan text-sm">
            P{String(piece.numero).padStart(2, "0")}
          </div>
          <h1 className="text-2xl font-semibold tracking-[0.1em]">{piece.nom}</h1>
        </div>
        <div className="ml-auto flex items-center gap-4 flex-wrap">
          <MgrsDisplay coordinates={piece.positionMGRS} />
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[color:var(--text-secondary)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--cyan-live)] pulse-live" />
            Maj il y a {sinceUpdate}s
          </div>
          <StatusBadge status={piece.statut} large />
        </div>
      </div>

      {tempCritical && (
        <div className="panel border-[color:var(--danger)]/50 bg-[color:var(--danger)]/10 px-4 py-2 flex items-center gap-3">
          <span className="text-[color:var(--danger)] glow-danger font-mono">⚠ ALERTE</span>
          <span className="text-sm">
            P{String(piece.numero).padStart(2, "0")} — TEMPÉRATURE CRITIQUE : {piece.temperature.toFixed(1)} °C
          </span>
        </div>
      )}

      <div className="grid grid-cols-12 gap-4">
        {/* Canon image */}
        <div className="col-span-12 lg:col-span-4 panel scanlines p-4">
          <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-[color:var(--text-secondary)] mb-2">
            Vue Tactique
          </h3>
          <div className="relative aspect-square">
            <CanonSvg azimut={piece.azimutReel} azimutConsigne={piece.azimutConsigne} firing={firing} />
            <div className="absolute top-2 left-2 right-2 flex justify-between font-mono text-[10px]">
              <span className="text-[color:var(--text-secondary)]">AZ</span>
              <span className="text-[color:var(--cyan-live)]">
                {piece.azimutMil != null ? `${piece.azimutMil} mils` : `${piece.azimutReel.toFixed(1)}°`}
              </span>
            </div>
            {firing && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <FireAnimation active={firing} />
              </div>
            )}
          </div>
        </div>

        {/* Orientation widget */}
        <div className="col-span-12 lg:col-span-4 panel scanlines p-4 flex flex-col items-center">
          <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-[color:var(--text-secondary)] mb-2 self-start">
            Orientation Az / Gîte
          </h3>
          <MilitaryGrid
            azimutConsigne={piece.azimutConsigne}
            azimutReel={piece.azimutReel}
            giteConsigne={piece.giteConsigne}
            giteReel={piece.giteReel}
            azimutMil={piece.azimutMil}
            giteMil={piece.giteMil}
          />
        </div>

        {/* KPIs */}
        <div className="col-span-12 lg:col-span-4 grid grid-cols-2 gap-3">
          <Kpi icon={<Thermometer className="h-3 w-3" />} label="Température">
            <LiveValue
              value={piece.temperature}
              unit="°C"
              critical={tempCritical}
              warning={tempWarning}
              className="text-2xl"
            />
            <div className="mt-2 text-[9px] font-mono text-[color:var(--text-secondary)]">
              Seuil : {cfg?.tempCritique ?? 85}°C
            </div>
          </Kpi>
          <Kpi icon={<Flame className="h-3 w-3" />} label="Tirs effectués">
            <span className="font-mono text-2xl text-[color:var(--text-primary)]">
              {piece.nombreTirs > 0 ? piece.nombreTirs : '—'}
            </span>
            <div className="mt-2 text-[9px] font-mono text-[color:var(--text-secondary)]">
              {piece.cadenceTir > 0 ? `${piece.cadenceTir.toFixed(1)} tirs/min` : 'En attente des données'}
            </div>
          </Kpi>
          {(piece.stockObus > 0 || piece.stockMax > 0) && (
            <Kpi icon={<Package className="h-3 w-3" />} label="Stock obus">
              <LiveValue value={piece.stockObus} digits={0} warning={stockLow} className="text-2xl" />
              {piece.stockMax > 0 && (
                <div className="mt-2 h-1 rounded bg-[color:var(--bg-base)] overflow-hidden">
                  <div
                    className={`h-full ${stockLow ? "bg-[color:var(--warning)]" : "bg-gradient-to-r from-[color:var(--cyan-live)] to-[color:var(--blue-signal)]"}`}
                    style={{ width: `${(piece.stockObus / piece.stockMax) * 100}%` }}
                  />
                </div>
              )}
            </Kpi>
          )}
          <Kpi icon={<Target className="h-3 w-3" />} label="Élévation réelle">
            <div className="font-mono text-2xl text-[color:var(--text-primary)]">
              {piece.elevationMil != null ? `${piece.elevationMil} mils` : piece.elevationReel != null ? `${piece.elevationReel.toFixed(1)}°` : '—'}
            </div>
          </Kpi>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartPanel title="Température (60s)">
          <RealtimeChart key={themeKey} series={tempSeries} yMin={20} yMax={110} />
        </ChartPanel>
        <ChartPanel title="Azimut Consigne vs Réel">
          <RealtimeChart key={themeKey} series={azimutSeries} />
        </ChartPanel>
        <ChartPanel title="Cadence de tir">
          {piece.cadenceTir > 0
            ? <RealtimeChart key={themeKey} series={cadenceSeries} type="line" yMin={0} yMax={10} />
            : <div className="flex items-center justify-center h-20 text-[10px] font-mono text-[color:var(--text-secondary)]">En attente des données de tir</div>
          }
        </ChartPanel>
      </div>

      {/* Commandes (admin) */}
      {user?.role === "ADMIN" && (
        <div className="panel scanlines p-4">
          <h3 className="text-[11px] font-mono uppercase tracking-[0.2em] text-[color:var(--text-secondary)] mb-3">
            Commandes & Recommandations
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <div className="grid grid-cols-2 gap-2">
                {["FEU", "HALT", "RECHARGER", "REPOSITIONNER"].map((c) => (
                  <button
                    key={c}
                    onClick={() => setPending(c)}
                    className={`px-3 py-3 rounded border font-mono text-sm uppercase tracking-[0.2em] transition ${
                      c === "FEU"
                        ? "border-[color:var(--danger)]/40 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10"
                        : c === "HALT"
                          ? "border-[color:var(--warning)]/40 text-[color:var(--warning)] hover:bg-[color:var(--warning)]/10"
                          : "border-[color:var(--cyan-live)]/40 text-[color:var(--cyan-live)] hover:bg-[color:var(--cyan-live)]/10"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="mt-3">
                <textarea
                  value={recommandation}
                  onChange={(e) => setRec(e.target.value)}
                  placeholder="Recommandation libre..."
                  className="w-full h-20 bg-[color:var(--bg-base)] border border-[color:var(--border-steel)] rounded px-3 py-2 text-sm font-mono outline-none focus:border-[color:var(--cyan-live)]"
                />
                <button
                  onClick={() => recommandation && setPending(`MSG: ${recommandation}`)}
                  className="mt-2 w-full py-2 rounded bg-[color:var(--cyan-live)]/10 border border-[color:var(--cyan-live)]/40 text-[color:var(--cyan-live)] font-mono text-xs uppercase tracking-[0.2em] hover:bg-[color:var(--cyan-live)]/20"
                >
                  ▸ Envoyer recommandation
                </button>
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-secondary)] mb-2">
                Historique commandes
              </div>
              <div className="space-y-1.5 max-h-64 overflow-auto">
                {commandes.length === 0 && (
                  <div className="text-[10px] font-mono text-[color:var(--text-disabled)]">
                    Aucune commande envoyée.
                  </div>
                )}
                {commandes.map((c) => (
                  <div
                    key={c.id}
                    className="panel px-3 py-2 flex items-center justify-between text-xs"
                  >
                    <span className="font-mono text-[color:var(--cyan-live)]">{c.commande}</span>
                    <span className="font-mono text-[10px] text-[color:var(--text-secondary)]">
                      {new Date(c.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm modal */}
      {pending && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm"
          onClick={() => setPending(null)}
        >
          <div
            className="glass p-6 rounded-lg max-w-sm w-full ring-active"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-mono uppercase tracking-[0.25em] text-[color:var(--cyan-live)] glow-cyan mb-2">
              Confirmation
            </h3>
            <p className="text-sm">
              Confirmer l'envoi de la commande{" "}
              <span className="font-mono text-[color:var(--cyan-live)]">{pending}</span> à{" "}
              <span className="font-mono">P{String(piece.numero).padStart(2, "0")} — {piece.nom}</span> ?
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setPending(null)}
                className="flex-1 py-2 rounded border border-[color:var(--border-steel)] text-xs uppercase tracking-wider hover:bg-[color:var(--bg-elevated)]"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  sendCommand(piece.id, pending);
                  setPending(null);
                  setRec("");
                }}
                className="flex-1 py-2 rounded bg-[color:var(--cyan-live)] text-[color:var(--bg-base)] font-bold text-xs uppercase tracking-wider"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="panel p-3 flex flex-col">
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] text-[color:var(--text-secondary)]">
        <span className="text-[color:var(--cyan-live)]">{icon}</span>
        {label}
      </div>
      <div className="mt-2 flex-1">{children}</div>
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel scanlines p-3">
      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[color:var(--text-secondary)] mb-2">
        {title}
      </div>
      {children}
    </div>
  );
}
