import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { EntreprisesManager } from '@/components/cabinet/entreprises-manager';
import { isCabinetReadOnly } from '@/lib/cabinet/cabinet-suspension';
import { requirePaidCabinet } from '@/lib/cabinet/cabinet-access';
import { getGestionnaires } from '@/lib/cabinet/cabinet-data';
import { getArchivedEntreprises, getEntreprises } from '@/lib/entreprise/cabinet-entreprises';
import { getCabinetQuotaUsage } from '@/lib/billing/cabinet-quotas';
import { countryOptions } from '@/lib/countries';
import { prisma } from '@/lib/prisma';
import { requireAuthorized } from '@/lib/authz/authz-page';

export const metadata: Metadata = {
  title: 'Entreprises',
  description: 'Portefeuille d’entreprises clientes de votre cabinet.',
};

export default async function EntreprisesPage() {
  const { user } = await requireAuthorized('entreprise.lister');
  // Le cabinetId vient de la session, jamais de l'URL (isolation
  // multi-tenant, FONCTIONNEMENT.md § 4).
  if (!user.cabinetId) redirect('/dashboard');
  await requirePaidCabinet(user.cabinetId);

  const [entreprises, archived, gestionnaires, quotas, cabinet] = await Promise.all([
    getEntreprises(user.cabinetId),
    getArchivedEntreprises(user.cabinetId),
    getGestionnaires(user.cabinetId),
    getCabinetQuotaUsage(user.cabinetId),
    prisma.cabinet.findUnique({
      where: { id: user.cabinetId },
      select: { billingStatus: true, status: true, suspensionType: true },
    }),
  ]);

  return (
    <EntreprisesManager
      entreprises={entreprises}
      archived={archived}
      gestionnaires={gestionnaires.map((g) => ({ id: g.id, name: g.name, status: g.status }))}
      // Calcule cote serveur : les donnees Intl different entre Node et le
      // navigateur (erreur d'hydratation sinon).
      countries={countryOptions()}
      quota={
        quotas.limits
          ? {
              used: quotas.entreprises.used,
              limit: quotas.limits.maxEntreprises,
              pendingPlan: quotas.limits.pendingPlanName,
            }
          : undefined
      }
      readOnly={cabinet ? isCabinetReadOnly(cabinet) : false}
    />
  );
}
