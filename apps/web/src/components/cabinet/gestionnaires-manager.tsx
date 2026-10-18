import { Users } from 'lucide-react';
import { InviteGestionnaire } from '@/components/dashboard/invite-gestionnaire';
import { InvitationActions } from '@/components/cabinet/invitation-actions';
import { GestionnaireActions } from '@/components/cabinet/gestionnaire-actions';
import { GestionnaireRestore } from '@/components/cabinet/gestionnaire-restore';
import { GESTIONNAIRE_RESTORE_WINDOW_DAYS } from '@/lib/gestionnaire-retention';
import { ACCOUNT_DELETION_RETENTION_DAYS } from '@/lib/account-retention';
import type {
  ArchivedGestionnaireRow,
  SelfDeletedGestionnaireRow,
  GestionnaireRow,
  InvitationRow,
  InvitationStatus,
} from '@/lib/cabinet-data';

const INVITATION_LABELS: Record<InvitationStatus, string> = {
  pending: 'En attente',
  accepted: 'Acceptée',
  expired: 'Expirée',
  revoked: 'Révoquée',
};

const INVITATION_BADGE: Record<InvitationStatus, string> = {
  pending: 'bg-primary/10 text-primary',
  accepted: 'bg-secondary/10 text-secondary',
  expired: 'bg-muted text-muted-foreground',
  revoked: 'bg-muted text-muted-foreground',
};

const formatDate = (date: Date) => date.toLocaleDateString('fr-BE');

// Presentation pure : recoit les lignes deja lues (cabinet-data.ts), sans
// acces donnees, pour rester testable sans base. Les actions sur les
// invitations (renvoyer, revoquer) vivent dans InvitationActions, celles sur
// les gestionnaires (suspendre, reactiver, retirer - D52) dans
// GestionnaireActions.
export function GestionnairesManager({
  gestionnaires,
  invitations,
  archived,
  selfDeleted = [],
  userQuota,
}: {
  gestionnaires: GestionnaireRow[];
  invitations: InvitationRow[];
  archived: ArchivedGestionnaireRow[];
  // Comptes supprimes par la personne elle-meme : information seulement.
  selfDeleted?: SelfDeletedGestionnaireRow[];
  // Places utilisees / maximum du plan (D15) ; absent = aucun quota connu.
  userQuota?: { used: number; limit: number | null; pendingPlan?: string | null };
}) {
  return (
    <div className="space-y-6">
      <InviteGestionnaire quota={userQuota} />

      <section className="rounded-2xl border border-border bg-card">
        <header className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-bold text-foreground">Gestionnaires RH</h2>
        </header>
        {gestionnaires.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Aucun gestionnaire pour le moment. Invitez-en un ci-dessus.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {gestionnaires.map((g) => (
              <li key={g.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{g.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{g.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:shrink-0 sm:justify-end">
                  <span
                    className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${
                      g.status === 'actif'
                        ? 'bg-secondary/10 text-secondary'
                        : 'bg-destructive/10 text-destructive-text'
                    }`}
                  >
                    {g.status === 'actif' ? 'Actif' : 'Suspendu'}
                  </span>
                  <GestionnaireActions
                    gestionnaireId={g.id}
                    name={g.name}
                    email={g.email}
                    status={g.status}
                    reactivatableByCabinet={g.reactivatableByCabinet}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card">
        <header className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-bold text-foreground">Invitations</h2>
        </header>
        {invitations.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            Aucune invitation envoyée.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {inv.status === 'pending'
                      ? `Expire le ${formatDate(inv.expiresAt)}`
                      : `Envoyée le ${formatDate(inv.createdAt)}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:shrink-0 sm:justify-end">
                  <span
                    className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${INVITATION_BADGE[inv.status]}`}
                  >
                    {INVITATION_LABELS[inv.status]}
                  </span>
                  <InvitationActions invitationId={inv.id} email={inv.email} status={inv.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selfDeleted.length > 0 && (
        <section className="rounded-2xl border border-border bg-card">
          <header className="border-b border-border px-4 py-4 sm:px-5">
            <h2 className="text-sm font-bold text-foreground">Comptes supprimés par la personne</h2>
            <p className="text-xs text-muted-foreground">
              Ces gestionnaires ont supprimé eux-mêmes leur compte : vous ne pouvez pas le restaurer.
              Seule l&apos;administration SocialFlow le peut, jusqu&apos;à la suppression définitive.
            </p>
          </header>
          <ul className="divide-y divide-border">
            {selfDeleted.map((s) => (
              <li key={s.id} className="flex flex-col gap-1 px-4 py-3 sm:px-5">
                <p className="truncate text-sm font-semibold text-foreground">{s.name}</p>
                <p className="truncate text-xs text-muted-foreground">{s.email}</p>
                <p className="text-xs text-muted-foreground">
                  A supprimé son compte le {formatDate(s.deletedAt)} · suppression définitive le{' '}
                  {formatDate(
                    new Date(
                      s.deletedAt.getTime() + ACCOUNT_DELETION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
                    ),
                  )}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {archived.length > 0 && (
        <section className="rounded-2xl border border-border bg-card">
          <header className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-bold text-foreground">Gestionnaires retirés</h2>
            <p className="text-xs text-muted-foreground">
              Restaurables pendant {GESTIONNAIRE_RESTORE_WINDOW_DAYS} jours après leur retrait.
            </p>
          </header>
          <ul className="divide-y divide-border">
            {archived.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{a.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{a.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Retiré le {formatDate(a.deletedAt)} · restaurable jusqu&apos;au{' '}
                    {formatDate(a.restorableUntil)}
                  </p>
                </div>
                <GestionnaireRestore gestionnaireId={a.id} name={a.name} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
