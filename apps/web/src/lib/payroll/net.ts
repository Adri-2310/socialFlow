import { ErreurMoteur } from './erreurs';
import type { Centimes } from './types';
import { BORNES, exigerEntier } from './validation';

// NET À PAYER (modules/paie.md § 3, étape 6).
//
// En clair : le net est ce que le salarié reçoit. On part du brut et on retire ce qui est retenu :
//   net = brut - cotisation personnelle + bonus à l'emploi - précompte - CSSS
// Le bonus à l'emploi n'est pas une prime : c'est une RÉDUCTION de la cotisation personnelle
// (modules/paie.md § 3, ONSS p. 448), d'où le signe plus ; la cotisation reste affichée en entier.
// La CSSS est négative quand elle rembourse un trop-retenu (mois 3 du trimestre).
//
// Exemple (employé isolé, 4 000,00 € : au-dessus du dernier plafond du bonus, donc bonus nul) :
//   4 000,00 - 522,80 (cotisation 13,07 %) + 0,00 - 826,70 (précompte) - 36,24 (CSSS, mois 1)
//   = 2 614,26 €.
//
// Pas d'arrondi ici : uniquement des additions de centimes déjà arrondis par chaque étape.
// Un net négatif n'est pas refusé (les retenues peuvent dépasser un très petit brut) : l'anomalie
// est signalée à l'étape 8, avec les autres contrôles.

export interface EntreeNet {
  brutCentimes: Centimes;
  cotisationPersonnelleCentimes: Centimes; // positive (onss.ts)
  bonusEmploiCentimes: Centimes; // positif (bonus-emploi.ts)
  precompteCentimes: Centimes; // positif (precompte.ts)
  // Positive = retenue, négative = remboursement (csss.ts, champ `retenue`).
  csssCentimes: Centimes;
}

export function calculerNet(entree: EntreeNet): Centimes {
  const max = BORNES.montantMax;
  const brut = exigerEntier('Le brut', entree.brutCentimes, 0, max);
  const cotisation = exigerEntier(
    'La cotisation personnelle',
    entree.cotisationPersonnelleCentimes,
    0,
    max,
  );
  const bonus = exigerEntier('Le bonus à l’emploi', entree.bonusEmploiCentimes, 0, max);
  const precompte = exigerEntier('Le précompte', entree.precompteCentimes, 0, max);
  const csss = exigerEntier('La CSSS', entree.csssCentimes, -max, max);
  // Le bonus ne peut pas dépasser la cotisation qu'il réduit (ONSS p. 449 : P <= cotisation).
  if (bonus > cotisation) {
    throw new ErreurMoteur(
      'ENTREE_INVALIDE',
      'Le bonus à l’emploi dépasse la cotisation personnelle qu’il réduit.',
    );
  }
  return brut - cotisation + bonus - precompte - csss;
}
