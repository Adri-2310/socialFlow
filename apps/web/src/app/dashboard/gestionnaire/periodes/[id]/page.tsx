import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Lock, Users } from 'lucide-react';
import { requireAuthorized } from '@/lib/authz/authz-page';
import { resolveScope } from '@/lib/authz/authz';
import { PrestationEncoder } from '@/components/gestionnaire/prestation-encoder';
import { ReadOnlyNotice } from '@/components/gestionnaire/read-only-notice';
import { isCabinetReadOnly } from '@/lib/cabinet/cabinet-suspension';
import {
  dateIsoEnFrancais,
  libelleMois,
  resumePrestation,
  ROLE_LABELS,
} from '@/lib/periode/periode-format';
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
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Salarié</th>
                <th className="px-4 py-3 font-semibold">Écarts du mois</th>
                <th className="px-4 py-3 font-semibold">Dernière saisie</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.salaries.map((s) => {
                const lignes = s.prestation ? resumePrestation(s.prestation) : [];
                return (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-semibold text-foreground">
                      {s.prenom} {s.nom}
                    </td>
                    <td className="px-4 py-3 text-foreground/80">
                      {lignes.length === 0 ? (
                        <span className="text-muted-foreground">Mois complet</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {lignes.map((ligne) => (
                            <li key={ligne}>{ligne}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {s.prestation?.modifiePar
                        ? `${s.prestation.modifiePar.name} (${ROLE_LABELS[s.prestation.modifiePar.role ?? ''] ?? 'compte'})`
                        : s.prestation
                          ? 'Compte supprimé'
                          : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <PrestationEncoder
                          periodeId={periode.id}
                          annee={periode.annee}
                          mois={periode.mois}
                          salarieId={s.id}
                          salarieNom={`${s.prenom} ${s.nom}`}
                          initial={s.prestation}
                          bloque={bloque}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
