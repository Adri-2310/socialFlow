import type { Metadata } from 'next';
import { UsersTable } from '@/components/admin/users-table';
import { getUsers } from '@/lib/admin-data';

export const metadata: Metadata = {
  title: 'Utilisateurs — Console SuperAdmin',
  description: 'Tous les comptes de la plateforme SocialFlow, tous cabinets confondus.',
};

export default async function AdminUsersPage() {
  const users = await getUsers();

  return <UsersTable users={users} />;
}
