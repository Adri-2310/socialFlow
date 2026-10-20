import type { Metadata } from 'next';
import { buildThemeCss } from '@/lib/branding/branding-rules';
import { cabinetMetadata } from '@/lib/cabinet/cabinet-metadata';
import { ensureCabinetSlug, isPortalRole, portalPath } from '@/lib/portal/cabinet-portal';
import { prisma } from '@/lib/prisma';

// Identite du cabinet pour les pages COMMUNES a plusieurs roles (/dashboard, /profil)
// quand elles sont vues par un gestionnaire, un administrateur d'entreprise ou un
// collaborateur (D33, D76) : SocialFlow n'y apparait pas. Titulaire et SuperAdmin
// gardent l'identite SocialFlow (null). Le cabinet vient de la session, jamais du client.
export type CabinetClientBrand = {
  brandName: string;
  logoUrl: string | null;
  theme: string | null;
  logoutHref: string;
  metadata: (title: string) => Metadata;
};

export async function getCabinetClientBrand(user: {
  role?: string | null;
  cabinetId?: string | null;
}): Promise<CabinetClientBrand | null> {
  if (!user.cabinetId || !isPortalRole(user.role)) return null;

  const cabinet = await prisma.cabinet.findUnique({
    where: { id: user.cabinetId },
    select: {
      name: true,
      displayName: true,
      logoUrl: true,
      primaryColor: true,
      secondaryColor: true,
    },
  });
  if (!cabinet) return null;

  const brandName = cabinet.displayName?.trim() || cabinet.name;
  return {
    brandName,
    logoUrl: cabinet.logoUrl,
    theme: buildThemeCss(cabinet),
    // D76 : apres deconnexion, retour sur le portail du cabinet.
    logoutHref: portalPath(await ensureCabinetSlug(user.cabinetId)),
    metadata: (title) => ({ ...cabinetMetadata(cabinet), title: `${title} — ${brandName}` }),
  };
}
