import type { Metadata } from 'next';
import { requireAuthorized } from '@/lib/authz/authz-page';
import { CabinetsTable } from '@/components/admin/cabinets-table';
import { getCabinets } from '@/lib/admin/admin-data';

export const metadata: Metadata = {
  title: 'Cabinets — Console SuperAdmin',
  description: 'Liste complète des cabinets clients SocialFlow.',
};

export default async function AdminCabinetsPage() {
  // Garde propre à la page : un layout n'est pas ré-exécuté à chaque navigation.
  await requireAuthorized('cabinet.administrer');

  const { rows } = await getCabinets();

  return <CabinetsTable cabinets={rows} />;
}
