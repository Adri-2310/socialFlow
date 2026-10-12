import type { ReactNode } from 'react';
import { requireSession } from '@/lib/require-session';
import { DashboardShell } from '@/components/layout/dashboard-shell';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { user } = await requireSession({ role: 'SUPER_ADMIN' });

  return (
    <DashboardShell role="SUPER_ADMIN" userName={user.name}>
      {children}
    </DashboardShell>
  );
}
