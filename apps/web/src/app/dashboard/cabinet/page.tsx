import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OverviewCards } from '@/components/cabinet/overview-cards';
import { requireSession } from '@/lib/require-session';
import { getCabinetOverview } from '@/lib/cabinet-data';

export const metadata: Metadata = {
  title: "Vue d'ensemble — SocialFlow",
  description: "État de votre cabinet : équipe, invitations et abonnement.",
};

export default async function CabinetOverviewPage() {
  const { user } = await requireSession({ role: 'CABINET_RH' });
  // Le cabinetId vient de la session, jamais de l'URL (isolation
  // multi-tenant, FONCTIONNEMENT.md § 4).
  if (!user.cabinetId) redirect('/dashboard');

  const overview = await getCabinetOverview(user.cabinetId);

  return (
    <>
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">{overview.cabinetName}</h2>
        <p className="text-sm text-muted-foreground">
          Bienvenue, {user.name}. Voici l&apos;état de votre cabinet.
        </p>
      </div>
      <OverviewCards data={overview} />
    </>
  );
}
