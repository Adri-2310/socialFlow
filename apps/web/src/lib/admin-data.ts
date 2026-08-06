import { prisma } from '@/lib/prisma';
import type { CabinetRow } from '@/components/admin/cabinets-table';
import type { AuditLogEntry } from '@/components/admin/audit-log-list';

// Partage entre la vue d'ensemble (/dashboard/admin, apercu limite) et la
// page dediee (/dashboard/admin/cabinets, liste complete) - meme requete,
// deux presentations differentes du meme CabinetsTable (voir sa prop `limit`).
export async function getCabinets() {
  const cabinets = await prisma.cabinet.findMany({
    orderBy: { createdAt: 'desc' },
    include: { users: { where: { role: 'CABINET_RH' }, select: { plan: true } } },
  });
  const rows: CabinetRow[] = cabinets.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    plan: c.users[0]?.plan ?? null,
  }));
  return { cabinets, rows };
}

export async function getAuditLogEntries(take: number): Promise<AuditLogEntry[]> {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take,
    include: { actor: { select: { name: true } }, cabinet: { select: { name: true } } },
  });
  return logs.map((log) => ({
    id: log.id,
    action: log.action,
    createdAt: log.createdAt.toISOString(),
    actorName: log.actor?.name ?? null,
    cabinetName: log.cabinet?.name ?? null,
  }));
}
