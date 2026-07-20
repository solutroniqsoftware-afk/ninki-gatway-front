import { createFileRoute } from "@tanstack/react-router";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Copy,
  KeyRound,
  Lock,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  Unlock,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useResponsables, usePieces, type BackendUser } from "@/lib/api/hooks";

export const Route = createFileRoute("/admin/responsables")({
  component: ResponsablesPage,
  head: () => ({ meta: [{ title: "Gestion des responsables · NINKI GATEWAY" }] }),
});

type Grade = "Soldat" | "Caporal" | "Sergent" | "Sergent-chef" | "Adjudant" | "Lieutenant";
type ResponsableStatus = "actif" | "suspendu" | "premiere_connexion";
type StatusFilter = "all" | "actif" | "suspendu" | "non_assigne";
type SortKey = "nom" | "statut" | "derniereConnexion";
type ModalState =
  | { type: "create" }
  | { type: "edit"; responsable: Responsable }
  | { type: "reset"; responsable: Responsable }
  | { type: "suspend"; responsable: Responsable }
  | { type: "delete"; responsable: Responsable }
  | { type: "password"; password: string; responsable: Responsable };

interface Responsable {
  id: string;
  nom: string;
  prenom: string;
  grade: Grade;
  identifiant: string;
  pieces: string[];
  statut: ResponsableStatus;
  mustChangePassword: boolean;
  derniereConnexion: Date | null;
}

interface PieceDisponible {
  id: string;
  nom: string;
  libre: boolean;
  assigneA?: string;
}

const GRADES: Grade[] = ["Soldat", "Caporal", "Sergent", "Sergent-chef", "Adjudant", "Lieutenant"];

const PAGE_SIZE = 10;

function mapUser(u: BackendUser): Responsable {
  let statut: ResponsableStatus = "actif";
  if (!u.isActive) statut = "suspendu";
  else if (u.mustChangePassword) statut = "premiere_connexion";
  return {
    id: u.id,
    nom: u.nom,
    prenom: u.prenom,
    grade: u.grade as Grade,
    identifiant: u.identifiant,
    pieces: u.pieces.map((p) => p.nom),
    statut,
    mustChangePassword: u.mustChangePassword,
    derniereConnexion: null,
  };
}

function ResponsablesPage() {
  const {
    data: apiResponsables,
    create: apiCreate,
    update: apiUpdate,
    remove: apiRemove,
    suspend: apiSuspend,
    reactivate: apiReactivate,
    resetPassword: apiResetPassword,
  } = useResponsables();
  const { data: apiPieces } = usePieces();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({
    key: "nom",
    direction: "asc",
  });
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<ModalState | null>(null);

  const responsables: Responsable[] = useMemo(
    () => apiResponsables.map(mapUser),
    [apiResponsables],
  );

  const piecesDisponibles: PieceDisponible[] = useMemo(
    () =>
      apiPieces.map((p) => {
        const assignedUser = apiResponsables.find((r) => r.pieces.some((rp) => rp.id === p.id));
        return {
          id: p.id,
          nom: p.nom,
          libre: !p.responsableId,
          assigneA: assignedUser?.identifiant,
        };
      }),
    [apiPieces, apiResponsables],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return responsables
      .filter((responsable) => {
        const matchSearch =
          responsable.nom.toLowerCase().includes(term) ||
          responsable.prenom.toLowerCase().includes(term) ||
          responsable.identifiant.toLowerCase().includes(term);
        const matchFilter =
          filter === "all" ||
          (filter === "non_assigne" && responsable.pieces.length === 0) ||
          (filter === "actif" && responsable.statut === "actif") ||
          (filter === "suspendu" && responsable.statut === "suspendu");
        return matchSearch && matchFilter;
      })
      .sort((a, b) => {
        const direction = sort.direction === "asc" ? 1 : -1;
        if (sort.key === "derniereConnexion") {
          return (
            ((a.derniereConnexion?.getTime() ?? 0) - (b.derniereConnexion?.getTime() ?? 0)) *
            direction
          );
        }
        if (sort.key === "statut") return a.statut.localeCompare(b.statut) * direction;
        return `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`) * direction;
      });
  }, [filter, responsables, search, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  };

  const saveResponsable = async (input: ResponsableFormValue, editing?: Responsable) => {
    // Map piece names → IDs for the API
    const pieceIds = input.pieces
      .map((name) => apiPieces.find((p) => p.nom === name)?.id)
      .filter(Boolean) as string[];

    if (editing) {
      await apiUpdate(editing.id, {
        nom: input.nom,
        prenom: input.prenom,
        grade: input.grade,
        pieceIds,
      });
      setModal(null);
      return;
    }

    const result = await apiCreate({
      nom: input.nom,
      prenom: input.prenom,
      grade: input.grade,
      identifiant: input.identifiant,
      role: "RESPONSABLE",
      pieceIds,
    });

    const newResponsable: Responsable = {
      id: result.id,
      nom: input.nom,
      prenom: input.prenom,
      grade: input.grade,
      identifiant: result.identifiant,
      pieces: input.pieces,
      statut: "premiere_connexion",
      mustChangePassword: true,
      derniereConnexion: null,
    };
    setModal({ type: "password", password: result.tempPassword, responsable: newResponsable });
  };

  const toggleSuspension = async (responsable: Responsable) => {
    if (responsable.statut === "suspendu") {
      await apiReactivate(responsable.id);
    } else {
      await apiSuspend(responsable.id);
    }
    setModal(null);
  };

  const resetPassword = async (responsable: Responsable) => {
    const result = await apiResetPassword(responsable.id);
    const updated: Responsable = {
      ...responsable,
      statut: "premiere_connexion",
      mustChangePassword: true,
    };
    setModal({ type: "password", password: result.tempPassword, responsable: updated });
  };

  const deleteResponsable = async (responsable: Responsable) => {
    await apiRemove(responsable.id);
    setModal(null);
  };

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-[0.15em] uppercase">
            Gestion des <span className="text-[color:var(--cyan-live)]">responsables</span>
          </h1>
          <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
            Création manuelle, affectation des pièces et contrôle des accès de la batterie.
          </p>
        </div>
        <button
          onClick={() => setModal({ type: "create" })}
          className="inline-flex items-center gap-2 rounded border border-[color:var(--cyan-live)]/40 bg-[color:var(--cyan-live)]/10 px-4 py-2 text-sm font-mono uppercase tracking-[0.16em] text-[color:var(--cyan-live)] hover:bg-[color:var(--cyan-live)]/20"
        >
          <Plus className="h-4 w-4" />
          Nouveau responsable
        </button>
      </div>

      <div className="glass rounded-md p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-[280px] flex-1 items-center gap-2 rounded border border-[color:var(--border-steel)] bg-[color:var(--bg-base)]/60 px-3 py-2">
            <Search className="h-4 w-4 text-[color:var(--cyan-live)]" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Rechercher nom ou identifiant..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-[color:var(--text-disabled)]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "Tous"],
              ["actif", "Actifs"],
              ["suspendu", "Suspendus"],
              ["non_assigne", "Non assignés"],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => {
                  setFilter(value as StatusFilter);
                  setPage(1);
                }}
                className={`rounded border px-3 py-2 text-xs uppercase tracking-wider transition ${
                  filter === value
                    ? "border-[color:var(--cyan-live)] bg-[color:var(--cyan-live)]/10 text-[color:var(--cyan-live)]"
                    : "border-[color:var(--border-steel)] text-[color:var(--text-secondary)] hover:border-[color:var(--cyan-live)]/40"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="panel scanlines overflow-hidden">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-[color:var(--bg-secondary)]/80 text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">
            <tr>
              <th className="px-3 py-3 text-left font-medium">#</th>
              <SortableTh label="Responsable" onClick={() => toggleSort("nom")} />
              <th className="px-3 py-3 text-left font-medium">Grade</th>
              <th className="px-3 py-3 text-left font-medium">Pièce(s) assignée(s)</th>
              <SortableTh label="Statut" onClick={() => toggleSort("statut")} />
              <SortableTh
                label="Dernière connexion"
                onClick={() => toggleSort("derniereConnexion")}
              />
              <th className="px-3 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((responsable, index) => (
              <tr
                key={responsable.id}
                className={`border-t border-[color:var(--border-steel)]/50 transition hover:bg-[color:var(--bg-elevated)]/40 ${
                  responsable.statut === "suspendu" ? "opacity-55 grayscale" : ""
                }`}
              >
                <td className="px-3 py-3 font-mono text-xs text-[color:var(--text-secondary)]">
                  {(currentPage - 1) * PAGE_SIZE + index + 1}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-full border border-[color:var(--cyan-live)]/40 bg-[color:var(--cyan-live)]/10 font-mono text-xs text-[color:var(--cyan-live)]">
                      {initiales(responsable)}
                    </div>
                    <div>
                      <div className="font-medium">
                        {shortGrade(responsable.grade)} {responsable.prenom} {responsable.nom}
                      </div>
                      <div className="font-mono text-xs text-[color:var(--text-secondary)]">
                        {responsable.identifiant}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">{responsable.grade}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {responsable.pieces.length === 0 ? (
                      <span className="rounded border border-[color:var(--warning)]/40 bg-[color:var(--warning)]/10 px-2 py-1 font-mono text-[10px] text-[color:var(--warning)]">
                        Non assigné
                      </span>
                    ) : (
                      responsable.pieces.map((piece) => (
                        <span
                          key={piece}
                          className="rounded border border-[color:var(--cyan-live)]/30 bg-[color:var(--cyan-live)]/10 px-2 py-1 font-mono text-[10px] text-[color:var(--cyan-live)]"
                        >
                          {piece}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <StatusBadge responsable={responsable} />
                </td>
                <td className="px-3 py-3 font-mono text-xs text-[color:var(--text-secondary)]">
                  {formatLastConnection(responsable.derniereConnexion)}
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-2">
                    <IconButton
                      title="Modifier"
                      onClick={() => setModal({ type: "edit", responsable })}
                    >
                      <Pencil className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      title={responsable.statut === "suspendu" ? "Réactiver" : "Suspendre"}
                      onClick={() =>
                        responsable.statut === "suspendu"
                          ? toggleSuspension(responsable)
                          : setModal({ type: "suspend", responsable })
                      }
                    >
                      {responsable.statut === "suspendu" ? (
                        <Unlock className="h-4 w-4" />
                      ) : (
                        <Lock className="h-4 w-4" />
                      )}
                    </IconButton>
                    <IconButton
                      title="Réinitialiser mot de passe"
                      onClick={() => setModal({ type: "reset", responsable })}
                    >
                      <KeyRound className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      title="Supprimer"
                      onClick={() => setModal({ type: "delete", responsable })}
                      danger
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-10 text-center text-sm text-[color:var(--text-secondary)]"
                >
                  Aucun responsable ne correspond à la recherche.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-[color:var(--border-steel)] bg-[color:var(--bg-secondary)]/50 px-4 py-3">
          <span className="font-mono text-xs text-[color:var(--text-secondary)]">
            Page {currentPage} / {pageCount} · {filtered.length} responsable(s)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={currentPage === 1}
              className="rounded border border-[color:var(--border-steel)] p-2 text-[color:var(--text-secondary)] disabled:opacity-35"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              disabled={currentPage === pageCount}
              className="rounded border border-[color:var(--border-steel)] p-2 text-[color:var(--text-secondary)] disabled:opacity-35"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {(modal?.type === "create" || modal?.type === "edit") && (
        <ResponsableFormModal
          responsables={responsables}
          piecesDisponibles={piecesDisponibles}
          editing={modal.type === "edit" ? modal.responsable : undefined}
          onClose={() => setModal(null)}
          onSave={saveResponsable}
        />
      )}

      {modal?.type === "reset" && (
        <ConfirmModal
          title="Réinitialiser le mot de passe"
          responsable={modal.responsable}
          body="Un nouveau mot de passe temporaire sera généré et devra être communiqué en main propre au responsable."
          actionLabel="Générer nouveau mdp"
          tone="cyan"
          onCancel={() => setModal(null)}
          onConfirm={() => resetPassword(modal.responsable)}
        />
      )}

      {modal?.type === "suspend" && (
        <ConfirmModal
          title="Suspendre le compte"
          responsable={modal.responsable}
          body="Le responsable sera immédiatement déconnecté et ne pourra plus accéder à la plateforme."
          actionLabel="Suspendre"
          tone="danger"
          onCancel={() => setModal(null)}
          onConfirm={() => toggleSuspension(modal.responsable)}
        />
      )}

      {modal?.type === "delete" && (
        <ConfirmModal
          title="Supprimer le compte"
          responsable={modal.responsable}
          body="Le compte sera supprimé définitivement. Les pièces assignées seront libérées. Cette action est irréversible."
          actionLabel="Supprimer définitivement"
          tone="danger"
          onCancel={() => setModal(null)}
          onConfirm={() => deleteResponsable(modal.responsable)}
        />
      )}

      {modal?.type === "password" && (
        <PasswordModal
          password={modal.password}
          responsable={modal.responsable}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

interface ResponsableFormValue {
  nom: string;
  prenom: string;
  grade: Grade;
  identifiant: string;
  pieces: string[];
}

function ResponsableFormModal({
  responsables,
  piecesDisponibles,
  editing,
  onClose,
  onSave,
}: {
  responsables: Responsable[];
  piecesDisponibles: PieceDisponible[];
  editing?: Responsable;
  onClose: () => void;
  onSave: (value: ResponsableFormValue, editing?: Responsable) => void;
}) {
  const [nom, setNom] = useState(editing?.nom ?? "");
  const [prenom, setPrenom] = useState(editing?.prenom ?? "");
  const [grade, setGrade] = useState<Grade>(editing?.grade ?? "Sergent");
  const [identifiant, setIdentifiant] = useState(editing?.identifiant ?? "");
  const [pieces, setPieces] = useState<string[]>(editing?.pieces ?? []);
  const [submitted, setSubmitted] = useState(false);

  const suggestedIdentifiant = useMemo(() => {
    if (!prenom || !nom) return "";
    return `${prenom[0]}.${nom}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }, [nom, prenom]);

  const identifierValid = /^[a-zA-Z0-9.]{3,}$/.test(identifiant);
  const identifierUsed = responsables.some(
    (responsable) => responsable.identifiant === identifiant && responsable.id !== editing?.id,
  );
  const canSave =
    nom.trim() && prenom.trim() && identifiant.trim() && identifierValid && !identifierUsed;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!canSave) return;
    onSave(
      {
        nom: nom.trim(),
        prenom: prenom.trim(),
        grade,
        identifiant: identifiant.trim(),
        pieces,
      },
      editing,
    );
  };

  return (
    <ModalFrame
      title={editing ? "Modifier un responsable" : "Créer un responsable"}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nom *" invalid={submitted && !nom.trim()}>
            <input
              value={nom}
              onChange={(event) => setNom(event.target.value)}
              className="form-input"
            />
          </Field>
          <Field label="Prénom *" invalid={submitted && !prenom.trim()}>
            <input
              value={prenom}
              onChange={(event) => setPrenom(event.target.value)}
              className="form-input"
            />
          </Field>
        </div>
        <Field label="Grade militaire">
          <select
            value={grade}
            onChange={(event) => setGrade(event.target.value as Grade)}
            className="form-input"
          >
            {GRADES.map((item) => (
              <option key={item} value={item} className="bg-[color:var(--bg-elevated)]">
                {item}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Identifiant *" invalid={submitted && (!identifierValid || identifierUsed)}>
          <div className="flex items-center gap-2">
            <input
              value={identifiant}
              disabled={!!editing}
              onChange={(event) => setIdentifiant(event.target.value)}
              className="form-input font-mono disabled:opacity-55"
              placeholder={suggestedIdentifiant || "i.diallo"}
            />
            {!editing && suggestedIdentifiant && (
              <button
                type="button"
                onClick={() => setIdentifiant(suggestedIdentifiant)}
                className="rounded border border-[color:var(--cyan-live)]/30 px-2 py-2 text-[10px] uppercase tracking-wider text-[color:var(--cyan-live)]"
              >
                Suggérer
              </button>
            )}
          </div>
          {!editing && identifiant && (
            <div
              className={`mt-1 font-mono text-[10px] ${identifierUsed || !identifierValid ? "text-[color:var(--danger)]" : "text-[color:var(--success)]"}`}
            >
              {identifierUsed ? "Déjà utilisé" : identifierValid ? "Disponible" : "Format invalide"}
            </div>
          )}
        </Field>
        <Field label="Pièce(s)">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {piecesDisponibles.map((piece) => {
              const selected = pieces.includes(piece.nom);
              const ownedByEditing = editing?.pieces.includes(piece.nom);
              const disabled = !piece.libre && !ownedByEditing;
              return (
                <label
                  key={piece.id}
                  className={`flex cursor-pointer items-center justify-between rounded border px-3 py-2 text-sm ${
                    selected
                      ? "border-[color:var(--cyan-live)] bg-[color:var(--cyan-live)]/10"
                      : "border-[color:var(--border-steel)] bg-[color:var(--bg-base)]/60"
                  } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
                >
                  <span>
                    {piece.nom}{" "}
                    <span className="text-[10px] text-[color:var(--text-secondary)]">
                      {disabled ? `(déjà assignée à ${piece.assigneA})` : "(libre)"}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={selected}
                    onChange={(event) =>
                      setPieces((current) =>
                        event.target.checked
                          ? [...current, piece.nom]
                          : current.filter((item) => item !== piece.nom),
                      )
                    }
                  />
                </label>
              );
            })}
          </div>
          {pieces.length === 0 && (
            <div className="mt-2 rounded border border-[color:var(--warning)]/40 bg-[color:var(--warning)]/10 px-3 py-2 text-xs text-[color:var(--warning)]">
              Avertissement : au moins une pièce assignée est recommandée.
            </div>
          )}
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Annuler
          </button>
          <button type="submit" className="btn-primary">
            {editing ? "Enregistrer" : "Créer le compte"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

function PasswordModal({
  password,
  responsable,
  onClose,
}: {
  password: string;
  responsable: Responsable;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <ModalFrame title="Mot de passe temporaire" onClose={onClose} danger>
      <div className="rounded border border-[color:var(--danger)]/50 bg-[color:var(--danger)]/10 p-4">
        <div className="flex items-center gap-2 text-[color:var(--danger)]">
          <ShieldAlert className="h-5 w-5" />
          <span className="text-sm font-bold uppercase tracking-[0.16em]">
            Mot de passe temporaire — à communiquer en main propre
          </span>
        </div>
        <div className="mt-3 text-sm text-[color:var(--text-secondary)]">
          Responsable : {shortGrade(responsable.grade)} {responsable.prenom} {responsable.nom}
        </div>
        <div className="my-5 rounded border border-[color:var(--danger)]/40 bg-[color:var(--bg-base)] p-4 text-center font-mono text-3xl tracking-[0.18em] text-[color:var(--danger)]">
          {password}
        </div>
        <p className="text-sm text-[color:var(--text-secondary)]">
          Ce mot de passe ne sera plus affiché après fermeture.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(password);
              setCopied(true);
            }}
            className="btn-secondary inline-flex items-center gap-2"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copié" : "Copier"}
          </button>
          <button onClick={onClose} className="btn-primary">
            Fermer et continuer
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}

function ConfirmModal({
  title,
  responsable,
  body,
  actionLabel,
  tone,
  onCancel,
  onConfirm,
}: {
  title: string;
  responsable: Responsable;
  body: string;
  actionLabel: string;
  tone: "cyan" | "danger";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalFrame title={title} onClose={onCancel}>
      <div className="space-y-4">
        <div>
          <div className="text-lg font-semibold">
            {shortGrade(responsable.grade)} {responsable.prenom} {responsable.nom}
          </div>
          <div className="font-mono text-xs text-[color:var(--text-secondary)]">
            {responsable.identifiant}
          </div>
        </div>
        <p className="text-sm text-[color:var(--text-secondary)]">{body}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="btn-secondary">
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className={`rounded px-4 py-2 text-sm font-bold uppercase tracking-wider ${
              tone === "danger"
                ? "bg-[color:var(--danger)] text-white"
                : "bg-[color:var(--cyan-live)] text-[color:var(--bg-base)]"
            }`}
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}

function ModalFrame({
  title,
  children,
  onClose,
  danger = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  danger?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="glass w-full max-w-2xl rounded-md p-5 ring-active">
        <div className="mb-4 flex items-center justify-between">
          <h2
            className={`font-mono text-sm uppercase tracking-[0.22em] ${
              danger ? "text-[color:var(--danger)]" : "text-[color:var(--cyan-live)]"
            }`}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  invalid,
  children,
}: {
  label: string;
  invalid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className={`mb-1.5 block text-[10px] uppercase tracking-wider ${invalid ? "text-[color:var(--danger)]" : "text-[color:var(--text-secondary)]"}`}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function SortableTh({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <th className="px-3 py-3 text-left font-medium">
      <button
        onClick={onClick}
        className="inline-flex items-center gap-1 hover:text-[color:var(--cyan-live)]"
      >
        {label}
        <ChevronsUpDown className="h-3 w-3" />
      </button>
    </th>
  );
}

function IconButton({
  title,
  onClick,
  children,
  danger = false,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={
        danger
          ? "rounded border border-[color:var(--danger)]/30 p-2 text-[color:var(--danger)]/60 transition hover:border-[color:var(--danger)] hover:text-[color:var(--danger)]"
          : "rounded border border-[color:var(--border-steel)] p-2 text-[color:var(--text-secondary)] transition hover:border-[color:var(--cyan-live)]/50 hover:text-[color:var(--cyan-live)]"
      }
    >
      {children}
    </button>
  );
}

function StatusBadge({ responsable }: { responsable: Responsable }) {
  if (responsable.statut === "suspendu") {
    return <Badge color="muted" label="Inactif" />;
  }
  if (responsable.statut === "premiere_connexion" || responsable.mustChangePassword) {
    return <Badge color="warning" label="Première connexion" />;
  }
  return <Badge color="success" label="Actif" />;
}

function Badge({ color, label }: { color: "success" | "warning" | "muted"; label: string }) {
  const className =
    color === "success"
      ? "border-[color:var(--success)]/40 bg-[color:var(--success)]/10 text-[color:var(--success)]"
      : color === "warning"
        ? "border-[color:var(--warning)]/40 bg-[color:var(--warning)]/10 text-[color:var(--warning)]"
        : "border-[color:var(--border-steel)] bg-[color:var(--bg-elevated)] text-[color:var(--text-secondary)]";
  return (
    <span className={`rounded border px-2 py-1 font-mono text-[10px] uppercase ${className}`}>
      {label}
    </span>
  );
}

function initiales(responsable: Responsable) {
  return `${responsable.prenom[0] ?? ""}${responsable.nom[0] ?? ""}`.toUpperCase();
}

function shortGrade(grade: Grade) {
  if (grade === "Sergent-chef") return "Sgt.";
  if (grade === "Sergent") return "Sgt.";
  if (grade === "Lieutenant") return "Lt.";
  if (grade === "Adjudant") return "Adj.";
  if (grade === "Caporal") return "Cpl.";
  return "Sdt.";
}

function formatLastConnection(value: Date | null) {
  if (!value) return "Jamais connecté";
  const diff = Date.now() - value.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  return `Il y a ${Math.floor(hours / 24)} j`;
}
