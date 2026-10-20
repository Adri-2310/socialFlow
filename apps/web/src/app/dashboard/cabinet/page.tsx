import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CabinetAlerts } from '@/components/cabinet/alerts';
import { OverviewCards } from '@/components/cabinet/overview-cards';
import { QuotaUsage } from '@/components/cabinet/quota-usage';
import { buildCabinetAlerts } from '@/lib/cabinet-alerts';
import { getEntreprises } from '@/lib/cabinet-entreprises';
import { getCabinetQuotaUsage } from '@/lib/cabinet-quotas';
import { requireAuthorized } from '@/lib/authz-page';
import { requirePaidCabinet } from '@/lib/cabinet-access';
import {
  getArchivedGestionnaires,
  getCabinetOverview,
  getGestionnaires,
  getInvitations,
} from '@/lib/cabinet-data';

export const metadata: Metadata = {
  title: "Vue d'ensemble",
  description: "État de votre cabinet : équipe, invitations et abonnement.",
};

export default async function CabinetOverviewPage() {
  const { user } = await requireAuthorized('cabinet.consulter');
  // Le cabinetId vient de la session, jamais de l'URL (isolation
  // multi-tenant, FONCTIONNEMENT.md § 4).
  if (!user.cabinetId) redirect('/dashboard');
  // D32 : rien d'autre que l'ecran de paiement tant que le Checkout n'est pas fait.
  await requirePaidCabinet(user.cabinetId);

  const [overview, quotas, invitations, gestionnaires, archived, entreprises] = await Promise.all([
    getCabinetOverview(user.cabinetId),
    getCabinetQuotaUsage(user.cabinetId),
    getInvitations(user.cabinetId),
    getGestionnaires(user.cabinetId),
    getArchivedGestionnaires(user.cabinetId),
    getEntreprises(user.cabinetId),
  ]);

  const alerts = buildCabinetAlerts({
    quotas,
    invitations,
    gestionnaires,
    archived,
    entreprises,
    subscription: {
      status: overview.subscription.status,
      trialEndsAt: overview.subscription.trialEndsAt,
    },
  });

  return (
    <>
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">{overview.cabinetName}</h2>
        <p className="text-sm text-muted-foreground">
          Bienvenue, {user.name}. Voici l&apos;état de votre cabinet.
        </p>
      </div>
      <CabinetAlerts alerts={alerts} />
      <OverviewCards data={overview} />
      <QuotaUsage data={quotas} />
    </>
  );
}
