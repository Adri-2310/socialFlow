'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mail } from 'lucide-react';

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Session expirée. Reconnectez-vous.',
  FORBIDDEN: "Vous n'êtes pas autorisé à effectuer cette action.",
  INVALID_EMAIL: 'Adresse email invalide.',
  EMAIL_UNCHANGED: "Cette adresse est déjà celle du compte.",
  EMAIL_ALREADY_USED: 'Un compte existe déjà avec cette adresse email.',
  INVITATION_ALREADY_PENDING: 'Une invitation est déjà en attente pour cette adresse.',
  GESTIONNAIRE_NOT_FOUND: 'Ce gestionnaire est introuvable.',
  CABINET_READ_ONLY:
    'Votre cabinet est en lecture seule : régularisez votre abonnement pour reprendre les modifications.',
};

// Modification de l'adresse de connexion d'un gestionnaire (D53). Le serveur
// remet l'adresse a "non verifiee", coupe ses sessions et envoie un email de
// confirmation : on le dit clairement avant de valider.
export function EditEmailDialog({
  gestionnaireId,
  name,
  currentEmail,
  onClose,
}: {
  gestionnaireId: string;
  name: string;
  currentEmail: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(currentEmail);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch(`/api/gestionnaires/${gestionnaireId}/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(ERROR_MESSAGES[body?.error] ?? 'Une erreur est survenue. Veuillez réessayer.');
      return;
    }

    const body = await res.json().catch(() => null);
    router.refresh();

    // L'adresse est deja changee ; si l'email de confirmation n'est pas parti,
    // on le signale plutot que de fermer en silence.
    if (body?.verificationEmailSent === false) {
      setWarning(
        "L'adresse a été modifiée, mais l'email de confirmation n'a pas pu être envoyé. Le gestionnaire pourra le redemander depuis son profil.",
      );
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-6"
      >
        <div className="flex items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Mail className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Modifier l&apos;email de {name}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              C&apos;est l&apos;adresse de connexion du gestionnaire. Il devra confirmer la
              nouvelle adresse par email, ses sessions en cours seront fermées et l&apos;ancienne
              adresse sera prévenue.
            </p>
          </div>
        </div>

        <label
          htmlFor={`edit-email-${gestionnaireId}`}
          className="mt-5 block text-sm font-medium text-foreground"
        >
          Nouvelle adresse email
        </label>
        <input
          id={`edit-email-${gestionnaireId}`}
          type="email"
          autoComplete="off"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading || warning !== null}
          className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base text-foreground sm:text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        />

        {error && <p className="mt-2 text-sm text-destructive-text">{error}</p>}
        {warning && <p className="mt-2 text-sm text-muted-foreground">{warning}</p>}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-input px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {warning ? 'Fermer' : 'Annuler'}
          </button>
          {!warning && (
            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Enregistrer
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
