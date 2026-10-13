import { Users } from 'lucide-react';
import { InviteGestionnaire } from '@/components/dashboard/invite-gestionnaire';
import type { GestionnaireRow, InvitationRow, InvitationStatus } from '@/lib/cabinet-data';

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
// acces donnees, pour rester testable sans base. Les actions (renvoyer,
// revoquer, desactiver) arrivent dans les etapes suivantes.
export function GestionnairesManager({
  gestionnaires,
  invitations,
}: {
  gestionnaires: GestionnaireRow[];
  invitations: InvitationRow[];
}) {
  return (
    <div className="space-y-6">
      <InviteGestionnaire />

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
              <li key={g.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{g.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{g.email}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    g.status === 'actif'
                      ? 'bg-secondary/10 text-secondary'
                      : 'bg-destructive/10 text-destructive'
                  }`}
                >
                  {g.status === 'actif' ? 'Actif' : 'Suspendu'}
                </span>
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
              <li key={inv.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {inv.status === 'pending'
                      ? `Expire le ${formatDate(inv.expiresAt)}`
                      : `Envoyée le ${formatDate(inv.createdAt)}`}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${INVITATION_BADGE[inv.status]}`}
                >
                  {INVITATION_LABELS[inv.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
