import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Lock, Users } from 'lucide-react';
import { requireAuthorized } from '@/lib/authz/authz-page';
import { resolveScope } from '@/lib/authz/authz';
import { PrestationsTable } from '@/components/gestionnaire/prestations-table';
import { ReadOnlyNotice } from '@/components/gestionnaire/read-only-notice';
import { isCabinetReadOnly } from '@/lib/cabinet/cabinet-suspension';
import { dateIsoEnFrancais, libelleMois } from '@/lib/periode/periode-format';
import { getPrestationsPeriode } from '@/lib/periode/prestation-data';
import { prisma } from '@/lib/prisma';
import { StatusBadge } from '@/components/shared/status-badge';

export const metadata: Metadata = {
  title: 'Prestations',
  description: 'Les prestations du mois, salarié par salarié.',
};

// Prestations d'une période (D92, roles/03 § 5) : une ligne par salarié en poste pendant le
// mois, avec ses écarts. Sans écart, un salarié est payé pour un mois complet selon son régime.
export default async function PrestationsPeriodePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireAuthorized('periode.voir');
  const { id } = await params;

  const scope = await resolveScope(user);
  if (!scope) redirect('/dashboard');

  // Période hors périmètre (entreprise non assignée, archivée, autre cabinet) : 404.
  const data = await getPrestationsPeriode(scope, id);
  if (!data || scope.kind !== 'entreprises') notFound();

  // D29, D71 : cabinet en lecture seule, les actions sont désactivées (le serveur refuse aussi).
  const cabinet = await prisma.cabinet.findUnique({
    where: { id: scope.cabinetId },
    select: { billingStatus: true, status: true, suspensionType: true },
  });
  const readOnly = !cabinet || isCabinetReadOnly(cabinet);
  const { periode } = data;
  const verrouillee = periode.statut === 'VERROUILLEE';
  const bloque = readOnly
    ? 'Votre cabinet est en lecture seule.'
    : verrouillee
      ? 'Les prestations sont verrouillées : déverrouillez-les pour les modifier.'
      : null;

  return (
    <section className="space-y-4">
      <div>
        <Link
          href={`/dashboard/gestionnaire/entreprises/${periode.entrepriseId}/periodes`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Périodes de paie
        </Link>
        <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">
          <span className="capitalize">{libelleMois(periode.annee, periode.mois)}</span> ·{' '}
          {periode.entrepriseNom}
        </h2>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          Date limite : {dateIsoEnFrancais(periode.dateLimite)}
          {verrouillee && (
            <StatusBadge
              domain="echeance"
              status="VERROUILLEE"
              icon={<Lock aria-hidden="true" />}
            />
          )}
        </p>
      </div>

      <ReadOnlyNotice readOnly={readOnly} />

      {data.salaries.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center sm:p-8">
          <Users className="mx-auto h-8 w-8 text-muted-foreground" />
          <h3 className="mt-3 text-lg font-bold text-foreground">Aucun salarié en poste ce mois</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Les salariés entrés au plus tard à la fin du mois et non sortis avant son début
            apparaissent ici.
          </p>
        </div>
      ) : (
        <PrestationsTable salaries={data.salaries} periode={periode} bloque={bloque} />
      )}
    </section>
  );
}
