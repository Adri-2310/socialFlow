import { prisma } from '@/lib/prisma';
import { hashInvitationToken } from '@/lib/invitations';

// Ce que la page d'acceptation d'une invitation montre du cabinet qui invite
// (D33) : son nom, son logo et sa couleur, pour que le futur gestionnaire le
// reconnaisse. Page publique : rien n'est revele sans un jeton valide
// (invitation en attente, non expiree). Un jeton inconnu, expire ou deja
// utilise ne donne aucune information sur un cabinet.
export type InvitationPreview = {
  email: string;
  cabinetName: string;
  brandName: string;
  primaryColor: string | null;
  secondaryColor: string | null;
  logoUrl: string | null;
};

export async function getInvitationPreview(
  token: string | undefined,
): Promise<InvitationPreview | null> {
  if (!token) return null;

  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    select: {
      email: true,
      status: true,
      expiresAt: true,
      cabinet: {
        select: {
          name: true,
          displayName: true,
          primaryColor: true,
          secondaryColor: true,
          logoUrl: true,
          deletedAt: true,
          status: true,
        },
      },
    },
  });

  if (!invitation || invitation.status !== 'pending' || invitation.expiresAt <= new Date()) {
    return null;
  }
  const cabinet = invitation.cabinet;
  if (cabinet.deletedAt) return null;

  return {
    email: invitation.email,
    cabinetName: cabinet.name,
    brandName: cabinet.displayName?.trim() || cabinet.name,
    primaryColor: cabinet.primaryColor,
    secondaryColor: cabinet.secondaryColor,
    logoUrl: cabinet.logoUrl,
  };
}
