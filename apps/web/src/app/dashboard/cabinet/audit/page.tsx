import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CabinetAuditLog } from '@/components/cabinet/audit-log';
import { requireSession } from '@/lib/require-session';
import {
  getCabinetAuditLog,
  getCabinetAuditUsers,
  type CabinetAuditFilters,
} from '@/lib/cabinet-audit';

export const metadata: Metadata = {
  title: "Journal d'audit — SocialFlow",
  description: "Actions réalisées dans votre cabinet.",
};

type SearchParams = Record<string, string | string[] | undefined>;

// Une valeur de requete est soit une chaine, soit repetee (tableau) : on ne
// garde que la premiere, et rien si elle est vide.
function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.trim() ? v.trim() : undefined;
}

export default async function CabinetAuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user } = await requireSession({ role: 'CABINET_RH' });
  // Le cabinetId vient de la session, jamais de l'URL (isolation
  // multi-tenant, FONCTIONNEMENT.md § 4) : les parametres ne servent qu'a
  // filtrer a l'interieur de ce cabinet.
  if (!user.cabinetId) redirect('/dashboard');

  const params = await searchParams;
  const filters: CabinetAuditFilters = {
    action: first(params.action),
    userId: first(params.user),
    from: first(params.from),
    to: first(params.to),
  };
  const page = Number(first(params.page)) || 1;

  const [data, users] = await Promise.all([
    getCabinetAuditLog(user.cabinetId, filters, page),
    getCabinetAuditUsers(user.cabinetId),
  ]);

  return (
    <CabinetAuditLog
      data={data}
      filters={filters}
      users={users}
      basePath="/dashboard/cabinet/audit"
    />
  );
}
