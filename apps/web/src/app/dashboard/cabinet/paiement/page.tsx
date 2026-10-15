import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PaymentStart } from '@/components/cabinet/payment-start';
import { normalizeBillingStatus } from '@/lib/billing';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/require-session';
import {
  TRIAL_DAYS,
  confirmCheckoutSession,
  getCheckoutSummary,
} from '@/lib/stripe-checkout';

export const metadata: Metadata = {
  title: 'Finaliser mon abonnement — SocialFlow',
  description: 'Démarrez votre essai gratuit pour accéder à votre espace.',
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? undefined;

const PERIOD_LABELS = { monthly: 'Mensuelle', yearly: 'Annuelle' } as const;

// Ecran "reprendre le paiement" (D32) : seul acces du titulaire tant que le
// Checkout n'est pas termine. Il est aussi l'adresse de retour de Stripe : au
// retour, la session est confirmee ici meme (sans attendre le webhook).
// N'appelle pas requirePaidCabinet : c'est la destination de cette garde.
export default async function PaymentPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user } = await requireSession({ role: 'CABINET_RH' });
  if (!user.cabinetId) redirect('/dashboard');
  const cabinetId = user.cabinetId;

  const params = await searchParams;
  const retour = first(params.retour);
  const sessionId = first(params.session_id);

  let confirmError: string | null = null;
  if (retour === 'ok' && sessionId) {
    const result = await confirmCheckoutSession(cabinetId, sessionId);
    if (!result.ok) confirmError = result.error;
  }

  // Deja en regle (paiement fait, ou retour confirme) : rien a faire ici.
  const cabinet = await prisma.cabinet.findUnique({
    where: { id: cabinetId },
    select: { billingStatus: true },
  });
  if (cabinet && normalizeBillingStatus(cabinet.billingStatus) !== 'EN_ATTENTE_PAIEMENT') {
    redirect('/dashboard/cabinet');
  }

  const summary = await getCheckoutSummary(cabinetId);
  // Montant reellement facture par Stripe. En annuel : le total de l'annee,
  // le cout mensuel equivalent n'etant qu'une information (D58).
  const euros = (value: number) =>
    new Intl.NumberFormat('fr-BE', {
      style: 'currency',
      currency: summary?.currency ?? 'EUR',
      maximumFractionDigits: 0,
    }).format(value);
  const priceLabel =
    summary?.amount != null
      ? summary.billingPeriod === 'yearly'
        ? `${euros(summary.amount)} par an (soit ${euros(summary.amount / 12)} par mois)`
        : `${euros(summary.amount)} par mois`
      : null;

  return (
    <PaymentStart
      planName={summary?.planName ?? 'Aucun plan'}
      periodLabel={summary ? PERIOD_LABELS[summary.billingPeriod] : '—'}
      priceLabel={priceLabel}
      trialDays={TRIAL_DAYS}
      cancelled={retour === 'annule'}
      confirmError={confirmError}
    />
  );
}
