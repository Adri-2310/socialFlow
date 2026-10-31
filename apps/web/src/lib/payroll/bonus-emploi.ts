import { arrondirFraction } from './arrondi';
import type { ParametresBonusEmploi } from './bareme/schema';
import { ErreurMoteur } from './erreurs';
import { DIVISEUR_TAUX, type CategorieSalarie, type Centimes, type LigneCalcul } from './types';
import { BORNES, exigerEntier } from './validation';

// BONUS À L'EMPLOI (modules/paie.md § 3, étape 3) : une réduction de la cotisation personnelle
// pour les bas salaires.
// Source : Instructions administratives ONSS 2026/3, pages 448 à 453. Tous les montants, plafonds
// et coefficients viennent du bloc `bonusEmploi` du barème (D99), aucun n'est écrit ici.
//
// En clair, la loi procède en trois temps :
//   1. on détermine le SALAIRE MENSUEL DE RÉFÉRENCE S : ce que gagnerait le travailleur s'il avait
//      presté tout le mois (un travailleur qui a presté la moitié du mois n'est pas « pauvre » :
//      on le compare à un salaire de plein mois) ;
//   2. on lit dans deux tableaux (volet A « bas salaires », volet B « très bas salaires ») le
//      MONTANT DE BASE R : plein pour un petit salaire, il diminue ensuite jusqu'à 0 ;
//   3. on RAMÈNE R aux prestations réelles (P = R x part du mois prestée), puis on plafonne : le
//      bonus ne peut ni dépasser la cotisation personnelle due, ni dépasser le plafond annuel.
// Le bonus s'ajoute au net : il diminue la retenue de cotisation personnelle.
//
// Décisions propres au moteur (D101) : la fraction prestée est arrondie à 2 décimales (règle de la
// loi), R et P sont arrondis au centime PAR VOLET avant d'être additionnés.

// Prestations du mois, exprimées dans l'unité du travailleur :
// - JOURS : un temps plein ; `realisees` = J (jours déclarés), `pleinTemps` = D (jours du mois
//   dans son régime de travail) ;
// - MINUTES : un temps partiel ou un travail à l'heure ; `realisees` = H (heures déclarées),
//   `pleinTemps` = U (heures du mois d'un temps plein), tous deux en MINUTES pour rester entiers.
// Le choix de l'unité revient à l'appelant : c'est lui qui connaît le régime de travail.
export interface Prestations {
  unite: 'JOURS' | 'MINUTES';
  realisees: number;
  pleinTemps: number;
}

// Vérifie les prestations (unité connue, nombres entiers dans les bornes du mois) ; partagé avec la
// réduction structurelle, qui lit les mêmes prestations.
export function exigerPrestations(prestations: Prestations): void {
  const { unite, realisees, pleinTemps } = prestations;
  if (unite !== 'JOURS' && unite !== 'MINUTES') {
    throw new ErreurMoteur(
      'ENTREE_INVALIDE',
      "L'unité des prestations doit être JOURS ou MINUTES.",
    );
  }
  const maxUnites = unite === 'JOURS' ? BORNES.joursDansUnMoisMax : BORNES.minutesDansUnMoisMax;
  exigerEntier('Les prestations réalisées', realisees, 0, maxUnites);
  exigerEntier("Les prestations d'un temps plein", pleinTemps, 1, maxUnites);
}

export interface EntreeBonusEmploi {
  categorie: CategorieSalarie;
  // W : brut du mois à 100 % (jamais majoré de 8 %, même pour un ouvrier, p. 450).
  // Limite de la v1 : l'appelant y met le brut ordinaire (salaire et primes) ; les éléments que la
  // loi exclut du calcul (indemnité de rupture, pécule de sortie, prime de fin d'année…, p. 449)
  // arrivent avec les cas particuliers de l'étape 8.
  brutReferenceCentimes: Centimes;
  prestations: Prestations;
  // Cotisation personnelle due ce mois (onss.ts) : le bonus ne peut pas la dépasser.
  cotisationPersonnelleCentimes: Centimes;
  // Total du bonus déjà accordé à ce travailleur depuis le 1er janvier, pour le plafond annuel.
  // Entrée OBLIGATOIRE : le moteur est pur et ne va pas le chercher ; sans elle il ne devine pas.
  bonusDejaPrisAnneeCentimes: Centimes;
}

export interface ResultatBonusEmploi {
  bonus: Centimes; // total accordé, positif (somme des lignes)
  // Les deux volets réellement accordés (après plafonds) : le précompte en reprend une part
  // différente pour chacun (Annexe III n° 46, D102). `bonus` = voletA + voletB.
  voletA: Centimes;
  voletB: Centimes;
  salaireReference: Centimes; // S, pour l'afficher et l'expliquer
  lignes: LigneCalcul[];
}

// Les fractions de la loi sont arrondies à 2 décimales : on les compte en CENTIÈMES (0,86 = 86).
const CENTIEMES = 100;

// S : le salaire mensuel de référence (p. 450).
//   - prestations complètes (J >= D, ou H >= U) : S = W ;
//   - temps plein incomplet : S = (W / J) x D, avec W / J arrondi au centime ;
//   - temps partiel : S = (W / H) x U, avec W / H (le salaire horaire) arrondi au centime.
// Exemple à la main (p. 453, exemple 1) : W = 2 015,00 €, J = 19 jours sur D = 22.
//   W / J = 106,0526 -> 106,05 € par jour ; S = 106,05 x 22 = 2 333,10 €.
export function calculerSalaireReference(
  brutCentimes: Centimes,
  prestations: Prestations,
): Centimes {
  const { unite, realisees, pleinTemps } = prestations;
  if (realisees >= pleinTemps) return brutCentimes;
  if (unite === 'JOURS') {
    const parJour = arrondirFraction(brutCentimes, realisees); // W / J, au centime
    return parJour * pleinTemps;
  }
  // Minutes : le salaire horaire est W / (minutes / 60), soit W x 60 / minutes (en centimes par heure).
  const parHeure = arrondirFraction(brutCentimes * 60, realisees);
  // x U heures = x (U minutes / 60), arrondi au centime.
  return arrondirFraction(parHeure * pleinTemps, 60);
}

// R : le montant de base d'UN volet pour un salaire de référence S (p. 451-452).
//   S <= plafondPlein                  -> R = montantMax
//   plafondPlein < S <= plafondNul     -> R = montantMax - coefficient x (S - plafondPlein)
//   S > plafondNul                     -> R = 0
// Exemple (employé, volet B, S = 2 500,00 €) : 171,99 - 0,2699 x (2 500,00 - 2 300,62)
//   = 171,99 - 53,8127 = 118,1773 -> 118,18 €.
// Tout reste en entiers : coefficient x (S - plafond) est en « centimes x millionièmes » ; on
// compare et on divise par DIVISEUR_TAUX au moment d'arrondir.
function montantBaseVolet(
  salaireReference: Centimes,
  volet: ParametresBonusEmploi['employe']['voletA'],
): Centimes {
  if (salaireReference <= volet.plafondPlein) return volet.montantMax;
  if (salaireReference > volet.plafondNul) return 0;
  const numerateur =
    volet.montantMax * DIVISEUR_TAUX - volet.coefficient * (salaireReference - volet.plafondPlein);
  // Juste avant le plafond nul, la formule peut tomber à quelques fractions de centime sous 0 : la réduction ne peut pas être négative.
  if (numerateur <= 0) return 0;
  return arrondirFraction(numerateur, DIVISEUR_TAUX);
}

// Calcule le bonus à l'emploi du mois et son détail, ligne par ligne.
export function calculerBonusEmploi(
  entree: EntreeBonusEmploi,
  bareme: ParametresBonusEmploi,
): ResultatBonusEmploi {
  if (entree.categorie !== 'EMPLOYE' && entree.categorie !== 'OUVRIER') {
    throw new ErreurMoteur('ENTREE_INVALIDE', 'Le statut du salarié doit être EMPLOYE ou OUVRIER.');
  }
  const brut = exigerEntier(
    'Le brut de référence',
    entree.brutReferenceCentimes,
    0,
    BORNES.montantMax,
  );
  const cotisation = exigerEntier(
    'La cotisation personnelle',
    entree.cotisationPersonnelleCentimes,
    0,
    BORNES.montantMax,
  );
  // Un total déjà pris supérieur au plafond annuel est une donnée incohérente, pas un « zéro ».
  const dejaPris = exigerEntier(
    'Le bonus déjà pris cette année',
    entree.bonusDejaPrisAnneeCentimes,
    0,
    bareme.plafondAnnuel,
  );

  const { realisees, pleinTemps } = entree.prestations;
  exigerPrestations(entree.prestations);

  // Aucune prestation : la loi ne permet pas de déterminer un salaire de référence (p. 453,
  // « codes MRT ») ; il n'y a donc pas de bonus : résultat 0, sans ligne.
  if (realisees === 0) {
    return { bonus: 0, voletA: 0, voletB: 0, salaireReference: 0, lignes: [] };
  }

  const s = calculerSalaireReference(brut, entree.prestations);
  const tableau = entree.categorie === 'OUVRIER' ? bareme.ouvrier : bareme.employe;
  const rA = montantBaseVolet(s, tableau.voletA);
  const rB = montantBaseVolet(s, tableau.voletB);

  // Part du mois prestée, arrondie à 2 décimales (0,005 monte) et jamais au-dessus de 1 (p. 452).
  // Exemple : 19 jours sur 22 = 0,8636... -> 0,86.
  const centiemes = Math.min(CENTIEMES, arrondirFraction(CENTIEMES * realisees, pleinTemps));
  // P = R x fraction, au centime, volet par volet.
  let pA = arrondirFraction(rA * centiemes, CENTIEMES);
  let pB = arrondirFraction(rB * centiemes, CENTIEMES);

  // Plafonds : le total ne dépasse ni la cotisation personnelle due (p. 452), ni ce qui reste du
  // plafond annuel (p. 453). On retire l'excédent d'abord au volet B, puis au volet A (p. 450 :
  // « l'écrêtement s'effectue dans le volet B et ensuite dans le volet A »).
  const autorise = Math.min(cotisation, bareme.plafondAnnuel - dejaPris);
  const exces = pA + pB - autorise;
  if (exces > 0) {
    const retraitB = Math.min(pB, exces);
    pB -= retraitB;
    pA -= exces - retraitB;
  }

  const lignes: LigneCalcul[] = [];
  if (pA > 0) {
    lignes.push({
      code: 'BONUS_EMPLOI_A',
      libelle: "Bonus à l'emploi, volet A (bas salaires)",
      base: s,
      taux: null,
      montant: pA,
    });
  }
  if (pB > 0) {
    lignes.push({
      code: 'BONUS_EMPLOI_B',
      libelle: "Bonus à l'emploi, volet B (très bas salaires)",
      base: s,
      taux: null,
      montant: pB,
    });
  }
  return { bonus: pA + pB, voletA: pA, voletB: pB, salaireReference: s, lignes };
}
