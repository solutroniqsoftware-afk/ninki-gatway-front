import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Shield, Lock, User as UserIcon, AlertCircle, Eye, EyeOff } from "lucide-react";
import { useNinki } from "@/lib/ninki/store";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Connexion · NINKI GATEWAY" }] }),
});

function LoginPage() {
  const navigate = useNavigate();
  const login = useNinki((s) => s.login);
  const [identifiant, setId] = useState("");
  const [password, setPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPwd, setShowPwd] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifiant || !password) return;

    setLoading(true);
    setError(null);

    try {
      const { mustChangePassword } = await login(identifiant, password);

      if (mustChangePassword) {
        navigate({ to: "/change-password" as any });
        return;
      }

      const user = useNinki.getState().user;
      if (user?.role === "RESPONSABLE" && user.pieces.length > 0) {
        navigate({ to: "/pieces/$pieceId", params: { pieceId: user.pieces[0].id } });
      } else {
        navigate({ to: "/" });
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 423) {
        setError("Compte verrouillé après 5 tentatives. Contactez un administrateur.");
      } else if (status === 401) {
        setError("Identifiant ou mot de passe incorrect.");
      } else {
        setError("Erreur de connexion. Vérifiez le réseau.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none scanlines opacity-60" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,212,255,0.08),transparent_60%)]" />

      <form onSubmit={submit} className="relative w-full max-w-md glass rounded-lg p-8 ring-active">
        <div className="flex flex-col items-center mb-8">
          <div className="relative">
            <Shield className="h-14 w-14 text-[color:var(--cyan-live)] glow-cyan" />
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-[color:var(--success)] pulse-live" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-[0.4em]">
            NINKI <span className="text-[color:var(--cyan-live)]">GATEWAY</span>
          </h1>
          <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-[color:var(--text-secondary)] font-mono">
            Plateforme de Supervision Militaire
          </p>
        </div>

        <div className="space-y-4">
          <Field icon={<UserIcon className="h-4 w-4" />} label="Identifiant">
            <input
              value={identifiant}
              onChange={(e) => setId(e.target.value)}
              className="w-full bg-transparent outline-none font-mono text-[color:var(--text-primary)]"
              autoFocus
              autoComplete="username"
              disabled={loading}
            />
          </Field>
          <Field
            icon={<Lock className="h-4 w-4" />}
            label="Mot de passe"
            action={
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="text-[color:var(--text-secondary)] hover:text-[color:var(--cyan-live)] transition"
                tabIndex={-1}
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          >
            <input
              type={showPwd ? "text" : "password"}
              value={password}
              onChange={(e) => setPwd(e.target.value)}
              className="w-full bg-transparent outline-none font-mono text-[color:var(--text-primary)]"
              autoComplete="current-password"
              disabled={loading}
            />
          </Field>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 px-3 py-2 text-xs text-[color:var(--danger)]">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !identifiant || !password}
          className="mt-6 w-full py-3 rounded bg-gradient-to-r from-[color:var(--cyan-live)] to-[color:var(--blue-signal)] text-[color:var(--bg-base)] font-bold tracking-[0.3em] text-sm uppercase hover:brightness-110 transition relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Authentification…" : "▸ Accéder au Système"}
        </button>
        <p className="mt-4 text-center text-[10px] uppercase tracking-wider text-[color:var(--text-disabled)]">
          Accès réservé au personnel autorisé
        </p>
      </form>
    </div>
  );
}

function Field({
  icon,
  label,
  action,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-secondary)] mb-1.5">
        {label}
      </div>
      <div className="flex items-center gap-2 px-3 py-2.5 rounded border border-[color:var(--border-steel)] bg-[color:var(--bg-secondary)]/60 focus-within:border-[color:var(--cyan-live)] focus-within:ring-active transition">
        <span className="text-[color:var(--cyan-live)]">{icon}</span>
        {children}
        {action && <span className="ml-auto">{action}</span>}
      </div>
    </div>
  );
}
