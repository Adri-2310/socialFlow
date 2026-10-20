import { prisma } from '@/lib/prisma';
import { normalizeBillingStatus, type BillingStatus } from '@/lib/billing/billing';

// Suppression du compte du titulaire (roles/02-cabinet-rh.md § 4.7, D67) : elle
// est refusee tant que l'abonnement du cabinet n'est pas termine, le titulaire
// doit d'abord le resilier. Un abonnement existe des l'essai (carte
// enregistree) jusqu'a sa fin effective : programmer une resiliation en fin de
// periode ne suffit donc pas, l'abonnement court encore.
//
// Pas d'abonnement a resilier : "en attente de paiement" (Checkout jamais
// termine) et "resilie". Les gestionnaires, eux, peuvent toujours supprimer
// leur propre compte.
const BLOCKING_STATUSES: readonly BillingStatus[] = ['ESSAI', 'ACTIF', 'DELAI_GRACE', 'IMPAYE'];

export function isSubscriptionBlockingDeletion(status: string | null | undefined): boolean {
  return BLOCKING_STATUSES.includes(normalizeBillingStatus(status));
}

// Code d'erreur renvoye a l'interface (voir lib/auth/auth-errors.ts).
export const ACCOUNT_DELETION_BLOCKED_CODE = 'ACCOUNT_DELETION_BLOCKED_BY_SUBSCRIPTION';

// null = suppression permise. Seul le titulaire du cabinet est concerne.
export async function accountDeletionBlock(
  userId: string,
): Promise<typeof ACCOUNT_DELETION_BLOCKED_CODE | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, cabinet: { select: { billingStatus: true } } },
  });
  if (user?.role !== 'CABINET_RH' || !user.cabinet) return null;

  return isSubscriptionBlockingDeletion(user.cabinet.billingStatus)
    ? ACCOUNT_DELETION_BLOCKED_CODE
    : null;
}
