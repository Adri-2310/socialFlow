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

export type GestionnaireRow = {
  id: string;
  name: string;
  email: string;
  status: 'actif' | 'suspendu';
  createdAt: Date;
};

// Gestionnaires non archives du cabinet (meme perimetre que les compteurs de
// getCabinetOverview). Select explicite : rien d'autre que ce que la page
// affiche ne sort de la couche de lecture.
export async function getGestionnaires(cabinetId: string): Promise<GestionnaireRow[]> {
  const rows = await prisma.user.findMany({
    where: { cabinetId, role: 'GESTIONNAIRE_RH', deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, email: true, status: true, createdAt: true },
  });

  return rows.map((row) => ({
    ...row,
    status: row.status === 'suspendu' ? 'suspendu' : 'actif',
  }));
}

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export type InvitationRow = {
  id: string;
  email: string;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
};

// Statut affiche (roles/02 § 4.2) : en base, une invitation jamais acceptee
// reste "pending" apres son echeance (aucune tache ne la fait passer a
// "expired" pour l'instant) ; on la presente donc comme expiree des que la
// date est depassee.
export function invitationDisplayStatus(
  status: string,
  expiresAt: Date,
  now: Date = new Date(),
): InvitationStatus {
  if (status === 'accepted' || status === 'revoked' || status === 'expired') return status;
  return expiresAt.getTime() <= now.getTime() ? 'expired' : 'pending';
}

// Le jeton (Invitation.token) n'est volontairement jamais selectionne : il
// n'a pas a quitter la base, il n'existe que dans l'email envoye (C3).
export async function getInvitations(cabinetId: string): Promise<InvitationRow[]> {
  const now = new Date();
  const rows = await prisma.invitation.findMany({
    where: { cabinetId, role: 'GESTIONNAIRE_RH' },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, email: true, status: true, expiresAt: true, createdAt: true },
  });

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    status: invitationDisplayStatus(row.status, row.expiresAt, now),
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  }));
}
