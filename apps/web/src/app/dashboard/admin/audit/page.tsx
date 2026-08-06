import type { Metadata } from 'next';
import { AuditLogList } from '@/components/admin/audit-log-list';
import { getAuditLogEntries } from '@/lib/admin-data';

export const metadata: Metadata = {
  title: "Journal d'audit — Console SuperAdmin",
  description: "Historique complet des événements de la plateforme SocialFlow.",
};

// Plafond raisonnable pour un TFE plutot que "tout, sans limite" : le
// journal grossit en continu, pagine cote client par tranches de 200
// evenements les plus recents (voir AuditLogList).
const MAX_ENTRIES = 200;

export default async function AdminAuditPage() {
  const logs = await getAuditLogEntries(MAX_ENTRIES);

  return <AuditLogList logs={logs} />;
}
