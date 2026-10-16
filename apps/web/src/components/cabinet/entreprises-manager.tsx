import { AlertTriangle, Building2 } from 'lucide-react';
import { EntrepriseActions } from '@/components/cabinet/entreprise-actions';
import { EntrepriseCreate } from '@/components/cabinet/entreprise-create';
import { EntrepriseRestore } from '@/components/cabinet/entreprise-restore';
import type { GestionnaireOption } from '@/components/cabinet/entreprise-form-dialog';
import type { ArchivedEntrepriseRow, EntrepriseRow } from '@/lib/cabinet-entreprises';
import type { CountryOption } from '@/lib/countries';

const formatDate = (date: Date) => date.toLocaleDateString('fr-BE');

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
  quota?: { used: number; limit: number | null };
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
              <li
                key={e.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
              >
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
                    gestionnaireIds: e.gestionnaires.map((g) => g.id),
                  }}
                  countries={countries}
                  gestionnaires={gestionnaires}
                  readOnly={readOnly}
                />
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
