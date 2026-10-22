import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Eye, Users } from 'lucide-react';
import { requireAuthorized } from '@/lib/authz/authz-page';
import { resolveScope } from '@/lib/authz/authz';
import { SalarieArchiveActions } from '@/components/gestionnaire/salarie-archive-actions';
import { SalarieCreate } from '@/components/gestionnaire/salarie-create';
import { SalarieImport } from '@/components/gestionnaire/salarie-import';
import { SortieBadge } from '@/components/gestionnaire/sortie-badge';
import { isCabinetReadOnly } from '@/lib/cabinet/cabinet-suspension';
import { countryOptions } from '@/lib/countries';
import { prisma } from '@/lib/prisma';
import { getSalariesEntreprise } from '@/lib/salarie/salarie-data';

export const metadata: Metadata = {
  title: 'Salariés',
  description: 'Les dossiers des salariés de l’entreprise.',
};

const STATUT_LABELS: Record<string, string> = { EMPLOYE: 'Employé', OUVRIER: 'Ouvrier' };

// Les dates de dossier n'ont pas d'heure : on les lit en UTC pour ne pas les décaler d'un jour.
const formatDate = (date: Date) => date.toLocaleDateString('fr-BE', { timeZone: 'UTC' });

const ONGLET_ACTIF = 'rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary';
const ONGLET =
  'rounded-lg px-3 py-1.5 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground';

export default async function SalariesEntreprisePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ archives?: string }>;
}) {
  const { user } = await requireAuthorized('salarie.lister');
  const { id } = await params;
  const archives = (await searchParams).archives === '1';

  const scope = await resolveScope(user);
  if (!scope) redirect('/dashboard');

  // Entreprise hors périmètre (non assignée, archivée, autre cabinet) : 404, on ne
  // révèle pas son existence.
  const maintenant = new Date();
  const data = await getSalariesEntreprise(scope, id, maintenant, { archives });
  // scope.kind : toujours « entreprises » ici (sinon data serait null), mais TypeScript l'ignore.
  if (!data || scope.kind !== 'entreprises') notFound();

  // D29, D71 : cabinet en lecture seule, les actions sont désactivées (le serveur refuse aussi).
  const cabinet = await prisma.cabinet.findUnique({
    where: { id: scope.cabinetId },
    select: { billingStatus: true, status: true, suspensionType: true },
  });
  const readOnly = !cabinet || isCabinetReadOnly(cabinet);
  const base = `/dashboard/gestionnaire/entreprises/${data.entreprise.id}/salaries`;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/dashboard/gestionnaire"
            className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Mes entreprises
          </Link>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">
            {data.entreprise.name}
          </h2>
        </div>
        {!archives && (
          <div className="flex flex-wrap items-center gap-2">
            <SalarieImport entrepriseId={data.entreprise.id} readOnly={readOnly} />
            <SalarieCreate
              entrepriseId={data.entreprise.id}
              // Calculé côté serveur : les données Intl diffèrent entre Node et le navigateur.
              countries={countryOptions()}
              readOnly={readOnly}
            />
          </div>
        )}
      </div>

      <nav aria-label="Dossiers" className="flex gap-1">
        <Link
          href={base}
          aria-current={archives ? undefined : 'page'}
          className={archives ? ONGLET : ONGLET_ACTIF}
        >
          Actifs
        </Link>
        <Link
          href={`${base}?archives=1`}
          aria-current={archives ? 'page' : undefined}
          className={archives ? ONGLET_ACTIF : ONGLET}
        >
          Archivés ({data.nbArchives})
        </Link>
      </nav>

      {data.salaries.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center sm:p-8">
          <Users className="mx-auto h-8 w-8 text-muted-foreground" />
          <h3 className="mt-3 text-lg font-bold text-foreground">
            {archives ? 'Aucun dossier archivé' : 'Aucun salarié'}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {archives
              ? 'Les dossiers archivés ne sont jamais supprimés : ils apparaissent ici et peuvent être restaurés.'
              : 'Les dossiers des salariés de cette entreprise apparaîtront ici.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Salarié</th>
                <th className="px-4 py-3 font-semibold">NISS</th>
                <th className="px-4 py-3 font-semibold">Fonction</th>
                <th className="px-4 py-3 font-semibold">Statut</th>
                <th className="px-4 py-3 font-semibold">Entrée</th>
                <th className="px-4 py-3 font-semibold">Situation</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.salaries.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-semibold text-foreground">
                    <Link
                      href={`/dashboard/gestionnaire/salaries/${s.id}`}
                      className="text-primary hover:underline"
                    >
                      {s.prenom} {s.nom}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {s.nissMasque}
                  </td>
                  <td className="px-4 py-3 text-foreground/80">{s.fonction ?? '—'}</td>
                  <td className="px-4 py-3 text-foreground/80">
                    {s.statut ? (STATUT_LABELS[s.statut] ?? s.statut) : '—'}
                  </td>
                  <td className="px-4 py-3 text-foreground/80">{formatDate(s.dateEntree)}</td>
                  <td className="px-4 py-3">
                    <SortieBadge
                      dateEntree={s.dateEntree}
                      dateSortie={s.dateSortie}
                      at={maintenant}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Link
                        href={`/dashboard/gestionnaire/salaries/${s.id}`}
                        aria-label={`Voir le dossier de ${s.prenom} ${s.nom}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted"
                      >
                        <Eye className="h-3.5 w-3.5" /> Voir
                      </Link>
                      {archives && (
                        <SalarieArchiveActions
                          salarieId={s.id}
                          nom={`${s.prenom} ${s.nom}`}
                          archive
                          readOnly={readOnly}
                          compact
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
