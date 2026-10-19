import type { ReactNode } from 'react';
import { requireSession } from '@/lib/require-session';
import { DashboardShell } from '@/components/layout/dashboard-shell';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // D20 : la console est inaccessible sans 2FA (redirection vers /profil).
  const { user } = await requireSession({ role: 'SUPER_ADMIN', twoFactor: true });

  return (
    <DashboardShell role="SUPER_ADMIN" userName={user.name}>
      {children}
    </DashboardShell>
  );
}
