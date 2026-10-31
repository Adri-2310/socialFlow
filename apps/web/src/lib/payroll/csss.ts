import { appliquerTaux, arrondirFraction } from './arrondi';
import type { ParametresCsss } from './bareme/schema';
import { ErreurMoteur } from './erreurs';
import type { SituationFiscalePaie } from './precompte';
import type { Centimes, CategorieSalarie, LigneCalcul } from './types';
import { BORNES, exigerEntier } from './validation';

// COTISATION SPÉCIALE POUR LA SÉCURITÉ SOCIALE, « CSSS » (modules/paie.md § 3, étape 6).
//
// En clair : en plus de la cotisation de 13,07 %, l'ONSS retient une petite somme qui grandit avec
// le salaire et dépend du ménage (isolé, ou couple dont le conjoint a ou non des revenus). Elle se
// calcule sur la rémunération du TRIMESTRE, mais se retient chaque MOIS : c'est une provision, le
// décompte définitif est fait par le fisc.
//
// Source : Instructions administratives ONSS 2026/3, « La cotisation spéciale pour la sécurité
// sociale », `doc/reference/onss-csss-2026-3.html` (barèmes en vigueur depuis le 01/04/2022).
// Aucun montant n'est écrit ici : tout vient du bloc `csss` du barème (D99, D103).
//
// Mécanique du document :
//   - mois 1 et 2 du trimestre : on retient le TIERS du montant de la tranche atteinte par le
//     salaire du mois (« au moins un tiers du plafond inférieur d'une tranche ») ;
//   - mois 3 : on connaît la rémunération réelle du trimestre, on calcule le montant exact et on
//     retient la différence avec ce qui l'a déjà été (ou on rembourse le trop-perçu) ;
//   - la CSSS se retient après la cotisation personnelle et le précompte.
// Les montants du document pour le mois 1 et 2 ne sont écrits que pour un cas (commune, conjoint
// avec revenus). Pour les autres cas, le moteur applique la même règle : tiers du montant
// trimestriel obtenu avec 3 x le salaire du mois (D103).
//
// Arrondi : chaque montant est arrondi au centime, la moitié monte (D99) ; le tiers mensuel est
// arrondi lui aussi, ce qui explique les écarts de 1 centime que le mois 3 régularise.

// Le salarié de la fiche de situation : seuls ces deux critères comptent pour la CSSS.
export type SituationCsss = Pick<SituationFiscalePaie, 'situationFamiliale' | 'conjointRevenus'>;

export interface EntreeCsss {
  categorie: CategorieSalarie;
  // Brut du mois en centimes (résultat de l'étape 1).
  brutCentimes: Centimes;
  // Mois civil de la fiche, de 1 (janvier) à 12 : il décide du rang dans le trimestre
  // (janvier, avril, juillet, octobre = 1 ; février, mai, août, novembre = 2 ; les autres = 3).
  moisCivil: number;
  situation: SituationCsss;
  // Lus seulement au mois 3, fournis par l'appelant (il les trouve sur les fiches précédentes) :
  // brut des deux premiers mois du trimestre, et CSSS déjà retenue sur ces deux mois.
  brutMoisPrecedentsCentimes: Centimes;
  csssDejaRetenueCentimes: Centimes;
}

export interface ResultatCsss {
  // Ce qui est retenu CE mois. Positif = retenue ; négatif = remboursement (mois 3 seulement).
  retenue: Centimes;
  rang: 1 | 2 | 3; // rang du mois dans le trimestre
  // Rémunération trimestrielle utilisée (mois 1 et 2 : 3 x le mois ; mois 3 : réelle), à 108 %
  // pour un ouvrier.
  remunerationTrimestre: Centimes;
  // Montant du trimestre pour cette rémunération (mois 1 et 2 : estimation si le mois se répétait).
  montantTrimestre: Centimes;
  lignes: LigneCalcul[];
}

type BaremeCsss = ParametresCsss['individuelle'];

// Montant dû pour un trimestre de rémunération `q`. On prend la dernière tranche dont le seuil
// `depuis` est atteint (en dessous de la première : rien à payer), puis fixe + taux x excédent,
// ramené entre plancher et plafond.
// Exemple (isolé, q = 8 400,00 €) : tranche « 6 570,55 € et plus » = 30,99 € + 1,10 % x
// (8 400,00 - 6 570,54) = 30,99 + 20,12 = 51,11 €.
export function calculerMontantTrimestre(q: Centimes, bareme: BaremeCsss): Centimes {
  let tranche: BaremeCsss[number] | undefined;
  for (const t of bareme) {
    if (q >= t.depuis) tranche = t;
  }
  if (tranche === undefined) return 0;
  let montant = tranche.fixe + appliquerTaux(Math.max(0, q - tranche.excedentDe), tranche.taux);
  if (tranche.plancher !== undefined) montant = Math.max(montant, tranche.plancher);
  if (tranche.plafond !== undefined) montant = Math.min(montant, tranche.plafond);
  return montant;
}

// Quel barème pour quel ménage ? (D103)
//   - isolé -> imposition individuelle ;
//   - marié ou cohabitant légal -> imposition commune ; le conjoint « a des revenus professionnels »
//     quand ils dépassent le plafond de la réduction du n° 40, soit `REVENUS` ; les autres valeurs
//     (sans revenus, pension, revenu limité) comptent comme « sans revenus ».
function choisirBareme(situation: SituationCsss, bloc: ParametresCsss): BaremeCsss {
  if (situation.situationFamiliale === 'ISOLE') return bloc.individuelle;
  if (situation.situationFamiliale !== 'MARIE_OU_COHABITANT_LEGAL') {
    throw new ErreurMoteur('ENTREE_INVALIDE', 'La situation familiale est inconnue.');
  }
  switch (situation.conjointRevenus) {
    case 'REVENUS':
      return bloc.communeConjointRevenus;
    case 'SANS_REVENUS':
    case 'PENSION_TRES_LIMITEE':
    case 'PENSION_LIMITEE':
    case 'REVENU_LIMITE':
      return bloc.communeConjointSansRevenus;
    default:
      throw new ErreurMoteur(
        'ENTREE_INVALIDE',
        'Les revenus du conjoint doivent être précisés pour un salarié marié ou cohabitant légal.',
      );
  }
}

// Exemple à la main (employé isolé, 2 800,00 € par mois, trimestre juillet-août-septembre) :
//   mois 1 : Q = 3 x 2 800 = 8 400,00 -> 51,11 € ; tiers = 17,0366 -> 17,04 € retenus ;
//   mois 2 : idem, 17,04 € ;
//   mois 3 : Q réel = 8 400,00 -> 51,11 € ; déjà retenu 34,08 € -> 17,03 € retenus.
//   Total du trimestre : 51,11 €.
export function calculerCsss(entree: EntreeCsss, bloc: ParametresCsss): ResultatCsss {
  if (entree.categorie !== 'EMPLOYE' && entree.categorie !== 'OUVRIER') {
    throw new ErreurMoteur('ENTREE_INVALIDE', 'Le statut du salarié doit être EMPLOYE ou OUVRIER.');
  }
  const brut = exigerEntier('Le brut', entree.brutCentimes, 0, BORNES.montantMax);
  const mois = exigerEntier('Le mois', entree.moisCivil, 1, 12);
  const brutPrecedents = exigerEntier(
    'Le brut des mois précédents du trimestre',
    entree.brutMoisPrecedentsCentimes,
    0,
    BORNES.montantMax,
  );
  const dejaRetenu = exigerEntier(
    'La CSSS déjà retenue',
    entree.csssDejaRetenueCentimes,
    0,
    BORNES.montantMax,
  );
  const bareme = choisirBareme(entree.situation, bloc);

  // Un ouvrier est pris à 108 % de sa rémunération (le document le dit pour la CSSS aussi).
  const majorer = (brutCentimes: Centimes): Centimes =>
    entree.categorie === 'OUVRIER'
      ? appliquerTaux(brutCentimes, bloc.coefficientOuvrier)
      : brutCentimes;

  const rang = (((mois - 1) % 3) + 1) as 1 | 2 | 3;
  let remunerationTrimestre: Centimes;
  let montantTrimestre: Centimes;
  let retenue: Centimes;
  if (rang === 3) {
    // Mois 3 : rémunération réelle du trimestre, montant exact, puis solde.
    remunerationTrimestre = majorer(brut + brutPrecedents);
    montantTrimestre = calculerMontantTrimestre(remunerationTrimestre, bareme);
    retenue = montantTrimestre - dejaRetenu;
  } else {
    // Mois 1 et 2 : on traite le mois comme s'il se répétait trois fois, et on en retient le tiers.
    remunerationTrimestre = 3 * majorer(brut);
    montantTrimestre = calculerMontantTrimestre(remunerationTrimestre, bareme);
    retenue = arrondirFraction(montantTrimestre, 3);
  }

  if (retenue === 0) return { retenue, rang, remunerationTrimestre, montantTrimestre, lignes: [] };

  const libelle =
    rang !== 3
      ? 'Cotisation spéciale de sécurité sociale (provision)'
      : retenue < 0
        ? 'Cotisation spéciale de sécurité sociale (remboursement du trop retenu)'
        : 'Cotisation spéciale de sécurité sociale (solde du trimestre)';
  return {
    retenue,
    rang,
    remunerationTrimestre,
    montantTrimestre,
    lignes: [
      {
        code: 'CSSS',
        libelle,
        base: remunerationTrimestre,
        taux: null,
        // Une retenue est négative sur la fiche ; un remboursement est positif.
        montant: -retenue,
      },
    ],
  };
}
