import type { ReactNode } from 'react';
import { requireAuthorized } from '@/lib/authz/authz-page';
import { DashboardShell } from '@/components/layout/dashboard-shell';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // D20 : la console est inaccessible sans 2FA (redirection vers /profil).
  const { user } = await requireAuthorized('plateforme.superviser');

  return (
    <DashboardShell role="SUPER_ADMIN" userName={user.name}>
      {children}
    </DashboardShell>
  );
}
