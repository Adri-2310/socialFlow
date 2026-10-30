import { entrepriseWhere, type Scope } from '@/lib/authz/authz';
import { prisma } from '@/lib/prisma';
import { dateLimiteParDefaut, moisOuvrable, refusBorneBasse } from './periode-dates';

// Cycle d'une période de paie (D90, D91, roles/03 § 5) : ouverture, décalage de la date limite,
// verrouillage et déverrouillage des prestations. Tout est écrit avec son audit dans la même
// transaction ; l'audit ne contient que des identifiants, l'année, le mois et des noms de
// champs, jamais une date ni une valeur (D86, D90).
//
// G2 : le déverrouillage sera refusé quand une fiche utilise la période (comme D83).

export type PeriodeError =
  | { error: 'ENTREPRISE_NOT_FOUND' }
  | { error: 'PERIODE_NOT_FOUND' }
  | { error: 'PERIODE_OUT_OF_RANGE' }
  | { error: 'PERIODE_BEFORE_PAIE_START' }
  | { error: 'PERIODE_BEFORE_ENTREPRISE_START' }
  | { error: 'PERIODE_ALREADY_EXISTS' }
  | { error: 'PERIODE_LOCKED' }
  | { error: 'PERIODE_ALREADY_LOCKED' }
  | { error: 'PERIODE_NOT_LOCKED' };

type Failure<E extends PeriodeError['error']> = { ok: false } & Extract<PeriodeError, { error: E }>;

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';

// La période visée relue dans la transaction : une assignation retirée entre-temps coupe aussi
// l'écriture. null si hors périmètre.
async function findPeriode(
  tx: Pick<typeof prisma, 'periodePaie'>,
  scope: Extract<Scope, { kind: 'entreprises' }>,
  periodeId: string,
) {
  return tx.periodePaie.findFirst({
    where: {
      id: periodeId,
      cabinetId: scope.cabinetId,
      entreprise: { AND: [entrepriseWhere(scope), { deletedAt: null }] },
    },
    select: { id: true, entrepriseId: true, statut: true, dateLimite: true },
  });
}

export async function openPeriode(
  scope: Scope,
  actorId: string,
  entrepriseId: string,
  annee: number,
  mois: number,
  aujourdhui = new Date(),
): Promise<
  | { ok: true; id: string; dateLimite: string }
  | Failure<
      | 'ENTREPRISE_NOT_FOUND'
      | 'PERIODE_OUT_OF_RANGE'
      | 'PERIODE_BEFORE_PAIE_START'
      | 'PERIODE_BEFORE_ENTREPRISE_START'
      | 'PERIODE_ALREADY_EXISTS'
    >
> {
  if (scope.kind !== 'entreprises') return { ok: false, error: 'ENTREPRISE_NOT_FOUND' };

  try {
    return await prisma.$transaction(async (tx) => {
      const entreprise = await tx.entreprise.findFirst({
        where: {
          AND: [
            entrepriseWhere(scope),
            { id: entrepriseId, cabinetId: scope.cabinetId, deletedAt: null },
          ],
        },
        select: { id: true, jourLimitePrestations: true, createdAt: true },
      });
      if (!entreprise) return { ok: false as const, error: 'ENTREPRISE_NOT_FOUND' as const };

      if (!moisOuvrable(annee, mois, aujourdhui)) {
        return { ok: false as const, error: 'PERIODE_OUT_OF_RANGE' as const };
      }
      // D114 : borne basse. Pas de période avant le début de la paie (septembre 2026), ni avant le
      // mois d'inscription de l'entreprise ; une période déjà ouverte n'est jamais touchée.
      const refus = refusBorneBasse(annee, mois, entreprise.createdAt);
      if (refus === 'AVANT_DEBUT_PAIE') {
        return { ok: false as const, error: 'PERIODE_BEFORE_PAIE_START' as const };
      }
      if (refus === 'AVANT_INSCRIPTION') {
        return { ok: false as const, error: 'PERIODE_BEFORE_ENTREPRISE_START' as const };
      }
      const existante = await tx.periodePaie.findUnique({
        where: { entrepriseId_annee_mois: { entrepriseId, annee, mois } },
        select: { id: true },
      });
      if (existante) return { ok: false as const, error: 'PERIODE_ALREADY_EXISTS' as const };

      const dateLimite = dateLimiteParDefaut(annee, mois, entreprise.jourLimitePrestations);
      const periode = await tx.periodePaie.create({
        data: {
          cabinetId: scope.cabinetId,
          entrepriseId,
          annee,
          mois,
          statut: 'OUVERTE',
          dateLimite: new Date(dateLimite),
          ouverteParId: actorId,
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          action: 'PERIODE_OPENED',
          cabinetId: scope.cabinetId,
          actorId,
          metadata: { periodeId: periode.id, entrepriseId, annee, mois },
        },
      });

      return { ok: true as const, id: periode.id, dateLimite };
    });
  } catch (error) {
    // Deux ouvertures simultanées : la contrainte d'unicité tranche, la perdante est un doublon.
    if (isUniqueViolation(error)) return { ok: false, error: 'PERIODE_ALREADY_EXISTS' };
    throw error;
  }
}

// D91 : décale la date limite de cette période seulement. Impossible une fois les prestations
// verrouillées. Une date identique n'écrit rien.
export async function changeDateLimite(
  scope: Scope,
  actorId: string,
  periodeId: string,
  dateLimite: string,
): Promise<{ ok: true; changed: boolean } | Failure<'PERIODE_NOT_FOUND' | 'PERIODE_LOCKED'>> {
  if (scope.kind !== 'entreprises') return { ok: false, error: 'PERIODE_NOT_FOUND' };

  return prisma.$transaction(async (tx) => {
    const periode = await findPeriode(tx, scope, periodeId);
    if (!periode) return { ok: false as const, error: 'PERIODE_NOT_FOUND' as const };
    if (periode.statut !== 'OUVERTE') {
      return { ok: false as const, error: 'PERIODE_LOCKED' as const };
    }
    if (periode.dateLimite.toISOString().slice(0, 10) === dateLimite) {
      return { ok: true as const, changed: false };
    }

    await tx.periodePaie.update({
      where: { id: periode.id },
      data: { dateLimite: new Date(dateLimite) },
    });
    await tx.auditLog.create({
      data: {
        action: 'PERIODE_DEADLINE_CHANGED',
        cabinetId: scope.cabinetId,
        actorId,
        metadata: {
          periodeId: periode.id,
          entrepriseId: periode.entrepriseId,
          fields: ['dateLimite'],
        },
      },
    });

    return { ok: true as const, changed: true };
  });
}

// Verrouille les prestations : plus personne ne les modifie jusqu'à un déverrouillage audité.
export async function lockPeriode(
  scope: Scope,
  actorId: string,
  periodeId: string,
): Promise<{ ok: true } | Failure<'PERIODE_NOT_FOUND' | 'PERIODE_ALREADY_LOCKED'>> {
  if (scope.kind !== 'entreprises') return { ok: false, error: 'PERIODE_NOT_FOUND' };

  return prisma.$transaction(async (tx) => {
    const periode = await findPeriode(tx, scope, periodeId);
    if (!periode) return { ok: false as const, error: 'PERIODE_NOT_FOUND' as const };

    // Le statut fait partie du filtre : deux verrouillages simultanés, un seul passe.
    const { count } = await tx.periodePaie.updateMany({
      where: { id: periode.id, statut: 'OUVERTE' },
      data: { statut: 'VERROUILLEE', verrouilleeLe: new Date() },
    });
    if (count === 0) return { ok: false as const, error: 'PERIODE_ALREADY_LOCKED' as const };

    await tx.auditLog.create({
      data: {
        action: 'PERIODE_LOCKED',
        cabinetId: scope.cabinetId,
        actorId,
        metadata: { periodeId: periode.id, entrepriseId: periode.entrepriseId },
      },
    });

    return { ok: true as const };
  });
}

export async function unlockPeriode(
  scope: Scope,
  actorId: string,
  periodeId: string,
): Promise<{ ok: true } | Failure<'PERIODE_NOT_FOUND' | 'PERIODE_NOT_LOCKED'>> {
  if (scope.kind !== 'entreprises') return { ok: false, error: 'PERIODE_NOT_FOUND' };

  return prisma.$transaction(async (tx) => {
    const periode = await findPeriode(tx, scope, periodeId);
    if (!periode) return { ok: false as const, error: 'PERIODE_NOT_FOUND' as const };

    const { count } = await tx.periodePaie.updateMany({
      where: { id: periode.id, statut: 'VERROUILLEE' },
      data: { statut: 'OUVERTE', verrouilleeLe: null },
    });
    if (count === 0) return { ok: false as const, error: 'PERIODE_NOT_LOCKED' as const };

    await tx.auditLog.create({
      data: {
        action: 'PERIODE_UNLOCKED',
        cabinetId: scope.cabinetId,
        actorId,
        metadata: { periodeId: periode.id, entrepriseId: periode.entrepriseId },
      },
    });

    return { ok: true as const };
  });
}
