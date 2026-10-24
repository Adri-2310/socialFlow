import { entrepriseWhere, type Scope } from '@/lib/authz/authz';
import { prisma } from '@/lib/prisma';
import type { ConditionTravailInput } from '@/lib/schemas/salarie';

// Historique daté des conditions de travail (roles/03 § 4.2). Une condition est valable
// à partir de sa date d'effet : on AJOUTE une ligne pour un changement, on ne réécrit pas
// l'ancienne. Deux exceptions, voulues par Adrien :
//   - corriger une erreur de saisie sur une ligne (sa date ne change jamais) ;
//   - annuler un changement encore à venir.
// Quand les fiches existeront (G2), la correction devra refuser une ligne que la fiche
// d'un mois déjà préparé utilise ; une fiche envoyée, elle, n'est jamais touchée (D13).

export type ConditionError =
  | { error: 'SALARIE_NOT_FOUND' }
  | { error: 'CONDITION_NOT_FOUND' }
  | { error: 'DATE_EFFET_OUT_OF_RANGE' }
  | { error: 'CONDITION_DATE_ALREADY_USED' }
  | { error: 'DATE_EFFET_IMMUABLE' }
  | { error: 'CONDITION_NOT_REMOVABLE' };

type Failure<E extends ConditionError['error']> = { ok: false } & Extract<
  ConditionError,
  { error: E }
>;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
  );
}

const toDate = (iso: string) => new Date(iso);
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

// Le dossier visé, relu dans la transaction : une assignation retirée entre-temps coupe aussi
// l'écriture. null si hors périmètre (le 404 ne distingue pas les cas).
async function findSalarie(
  tx: Pick<typeof prisma, 'salarie'>,
  scope: Extract<Scope, { kind: 'entreprises' }>,
  salarieId: string,
) {
  return tx.salarie.findFirst({
    where: {
      id: salarieId,
      cabinetId: scope.cabinetId,
      deletedAt: null,
      entreprise: { AND: [entrepriseWhere(scope), { deletedAt: null }] },
    },
    select: { id: true, entrepriseId: true, dateEntree: true, dateSortie: true },
  });
}

// Ajoute une ligne à l'historique. Une date dans le passé est permise (rattrapage d'une
// augmentation oubliée), mais pas avant l'entrée ni après la sortie.
export async function addCondition(
  scope: Scope,
  actorId: string,
  salarieId: string,
  input: ConditionTravailInput,
): Promise<
  | { ok: true; id: string }
  | Failure<'SALARIE_NOT_FOUND' | 'DATE_EFFET_OUT_OF_RANGE' | 'CONDITION_DATE_ALREADY_USED'>
> {
  if (scope.kind !== 'entreprises') return { ok: false, error: 'SALARIE_NOT_FOUND' };

  try {
    return await prisma.$transaction(async (tx) => {
      const salarie = await findSalarie(tx, scope, salarieId);
      if (!salarie) return { ok: false as const, error: 'SALARIE_NOT_FOUND' as const };

      if (
        input.dateEffet < isoDay(salarie.dateEntree) ||
        (salarie.dateSortie && input.dateEffet > isoDay(salarie.dateSortie))
      ) {
        return { ok: false as const, error: 'DATE_EFFET_OUT_OF_RANGE' as const };
      }

      const { dateEffet, ...valeurs } = input;
      const condition = await tx.conditionTravail.create({
        data: {
          ...valeurs,
          cabinetId: scope.cabinetId,
          salarieId: salarie.id,
          dateEffet: toDate(dateEffet),
          createdById: actorId,
        },
        select: { id: true },
      });

      // D8, D26 : des identifiants seulement, ni date ni montant.
      await tx.auditLog.create({
        data: {
          action: 'SALARIE_CONDITION_ADDED',
          cabinetId: scope.cabinetId,
          actorId,
          metadata: {
            salarieId: salarie.id,
            entrepriseId: salarie.entrepriseId,
            conditionId: condition.id,
          },
        },
      });

      return { ok: true as const, id: condition.id };
    });
  } catch (error) {
    // La seule contrainte d'unicité ici est (salarieId, dateEffet).
    if (isUniqueViolation(error)) return { ok: false, error: 'CONDITION_DATE_ALREADY_USED' };
    throw error;
  }
}

const CHAMPS = [
  'statut',
  'commissionParitaire',
  'fonction',
  'regime',
  'heuresSemaineMinutes',
  'heuresReferenceMinutes',
  'salaireMensuelBrutCents',
  'salaireHoraireBrutCents',
] as const;

// Corrige une ligne existante. Sa date d'effet ne change jamais : pour déplacer un
// changement, on annule la ligne (si elle est à venir) et on en ajoute une autre. Une
// correction qui ne change rien n'écrit rien.
export async function updateCondition(
  scope: Scope,
  actorId: string,
  salarieId: string,
  conditionId: string,
  input: ConditionTravailInput,
): Promise<
  | { ok: true; changed: string[] }
  | Failure<'SALARIE_NOT_FOUND' | 'CONDITION_NOT_FOUND' | 'DATE_EFFET_IMMUABLE'>
> {
  if (scope.kind !== 'entreprises') return { ok: false, error: 'SALARIE_NOT_FOUND' };

  return prisma.$transaction(async (tx) => {
    const salarie = await findSalarie(tx, scope, salarieId);
    if (!salarie) return { ok: false as const, error: 'SALARIE_NOT_FOUND' as const };

    const current = await tx.conditionTravail.findFirst({
      where: { id: conditionId, salarieId: salarie.id },
    });
    if (!current) return { ok: false as const, error: 'CONDITION_NOT_FOUND' as const };
    if (input.dateEffet !== isoDay(current.dateEffet)) {
      return { ok: false as const, error: 'DATE_EFFET_IMMUABLE' as const };
    }

    // Une absence de valeur (heures, salaire de l'autre type) se range en null, comme en base.
    const changed = CHAMPS.filter((champ) => (input[champ] ?? null) !== current[champ]);
    if (changed.length === 0) return { ok: true as const, changed: [] as string[] };

    await tx.conditionTravail.update({
      where: { id: current.id },
      data: Object.fromEntries(changed.map((champ) => [champ, input[champ] ?? null])),
    });
    await tx.auditLog.create({
      data: {
        action: 'SALARIE_CONDITION_UPDATED',
        cabinetId: scope.cabinetId,
        actorId,
        // Noms de champs seulement, jamais les valeurs.
        metadata: {
          salarieId: salarie.id,
          entrepriseId: salarie.entrepriseId,
          conditionId: current.id,
          fields: [...changed],
        },
      },
    });

    return { ok: true as const, changed: [...changed] };
  });
}

// Annule un changement encore à venir. Jamais une ligne déjà en vigueur ou passée, et
// jamais la première (celle de l'entrée) : l'historique doit toujours commencer à l'entrée.
export async function removeCondition(
  scope: Scope,
  actorId: string,
  salarieId: string,
  conditionId: string,
  now: Date = new Date(),
): Promise<
  { ok: true } | Failure<'SALARIE_NOT_FOUND' | 'CONDITION_NOT_FOUND' | 'CONDITION_NOT_REMOVABLE'>
> {
  if (scope.kind !== 'entreprises') return { ok: false, error: 'SALARIE_NOT_FOUND' };

  return prisma.$transaction(async (tx) => {
    const salarie = await findSalarie(tx, scope, salarieId);
    if (!salarie) return { ok: false as const, error: 'SALARIE_NOT_FOUND' as const };

    const current = await tx.conditionTravail.findFirst({
      where: { id: conditionId, salarieId: salarie.id },
      select: { id: true, dateEffet: true },
    });
    if (!current) return { ok: false as const, error: 'CONDITION_NOT_FOUND' as const };

    const jour = isoDay(current.dateEffet);
    if (jour <= isoDay(now) || jour === isoDay(salarie.dateEntree)) {
      return { ok: false as const, error: 'CONDITION_NOT_REMOVABLE' as const };
    }

    await tx.conditionTravail.delete({ where: { id: current.id } });
    await tx.auditLog.create({
      data: {
        action: 'SALARIE_CONDITION_REMOVED',
        cabinetId: scope.cabinetId,
        actorId,
        metadata: {
          salarieId: salarie.id,
          entrepriseId: salarie.entrepriseId,
          conditionId: current.id,
        },
      },
    });

    return { ok: true as const };
  });
}
