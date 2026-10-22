import { AlertTriangle, Building2 } from 'lucide-react';
import { EntrepriseActions } from '@/components/cabinet/entreprise-actions';
import { EntrepriseAdminInvite } from '@/components/cabinet/entreprise-admin-invite';
import { EntrepriseAdminRemove } from '@/components/cabinet/entreprise-admin-remove';
import { InvitationActions } from '@/components/cabinet/invitation-actions';
import { EntrepriseCreate } from '@/components/cabinet/entreprise-create';
import { EntrepriseRestore } from '@/components/cabinet/entreprise-restore';
import type { GestionnaireOption } from '@/components/cabinet/entreprise-form-dialog';
import type { ArchivedEntrepriseRow, EntrepriseRow } from '@/lib/entreprise/cabinet-entreprises';
import type { CountryOption } from '@/lib/countries';

const formatDate = (date: Date) => date.toLocaleDateString('fr-BE');

// Administrateur de l'entreprise (D5) : son compte, l'invitation en cours
// (renvoyer / revoquer) ou la possibilite d'en inviter un.
function AdminBlock({ entreprise: e, readOnly }: { entreprise: EntrepriseRow; readOnly: boolean }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-muted/40 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-xs">
        <p className="font-semibold text-foreground">Administrateur</p>
        {e.admin ? (
          <p className="truncate text-muted-foreground">
            {e.admin.name} · {e.admin.email}
            {e.adminInvitation &&
              ` · remplaçant invité : ${e.adminInvitation.email} (${
                e.adminInvitation.status === 'pending' ? `expire le ${formatDate(e.adminInvitation.expiresAt)}` : 'invitation expirée'
              })`}
          </p>
        ) : e.adminInvitation ? (
          <p className="text-muted-foreground">
            {e.adminInvitation.status === 'pending'
              ? `Invitation envoyée à ${e.adminInvitation.email} · expire le ${formatDate(e.adminInvitation.expiresAt)}`
              : `Invitation à ${e.adminInvitation.email} expirée le ${formatDate(e.adminInvitation.expiresAt)}`}
          </p>
        ) : (
          <p className="text-muted-foreground">Aucun administrateur pour le moment.</p>
        )}
      </div>
      {e.admin && (
        <div className="flex flex-wrap items-center gap-2">
          {/* D78 : remplacement sans interruption - l'administrateur actuel reste actif jusqu'a
              l'acceptation. Une invitation de remplacement en cours se renvoie ou se revoque. */}
          {e.adminInvitation ? (
            !readOnly && (
              <InvitationActions
                invitationId={e.adminInvitation.id}
                email={e.adminInvitation.email}
                status={e.adminInvitation.status}
              />
            )
          ) : (
            <EntrepriseAdminInvite
              entrepriseId={e.id}
              name={e.name}
              defaultEmail=""
              readOnly={readOnly}
              replace
            />
          )}
          <EntrepriseAdminRemove
            entrepriseId={e.id}
            entrepriseName={e.name}
            adminName={e.admin.name}
            readOnly={readOnly}
          />
        </div>
      )}
      {!e.admin &&
        (e.adminInvitation ? (
          !readOnly && (
            <InvitationActions
              invitationId={e.adminInvitation.id}
              email={e.adminInvitation.email}
              status={e.adminInvitation.status}
            />
          )
        ) : (
          <EntrepriseAdminInvite
            entrepriseId={e.id}
            name={e.name}
            defaultEmail={e.contactEmail ?? ''}
            readOnly={readOnly}
          />
        ))}
    </div>
  );
}

// Presentation : recoit les lignes deja lues (cabinet-entreprises.ts), sans
// acces donnees. Le Cabinet RH ne voit ici que l'identite des entreprises et
// leurs assignations : jamais de salaries ni de fiches (D26).
export function EntreprisesManager({
  entreprises,
  archived,
  gestionnaires,
  countries,
  quota,
  readOnly,
}: {
  entreprises: EntrepriseRow[];
  archived: ArchivedEntrepriseRow[];
  gestionnaires: GestionnaireOption[];
  countries: CountryOption[];
  quota?: { used: number; limit: number | null; pendingPlan?: string | null };
  readOnly: boolean;
}) {
  return (
    <div className="space-y-6">
      <EntrepriseCreate
        countries={countries}
        gestionnaires={gestionnaires}
        quota={quota}
        readOnly={readOnly}
      />

      <section className="rounded-2xl border border-border bg-card">
        <header className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-bold text-foreground">Portefeuille</h2>
        </header>
        {entreprises.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
            <Building2 className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Aucune entreprise cliente pour le moment. Créez-en une ci-dessus.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {entreprises.map((e) => (
              <li key={e.id} className="space-y-3 px-4 py-3 sm:px-5">
               <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{e.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {e.vatNumber}
                    {e.city ? ` · ${e.city}` : ''}
                  </p>
                  {e.gestionnaires.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Gestionnaires :{' '}
                      {e.gestionnaires
                        .map((g) => (g.status === 'suspendu' ? `${g.name} (suspendu)` : g.name))
                        .join(', ')}
                    </p>
                  )}
                  {!e.covered && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-destructive-text">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Aucun gestionnaire actif : assignez-en un.
                    </p>
                  )}
                </div>
                <EntrepriseActions
                  entrepriseId={e.id}
                  name={e.name}
                  initial={{
                    name: e.name,
                    vatNumber: e.vatNumber,
                    addressLine: e.addressLine ?? '',
                    postalCode: e.postalCode ?? '',
                    city: e.city ?? '',
                    country: e.country,
                    contactEmail: e.contactEmail ?? '',
                    contactPhone: e.contactPhone ?? '',
                    jourLimitePrestations: String(e.jourLimitePrestations),
                    gestionnaireIds: e.gestionnaires.map((g) => g.id),
                  }}
                  countries={countries}
                  gestionnaires={gestionnaires}
                  readOnly={readOnly}
                />
               </div>
               <AdminBlock entreprise={e} readOnly={readOnly} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {archived.length > 0 && (
        <section className="rounded-2xl border border-border bg-card">
          <header className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-bold text-foreground">Entreprises archivées</h2>
            <p className="text-xs text-muted-foreground">
              Elles ne comptent plus dans votre quota. Restaurez-les à tout moment.
            </p>
          </header>
          <ul className="divide-y divide-border">
            {archived.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{a.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.vatNumber} · archivée le {formatDate(a.deletedAt)}
                  </p>
                </div>
                <EntrepriseRestore entrepriseId={a.id} name={a.name} readOnly={readOnly} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
