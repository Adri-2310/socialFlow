import { prisma } from '@/lib/prisma';
import type { CabinetEmailBrand } from '@/lib/email/email-brand';

// Charge l'identite d'un cabinet pour ses emails (D30, D33). Le cabinetId vient
// de la session ou de la ressource deja verifiee, jamais de la requete.
export async function getCabinetEmailBrand(cabinetId: string): Promise<CabinetEmailBrand> {
  const cabinet = await prisma.cabinet.findUniqueOrThrow({
    where: { id: cabinetId },
    select: {
      name: true,
      displayName: true,
      primaryColor: true,
      logoUrl: true,
      contactEmail: true,
    },
  });

  return {
    name: cabinet.displayName?.trim() || cabinet.name,
    primaryColor: cabinet.primaryColor,
    logoUrl: cabinet.logoUrl,
    replyTo: cabinet.contactEmail,
  };
}
