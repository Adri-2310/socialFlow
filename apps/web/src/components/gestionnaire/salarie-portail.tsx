'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, MailX, Send, UserCheck } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ERROR_MESSAGES, FALLBACK } from '@/lib/salarie/form-messages';
import { Notice } from '@/components/shared/notice';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

// Les dates de dossier n'ont pas d'heure : on les lit en UTC pour ne pas les décaler d'un jour.
const formatDate = (iso: string) => new Date(iso).toLocaleDateString('fr-BE', { timeZone: 'UTC' });

type Etat =
  | { etat: 'AUCUNE' }
  | { etat: 'EN_ATTENTE'; expiresAt: string }
  | { etat: 'EXPIREE'; expiresAt: string }
  | { etat: 'COMPTE_ACTIF' };

// Accès du salarié à son espace (roles/03 § 4.3) : inviter, renvoyer, révoquer. L'invitation est
// facultative : sans compte, le salarié reçoit tout de même ses fiches par lien sécurisé (D12).
// L'adresse d'envoi est celle du dossier ; elle n'est jamais affichée ici. `readOnly` évite un
// aller-retour inutile : le serveur reste seul juge (423).
export function SalariePortail({
  salarieId,
  etat,
  aUnEmail,
  readOnly,
}: {
  salarieId: string;
  etat: Etat;
  aUnEmail: boolean;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [revoquer, setRevoquer] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [avertissement, setAvertissement] = useState<string | null>(null);

  async function appeler(methode: 'POST' | 'DELETE') {
    setLoading(true);
    setErreur(null);
    setAvertissement(null);
    try {
      const res = await fetch(`/api/salaries/${salarieId}/invitation`, { method: methode });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setErreur(ERROR_MESSAGES[body?.error] ?? FALLBACK);
        return;
      }
      // L'invitation existe même si l'email n'est pas parti : on le dit, pour la renvoyer.
      if (methode === 'POST' && body?.emailSent === false) {
        setAvertissement(
          'L’invitation est créée, mais l’email n’a pas pu être envoyé. Utilisez « Renvoyer ».',
        );
      }
      router.refresh();
    } catch {
      setErreur(FALLBACK);
    } finally {
      setLoading(false);
      setRevoquer(false);
    }
  }

  const desactive = readOnly || loading;
  const inviter = (libelle: string) => (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => appeler('POST')}
      disabled={desactive || !aUnEmail}
      title={readOnly ? 'Votre cabinet est en lecture seule.' : undefined}
      className="text-xs"
    >
      {loading ? <Spinner /> : <Send aria-hidden="true" />}
      {libelle}
    </Button>
  );

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground">Accès au portail salarié</h3>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 text-sm">
          {etat.etat === 'COMPTE_ACTIF' ? (
            <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          ) : etat.etat === 'EXPIREE' ? (
            <MailX className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          ) : (
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <div>
            {etat.etat === 'COMPTE_ACTIF' && (
              <>
                <p className="font-semibold text-foreground">Compte actif</p>
                <p className="text-muted-foreground">
                  Le salarié a créé son compte et accède à son espace.
                </p>
              </>
            )}
            {etat.etat === 'EN_ATTENTE' && (
              <>
                <p className="font-semibold text-foreground">Invitation envoyée</p>
                <p className="text-muted-foreground">
                  Le lien est valable jusqu’au {formatDate(etat.expiresAt)}.
                </p>
              </>
            )}
            {etat.etat === 'EXPIREE' && (
              <>
                <p className="font-semibold text-foreground">Invitation expirée</p>
                <p className="text-muted-foreground">
                  Le lien a expiré le {formatDate(etat.expiresAt)} : renvoyez l’invitation.
                </p>
              </>
            )}
            {etat.etat === 'AUCUNE' && (
              <>
                <p className="font-semibold text-foreground">Pas de compte</p>
                <p className="text-muted-foreground">
                  {aUnEmail
                    ? 'L’invitation est facultative : sans compte, le salarié reçoit tout de même ses fiches de paie par lien sécurisé.'
                    : 'Ajoutez l’email du salarié (bouton « Modifier ») pour pouvoir l’inviter. Il recevra ses fiches de paie par lien sécurisé dans tous les cas.'}
                </p>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {etat.etat === 'AUCUNE' && inviter('Inviter au portail')}
          {(etat.etat === 'EN_ATTENTE' || etat.etat === 'EXPIREE') && inviter('Renvoyer')}
          {etat.etat === 'EN_ATTENTE' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRevoquer(true)}
              disabled={desactive}
              className="text-xs"
            >
              Révoquer
            </Button>
          )}
        </div>
      </div>

      {avertissement && (
        <Notice tone="warning" className="mt-3">
          {avertissement}
        </Notice>
      )}
      {erreur && (
        <p role="alert" className="mt-3 text-sm text-destructive-text">
          {erreur}
        </p>
      )}

      {revoquer && (
        <ConfirmDialog
          title="Révoquer l’invitation ?"
          description="Le lien envoyé au salarié ne fonctionnera plus. Vous pourrez l’inviter de nouveau. L’action est inscrite à l’audit."
          confirmLabel="Révoquer l’invitation"
          loading={loading}
          onCancel={() => setRevoquer(false)}
          onConfirm={() => appeler('DELETE')}
        />
      )}
    </section>
  );
}
