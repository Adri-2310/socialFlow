import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { QuotaUsage } from '@/components/cabinet/quota-usage';
import { SubscriptionDetails, type CardFlash } from '@/components/cabinet/subscription-details';
import { requirePaidCabinet } from '@/lib/cabinet/cabinet-access';
import { getCabinetSubscriptionDetails } from '@/lib/billing/cabinet-billing';
import { confirmCardUpdate, getBillingExtras } from '@/lib/billing/cabinet-subscription';
import { getCabinetQuotaUsage } from '@/lib/billing/cabinet-quotas';
import { getPlanChangeOptions } from '@/lib/billing/plan-change';
import { requireAuthorized } from '@/lib/authz/authz-page';

export const metadata: Metadata = {
  title: 'Mon abonnement',
  description: 'Votre abonnement, votre carte, vos factures et vos quotas.',
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? undefined;

export default async function CabinetBillingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user } = await requireAuthorized('abonnement.gerer');
  // Le cabinetId vient de la session, jamais de l'URL (isolation
  // multi-tenant, FONCTIONNEMENT.md § 4).
  if (!user.cabinetId) redirect('/dashboard');
  // D32 : tant que le Checkout n'est pas termine, seul l'ecran de paiement.
  // La page reste en revanche accessible en lecture seule (D29, D57) : c'est
  // la qu'on regularise un impaye.
  await requirePaidCabinet(user.cabinetId);

  // Retour de la saisie de carte chez Stripe : confirme cote serveur, sans
  // faire confiance a l'URL seule (la session doit appartenir au cabinet).
  const params = await searchParams;
  const retour = first(params.carte);
  const sessionId = first(params.session_id);
  let flash: CardFlash = null;
  if (retour === 'annulee') {
    flash = 'annulee';
  } else if (retour === 'ok' && sessionId) {
    const result = await confirmCardUpdate(user.cabinetId, user.id, sessionId);
    flash = result.ok ? 'ok' : 'erreur';
  }

  const [subscription, quotas, extras, planChange] = await Promise.all([
    getCabinetSubscriptionDetails(user.cabinetId),
    getCabinetQuotaUsage(user.cabinetId),
    getBillingExtras(user.cabinetId),
    getPlanChangeOptions(user.cabinetId),
  ]);

  return (
    <>
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">Mon abonnement</h2>
        <p className="text-sm text-muted-foreground">
          Votre abonnement, votre carte, vos factures et vos quotas.
        </p>
      </div>
      <SubscriptionDetails
        data={subscription}
        extras={extras}
        planChange={planChange}
        flash={flash}
      />
      <QuotaUsage data={quotas} />
    </>
  );
}
