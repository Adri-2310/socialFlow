import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { normalizeBillingStatus } from '@/lib/billing';

// D32 : tant que le paiement n'est pas fait (Stripe Checkout non termine), le
// titulaire n'a pour seul acces que l'ecran "reprendre le paiement".
export const PAYMENT_PAGE = '/dashboard/cabinet/paiement';

// A appeler en tete de chaque page de l'espace Cabinet RH, sauf l'ecran de
// paiement lui-meme. Le cabinetId vient de la session.
//
// Fait par page plutot que dans le layout : un layout serveur ne connait pas
// l'URL demandee et ne peut donc pas laisser passer la page de paiement.
export async function requirePaidCabinet(cabinetId: string): Promise<void> {
  const cabinet = await prisma.cabinet.findUnique({
    where: { id: cabinetId },
    select: { billingStatus: true },
  });

  if (cabinet && normalizeBillingStatus(cabinet.billingStatus) === 'EN_ATTENTE_PAIEMENT') {
    redirect(PAYMENT_PAGE);
  }
}
