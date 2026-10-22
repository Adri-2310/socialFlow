import { entrepriseWhere, type Scope } from '@/lib/authz/authz';
import { prisma } from '@/lib/prisma';

// Sortie et archivage d'un dossier salarié (roles/03 § 4.2). La sortie et l'archivage sont
// deux choses : le salarié qui sort reste actif (il faut sa dernière fiche) ; l'archivage
// masque le dossier des listes sans jamais le supprimer (conservation 5 ans, pas de
// suppression physique). Le NISS d'un dossier archivé reste réservé : on restaure, on ne
// recrée pas.
//
// G2 : la sortie déclenchera la DIMONA OUT et la dernière fiche (D40), puis sera verrouillée
// une fois la DIMONA OUT envoyée ; l'archivage sera refusé s'il reste une fiche en cours.

export type LifecycleError =
  | { error: 'SALARIE_NOT_FOUND' }
  | { error: 'DATE_SORTIE_OUT_OF_RANGE' }
  | { error: 'CONDITION_AFTER_SORTIE' }
  | { error: 'SALARIE_ALREADY_ARCHIVED' }
  | { error: 'SALARIE_NOT_ARCHIVED' };

type Failure<E extends LifecycleError['error']> = { ok: false } & Extract<
  LifecycleError,
  { error: E }
>;

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

// Le dossier visé, archivé compris, relu dans la transaction : une assignation retirée
// entre-temps coupe aussi l'écriture. null si hors périmètre.
async function findSalarie(
  tx: Pick<typeof prisma, 'salarie'>,
  scope: Extract<Scope, { kind: 'entreprises' }>,
  salarieId: string,
) {
  return tx.salarie.findFirst({
    where: {
      id: salarieId,
      cabinetId: scope.cabinetId,
      entreprise: { AND: [entrepriseWhere(scope), { deletedAt: null }] },
    },
    select: { id: true, entrepriseId: true, dateEntree: true, dateSortie: true, deletedAt: true },
  });
}

// Enregistre, corrige ou efface (null) la date de sortie. Pas avant l'entrée, et refusée si une
// condition de travail est datée après : il faut d'abord l'annuler. Une demande qui ne change
// rien n'écrit rien. Le jour de la sortie lui-même reste permis pour une condition.
export async function recordSortie(
  scope: Scope,
  actorId: string,
  salarieId: string,
  dateSortie: string | null,
): Promise<
  | { ok: true; changed: boolean }
  | Failure<'SALARIE_NOT_FOUND' | 'DATE_SORTIE_OUT_OF_RANGE' | 'CONDITION_AFTER_SORTIE'>
> {
  if (scope.kind !== 'entreprises') return { ok: false, error: 'SALARIE_NOT_FOUND' };

  return prisma.$transaction(async (tx) => {
    const salarie = await findSalarie(tx, scope, salarieId);
    // Un dossier archivé ne se modifie pas : on le restaure d'abord.
    if (!salarie || salarie.deletedAt) {
      return { ok: false as const, error: 'SALARIE_NOT_FOUND' as const };
    }

    const actuelle = salarie.dateSortie ? isoDay(salarie.dateSortie) : null;
    if (dateSortie === actuelle) return { ok: true as const, changed: false };

    if (dateSortie !== null) {
      if (dateSortie < isoDay(salarie.dateEntree)) {
        return { ok: false as const, error: 'DATE_SORTIE_OUT_OF_RANGE' as const };
      }
      const apres = await tx.conditionTravail.count({
        where: { salarieId: salarie.id, dateEffet: { gt: new Date(dateSortie) } },
      });
      if (apres > 0) return { ok: false as const, error: 'CONDITION_AFTER_SORTIE' as const };
    }

    await tx.salarie.update({
      where: { id: salarie.id },
      data: { dateSortie: dateSortie === null ? null : new Date(dateSortie) },
    });
    // D8, D26 : des identifiants seulement, ni la date ni rien du dossier.
    await tx.auditLog.create({
      data: {
        action: dateSortie === null ? 'SALARIE_SORTIE_CLEARED' : 'SALARIE_SORTIE_RECORDED',
        cabinetId: scope.cabinetId,
        actorId,
        metadata: { salarieId: salarie.id, entrepriseId: salarie.entrepriseId },
      },
    });

    return { ok: true as const, changed: true };
  });
}

// Archive le dossier (soft-delete). Permis même sans date de sortie : un dossier créé par
// erreur doit pouvoir disparaître des listes.
export async function archiveSalarie(
  scope: Scope,
  actorId: string,
  salarieId: string,
): Promise<{ ok: true } | Failure<'SALARIE_NOT_FOUND' | 'SALARIE_ALREADY_ARCHIVED'>> {
  if (scope.kind !== 'entreprises') return { ok: false, error: 'SALARIE_NOT_FOUND' };

  return prisma.$transaction(async (tx) => {
    const salarie = await findSalarie(tx, scope, salarieId);
    if (!salarie) return { ok: false as const, error: 'SALARIE_NOT_FOUND' as const };
    if (salarie.deletedAt) {
      return { ok: false as const, error: 'SALARIE_ALREADY_ARCHIVED' as const };
    }

    await tx.salarie.update({ where: { id: salarie.id }, data: { deletedAt: new Date() } });
    await tx.auditLog.create({
      data: {
        action: 'SALARIE_ARCHIVED',
        cabinetId: scope.cabinetId,
        actorId,
        metadata: { salarieId: salarie.id, entrepriseId: salarie.entrepriseId },
      },
    });

    return { ok: true as const };
  });
}

export async function restoreSalarie(
  scope: Scope,
  actorId: string,
  salarieId: string,
): Promise<{ ok: true } | Failure<'SALARIE_NOT_FOUND' | 'SALARIE_NOT_ARCHIVED'>> {
  if (scope.kind !== 'entreprises') return { ok: false, error: 'SALARIE_NOT_FOUND' };

  return prisma.$transaction(async (tx) => {
    const salarie = await findSalarie(tx, scope, salarieId);
    if (!salarie) return { ok: false as const, error: 'SALARIE_NOT_FOUND' as const };
    if (!salarie.deletedAt) return { ok: false as const, error: 'SALARIE_NOT_ARCHIVED' as const };

    await tx.salarie.update({ where: { id: salarie.id }, data: { deletedAt: null } });
    await tx.auditLog.create({
      data: {
        action: 'SALARIE_RESTORED',
        cabinetId: scope.cabinetId,
        actorId,
        metadata: { salarieId: salarie.id, entrepriseId: salarie.entrepriseId },
      },
    });

    return { ok: true as const };
  });
}
