import { ErreurMoteur } from './erreurs';
import type { Centimes } from './types';
import { BORNES, exigerEntier } from './validation';

// COÛT EMPLOYEUR (modules/paie.md § 3, étape 7).
//
// En clair : ce que le salarié coûte en tout à son employeur ce mois-ci.
//   coût employeur = brut + cotisations patronales - réduction structurelle
// Seul le brut est versé au salarié ; les cotisations patronales (cotisations-patronales.ts) vont
// à l'ONSS et la réduction structurelle (reduction-structurelle.ts) en diminue le montant.
//
// Exemple (employé, 2 800,00 €, voir cotisations-patronales.ts) :
//   2 800,00 + 700,81 - 224,79 = 3 276,02 €.
//
// Pas d'arrondi ici : uniquement des additions de centimes déjà arrondis par chaque étape.
// Hors v1 : assurance accidents du travail, assurance groupe, titres-repas, secrétariat social et
// toute charge qui n'est pas une cotisation de sécurité sociale.

// Ce que le coût employeur NE contient PAS : il est présenté comme une ESTIMATION. Cette liste est
// celle que l'écran affiche à côté du montant ; elle reprend modules/paie.md § 9 et § 10 (D120 (e)).
export const LIMITES_COUT_EMPLOYEUR_ESTIME = [
  { code: 'FONDS_FERMETURE', libelle: "Fonds de fermeture d'entreprises : non calculé (D117)." },
  {
    code: 'INDEX_CENTIME',
    libelle: 'Cotisation spéciale « index centime » : non calculée (D117).',
  },
  {
    code: 'DISPENSE_PRECOMPTE_HEURES_SUP',
    libelle:
      'Dispense de versement du précompte professionnel sur les heures supplémentaires : non prise en compte.',
  },
  {
    code: 'REDUCTION_STRUCTURELLE_TRIMESTRIELLE',
    libelle:
      'Réduction structurelle : estimation mensuelle d’un calcul trimestriel, sans régularisation (D104).',
  },
  {
    code: 'AUTRES_CHARGES',
    libelle:
      'Assurance accidents du travail, assurance groupe, titres-repas, secrétariat social : hors périmètre.',
  },
] as const;

export interface EntreeCoutEmployeur {
  brutCentimes: Centimes;
  cotisationsPatronalesCentimes: Centimes; // total, positif
  reductionStructurelleCentimes: Centimes; // positif
}

export function calculerCoutEmployeur(entree: EntreeCoutEmployeur): Centimes {
  const max = BORNES.montantMax;
  const brut = exigerEntier('Le brut', entree.brutCentimes, 0, max);
  const cotisations = exigerEntier(
    'Les cotisations patronales',
    entree.cotisationsPatronalesCentimes,
    0,
    max,
  );
  const reduction = exigerEntier(
    'La réduction structurelle',
    entree.reductionStructurelleCentimes,
    0,
    max,
  );
  // La réduction s'impute sur les cotisations : elle ne peut pas les dépasser.
  if (reduction > cotisations) {
    throw new ErreurMoteur(
      'ENTREE_INVALIDE',
      'La réduction structurelle dépasse les cotisations patronales.',
    );
  }
  return brut + cotisations - reduction;
}
