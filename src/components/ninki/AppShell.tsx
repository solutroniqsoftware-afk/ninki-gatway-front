import { useEffect, useState } from "react";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useNinki, restoreSession } from "@/lib/ninki/store";
import { disconnectSocket } from "@/lib/ws/socket";
import { useConfig } from "@/lib/api/hooks";
import { DEMO_MODE } from "@/lib/ninki/demo-data";

export function AppShell() {
  const user = useNinki((s) => s.user);
  // N'envoie la requête /config que si l'utilisateur est authentifié (endpoint protégé JWT)
  // et qu'il y a un vrai backend à interroger (pas en démo statique)
  const { data: config } = useConfig(!!user && !DEMO_MODE);
  const simulationMode = config?.simulationMode ?? false;
  const loadInitialData = useNinki((s) => s.loadInitialData);
  const connectWebSocket = useNinki((s) => s.connectWebSocket);
  const fetchWeather = useNinki((s) => s.fetchWeather);
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  // Blocks auth guard until session restore attempt is complete, preventing
  // a premature redirect to /login before the stored token is validated.
  const [sessionReady, setSessionReady] = useState(!!user);

  useEffect(() => {
    if (user) {
      setSessionReady(true);
      return;
    }
    restoreSession()
      .catch(() => {})
      .finally(() => setSessionReady(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load data + connect WS when user is authenticated
  useEffect(() => {
    if (!user) return;
    loadInitialData().catch(console.error);
    connectWebSocket();
    return () => { disconnectSocket(); };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh weather when internet comes back
  useEffect(() => {
    if (!user) return;
    const onOnline = () => fetchWeather().catch(() => {});
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [user?.id, fetchWeather]);

  // Auth + role guards — only run once session restore is done
  useEffect(() => {
    if (!sessionReady) return;
    if (!user && path !== "/login") {
      navigate({ to: "/login" });
      return;
    }
    if (user?.mustChangePassword && path !== "/change-password") {
      navigate({ to: "/change-password" });
      return;
    }
    if (user?.role === "RESPONSABLE" && user.pieces.length > 0 && !user.mustChangePassword) {
      if (!path.startsWith("/pieces/")) {
        navigate({ to: "/pieces/$pieceId", params: { pieceId: user.pieces[0].id } });
      }
    }
  }, [sessionReady, user, path, navigate]);

  // While the session restore is in flight, show nothing to avoid layout flash
  if (!sessionReady) return null;

  if (path === "/login" || path === "/change-password") return <Outlet />;
  if (!user) return null;

  const SimBanner = simulationMode ? (
    <div style={{
      background: "#FFB800", color: "#0A0E1A", textAlign: "center",
      padding: "4px", fontSize: "11px", fontFamily: "monospace",
      fontWeight: "bold", letterSpacing: "0.1em",
    }}>
      ⚠ MODE SIMULATION ACTIF — Données non réelles
    </div>
  ) : null;

  const DemoBanner = DEMO_MODE ? (
    <div style={{
      background: "#FFB800", color: "#0A0E1A", textAlign: "center",
      padding: "3px 12px", fontSize: "10px", fontFamily: "monospace",
      letterSpacing: "0.05em",
    }}>
      ⚠ MODE DÉMO — Données simulées à des fins de présentation
    </div>
  ) : null;

  if (user.role === "RESPONSABLE") {
    return <>{DemoBanner}{SimBanner}<Outlet /></>;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {DemoBanner}
      {SimBanner}
      <Topbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

