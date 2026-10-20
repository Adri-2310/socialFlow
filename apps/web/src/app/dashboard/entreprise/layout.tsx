import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { auth } from '@/lib/auth/auth';
import { cabinetMetadata } from '@/lib/cabinet/cabinet-metadata';
import { requireAuthorized } from '@/lib/authz/authz-page';
import { prisma } from '@/lib/prisma';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { buildThemeCss } from '@/lib/branding/branding-rules';
import { ensureCabinetSlug, portalPath } from '@/lib/portal/cabinet-portal';

const CABINET_BRAND_SELECT = {
  displayName: true,
  primaryColor: true,
  secondaryColor: true,
  logoUrl: true,
  name: true,
} as const;

// Onglet aux couleurs du cabinet de l'entreprise (D33), jamais "SocialFlow".
export async function generateMetadata(): Promise<Metadata> {
  const session = await auth.api.getSession({ headers: await headers() });
  const cabinetId = session?.user.cabinetId;
  if (!cabinetId || session.user.role !== 'ENTREPRISE_CLIENTE') return {};

  const cabinet = await prisma.cabinet.findUnique({
    where: { id: cabinetId },
    select: CABINET_BRAND_SELECT,
  });
  return cabinet ? cabinetMetadata(cabinet) : {};
}

// Garde de role et shell poses une fois pour tout l'espace de l'administrateur
// d'entreprise (meme principe que dashboard/cabinet/layout.tsx). Le portail
// prend le nom, le logo et les couleurs du cabinet (D33).
export default async function EntrepriseLayout({ children }: { children: ReactNode }) {
  const { user } = await requireAuthorized('entreprise.lister');

  const cabinet = user.cabinetId
    ? await prisma.cabinet.findUnique({
        where: { id: user.cabinetId },
        select: CABINET_BRAND_SELECT,
      })
    : null;
  const theme = cabinet ? buildThemeCss(cabinet) : null;
  // D76 : apres deconnexion, retour sur le portail du cabinet.
  const logoutHref = user.cabinetId ? portalPath(await ensureCabinetSlug(user.cabinetId)) : undefined;

  return (
    <DashboardShell
      role="ENTREPRISE_CLIENTE"
      userName={user.name}
      brandName={cabinet?.displayName ?? null}
      logoUrl={cabinet?.logoUrl ?? null}
      logoutHref={logoutHref}
    >
      {/* Couleurs du cabinet : valeurs #rrggbb validees a l'enregistrement. */}
      {theme && <style dangerouslySetInnerHTML={{ __html: theme }} />}
      {children}
    </DashboardShell>
  );
}
