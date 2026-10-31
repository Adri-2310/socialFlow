import { ErreurMoteur } from './erreurs';
import type { DateIso } from './types';

// Calendrier en entiers : le moteur n'a pas d'horloge ni d'objet Date (types.ts), donc pas de
// fuseau horaire ni de changement d'heure. Tout se calcule avec des nombres de jours.

export const estBissextile = (annee: number): boolean =>
  (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;

export function joursDuMois(annee: number, mois: number): number {
  if (mois === 2) return estBissextile(annee) ? 29 : 28;
  return [4, 6, 9, 11].includes(mois) ? 30 : 31;
}

// « 2026-05-14 » -> { annee: 2026, mois: 5, jour: 14 }. Un jour qui n'existe pas (le 30 février) ou
// un autre format est refusé : une date fausse ne doit jamais décaler un calcul en silence.
export function lireDate(
  nom: string,
  date: DateIso,
): { annee: number; mois: number; jour: number } {
  const m = typeof date === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(date) : null;
  if (m) {
    const annee = Number(m[1]);
    const mois = Number(m[2]);
    const jour = Number(m[3]);
    if (mois >= 1 && mois <= 12 && jour >= 1 && jour <= joursDuMois(annee, mois)) {
      return { annee, mois, jour };
    }
  }
  throw new ErreurMoteur('ENTREE_INVALIDE', `${nom} doit être une date AAAA-MM-JJ existante.`);
}

// Numéro d'un jour : nombre de jours depuis le 1er janvier 1970, par l'algorithme de calendrier
// grégorien de Howard Hinnant (« days from civil »), en divisions entières.
// Exemple : 1970-01-01 -> 0 ; 1970-01-02 -> 1. Sert à compter les jours entre deux dates :
// numeroDeJour('2026-03-01') - numeroDeJour('2026-02-01') = 28.
export function numeroDeJour(nom: string, date: DateIso): number {
  const { annee, mois, jour } = lireDate(nom, date);
  const a = mois <= 2 ? annee - 1 : annee;
  const ere = Math.floor(a / 400);
  const anneeDeLEre = a - ere * 400;
  const jourDeLAnnee = Math.floor((153 * (mois + (mois > 2 ? -3 : 9)) + 2) / 5) + jour - 1;
  const jourDeLEre =
    anneeDeLEre * 365 + Math.floor(anneeDeLEre / 4) - Math.floor(anneeDeLEre / 100) + jourDeLAnnee;
  return ere * 146_097 + jourDeLEre - 719_468;
}
