import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { auth } from '@/lib/auth/auth';
import { cabinetMetadata } from '@/lib/cabinet/cabinet-metadata';
import { isCabinetReadOnly } from '@/lib/cabinet/cabinet-suspension';
import { requireAuthorized } from '@/lib/authz/authz-page';
import { prisma } from '@/lib/prisma';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { ReadOnlyNotice } from '@/components/gestionnaire/read-only-notice';
import { buildThemeCss } from '@/lib/branding/branding-rules';
import { ensureCabinetSlug, portalPath } from '@/lib/portal/cabinet-portal';

const CABINET_SELECT = {
  displayName: true,
  primaryColor: true,
  secondaryColor: true,
  logoUrl: true,
  name: true,
  billingStatus: true,
  status: true,
  suspensionType: true,
} as const;

// Onglet aux couleurs du cabinet (D33), jamais "SocialFlow".
export async function generateMetadata(): Promise<Metadata> {
  const session = await auth.api.getSession({ headers: await headers() });
  const cabinetId = session?.user.cabinetId;
  if (!cabinetId || session.user.role !== 'GESTIONNAIRE_RH') return {};

  const cabinet = await prisma.cabinet.findUnique({
    where: { id: cabinetId },
    select: CABINET_SELECT,
  });
  return cabinet ? cabinetMetadata(cabinet) : {};
}

// Garde de rôle et shell posés une fois pour tout l'espace du gestionnaire (même
// principe que dashboard/entreprise/layout.tsx). On garde sur `salarie.gerer`, que la
// matrice réserve au gestionnaire : `salarie.lister` est aussi ouverte au Cabinet RH
// (compteurs) et à l'entreprise, qui entreraient dans cet espace.
export default async function GestionnaireLayout({ children }: { children: ReactNode }) {
  const { user } = await requireAuthorized('salarie.gerer');

  const cabinet = user.cabinetId
    ? await prisma.cabinet.findUnique({ where: { id: user.cabinetId }, select: CABINET_SELECT })
    : null;
  const theme = cabinet ? buildThemeCss(cabinet) : null;
  // D76 : après déconnexion, retour sur le portail du cabinet.
  const logoutHref = user.cabinetId
    ? portalPath(await ensureCabinetSlug(user.cabinetId))
    : undefined;

  return (
    <DashboardShell
      role="GESTIONNAIRE_RH"
      userName={user.name}
      brandName={cabinet?.displayName ?? null}
      logoUrl={cabinet?.logoUrl ?? null}
      logoutHref={logoutHref}
    >
      {/* Couleurs du cabinet : valeurs #rrggbb validées à l'enregistrement. */}
      {theme && <style dangerouslySetInnerHTML={{ __html: theme }} />}
      {/* D29, D71 : cabinet en lecture seule, le gestionnaire consulte sans modifier. */}
      <ReadOnlyNotice readOnly={!!cabinet && isCabinetReadOnly(cabinet)} />
      {children}
    </DashboardShell>
  );
}
