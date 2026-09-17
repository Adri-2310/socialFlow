import type { Metadata } from 'next';
import { getPricingPlansConfig, getStripeStatus } from '@/lib/admin-data';
import { PlansConfig } from '@/components/admin/plans-config';
import { StripeStatusPanel } from '@/components/admin/stripe-status-panel';

export const metadata: Metadata = {
  title: 'Configuration — Console SuperAdmin',
  description: 'Edition des plans tarifaires et synchronisation avec le catalogue Stripe.',
};

export default async function AdminConfigurationPage() {
  const [plans, stripeStatus] = await Promise.all([getPricingPlansConfig(), getStripeStatus()]);

  return (
    <>
      <StripeStatusPanel status={stripeStatus} />
      <PlansConfig plans={plans} />
    </>
  );
}
