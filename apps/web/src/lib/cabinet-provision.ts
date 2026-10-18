import { prisma } from '@/lib/prisma';

// Creation du cabinet d'un titulaire a l'inscription (D25, D32, D55). Partagee
// par l'inscription par email (hook d'auth) et par la finalisation d'une
// inscription Google/Microsoft (api/register/finalize). Le plan appartient au
// cabinet (D55), jamais a la personne.

export type PlanChoice = { planId: string; billingPeriod: 'monthly' | 'yearly' };

// Plan demande a l'inscription : il doit exister et ne pas etre archive (les
// plans sont geres dynamiquement, un enum fige rejetterait un plan cree apres
// coup). Une valeur invalide - forgee ou archivee entre le chargement du
// formulaire et la soumission - donne null : le cabinet est cree sans plan plutot
// que d'abandonner tout le compte.
export async function resolvePlanChoice(
  planId: unknown,
  billingPeriod: unknown,
): Promise<PlanChoice | null> {
  if (typeof planId !== 'string' || planId.length === 0 || planId.length > 100) return null;
  const plan = await prisma.pricingPlan.findFirst({
    where: { planId, archivedAt: null },
    select: { id: true },
  });
  if (!plan) return null;
  return { planId, billingPeriod: billingPeriod === 'yearly' ? 'yearly' : 'monthly' };
}

// Raison sociale du cabinet : celle saisie a l'inscription, sinon un nom par
// defaut tire du nom du titulaire.
export function defaultCabinetName(owner: { name: string; cabinetName?: string | null }): string {
  return owner.cabinetName?.trim() || `Cabinet de ${owner.name}`;
}

// Cree le cabinet et son entree d'audit. Le rattachement du titulaire
// (User.cabinetId) est fait par l'appelant : le hook d'auth passe par better-auth,
// la finalisation OAuth par Prisma. D25, D32 : aucun abonnement n'est cree ici, le
// cabinet reste « en attente de paiement » jusqu'au Stripe Checkout.
export async function createCabinetForOwner(
  owner: { id: string; name: string; cabinetName?: string | null },
  plan: PlanChoice | null,
): Promise<string> {
  const cabinet = await prisma.cabinet.create({
    data: {
      name: defaultCabinetName(owner),
      ...(plan ? { planId: plan.planId, billingPeriod: plan.billingPeriod } : {}),
    },
    select: { id: true },
  });
  await prisma.auditLog.create({
    data: { action: 'CABINET_CREATED', actorId: owner.id, cabinetId: cabinet.id },
  });
  return cabinet.id;
}
