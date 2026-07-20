import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { apiClient } from "@/lib/api/client";
import { useNinki } from "@/lib/ninki/store";
import { Lock, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/change-password")({
  component: ChangePasswordPage,
  head: () => ({ meta: [{ title: "Changer le mot de passe · NINKI GATEWAY" }] }),
});

function ChangePasswordPage() {
  const navigate = useNavigate();
  const user = useNinki((s) => s.user);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("Le nouveau mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    try {
      await apiClient.patch("/auth/change-password", { currentPassword, newPassword });
      // Mettre à jour le store pour effacer mustChangePassword
      useNinki.setState((s) => s.user ? { user: { ...s.user, mustChangePassword: false } } : {});
      navigate({ to: "/" });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? "Erreur lors du changement de mot de passe.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[color:var(--bg-primary)] px-4">
      <div className="w-full max-w-sm">
        <div className="panel p-8 space-y-6">
          <div className="text-center space-y-1">
            <Lock className="h-8 w-8 mx-auto text-[color:var(--cyan-live)]" />
            <h1 className="text-lg font-semibold tracking-[0.15em] uppercase">
              Changer le mot de passe
            </h1>
            {user?.mustChangePassword && (
              <p className="text-xs font-mono text-[color:var(--warning)]">
                Vous devez définir un nouveau mot de passe avant de continuer.
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider font-mono text-[color:var(--text-secondary)]">
                Mot de passe actuel
              </label>
              <div className="relative">
                <input
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className="w-full bg-[color:var(--bg-card)] border border-[color:var(--border-steel)] rounded px-3 py-2 text-sm font-mono text-[color:var(--text-primary)] pr-10 focus:outline-none focus:border-[color:var(--cyan-live)]"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider font-mono text-[color:var(--text-secondary)]">
                Nouveau mot de passe
              </label>
              <div className="relative">
                <input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full bg-[color:var(--bg-card)] border border-[color:var(--border-steel)] rounded px-3 py-2 text-sm font-mono text-[color:var(--text-primary)] pr-10 focus:outline-none focus:border-[color:var(--cyan-live)]"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider font-mono text-[color:var(--text-secondary)]">
                Confirmer le nouveau mot de passe
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="w-full bg-[color:var(--bg-card)] border border-[color:var(--border-steel)] rounded px-3 py-2 text-sm font-mono text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--cyan-live)]"
              />
            </div>

            {error && (
              <p className="text-xs font-mono text-[color:var(--danger)] border border-[color:var(--danger)]/30 bg-[color:var(--danger)]/08 rounded px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded text-sm font-mono font-semibold uppercase tracking-wider transition"
              style={{
                background: "var(--cyan-live)",
                color: "#0A0E1A",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Enregistrement…" : "Confirmer"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
