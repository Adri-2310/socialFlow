import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { EntreprisesManager } from '@/components/cabinet/entreprises-manager';
import { isCabinetReadOnly } from '@/lib/cabinet-suspension';
import { requirePaidCabinet } from '@/lib/cabinet-access';
import { getGestionnaires } from '@/lib/cabinet-data';
import { getArchivedEntreprises, getEntreprises } from '@/lib/cabinet-entreprises';
import { getCabinetQuotaUsage } from '@/lib/cabinet-quotas';
import { countryOptions } from '@/lib/countries';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/require-session';

export const metadata: Metadata = {
  title: 'Entreprises',
  description: 'Portefeuille d’entreprises clientes de votre cabinet.',
};

export default async function EntreprisesPage() {
  const { user } = await requireSession({ role: 'CABINET_RH' });
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
      quota={quotas.limits ? { used: quotas.entreprises.used, limit: quotas.limits.maxEntreprises } : undefined}
      readOnly={cabinet ? isCabinetReadOnly(cabinet) : false}
    />
  );
}
