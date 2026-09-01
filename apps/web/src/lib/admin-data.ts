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

export type MonitoringData = {
  db: { healthy: boolean; latencyMs: number | null };
  activeSessions: number;
  activeUsers: number;
  cabinetsByStatus: { actif: number; suspendu: number; archive: number };
  usersByStatus: { actif: number; suspendu: number; archive: number };
  rateLimitHits: { key: string; count: number; lastRequest: string }[];
};

// Contrairement a getCabinets/getUsers, aucune table ne represente "l'etat de
// la plateforme" telle quelle : cette fonction assemble des signaux reels
// deja disponibles (latence DB mesuree en direct, compteurs Session/
// Cabinet/User, table RateLimit deja utilisee par better-auth) plutot que
// d'inventer des metriques (uptime, CPU...) qu'on ne mesure pas reellement.
export async function getMonitoringData(): Promise<MonitoringData> {
  const dbStart = Date.now();
  let dbHealthy = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbHealthy = false;
  }
  const dbLatencyMs = dbHealthy ? Date.now() - dbStart : null;

  const [
    activeSessions,
    activeUserIds,
    cabinetsActifs,
    cabinetsSuspendus,
    cabinetsArchives,
    usersActifs,
    usersSuspendus,
    usersArchives,
    rateLimitRows,
  ] = await Promise.all([
    prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
    // Distinct des utilisateurs derriere ces sessions : une meme personne
    // reconnectee plusieurs fois (nouvel appareil, cookie efface...) compte
    // pour plusieurs sessions mais une seule personne reellement active.
    prisma.session.findMany({
      where: { expiresAt: { gt: new Date() } },
      distinct: ['userId'],
      select: { userId: true },
    }),
    prisma.cabinet.count({ where: { status: 'actif', deletedAt: null } }),
    prisma.cabinet.count({ where: { status: 'suspendu', deletedAt: null } }),
    prisma.cabinet.count({ where: { deletedAt: { not: null } } }),
    prisma.user.count({ where: { status: 'actif', deletedAt: null } }),
    prisma.user.count({ where: { status: 'suspendu', deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: { not: null } } }),
    prisma.rateLimit.findMany({ orderBy: { count: 'desc' }, take: 10 }),
  ]);

  return {
    db: { healthy: dbHealthy, latencyMs: dbLatencyMs },
    activeSessions,
    activeUsers: activeUserIds.length,
    cabinetsByStatus: { actif: cabinetsActifs, suspendu: cabinetsSuspendus, archive: cabinetsArchives },
    usersByStatus: { actif: usersActifs, suspendu: usersSuspendus, archive: usersArchives },
    rateLimitHits: rateLimitRows.map((r) => ({
      key: r.key,
      count: r.count,
      lastRequest: new Date(Number(r.lastRequest)).toISOString(),
    })),
  };
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
