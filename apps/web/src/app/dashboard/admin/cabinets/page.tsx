import type { Metadata } from 'next';
import { CabinetsTable } from '@/components/admin/cabinets-table';
import { getCabinets } from '@/lib/admin-data';

export const metadata: Metadata = {
  title: 'Cabinets — Console SuperAdmin',
  description: 'Liste complète des cabinets clients SocialFlow.',
};

export default async function AdminCabinetsPage() {
  const { rows } = await getCabinets();

  return <CabinetsTable cabinets={rows} />;
}
