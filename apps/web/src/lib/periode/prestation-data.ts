import { entrepriseWhere, type Scope } from '@/lib/authz/authz';
import { prisma } from '@/lib/prisma';
import type { PrestationInput } from '@/lib/schemas/prestation';
import type { PeriodeRow } from './periode-data';
import { bornesDuMois } from './periode-dates';

// Périmètres qui lisent et encodent des prestations : le gestionnaire assigné et l'entreprise
// elle-même (D91). Le Cabinet RH, le SuperAdmin et le collaborateur n'y ont pas accès (D8, D26).
export type PrestationScope = Extract<Scope, { kind: 'entreprises' | 'entreprise' }>;

export const isPrestationScope = (scope: Scope): scope is PrestationScope =>
  scope.kind === 'entreprises' || scope.kind === 'entreprise';

// La période si son entreprise est dans le périmètre, sinon null (non assignée, archivée, d'un
// autre cabinet, inexistante : le 404 ne distingue pas ces cas).
export async function findPeriodeAccessible(scope: Scope, periodeId: string) {
  if (!isPrestationScope(scope)) return null;
  return prisma.periodePaie.findFirst({
    where: {
      id: periodeId,
      cabinetId: scope.cabinetId,
      entreprise: { AND: [entrepriseWhere(scope), { deletedAt: null }] },
    },
    select: { id: true, entrepriseId: true, annee: true, mois: true },
  });
}

// Le salarié visé, s'il appartient à l'entreprise de la période et n'est pas archivé.
export async function findSalarieDeLaPeriode(
  scope: PrestationScope,
  entrepriseId: string,
  salarieId: string,
) {
  return prisma.salarie.findFirst({
    where: { id: salarieId, cabinetId: scope.cabinetId, entrepriseId, deletedAt: null },
    select: { id: true },
  });
}

export type PrestationRow = PrestationInput & {
  // Qui a encodé en dernier (le gestionnaire voit qui a encodé quoi), null si le compte a été purgé.
  modifiePar: { name: string; role: string | null } | null;
  modifieLe: string;
};

export type SalariePrestationRow = {
  id: string;
  nom: string;
  prenom: string;
  // null : aucun écart, « mois complet selon son régime ».
  prestation: PrestationRow | null;
};

// Les salariés actifs pendant le mois de la période, avec leurs prestations (D92) : entrés au
// plus tard le dernier jour du mois, ni sortis avant le premier, ni archivés. null si la
// période n'est pas dans le périmètre.
export async function getPrestationsPeriode(
  scope: Scope,
  periodeId: string,
): Promise<{
  periode: PeriodeRow & { entrepriseId: string; entrepriseNom: string };
  salaries: SalariePrestationRow[];
} | null> {
  if (!isPrestationScope(scope)) return null;

  const periode = await prisma.periodePaie.findFirst({
    where: {
      id: periodeId,
      cabinetId: scope.cabinetId,
      entreprise: { AND: [entrepriseWhere(scope), { deletedAt: null }] },
    },
    select: {
      id: true,
      entrepriseId: true,
      annee: true,
      mois: true,
      statut: true,
      dateLimite: true,
      verrouilleeLe: true,
      entreprise: { select: { name: true } },
    },
  });
  if (!periode) return null;

  const { premier, dernier } = bornesDuMois(periode.annee, periode.mois);
  const salaries = await prisma.salarie.findMany({
    where: {
      cabinetId: scope.cabinetId,
      entrepriseId: periode.entrepriseId,
      deletedAt: null,
      dateEntree: { lte: new Date(dernier) },
      OR: [{ dateSortie: null }, { dateSortie: { gte: new Date(premier) } }],
    },
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    select: {
      id: true,
      nom: true,
      prenom: true,
      prestations: {
        where: { periodeId: periode.id },
        select: {
          heuresPresteesMinutes: true,
          congeDemiJours: true,
          maladieDemiJours: true,
          ferieDemiJours: true,
          absenceNonRemDemiJours: true,
          heuresSupMinutes: true,
          primeCents: true,
          primeLibelle: true,
          updatedAt: true,
          modifiePar: { select: { name: true, role: true } },
        },
      },
    },
  });

  return {
    periode: {
      id: periode.id,
      entrepriseId: periode.entrepriseId,
      entrepriseNom: periode.entreprise.name,
      annee: periode.annee,
      mois: periode.mois,
      statut: periode.statut as PeriodeRow['statut'],
      dateLimite: periode.dateLimite.toISOString().slice(0, 10),
      verrouilleeLe: periode.verrouilleeLe?.toISOString() ?? null,
    },
    salaries: salaries.map((s) => {
      const p = s.prestations[0];
      return {
        id: s.id,
        nom: s.nom,
        prenom: s.prenom,
        prestation: p
          ? {
              heuresPresteesMinutes: p.heuresPresteesMinutes,
              congeDemiJours: p.congeDemiJours,
              maladieDemiJours: p.maladieDemiJours,
              ferieDemiJours: p.ferieDemiJours,
              absenceNonRemDemiJours: p.absenceNonRemDemiJours,
              heuresSupMinutes: p.heuresSupMinutes,
              primeCents: p.primeCents,
              primeLibelle: p.primeLibelle,
              modifiePar: p.modifiePar,
              modifieLe: p.updatedAt.toISOString(),
            }
          : null,
      };
    }),
  };
}
