import { ErreurMoteur } from './erreurs';
import { DIVISEUR_TAUX } from './types';

// Bornes TECHNIQUES de l'entrée : elles écartent l'impossible, pas l'inhabituel. Aucune n'est une
// règle légale (taux et seuils légaux viennent du barème) et aucune n'est un chiffre rond choisi
// au hasard : chacune se déduit d'une contrainte qu'on peut citer.
//
// Deux niveaux, volontairement séparés :
//   1. ici, le refus : une valeur impossible (heures au-delà du mois, montant que le calcul
//      en entiers ne sait plus représenter) lève une erreur, jamais un calcul silencieux ;
//   2. à l'étape 8, l'anomalie : une valeur possible mais suspecte (salaire très élevé, net
//      négatif, écart avec le mois précédent) est signalée, avec un seuil tiré du barème.

// Le plus grand multiplicateur appliqué à un montant est un taux, plafonné à 10 fois 100 %
// (tauxSchema). Un montant n'est accepté que si montant x taux, doublé par l'arrondi
// (arrondi.ts : 2n + d), reste un entier exact de JavaScript (au plus Number.MAX_SAFE_INTEGER,
// soit 9 007 199 254 740 991). Au-delà, JavaScript arrondirait en silence : on refuse avant.
// Valeur : 450 359 962 centimes, soit environ 4,5 millions d'euros.
const TAUX_MAX = 10 * DIVISEUR_TAUX;
const MONTANT_MAX = Math.floor((Number.MAX_SAFE_INTEGER - DIVISEUR_TAUX) / (2 * TAUX_MAX));

// Calendrier : un mois compte au plus 31 jours de 24 heures (D92 : valeurs bornées au mois).
const JOURS_MOIS_MAX = 31;
const MINUTES_PAR_JOUR = 24 * 60;

export const BORNES = {
  // Tout montant en centimes (rémunération, taux horaire, prime).
  montantMax: MONTANT_MAX,
  joursDansUnMoisMax: JOURS_MOIS_MAX,
  // 31 x 24 x 60 = 44 640 minutes : on ne peut pas prester plus d'heures que le mois n'en contient.
  minutesDansUnMoisMax: JOURS_MOIS_MAX * MINUTES_PAR_JOUR,
  // D96 : une durée hebdomadaire ne dépasse pas 60 heures (3 600 minutes).
  minutesSemaineMax: 60 * 60,
  // Nombre de personnes d'une même catégorie à charge (enfants, autres personnes) : même plafond
  // que le formulaire du dossier (lib/schemas/salarie.ts). Au-delà, c'est une faute de saisie.
  personnesAChargeMax: 20,
} as const;

// Vérifie qu'une valeur est un nombre ENTIER compris entre `min` et `max` (bornes incluses) et la
// renvoie. `nom` sert à écrire un message précis (« La prime doit être … »). Une entrée
// incohérente lève une erreur explicite : jamais un calcul silencieux.
export function exigerEntier(nom: string, valeur: unknown, min: number, max: number): number {
  // Refuse aussi une chaîne ("1500"), NaN et un flottant (12,5) : seuls les entiers entrent.
  if (typeof valeur !== 'number' || !Number.isInteger(valeur)) {
    throw new ErreurMoteur('ENTREE_INVALIDE', `${nom} doit être un nombre entier.`);
  }
  if (valeur < min || valeur > max) {
    throw new ErreurMoteur('ENTREE_INVALIDE', `${nom} doit être compris entre ${min} et ${max}.`);
  }
  return valeur;
}
