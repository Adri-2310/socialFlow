import { entrepriseWhere, type Scope } from '@/lib/authz/authz';
import { premierMoisOuvrable } from './periode-dates';
import { prisma } from '@/lib/prisma';
import { STATUTS_PERIODE } from '@/lib/schemas/periode';

export type PeriodeRow = {
  id: string;
  annee: number;
  mois: number;
  statut: (typeof STATUTS_PERIODE)[number];
  dateLimite: string;
  verrouilleeLe: string | null;
};

// Les périodes d'une entreprise du périmètre (gestionnaire assigné, ou l'entreprise elle-même),
// de la plus récente à la plus ancienne ; null si l'entreprise n'y est pas (non assignée,
// archivée, d'un autre cabinet, inexistante : le 404 ne distingue pas ces cas).
export async function getPeriodesEntreprise(
  scope: Scope,
  entrepriseId: string,
): Promise<{
  entreprise: { id: string; name: string; jourLimitePrestations: number };
  periodes: PeriodeRow[];
  // D114 : premier mois qu'on peut ouvrir pour cette entreprise (début de la paie ou inscription).
  premierMois: { annee: number; mois: number };
} | null> {
  const entreprise = await prisma.entreprise.findFirst({
    // AND et non une fusion d'objets : entrepriseWhere(scope) pose déjà un filtre sur `id`.
    where: { AND: [entrepriseWhere(scope), { id: entrepriseId, deletedAt: null }] },
    select: { id: true, name: true, jourLimitePrestations: true, createdAt: true },
  });
  if (!entreprise) return null;

  const periodes = await prisma.periodePaie.findMany({
    where: { entrepriseId: entreprise.id },
    orderBy: [{ annee: 'desc' }, { mois: 'desc' }],
    select: {
      id: true,
      annee: true,
      mois: true,
      statut: true,
      dateLimite: true,
      verrouilleeLe: true,
    },
  });

  const { createdAt, ...fiche } = entreprise;
  return {
    entreprise: fiche,
    premierMois: premierMoisOuvrable(createdAt),
    periodes: periodes.map((p) => ({
      id: p.id,
      annee: p.annee,
      mois: p.mois,
      statut: p.statut as PeriodeRow['statut'],
      dateLimite: p.dateLimite.toISOString().slice(0, 10),
      verrouilleeLe: p.verrouilleeLe?.toISOString() ?? null,
    })),
  };
}

// La période si son entreprise est dans le périmètre du gestionnaire, sinon null.
export async function findPeriodeInScope(
  scope: Scope,
  periodeId: string,
): Promise<{ id: string; entrepriseId: string } | null> {
  if (scope.kind !== 'entreprises') return null;
  return prisma.periodePaie.findFirst({
    where: {
      id: periodeId,
      cabinetId: scope.cabinetId,
      entreprise: { AND: [entrepriseWhere(scope), { deletedAt: null }] },
    },
    select: { id: true, entrepriseId: true },
  });
}
