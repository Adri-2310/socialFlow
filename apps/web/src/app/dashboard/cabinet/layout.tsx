import type { ReactNode } from 'react';
import { requireSession } from '@/lib/require-session';
import { DashboardShell } from '@/components/layout/dashboard-shell';

// Meme principe que dashboard/admin/layout.tsx : la garde de role et le shell
// sont poses une seule fois pour tout l'espace Cabinet RH.
export default async function CabinetLayout({ children }: { children: ReactNode }) {
  const { user } = await requireSession({ role: 'CABINET_RH' });

  return (
    <DashboardShell role="CABINET_RH" userName={user.name}>
      {children}
    </DashboardShell>
  );
}
