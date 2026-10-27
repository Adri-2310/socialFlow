import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, CalendarDays, Eye, Users } from 'lucide-react';
import { requireAuthorized } from '@/lib/authz/authz-page';
import { resolveScope } from '@/lib/authz/authz';
import { SalarieCreate } from '@/components/gestionnaire/salarie-create';
import { SalarieImport } from '@/components/gestionnaire/salarie-import';
import { SalariesOnglets } from '@/components/gestionnaire/salaries-onglets';
import { SalariesTable } from '@/components/gestionnaire/salaries-table';
import { isCabinetReadOnly } from '@/lib/cabinet/cabinet-suspension';
import { countryOptions } from '@/lib/countries';
import { prisma } from '@/lib/prisma';
import { getSalariesEntreprise } from '@/lib/salarie/salarie-data';

export const metadata: Metadata = {
  title: 'Salariés',
  description: 'Les dossiers des salariés de l’entreprise.',
};

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
            <Link
              href={`/dashboard/gestionnaire/entreprises/${data.entreprise.id}/periodes`}
              className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-input px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted"
            >
              <CalendarDays className="h-4 w-4" />
              Périodes de paie
            </Link>
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

      <SalariesOnglets base={base} archives={archives} nbArchives={data.nbArchives} />

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
        <SalariesTable
          salaries={data.salaries}
          archives={archives}
          readOnly={readOnly}
          at={maintenant}
        />
      )}
    </section>
  );
}
