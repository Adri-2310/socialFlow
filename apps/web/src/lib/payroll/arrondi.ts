import { ErreurMoteur } from './erreurs';
import { DIVISEUR_TAUX, type Centimes, type Fraction, type Taux } from './types';

// ARRONDIS EN ENTIERS : le seul endroit du moteur où un montant exact devient un nombre de centimes.
//
// Annexe III, n° 12 : « tous les montants sont, le cas échéant à chaque étape du calcul, arrondis
// au cent supérieur ou inférieur selon que le chiffre des millièmes atteint ou non 5 ».
// D99 : le moteur applique la même règle à chaque étape de la fiche, sur des entiers.
// En clair : on arrondit au centime le plus proche, et la moitié exacte monte (0,5 cent -> 1 cent).
//
// Un montant exact est toujours une fraction numérateur / dénominateur de centimes. On l'arrondit
// SANS passer par un flottant : floor((2n + d) / 2d) est « n/d arrondi, la moitié vers le haut ».
//
// Pourquoi cette formule : n/d + 1/2 arrondi vers le bas donne l'arrondi classique, et
// n/d + 1/2 = (2n + d) / 2d, ce qui garde tout en entiers.
// Exemple : 100 000,5 centimes = 200 001 / 2 -> floor((400 002 + 2) / 4) = 100 001.
// Contre-exemple : 100 000,4 centimes = 1 000 004 / 10 -> floor((2 000 008 + 10) / 20) = 100 000.
export function arrondirFraction(numerateur: number, denominateur: number): Centimes {
  // Un flottant en entrée trahirait un calcul fait en amont avec des décimaux : on refuse.
  if (!Number.isInteger(numerateur) || !Number.isInteger(denominateur)) {
    throw new ErreurMoteur('ENTREE_INVALIDE', 'Un arrondi porte sur des entiers.');
  }
  if (numerateur < 0) {
    // Les réductions se calculent sur leur valeur positive, puis se retranchent : la règle
    // « la moitié monte » n'est pas la même pour un négatif (-0,5 monterait vers 0).
    throw new ErreurMoteur('ENTREE_INVALIDE', 'Un montant à arrondir ne peut pas être négatif.');
  }
  if (denominateur <= 0) {
    throw new ErreurMoteur('ENTREE_INVALIDE', 'Le dénominateur doit être strictement positif.');
  }
  const doubleNumerateur = 2 * numerateur + denominateur;
  // Au-delà de 2^53 - 1, JavaScript perdrait des chiffres sans prévenir : on s'arrête avant.
  if (!Number.isSafeInteger(doubleNumerateur)) {
    throw new ErreurMoteur(
      'ENTREE_INVALIDE',
      'Le montant dépasse la capacité du calcul en entiers.',
    );
  }
  return Math.floor(doubleNumerateur / (2 * denominateur));
}

// montant x taux, arrondi. Le taux est en dix-millièmes de pour cent, donc on divise par
// DIVISEUR_TAUX (100 % = 1 000 000).
// Exemple : 100 000 centimes x 26,75 % (267 500) = 26 750 centimes.
export function appliquerTaux(montant: Centimes, taux: Taux): Centimes {
  return arrondirFraction(montant * taux, DIVISEUR_TAUX);
}

// montant x fraction (occupation, part de jours), arrondi.
// Exemple : 300 000 x 4/5 = 240 000.
export function proratiser(montant: Centimes, fraction: Fraction): Centimes {
  return arrondirFraction(montant * fraction.numerateur, fraction.denominateur);
}
