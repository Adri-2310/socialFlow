import { centsToInput, parseEurosToCents } from '@/lib/salarie/montant';
import type { PrestationInput } from '@/lib/schemas/prestation';
import {
  demiJoursEnTexte,
  minutesEnTexte,
  texteEnDemiJours,
  texteEnMinutes,
} from './periode-format';

// Valeurs du formulaire d'encodage : tout en chaînes, comme les champs de saisie. Partagé entre
// le formulaire (composant client) et la page qui le préremplit.
export type PrestationFormValues = {
  heuresPrestees: string; // « 7:30 » ou « 7,5 »
  conge: string; // en jours, par pas de 0,5
  maladie: string;
  ferie: string;
  absenceNonRem: string;
  heuresSup: string;
  primeMontant: string; // en euros
  primeLibelle: string;
};

export const PRESTATION_VIDE: PrestationFormValues = {
  heuresPrestees: '',
  conge: '',
  maladie: '',
  ferie: '',
  absenceNonRem: '',
  heuresSup: '',
  primeMontant: '',
  primeLibelle: '',
};

const jours = (demiJours: number) => (demiJours ? demiJoursEnTexte(demiJours) : '');

export function toPrestationFormValues(p: PrestationInput | null): PrestationFormValues {
  if (!p) return PRESTATION_VIDE;
  return {
    heuresPrestees: p.heuresPresteesMinutes === null ? '' : minutesEnTexte(p.heuresPresteesMinutes),
    conge: jours(p.congeDemiJours),
    maladie: jours(p.maladieDemiJours),
    ferie: jours(p.ferieDemiJours),
    absenceNonRem: jours(p.absenceNonRemDemiJours),
    heuresSup: p.heuresSupMinutes ? minutesEnTexte(p.heuresSupMinutes) : '',
    primeMontant: p.primeCents === null ? '' : centsToInput(p.primeCents),
    primeLibelle: p.primeLibelle ?? '',
  };
}

// Même corps que l'API attend (même schéma Zod, CONVENTIONS § 5). Une valeur illisible devient
// NaN : le schéma la refuse avec le code du champ.
export function toPrestationPayload(f: PrestationFormValues) {
  const montant = f.primeMontant.trim() ? (parseEurosToCents(f.primeMontant) ?? Number.NaN) : null;
  return {
    heuresPresteesMinutes: texteEnMinutes(f.heuresPrestees),
    congeDemiJours: texteEnDemiJours(f.conge),
    maladieDemiJours: texteEnDemiJours(f.maladie),
    ferieDemiJours: texteEnDemiJours(f.ferie),
    absenceNonRemDemiJours: texteEnDemiJours(f.absenceNonRem),
    heuresSupMinutes: texteEnMinutes(f.heuresSup) ?? 0,
    primeCents: montant,
    primeLibelle: f.primeLibelle.trim() || null,
  };
}
