import { prisma } from '@/lib/prisma';
import type { Prisma } from '../../../generated/prisma/client';
import {
  CABINET_AUDIT_ACTION_LIST,
  PLATFORM_ACTOR_LABEL,
  addDays,
  describeAuditEntry,
  isCabinetAuditAction,
  parseBrusselsDayStart,
} from '@/lib/cabinet/cabinet-audit-labels';

// Journal d'audit du cabinet (D31) : uniquement les entrees portant le
// cabinetId de la session, jamais un identifiant venu de l'URL. Les filtres
// ne font que restreindre ce perimetre.

export const AUDIT_PAGE_SIZE = 25;

export type CabinetAuditFilters = {
  action?: string;
  userId?: string;
  from?: string; // AAAA-MM-JJ, inclus
  to?: string; // AAAA-MM-JJ, inclus
};

export type CabinetAuditEntry = {
  id: string;
  action: string;
  createdAt: Date;
  actorLabel: string | null;
  message: string;
};

export type CabinetAuditPage = {
  entries: CabinetAuditEntry[];
  total: number;
  page: number;
  pageCount: number;
};

function readString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

export async function getCabinetAuditLog(
  cabinetId: string,
  filters: CabinetAuditFilters = {},
  page = 1,
): Promise<CabinetAuditPage> {
  const where: Prisma.AuditLogWhereInput = {
    cabinetId,
    action: isCabinetAuditAction(filters.action)
      ? filters.action
      : { in: CABINET_AUDIT_ACTION_LIST },
  };

  // "Personne" : auteur OU cible de l'action.
  if (filters.userId) {
    where.OR = [{ actorId: filters.userId }, { targetUserId: filters.userId }];
  }

  const fromDate = parseBrusselsDayStart(filters.from);
  const toDay = parseBrusselsDayStart(filters.to);
  if (fromDate || toDay) {
    where.createdAt = {
      ...(fromDate ? { gte: fromDate } : {}),
      // Borne haute exclusive : le lendemain a minuit (jour "to" inclus).
      ...(toDay ? { lt: addDays(toDay, 1) } : {}),
    };
  }

  const total = await prisma.auditLog.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (currentPage - 1) * AUDIT_PAGE_SIZE,
    take: AUDIT_PAGE_SIZE,
    select: {
      id: true,
      action: true,
      createdAt: true,
      metadata: true,
      actor: { select: { name: true, role: true } },
      targetUser: { select: { name: true } },
    },
  });

  return {
    total,
    page: currentPage,
    pageCount,
    entries: rows.map((row) => ({
      id: row.id,
      action: row.action,
      createdAt: row.createdAt,
      // Un SuperAdmin n'est jamais nomme : le cabinet voit l'administration.
      actorLabel:
        row.actor?.role === 'SUPER_ADMIN' ? PLATFORM_ACTOR_LABEL : (row.actor?.name ?? null),
      message: describeAuditEntry({
        action: row.action,
        targetName: row.targetUser?.name ?? null,
        email: readString(row.metadata, 'email'),
        previousEmail: readString(row.metadata, 'previousEmail'),
        newEmail: readString(row.metadata, 'newEmail'),
        entreprise: readString(row.metadata, 'entreprise'),
      }),
    })),
  };
}

export type AuditUserOption = { id: string; name: string };

// Personnes proposees dans le filtre : les gestionnaires du cabinet (archives
// compris, leurs actions restent dans le journal). Le titulaire (Cabinet RH)
// n'y figure pas : c'est lui qui consulte le journal, et il est l'auteur de
// presque toutes les entrees.
export async function getCabinetAuditUsers(cabinetId: string): Promise<AuditUserOption[]> {
  return prisma.user.findMany({
    where: { cabinetId, role: 'GESTIONNAIRE_RH' },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
}
