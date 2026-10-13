import { prisma } from '@/lib/prisma';
import {
  normalizeBillingPeriod,
  normalizeBillingStatus,
  type BillingStatus,
} from '@/lib/billing';
import {
  GESTIONNAIRE_RESTORE_WINDOW_DAYS,
  gestionnaireRestoreDeadline,
} from '@/lib/gestionnaire-retention';

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
  subscription: {
    planName: string | null;
    billingPeriod: 'monthly' | 'yearly' | null;
    // D55 : etat d'abonnement du cabinet et ses echeances.
    status: BillingStatus;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
  };
};

export async function getCabinetOverview(cabinetId: string): Promise<CabinetOverview> {
  const now = new Date();

  const [cabinet, gestionnaires, pendingInvitations] = await Promise.all([
    prisma.cabinet.findUniqueOrThrow({
      where: { id: cabinetId },
      select: {
        name: true,
        planId: true,
        billingPeriod: true,
        billingStatus: true,
        trialEndsAt: true,
        currentPeriodEnd: true,
      },
    }),
    prisma.user.groupBy({
      by: ['status'],
      where: { cabinetId, role: 'GESTIONNAIRE_RH', deletedAt: null },
      _count: { _all: true },
    }),
    prisma.invitation.count({
      where: { cabinetId, status: 'pending', expiresAt: { gt: now } },
    }),
  ]);

  const countFor = (status: string) =>
    gestionnaires.find((g) => g.status === status)?._count._all ?? 0;
  const actifs = countFor('actif');
  const suspendus = countFor('suspendu');

  // Le nom affiche vient de PricingPlan (modifiable depuis la configuration
  // SuperAdmin) plutot que d'un libelle fige ; repli sur l'identifiant si le
  // plan a ete supprime depuis.
  const plan = cabinet.planId
    ? await prisma.pricingPlan.findUnique({
        where: { planId: cabinet.planId },
        select: { name: true },
      })
    : null;

  return {
    cabinetName: cabinet.name,
    gestionnaires: { total: actifs + suspendus, actifs, suspendus },
    pendingInvitations,
    subscription: {
      planName: plan?.name ?? cabinet.planId ?? null,
      billingPeriod: normalizeBillingPeriod(cabinet.billingPeriod),
      status: normalizeBillingStatus(cabinet.billingStatus),
      trialEndsAt: cabinet.trialEndsAt,
      currentPeriodEnd: cabinet.currentPeriodEnd,
    },
  };
}

export type GestionnaireRow = {
  id: string;
  name: string;
  email: string;
  status: 'actif' | 'suspendu';
  // D52 : true si la suspension peut etre levee par le Cabinet RH (posee par
  // lui). Une suspension du SuperAdmin, ou anterieure au champ, ne l'est pas.
  reactivatableByCabinet: boolean;
  createdAt: Date;
};

// Gestionnaires non archives du cabinet (meme perimetre que les compteurs de
// getCabinetOverview). Select explicite : rien d'autre que ce que la page
// affiche ne sort de la couche de lecture.
export async function getGestionnaires(cabinetId: string): Promise<GestionnaireRow[]> {
  const rows = await prisma.user.findMany({
    where: { cabinetId, role: 'GESTIONNAIRE_RH', deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      suspendedBy: true,
      createdAt: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    status: row.status === 'suspendu' ? 'suspendu' : 'actif',
    reactivatableByCabinet: row.status === 'suspendu' && row.suspendedBy === 'CABINET_RH',
    createdAt: row.createdAt,
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

// Le hash du jeton (Invitation.tokenHash) n'est volontairement jamais
// selectionne : le jeton en clair n'existe que dans l'email envoye (C3).
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

export type ArchivedGestionnaireRow = {
  id: string;
  name: string;
  email: string;
  deletedAt: Date;
  restorableUntil: Date;
};

// Gestionnaires retires par le cabinet et encore restaurables (D52) : retires
// par le Cabinet RH lui-meme (deletedBy) - jamais une auto-suppression ni un
// archivage du SuperAdmin - et dans le delai de restauration.
export async function getArchivedGestionnaires(
  cabinetId: string,
  now: Date = new Date(),
): Promise<ArchivedGestionnaireRow[]> {
  const since = new Date(now.getTime() - GESTIONNAIRE_RESTORE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const rows = await prisma.user.findMany({
    where: {
      cabinetId,
      role: 'GESTIONNAIRE_RH',
      deletedBy: 'CABINET_RH',
      deletedAt: { gte: since },
    },
    orderBy: { deletedAt: 'desc' },
    select: { id: true, name: true, email: true, deletedAt: true },
  });

  return rows.flatMap((row) =>
    row.deletedAt
      ? [{ ...row, deletedAt: row.deletedAt, restorableUntil: gestionnaireRestoreDeadline(row.deletedAt) }]
      : [],
  );
}
