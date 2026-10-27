import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Building2, ChevronRight } from 'lucide-react';
import { EtatPeriodeBadge } from '@/components/gestionnaire/etat-periode-badge';
import { requireAuthorized } from '@/lib/authz/authz-page';
import { resolveScope } from '@/lib/authz/authz';
import { libelleMois } from '@/lib/periode/periode-format';
import { getTableauDeBord } from '@/lib/periode/tableau-de-bord';

export const metadata: Metadata = {
  title: 'Mes entreprises',
  description: 'Les entreprises clientes qui vous sont assignées.',
};

// Tableau de bord du gestionnaire (D93) : par entreprise, l'état de la période du mois courant et
// le nombre de salariés en poste. Les blocs des modules à venir n'y figurent pas encore.
export default async function GestionnaireHomePage() {
  const { user } = await requireAuthorized('salarie.lister');

  // Périmètre recalculé à chaque requête : une réassignation prend effet tout de suite.
  const scope = await resolveScope(user);
  if (!scope) redirect('/dashboard');

  const { annee, mois, entreprises } = await getTableauDeBord(scope, new Date());

  if (entreprises.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6 text-center sm:p-8">
        <Building2 className="mx-auto h-8 w-8 text-muted-foreground" />
        <h2 className="mt-3 text-lg font-bold text-foreground">Aucune entreprise assignée</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Votre cabinet doit vous assigner au moins une entreprise cliente pour que vous puissiez y
          gérer les dossiers des salariés.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {entreprises.length === 1
          ? '1 entreprise vous est assignée.'
          : `${entreprises.length} entreprises vous sont assignées.`}{' '}
        Mois en cours : {libelleMois(annee, mois)}.
      </p>
      <ul className="grid gap-3 md:grid-cols-2">
        {entreprises.map((e) => (
          <li
            key={e.id}
            className="rounded-2xl border border-border bg-card transition hover:border-primary/50"
          >
            <Link
              href={`/dashboard/gestionnaire/entreprises/${e.id}/salaries`}
              className="flex items-center gap-4 p-4"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-foreground">{e.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {e.vatNumber}
                  {e.city ? ` · ${e.city}` : ''}
                </span>
                <span className="mt-1 block text-xs font-medium text-foreground/80">
                  {e.salariesEnPoste === 0
                    ? 'Aucun salarié en poste ce mois'
                    : e.salariesEnPoste === 1
                      ? '1 salarié en poste ce mois'
                      : `${e.salariesEnPoste} salariés en poste ce mois`}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
              <EtatPeriodeBadge etat={e.etat} />
              <Link
                href={
                  e.etat.kind === 'NON_OUVERTE'
                    ? `/dashboard/gestionnaire/entreprises/${e.id}/periodes`
                    : `/dashboard/gestionnaire/periodes/${e.etat.periodeId}`
                }
                className="text-xs font-semibold text-primary hover:underline"
              >
                {e.etat.kind === 'NON_OUVERTE' ? 'Ouvrir la période' : 'Voir les prestations'}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
