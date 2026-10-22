import { entrepriseWhere } from '@/lib/authz/authz';
import { prisma } from '@/lib/prisma';
import {
  estNeutre,
  PRESTATION_FIELDS,
  type PrestationField,
  type PrestationInput,
} from '@/lib/schemas/prestation';
import { bornesDuMois } from './periode-dates';
import { isPrestationScope } from './prestation-data';
import type { Scope } from '@/lib/authz/authz';

// Encodage des prestations d'un salarié pour une période (D91, D92, roles/03 § 5). Le gestionnaire
// encode tant que la période est ouverte ; l'entreprise aussi, mais seulement jusqu'à la date
// limite (incluse). Tout est écrit avec son audit dans la même transaction ; l'audit ne contient
// que des identifiants et des noms de champs, jamais une valeur (D86, D90).
//
// G2 : une fiche qui utilise la période bloquera aussi l'encodage, comme le verrouillage.

export type PrestationError =
  | { error: 'PERIODE_NOT_FOUND' }
  | { error: 'SALARIE_NOT_FOUND' }
  | { error: 'PERIODE_LOCKED' }
  | { error: 'DEADLINE_PASSED' }
  | { error: 'SALARIE_NOT_ACTIVE_IN_PERIOD' };

type Failure<E extends PrestationError['error']> = { ok: false } & Extract<
  PrestationError,
  { error: E }
>;

type EncodageResult =
  | { ok: true; changed: boolean }
  | Failure<
      | 'PERIODE_NOT_FOUND'
      | 'SALARIE_NOT_FOUND'
      | 'PERIODE_LOCKED'
      | 'DEADLINE_PASSED'
      | 'SALARIE_NOT_ACTIVE_IN_PERIOD'
    >;

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

// Enregistre les écarts d'un salarié (remplace ceux d'avant). Un encodage sans aucun écart
// supprime la ligne : « sans prestation » et « mois complet » sont la même chose. Une demande
// qui ne change rien n'écrit rien.
export async function savePrestation(
  scope: Scope,
  actorId: string,
  periodeId: string,
  salarieId: string,
  input: PrestationInput,
  aujourdhui = new Date(),
): Promise<EncodageResult> {
  if (!isPrestationScope(scope)) return { ok: false, error: 'PERIODE_NOT_FOUND' };

  return prisma.$transaction(async (tx) => {
    // La période est relue dans la transaction : une assignation retirée entre-temps coupe aussi
    // l'écriture.
    const periode = await tx.periodePaie.findFirst({
      where: {
        id: periodeId,
        cabinetId: scope.cabinetId,
        entreprise: { AND: [entrepriseWhere(scope), { deletedAt: null }] },
      },
      select: { id: true, entrepriseId: true, annee: true, mois: true, dateLimite: true },
    });
    if (!periode) return { ok: false as const, error: 'PERIODE_NOT_FOUND' as const };

    // Prend le verrou de la ligne de période tant que l'état est « ouverte » : un verrouillage
    // simultané attend la fin de cet encodage, un encodage qui arrive après le verrouillage
    // trouve la période verrouillée.
    const { count } = await tx.periodePaie.updateMany({
      where: { id: periode.id, statut: 'OUVERTE' },
      data: { updatedAt: new Date() },
    });
    if (count === 0) return { ok: false as const, error: 'PERIODE_LOCKED' as const };

    // D91 : après la date limite, l'entreprise ne modifie plus ; le gestionnaire peut encore.
    if (scope.kind === 'entreprise' && isoDay(aujourdhui) > isoDay(periode.dateLimite)) {
      return { ok: false as const, error: 'DEADLINE_PASSED' as const };
    }

    const salarie = await tx.salarie.findFirst({
      where: {
        id: salarieId,
        cabinetId: scope.cabinetId,
        entrepriseId: periode.entrepriseId,
        deletedAt: null,
      },
      select: { id: true, dateEntree: true, dateSortie: true },
    });
    if (!salarie) return { ok: false as const, error: 'SALARIE_NOT_FOUND' as const };

    // D92 : seuls les salariés actifs pendant le mois ont des prestations.
    const { premier, dernier } = bornesDuMois(periode.annee, periode.mois);
    if (
      isoDay(salarie.dateEntree) > dernier ||
      (salarie.dateSortie && isoDay(salarie.dateSortie) < premier)
    ) {
      return { ok: false as const, error: 'SALARIE_NOT_ACTIVE_IN_PERIOD' as const };
    }

    const existante = await tx.prestation.findUnique({
      where: { periodeId_salarieId: { periodeId: periode.id, salarieId: salarie.id } },
    });
    const ids = {
      periodeId: periode.id,
      entrepriseId: periode.entrepriseId,
      salarieId: salarie.id,
    };

    if (estNeutre(input)) {
      if (!existante) return { ok: true as const, changed: false };
      await tx.prestation.delete({ where: { id: existante.id } });
      await tx.auditLog.create({
        data: { action: 'PRESTATION_CLEARED', cabinetId: scope.cabinetId, actorId, metadata: ids },
      });
      return { ok: true as const, changed: true };
    }

    const changed: PrestationField[] = PRESTATION_FIELDS.filter(
      (field) => !existante || existante[field] !== input[field],
    );
    if (existante && changed.length === 0) return { ok: true as const, changed: false };

    await tx.prestation.upsert({
      where: { periodeId_salarieId: { periodeId: periode.id, salarieId: salarie.id } },
      create: {
        cabinetId: scope.cabinetId,
        periodeId: periode.id,
        salarieId: salarie.id,
        modifieParId: actorId,
        ...input,
      },
      update: { modifieParId: actorId, ...input },
    });
    await tx.auditLog.create({
      data: {
        action: 'PRESTATION_SAVED',
        cabinetId: scope.cabinetId,
        actorId,
        metadata: { ...ids, fields: changed },
      },
    });

    return { ok: true as const, changed: true };
  });
}

// Efface les écarts d'un salarié : il redevient « mois complet selon son régime ».
export function clearPrestation(
  scope: Scope,
  actorId: string,
  periodeId: string,
  salarieId: string,
  aujourdhui = new Date(),
): Promise<EncodageResult> {
  return savePrestation(
    scope,
    actorId,
    periodeId,
    salarieId,
    {
      heuresPresteesMinutes: null,
      congeDemiJours: 0,
      maladieDemiJours: 0,
      ferieDemiJours: 0,
      absenceNonRemDemiJours: 0,
      heuresSupMinutes: 0,
      primeCents: null,
      primeLibelle: null,
    },
    aujourdhui,
  );
}
