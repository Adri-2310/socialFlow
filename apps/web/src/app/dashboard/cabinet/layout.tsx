import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { auth } from '@/lib/auth';
import { cabinetMetadata } from '@/lib/cabinet-metadata';
import { requireSession } from '@/lib/require-session';
import { prisma } from '@/lib/prisma';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { BillingBanner } from '@/components/cabinet/billing-banner';
import { SuspensionBanner } from '@/components/cabinet/suspension-banner';
import { suspensionTypeOf } from '@/lib/cabinet-suspension';
import { graceEndsAt, normalizeBillingStatus } from '@/lib/billing';
import { buildThemeCss } from '@/lib/branding-rules';

// Onglet du navigateur aux couleurs du cabinet (D33) : nom affiche (ou raison
// sociale) et logo comme icone, jamais "SocialFlow". Le cabinet vient de la
// session ; sans session ou sans cabinet, les metadonnees par defaut restent.
export async function generateMetadata(): Promise<Metadata> {
  const session = await auth.api.getSession({ headers: await headers() });
  const cabinetId = session?.user.cabinetId;
  if (!cabinetId || session.user.role !== 'CABINET_RH') return {};

  const cabinet = await prisma.cabinet.findUnique({
    where: { id: cabinetId },
    select: { displayName: true, name: true, logoUrl: true },
  });
  return cabinet ? cabinetMetadata(cabinet) : {};
}

// Meme principe que dashboard/admin/layout.tsx : la garde de role et le shell
// sont poses une seule fois pour tout l'espace Cabinet RH. Le bandeau
// d'abonnement (delai de grace, lecture seule) l'est aussi, pour apparaitre
// sur chaque page sans que chacune ait a le charger.
export default async function CabinetLayout({ children }: { children: ReactNode }) {
  const { user } = await requireSession({ role: 'CABINET_RH' });

  const cabinet = user.cabinetId
    ? await prisma.cabinet.findUnique({
        where: { id: user.cabinetId },
        select: {
          billingStatus: true,
          status: true,
          suspensionType: true,
          pastDueSince: true,
          displayName: true,
          primaryColor: true,
          secondaryColor: true,
          logoUrl: true,
          name: true,
        },
      })
    : null;
  const status = normalizeBillingStatus(cabinet?.billingStatus);
  const theme = cabinet ? buildThemeCss(cabinet) : null;

  return (
    <DashboardShell
      role="CABINET_RH"
      userName={user.name}
      brandName={cabinet?.displayName ?? null}
      logoUrl={cabinet?.logoUrl ?? null}
    >
      {/* Theme du cabinet (D33) : valeurs #rrggbb validees a l'enregistrement,
          jamais du texte libre. */}
      {theme && <style dangerouslySetInnerHTML={{ __html: theme }} />}
      {/* D71 : suspension en lecture seule par le SuperAdmin. */}
      <SuspensionBanner suspended={!!cabinet && suspensionTypeOf(cabinet) !== null} />
      <BillingBanner
        status={status}
        graceEndsAt={cabinet?.pastDueSince ? graceEndsAt(cabinet.pastDueSince) : null}
      />
      {children}
    </DashboardShell>
  );
}
