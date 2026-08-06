import type { ReactNode } from 'react';
import { requireSession } from '@/lib/require-session';
import { AdminShell } from '@/components/admin/admin-shell';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { user } = await requireSession({ role: 'SUPER_ADMIN' });

  return <AdminShell userName={user.name}>{children}</AdminShell>;
}
