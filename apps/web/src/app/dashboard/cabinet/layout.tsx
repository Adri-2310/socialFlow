import type { ReactNode } from 'react';
import { requireSession } from '@/lib/require-session';
import { prisma } from '@/lib/prisma';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { BillingBanner } from '@/components/cabinet/billing-banner';
import { graceEndsAt, normalizeBillingStatus } from '@/lib/billing';

// Meme principe que dashboard/admin/layout.tsx : la garde de role et le shell
// sont poses une seule fois pour tout l'espace Cabinet RH. Le bandeau
// d'abonnement (delai de grace, lecture seule) l'est aussi, pour apparaitre
// sur chaque page sans que chacune ait a le charger.
export default async function CabinetLayout({ children }: { children: ReactNode }) {
  const { user } = await requireSession({ role: 'CABINET_RH' });

  const cabinet = user.cabinetId
    ? await prisma.cabinet.findUnique({
        where: { id: user.cabinetId },
        select: { billingStatus: true, pastDueSince: true },
      })
    : null;
  const status = normalizeBillingStatus(cabinet?.billingStatus);

  return (
    <DashboardShell role="CABINET_RH" userName={user.name}>
      <BillingBanner
        status={status}
        graceEndsAt={cabinet?.pastDueSince ? graceEndsAt(cabinet.pastDueSince) : null}
      />
      {children}
    </DashboardShell>
  );
}
