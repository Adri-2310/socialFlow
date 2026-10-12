import { prisma } from '@/lib/prisma';

// Couche de lecture du dashboard Cabinet RH (/dashboard). Meme principe que
// admin-data.ts pour le SuperAdmin : une requete par concept, scopee par
// cabinetId, consommee par des composants de presentation sans etat.
//
// Toutes les requetes filtrent sur le cabinetId de la session : c'est la
// seule barriere d'isolation multi-tenant a ce niveau (voir
// doc/analysis/ARCHITECTURE_SOCIALFLOW_RBAC.md section 6), donc le
// cabinetId ne doit jamais venir d'un parametre d'URL ou d'un corps de
// requete.

export type CabinetOverview = {
  cabinetName: string;
  gestionnaires: { total: number; actifs: number; suspendus: number };
  pendingInvitations: number;
  subscription: { planName: string | null; billingPeriod: 'monthly' | 'yearly' | null };
};

export async function getCabinetOverview(cabinetId: string): Promise<CabinetOverview> {
  const now = new Date();

  const [cabinet, gestionnaires, pendingInvitations, owner] = await Promise.all([
    prisma.cabinet.findUniqueOrThrow({ where: { id: cabinetId }, select: { name: true } }),
    prisma.user.groupBy({
      by: ['status'],
      where: { cabinetId, role: 'GESTIONNAIRE_RH', deletedAt: null },
      _count: { _all: true },
    }),
    prisma.invitation.count({
      where: { cabinetId, status: 'pending', expiresAt: { gt: now } },
    }),
    prisma.user.findFirst({
      where: { cabinetId, role: 'CABINET_RH', deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { plan: true, billingPeriod: true },
    }),
  ]);

  const countFor = (status: string) =>
    gestionnaires.find((g) => g.status === status)?._count._all ?? 0;
  const actifs = countFor('actif');
  const suspendus = countFor('suspendu');

  // Le nom affiche vient de PricingPlan (modifiable depuis la configuration
  // SuperAdmin) plutot que d'un libelle fige ; repli sur l'identifiant si le
  // plan a ete supprime depuis.
  const plan = owner?.plan
    ? await prisma.pricingPlan.findUnique({ where: { planId: owner.plan }, select: { name: true } })
    : null;

  const billingPeriod =
    owner?.billingPeriod === 'monthly' || owner?.billingPeriod === 'yearly'
      ? owner.billingPeriod
      : null;

  return {
    cabinetName: cabinet.name,
    gestionnaires: { total: actifs + suspendus, actifs, suspendus },
    pendingInvitations,
    subscription: { planName: plan?.name ?? owner?.plan ?? null, billingPeriod },
  };
}
