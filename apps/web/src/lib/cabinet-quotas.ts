import { prisma } from '@/lib/prisma';

// Quotas bloquants d'un cabinet (D15, valeurs par defaut en D34,
// roles/02-cabinet-rh.md § 9). null = illimite.
export type PlanQuotas = {
  maxEntreprises: number | null;
  maxUtilisateurs: number | null;
  maxStorageMb: number | null;
};

export type QuotaKey = keyof PlanQuotas;

// Quotas appliques a un cabinet. Pendant un downgrade programme (D75), ce sont les
// plus stricts du plan actuel et du plan vise ; `pendingPlanName` nomme ce plan
// pour expliquer pourquoi la limite est plus basse.
export type EffectiveQuotas = PlanQuotas & { pendingPlanName?: string | null };

export type CabinetQuotaUsage = {
  // null : cabinet sans plan connu, aucun quota applique (voir getCabinetPlanQuotas).
  limits: EffectiveQuotas | null;
  // D56 : le quota "utilisateurs" (maxUtilisateurs) ne compte que les
  // gestionnaires non archives, le titulaire (Cabinet RH) n'y figure pas
  // (suspendus compris : ils gardent leur place). Les invitations en attente
  // reservent une place, sinon un cabinet pourrait en envoyer sans limite et
  // depasser son quota des qu'elles sont acceptees.
  utilisateurs: { members: number; pendingInvitations: number; used: number };
  // Entreprises clientes non archivees (une entreprise archivee libere sa
  // place). Pas encore de documents (chantier C5) : le stockage vaut 0, valeur
  // reelle et non un manque.
  entreprises: { used: number };
  storageMb: { used: number };
};

// Regle pure : le quota est atteint des que l'usage egale la limite (on ne
// peut plus AJOUTER). null = illimite.
export function isQuotaReached(used: number, limit: number | null): boolean {
  return limit !== null && used >= limit;
}

// Defini dans un module sans acces donnees (composants client) ; reexporte
// ici pour les imports existants.
export { formatStorageMb } from '@/lib/quota-format';

// Part consommee, bornee a [0, 100], pour les barres de progression.
export function quotaPercent(used: number, limit: number | null): number {
  if (limit === null || limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

// Le plan est celui du cabinet (Cabinet.planId, D55). Un plan archive continue de s'appliquer a ceux qui
// l'ont deja. Sans plan connu (compte cree sans plan, plan supprime), aucun
// quota n'est applique plutot que de bloquer un cabinet sur une valeur
// inventee.
//
// D75 : tant qu'un changement vers un autre plan est programme, ses quotas
// s'appliquent deja aux nouveaux ajouts (le plus strict des deux), pour que le
// cabinet ne depasse pas le plan vise a la date d'effet.
export async function getCabinetPlanQuotas(cabinetId: string): Promise<EffectiveQuotas | null> {
  const cabinet = await prisma.cabinet.findUnique({
    where: { id: cabinetId },
    select: { planId: true, pendingPlanId: true },
  });
  if (!cabinet?.planId) return null;

  const current = await prisma.pricingPlan.findUnique({
    where: { planId: cabinet.planId },
    select: { maxEntreprises: true, maxUtilisateurs: true, maxStorageMb: true },
  });
  if (!current) return null;

  if (cabinet.pendingPlanId && cabinet.pendingPlanId !== cabinet.planId) {
    const pending = await prisma.pricingPlan.findUnique({
      where: { planId: cabinet.pendingPlanId },
      select: { name: true, maxEntreprises: true, maxUtilisateurs: true, maxStorageMb: true },
    });
    if (pending) return { ...reserveQuotas(current, pending), pendingPlanName: pending.name };
  }
  return current;
}

// Limite la plus stricte de deux (null = illimite).
export function stricterLimit(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

// Quotas reserves pendant un downgrade programme : le plus strict, quota par quota.
export function reserveQuotas(current: PlanQuotas, pending: PlanQuotas): PlanQuotas {
  return {
    maxEntreprises: stricterLimit(current.maxEntreprises, pending.maxEntreprises),
    maxUtilisateurs: stricterLimit(current.maxUtilisateurs, pending.maxUtilisateurs),
    maxStorageMb: stricterLimit(current.maxStorageMb, pending.maxStorageMb),
  };
}

export async function getCabinetQuotaUsage(cabinetId: string): Promise<CabinetQuotaUsage> {
  const [limits, members, pendingInvitations, entreprises] = await Promise.all([
    getCabinetPlanQuotas(cabinetId),
    prisma.user.count({
      where: { cabinetId, role: 'GESTIONNAIRE_RH', deletedAt: null },
    }),
    prisma.invitation.count({
      where: {
        cabinetId,
        role: 'GESTIONNAIRE_RH',
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
    }),
    prisma.entreprise.count({ where: { cabinetId, deletedAt: null } }),
  ]);

  return {
    limits,
    utilisateurs: { members, pendingInvitations, used: members + pendingInvitations },
    entreprises: { used: entreprises },
    storageMb: { used: 0 },
  };
}

// Reponse d'API commune quand un ajout depasserait le quota
// (CONVENTIONS.md § 3 : 403 QUOTA_EXCEEDED avec le quota concerne).
// `pendingPlan` : nom du plan vise par un downgrade programme, quand c'est lui qui
// fixe la limite (D75) ; l'interface l'explique au lieu de proposer un upgrade.
export function quotaExceededBody(
  quota: QuotaKey,
  limit: number,
  used: number,
  pendingPlan?: string | null,
) {
  return {
    error: 'QUOTA_EXCEEDED' as const,
    quota,
    limit,
    used,
    ...(pendingPlan ? { pendingPlan } : {}),
  };
}
