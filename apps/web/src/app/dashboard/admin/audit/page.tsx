import type { Metadata } from 'next';
import { requireAuthorized } from '@/lib/authz/authz-page';
import { AuditLogList } from '@/components/admin/audit-log-list';
import { getAuditLogEntries } from '@/lib/admin/admin-data';

export const metadata: Metadata = {
  title: "Journal d'audit — Console SuperAdmin",
  description: "Historique complet des événements de la plateforme SocialFlow.",
};

// Plafond raisonnable pour un TFE plutot que "tout, sans limite" : le
// journal grossit en continu, pagine cote client par tranches de 200
// evenements les plus recents (voir AuditLogList).
const MAX_ENTRIES = 200;

export default async function AdminAuditPage() {
  // Garde propre à la page : un layout n'est pas ré-exécuté à chaque navigation.
  await requireAuthorized('audit.voir');

  const logs = await getAuditLogEntries(MAX_ENTRIES);

  return <AuditLogList logs={logs} />;
}
