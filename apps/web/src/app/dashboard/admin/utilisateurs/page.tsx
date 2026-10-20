import type { Metadata } from 'next';
import { requireAuthorized } from '@/lib/authz/authz-page';
import { UsersTable } from '@/components/admin/users-table';
import { getUsers } from '@/lib/admin/admin-data';

export const metadata: Metadata = {
  title: 'Utilisateurs — Console SuperAdmin',
  description: 'Tous les comptes de la plateforme SocialFlow, tous cabinets confondus.',
};

export default async function AdminUsersPage() {
  // Garde propre à la page : un layout n'est pas ré-exécuté à chaque navigation.
  await requireAuthorized('utilisateur.lister');

  const users = await getUsers();

  return <UsersTable users={users} />;
}
