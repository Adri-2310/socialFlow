import { ErreurMoteur } from './erreurs';
import type { Fraction } from './types';
import { BORNES, exigerEntier } from './validation';

// Plus grand commun diviseur (algorithme d'Euclide) : sert à réduire une fraction (1 824 / 2 280
// devient 4/5). Récursif et sur des entiers, donc sans aucune approximation.
function pgcd(a: number, b: number): number {
  return b === 0 ? a : pgcd(b, a % b);
}

// Les données du dossier (ConditionTravail) dont on a besoin pour l'occupation.
// `heuresSemaineMinutes` : durée hebdomadaire du travailleur. `heuresReferenceMinutes` : durée
// hebdomadaire de la personne de référence (temps plein de l'entreprise). Les deux en minutes (D96).
export interface EntreeOccupation {
  regime: 'TEMPS_PLEIN' | 'TEMPS_PARTIEL';
  heuresSemaineMinutes: number | null;
  heuresReferenceMinutes: number | null;
}

// D39, D96 : fraction d'occupation = heures par semaine du travailleur / heures par semaine de la
// personne de référence, en minutes entières, gardée en FRACTION (jamais en décimal : 1/3 n'a pas
// d'écriture décimale exacte). Exemple : 30 h 24 sur 38 h = 1 824 / 2 280 minutes = 4/5.
//
// D100 : cette fraction n'intervient PAS dans le brut (le salaire saisi est déjà celui du temps
// partiel). Elle servira aux seuls calculs que la loi proratise, comme le bonus à l'emploi.
export function fractionOccupation(entree: EntreeOccupation): Fraction {
  // Temps plein : toujours 1/1, même si des heures sont enregistrées dans le dossier.
  if (entree.regime === 'TEMPS_PLEIN') return { numerateur: 1, denominateur: 1 };

  // Temps partiel : sans les deux durées, on ne devine pas une fraction.
  if (entree.heuresSemaineMinutes === null || entree.heuresReferenceMinutes === null) {
    throw new ErreurMoteur(
      'OCCUPATION_INCOMPLETE',
      'Un travailleur à temps partiel doit avoir ses heures et celles de la personne de référence.',
    );
  }
  const semaine = exigerEntier(
    'Les heures par semaine',
    entree.heuresSemaineMinutes,
    1,
    BORNES.minutesSemaineMax,
  );
  const reference = exigerEntier(
    'Les heures par semaine de la personne de référence',
    entree.heuresReferenceMinutes,
    1,
    BORNES.minutesSemaineMax,
  );
  // Un « temps partiel » qui travaille plus que la référence est une erreur de saisie.
  if (semaine > reference) {
    throw new ErreurMoteur(
      'OCCUPATION_INCOHERENTE',
      'Un temps partiel ne peut pas dépasser les heures de la personne de référence.',
    );
  }
  // On réduit la fraction pour qu'elle soit lisible (4/5 plutôt que 1 824/2 280) ; le résultat
  // d'un calcul est identique, seul l'affichage change.
  const diviseur = pgcd(semaine, reference);
  return { numerateur: semaine / diviseur, denominateur: reference / diviseur };
}
