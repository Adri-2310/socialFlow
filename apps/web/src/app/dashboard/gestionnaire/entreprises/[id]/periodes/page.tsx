import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, CalendarDays, Lock } from 'lucide-react';
import { requireAuthorized } from '@/lib/authz/authz-page';
import { resolveScope } from '@/lib/authz/authz';
import { PeriodeActions } from '@/components/gestionnaire/periode-actions';
import { PeriodeOuvrir } from '@/components/gestionnaire/periode-ouvrir';
import { ReadOnlyNotice } from '@/components/gestionnaire/read-only-notice';
import { isCabinetReadOnly } from '@/lib/cabinet/cabinet-suspension';
import { getPeriodesEntreprise } from '@/lib/periode/periode-data';
import { moisProposes } from '@/lib/periode/periode-dates';
import { dateIsoEnFrancais, libelleMois } from '@/lib/periode/periode-format';
import { prisma } from '@/lib/prisma';
import { StatusBadge } from '@/components/shared/status-badge';

export const metadata: Metadata = {
  title: 'Périodes de paie',
  description: 'Les périodes de paie et les prestations mensuelles de l’entreprise.',
};

// Périodes de paie d'une entreprise (D90, roles/03 § 5) : ouverture, date limite, verrouillage
// des prestations, accès à la saisie.
export default async function PeriodesEntreprisePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireAuthorized('periode.voir');
  const { id } = await params;

  const scope = await resolveScope(user);
  if (!scope) redirect('/dashboard');

  // Entreprise hors périmètre (non assignée, archivée, autre cabinet) : 404, on ne révèle pas
  // son existence.
  const data = await getPeriodesEntreprise(scope, id);
  if (!data || scope.kind !== 'entreprises') notFound();

  // D29, D71 : cabinet en lecture seule, les actions sont désactivées (le serveur refuse aussi).
  const cabinet = await prisma.cabinet.findUnique({
    where: { id: scope.cabinetId },
    select: { billingStatus: true, status: true, suspensionType: true },
  });
  const readOnly = !cabinet || isCabinetReadOnly(cabinet);

  const maintenant = new Date();
  const courant = { annee: maintenant.getUTCFullYear(), mois: maintenant.getUTCMonth() + 1 };

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href={`/dashboard/gestionnaire/entreprises/${data.entreprise.id}/salaries`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Salariés
          </Link>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">
            {data.entreprise.name}
          </h2>
          <p className="text-sm text-muted-foreground">
            Prestations à donner avant le {data.entreprise.jourLimitePrestations} de chaque mois
            (règle réglée par votre cabinet, décalable période par période).
          </p>
        </div>
        <PeriodeOuvrir
          entrepriseId={data.entreprise.id}
          mois={moisProposes(maintenant, data.periodes)}
          moisCourant={courant}
          jourLimite={data.entreprise.jourLimitePrestations}
          readOnly={readOnly}
        />
      </div>

      <ReadOnlyNotice readOnly={readOnly} />

      {data.periodes.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center sm:p-8">
          <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground" />
          <h3 className="mt-3 text-lg font-bold text-foreground">Aucune période ouverte</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Ouvrez la période d’un mois pour saisir les prestations des salariés.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Période</th>
                <th className="px-4 py-3 font-semibold">Date limite</th>
                <th className="px-4 py-3 font-semibold">Prestations</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.periodes.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-semibold capitalize text-foreground">
                    <Link
                      href={`/dashboard/gestionnaire/periodes/${p.id}`}
                      className="text-primary hover:underline"
                    >
                      {libelleMois(p.annee, p.mois)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-foreground/80">
                    {dateIsoEnFrancais(p.dateLimite)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      domain="periode"
                      status={p.statut}
                      icon={p.statut === 'VERROUILLEE' ? <Lock aria-hidden="true" /> : undefined}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Link
                        href={`/dashboard/gestionnaire/periodes/${p.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted"
                      >
                        Prestations
                      </Link>
                      <PeriodeActions
                        periodeId={p.id}
                        verrouillee={p.statut === 'VERROUILLEE'}
                        dateLimite={p.dateLimite}
                        readOnly={readOnly}
                      />
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
