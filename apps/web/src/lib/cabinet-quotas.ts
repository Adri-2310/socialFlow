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
  // null : cabinet sans plan connu, aucun quota applique (voir getCabinetPlanQuotas).
  limits: PlanQuotas | null;
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
export async function getCabinetPlanQuotas(cabinetId: string): Promise<PlanQuotas | null> {
  const cabinet = await prisma.cabinet.findUnique({
    where: { id: cabinetId },
    select: { planId: true },
  });
  if (!cabinet?.planId) return null;

  const plan = await prisma.pricingPlan.findUnique({
    where: { planId: cabinet.planId },
    select: { maxEntreprises: true, maxUtilisateurs: true, maxStorageMb: true },
  });
  return plan ?? null;
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
export function quotaExceededBody(quota: QuotaKey, limit: number, used: number) {
  return { error: 'QUOTA_EXCEEDED' as const, quota, limit, used };
}
