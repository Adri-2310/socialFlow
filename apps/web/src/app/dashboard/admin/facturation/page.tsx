import type { Metadata } from 'next';
import { requireAuthorized } from '@/lib/authz/authz-page';
import { getBillingData } from '@/lib/admin/admin-data';
import { FacturationAbonnements } from '@/components/admin/facturation-abonnements';

export const metadata: Metadata = {
  title: 'Facturation — Console SuperAdmin',
  description: 'Abonnements et revenus reels de la plateforme SocialFlow (Stripe).',
};

export default async function AdminFacturationPage() {
  // Garde propre à la page : un layout n'est pas ré-exécuté à chaque navigation.
  await requireAuthorized('plateforme.superviser');

  const { rows, mrr } = await getBillingData();

  return <FacturationAbonnements rows={rows} mrr={mrr} />;
}
