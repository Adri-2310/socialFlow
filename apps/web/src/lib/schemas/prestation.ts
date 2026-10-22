import { z } from 'zod';
import { bornesDuMois } from '@/lib/periode/periode-dates';

// Prestations d'un salarié pour une période (D92, roles/03 § 5). On saisit des écarts : un salarié
// sans prestation vaut « mois complet selon son régime ». Aucun flottant : les jours se comptent
// en demi-journées (2 = un jour), les heures en minutes, la prime en centimes. Chaque valeur est
// bornée au nombre de jours ou d'heures du mois de la période, d'où une fabrique de schéma.

export const PRESTATION_FIELDS = [
  'heuresPresteesMinutes',
  'congeDemiJours',
  'maladieDemiJours',
  'ferieDemiJours',
  'absenceNonRemDemiJours',
  'heuresSupMinutes',
  'primeCents',
  'primeLibelle',
] as const;

export type PrestationField = (typeof PRESTATION_FIELDS)[number];

export type PrestationInput = {
  heuresPresteesMinutes: number | null;
  congeDemiJours: number;
  maladieDemiJours: number;
  ferieDemiJours: number;
  absenceNonRemDemiJours: number;
  heuresSupMinutes: number;
  primeCents: number | null;
  primeLibelle: string | null;
};

export function prestationSchema(annee: number, mois: number) {
  const { joursDansMois } = bornesDuMois(annee, mois);
  const demiJours = z
    .number()
    .int()
    .min(0)
    .max(joursDansMois * 2)
    .default(0);
  const minutes = z
    .number()
    .int()
    .min(0)
    .max(joursDansMois * 24 * 60);

  return z
    .object({
      // Facultatif : utile surtout aux ouvriers payés à l'heure.
      heuresPresteesMinutes: minutes.nullable().default(null),
      congeDemiJours: demiJours,
      maladieDemiJours: demiJours,
      ferieDemiJours: demiJours,
      absenceNonRemDemiJours: demiJours,
      heuresSupMinutes: minutes.default(0),
      // Une prime : un montant et un libellé court, l'un ne va pas sans l'autre.
      primeCents: z.number().int().positive().max(100_000_000).nullable().default(null),
      primeLibelle: z.string().trim().min(1).max(60).nullable().default(null),
    })
    .superRefine((value, ctx) => {
      if (value.primeCents !== null && value.primeLibelle === null) {
        ctx.addIssue({ code: 'custom', path: ['primeLibelle'], message: 'PRIME_LIBELLE_REQUIRED' });
      }
      if (value.primeCents === null && value.primeLibelle !== null) {
        ctx.addIssue({ code: 'custom', path: ['primeCents'], message: 'PRIME_MONTANT_REQUIRED' });
      }
    });
}

// Aucun écart : équivaut à « pas de prestation », la ligne est alors supprimée.
export function estNeutre(input: PrestationInput): boolean {
  return (
    input.heuresPresteesMinutes === null &&
    input.congeDemiJours === 0 &&
    input.maladieDemiJours === 0 &&
    input.ferieDemiJours === 0 &&
    input.absenceNonRemDemiJours === 0 &&
    input.heuresSupMinutes === 0 &&
    input.primeCents === null &&
    input.primeLibelle === null
  );
}
