import { prisma } from '@/lib/prisma';
import type { CabinetRow } from '@/components/admin/cabinets-table';
import type { UserRow } from '@/components/admin/users-table';
import type { AuditLogEntry } from '@/components/admin/audit-log-list';

// Partage entre la vue d'ensemble (/dashboard/admin, apercu limite) et la
// page dediee (/dashboard/admin/cabinets, liste complete) - meme requete,
// deux presentations differentes du meme CabinetsTable (voir sa prop `limit`).
export async function getCabinets() {
  const cabinets = await prisma.cabinet.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      users: { where: { role: 'CABINET_RH' }, select: { plan: true } },
      _count: { select: { users: { where: { role: 'GESTIONNAIRE_RH' } } } },
    },
  });
  const rows: CabinetRow[] = cabinets.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    plan: c.users[0]?.plan ?? null,
    gestionnaireCount: c._count.users,
    createdAt: c.createdAt.toISOString(),
    deletedAt: c.deletedAt?.toISOString() ?? null,
  }));
  return { cabinets, rows };
}

export async function getUsers(): Promise<UserRow[]> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
      deletedAt: true,
      cabinet: { select: { name: true } },
    },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role ?? 'CABINET_RH',
    status: u.status,
    cabinetName: u.cabinet?.name ?? null,
    createdAt: u.createdAt.toISOString(),
    deletedAt: u.deletedAt?.toISOString() ?? null,
  }));
}

export async function getAuditLogEntries(take: number): Promise<AuditLogEntry[]> {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take,
    include: {
      actor: { select: { name: true } },
      cabinet: { select: { name: true } },
      targetUser: { select: { name: true } },
    },
  });
  return logs.map((log) => ({
    id: log.id,
    action: log.action,
    createdAt: log.createdAt.toISOString(),
    actorName: log.actor?.name ?? null,
    cabinetName: log.cabinet?.name ?? null,
    targetUserName: log.targetUser?.name ?? null,
  }));
}
