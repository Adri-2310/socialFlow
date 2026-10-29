import { appliquerTaux, arrondirFraction } from './arrondi';
import type { ParametresReductionStructurelle } from './bareme/schema';
import { calculerSalaireReference, exigerPrestations, type Prestations } from './bonus-emploi';
import { ErreurMoteur } from './erreurs';
import { DIVISEUR_TAUX, type Centimes, type LigneCalcul } from './types';
import { BORNES, exigerEntier } from './validation';

// RÉDUCTION STRUCTURELLE (modules/paie.md § 3, étape 7) : une réduction des cotisations patronales
// pour les bas salaires, accordée automatiquement aux employeurs du secteur privé marchand
// (catégorie 1, D98). Elle diminue le coût employeur, pas le net du salarié.
// Source : Instructions administratives ONSS 2026/3, pages 374 à 383, valeurs applicables à partir
// du 3e trimestre 2026. Tous les montants et coefficients viennent du bloc `reductionStructurelle`.
//
// En clair, la loi procède en quatre temps :
//   1. S : le salaire de référence du TRIMESTRE, ce que le travailleur aurait gagné à temps plein ;
//   2. R : le montant de base, R = 0,14 x (S0 - S) + 0,16 x (S2 - S), chaque terme ramené à 0 s'il
//      est négatif (le second terme ne joue que pour les très bas salaires) ;
//   3. on ramène R aux prestations : Ps = R x µ x beta. µ est la part des prestations ; beta les
//      « assimile » à un temps plein : dès 80 % de prestations, la réduction est complète ;
//   4. on plafonne par les cotisations sur lesquelles la réduction s'impute (base + modération).
//
// Estimation mensuelle (D104) : la loi calcule par trimestre, la fiche est mensuelle. Le moteur
// prend S = 3 x le salaire de référence du mois, µ = la part du mois prestée, puis un tiers du
// résultat trimestriel. Si le salaire et les prestations sont stables, c'est exact ; sinon la
// régularisation du trimestre (DmfA) n'est pas reproduite.
//
// Arrondi : les deux termes de R sont arrondis chacun au centime (p. 382), µ à 2 décimales, beta
// n'est JAMAIS arrondi, Ps est arrondi une seule fois au centime (p. 382). Le tiers mensuel et le
// plafonnement sont arrondis au centime (D99).

const CENTIEMES = 100;
const MOIS_PAR_TRIMESTRE = 3;

export interface EntreeReductionStructurelle {
  // W : brut du mois à 100 % (jamais majoré de 8 %). Mêmes limites de v1 que le bonus à l'emploi.
  brutReferenceCentimes: Centimes;
  prestations: Prestations;
  // Contrat au moins à mi-temps (heures hebdomadaires >= la moitié de la personne de référence,
  // p. 377) : sans lui, un travailleur qui preste moins de 27,5 % n'a droit à rien.
  contratAuMoinsMiTemps: boolean;
  // Cotisation de base + modération du mois (cotisations-patronales.ts, `cotisationsReductibles`).
  cotisationsReductiblesCentimes: Centimes;
}

export interface ResultatReductionStructurelle {
  reduction: Centimes; // positif ; la ligne de détail est négative
  salaireReferenceTrimestre: Centimes; // S
  montantBaseTrimestre: Centimes; // R
  prestationsCentiemes: number; // µ en centièmes (86 = 0,86)
  lignes: LigneCalcul[];
}

function pgcd(a: number, b: number): number {
  return b === 0 ? a : pgcd(b, a % b);
}

// Le terme « coefficient x (plafond - S) » : 0 si S atteint le plafond. Arrondi au centime.
// Exemple : 0,14 x (11 687,74 - 8 400,00) = 460,2836 -> 460,28 €.
function terme(plafond: Centimes, s: Centimes, coefficient: number): Centimes {
  return s >= plafond ? 0 : appliquerTaux(plafond - s, coefficient);
}

// Ps = R x µ x beta, arrondi UNE fois. Tout est exact en entiers : µ = m / 100, et
//   - µ < début de progression : beta = valeurMinimale -> R x m x valeurMinimale / (100 x 1 000 000) ;
//   - progression : beta = valeurMinimale + (µ - début) x pente ; on met tout sur le même
//     dénominateur, on réduit la fraction (pgcd) pour rester dans les entiers sûrs de JavaScript ;
//   - µ >= fin de progression : beta = 1/µ, donc µ x beta = 1 : Ps = R.
// Exemple (µ = 0,70, R = 622,91 €) : beta = 1,18 + (0,70 - 0,55) x 0,28 = 1,222 ;
//   Ps = 622,91 x 0,70 x 1,222 = 532,8372 -> 532,84 €.
function appliquerFacteur(
  r: Centimes,
  m: number,
  contratAuMoinsMiTemps: boolean,
  p: ParametresReductionStructurelle,
): Centimes {
  const mTaux = m * (DIVISEUR_TAUX / CENTIEMES); // µ en dix-millièmes de pour cent
  if (mTaux >= p.finProgression) return r;
  if (mTaux < p.plancherPrestations && !contratAuMoinsMiTemps) return 0;
  if (mTaux < p.debutProgression) {
    return arrondirFraction(r * m * p.valeurMinimale, CENTIEMES * DIVISEUR_TAUX);
  }
  const numerateur = p.valeurMinimale * DIVISEUR_TAUX + (mTaux - p.debutProgression) * p.pente;
  const denominateur = CENTIEMES * DIVISEUR_TAUX * DIVISEUR_TAUX;
  const g = pgcd(numerateur, denominateur);
  return arrondirFraction(r * m * (numerateur / g), denominateur / g);
}

export function calculerReductionStructurelle(
  entree: EntreeReductionStructurelle,
  bloc: ParametresReductionStructurelle,
): ResultatReductionStructurelle {
  const brut = exigerEntier(
    'Le brut de référence',
    entree.brutReferenceCentimes,
    0,
    BORNES.montantMax,
  );
  const reductibles = exigerEntier(
    'Les cotisations réductibles',
    entree.cotisationsReductiblesCentimes,
    0,
    BORNES.montantMax,
  );
  exigerPrestations(entree.prestations);
  if (typeof entree.contratAuMoinsMiTemps !== 'boolean') {
    throw new ErreurMoteur(
      'ENTREE_INVALIDE',
      'Il faut préciser si le contrat est au moins à mi-temps.',
    );
  }

  const aucune = {
    reduction: 0,
    salaireReferenceTrimestre: 0,
    montantBaseTrimestre: 0,
    prestationsCentiemes: 0,
    lignes: [],
  };
  // Sans prestation, pas de salaire de référence ni de réduction.
  if (entree.prestations.realisees === 0) return aucune;

  // µ : part des prestations, à 2 décimales (0,005 monte), comptée en centièmes.
  const m = arrondirFraction(
    CENTIEMES * entree.prestations.realisees,
    entree.prestations.pleinTemps,
  );
  // S : trois fois le salaire de référence du mois (estimation mensuelle).
  const s = MOIS_PAR_TRIMESTRE * calculerSalaireReference(brut, entree.prestations);
  const r =
    terme(bloc.plafondBasSalaires, s, bloc.coefficientBasSalaires) +
    terme(bloc.plafondTresBasSalaires, s, bloc.coefficientTresBasSalaires);
  const psTrimestre = appliquerFacteur(r, m, entree.contratAuMoinsMiTemps, bloc);

  // Un tiers du trimestre, plafonné par les cotisations sur lesquelles la réduction s'impute.
  const reduction = Math.min(arrondirFraction(psTrimestre, MOIS_PAR_TRIMESTRE), reductibles);
  const resultat = {
    reduction,
    salaireReferenceTrimestre: s,
    montantBaseTrimestre: r,
    prestationsCentiemes: m,
    lignes: [] as LigneCalcul[],
  };
  if (reduction === 0) return resultat;
  resultat.lignes.push({
    code: 'REDUCTION_STRUCTURELLE',
    libelle: 'Réduction structurelle des cotisations patronales',
    base: s,
    taux: null,
    // Une réduction diminue le coût : négatif.
    montant: -reduction,
  });
  return resultat;
}
