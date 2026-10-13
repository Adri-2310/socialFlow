import { prisma } from '@/lib/prisma';

// Quotas bloquants d'un cabinet (D15, valeurs par defaut en D34,
// roles/02-cabinet-rh.md § 9). null = illimite.
export type PlanQuotas = {
  maxEntreprises: number | null;
  maxUtilisateurs: number | null;
  maxStorageMb: number | null;
};

export type QuotaKey = keyof PlanQuotas;

export type CabinetQuotaUsage = {
  // null : cabinet sans plan connu, aucun quota applique (voir resolvePlanQuotas).
  limits: PlanQuotas | null;
  // Utilisateurs du cabinet = Cabinet RH + gestionnaires non archives
  // (suspendus compris : ils gardent leur place). Les invitations en attente
  // reservent une place, sinon un cabinet pourrait en envoyer sans limite et
  // depasser son quota des qu'elles sont acceptees.
  utilisateurs: { members: number; pendingInvitations: number; used: number };
  // Pas encore de table d'entreprises ni de documents (chantiers C1 et C5) :
  // 0 est donc la valeur reelle, pas un manque.
  entreprises: { used: number };
  storageMb: { used: number };
};

// Regle pure : le quota est atteint des que l'usage egale la limite (on ne
// peut plus AJOUTER). null = illimite.
export function isQuotaReached(used: number, limit: number | null): boolean {
  return limit !== null && used >= limit;
}

// Part consommee, bornee a [0, 100], pour les barres de progression.
export function quotaPercent(used: number, limit: number | null): number {
  if (limit === null || limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

// Le plan du cabinet est celui de son titulaire (User.plan, dette C2 : il
// migrera sur Cabinet). Un plan archive continue de s'appliquer a ceux qui
// l'ont deja. Sans plan connu (compte cree sans plan, plan supprime), aucun
// quota n'est applique plutot que de bloquer un cabinet sur une valeur
// inventee.
async function resolvePlanQuotas(cabinetId: string): Promise<PlanQuotas | null> {
  const owner = await prisma.user.findFirst({
    where: { cabinetId, role: 'CABINET_RH', deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { plan: true },
  });
  if (!owner?.plan) return null;

  const plan = await prisma.pricingPlan.findUnique({
    where: { planId: owner.plan },
    select: { maxEntreprises: true, maxUtilisateurs: true, maxStorageMb: true },
  });
  return plan ?? null;
}

export async function getCabinetQuotaUsage(cabinetId: string): Promise<CabinetQuotaUsage> {
  const [limits, members, pendingInvitations] = await Promise.all([
    resolvePlanQuotas(cabinetId),
    prisma.user.count({
      where: {
        cabinetId,
        role: { in: ['CABINET_RH', 'GESTIONNAIRE_RH'] },
        deletedAt: null,
      },
    }),
    prisma.invitation.count({
      where: {
        cabinetId,
        role: 'GESTIONNAIRE_RH',
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
    }),
  ]);

  return {
    limits,
    utilisateurs: { members, pendingInvitations, used: members + pendingInvitations },
    entreprises: { used: 0 },
    storageMb: { used: 0 },
  };
}

// Reponse d'API commune quand un ajout depasserait le quota
// (CONVENTIONS.md § 3 : 403 QUOTA_EXCEEDED avec le quota concerne).
export function quotaExceededBody(quota: QuotaKey, limit: number, used: number) {
  return { error: 'QUOTA_EXCEEDED' as const, quota, limit, used };
}
