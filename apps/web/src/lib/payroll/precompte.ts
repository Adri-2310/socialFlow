import { appliquerTaux, arrondirFraction } from './arrondi';
import type { ParametresPrecompte } from './bareme/schema';
import { ErreurMoteur } from './erreurs';
import type { Centimes, LigneCalcul } from './types';
import { BORNES, exigerEntier } from './validation';

// PRÉCOMPTE PROFESSIONNEL (modules/paie.md § 3, étape 6).
//
// En clair : le précompte est une AVANCE sur l'impôt du salarié, retenue chaque mois. Pour la
// calculer, la loi fait comme si le salaire du mois durait toute l'année, calcule l'impôt de
// l'année, puis en reprend un douzième. Six sous-étapes (a à f), chacune dans sa fonction.
//
// Source : Annexe III à l'arrêté royal d'exécution du CIR 92 (AR du 11/12/2025, revenus payés à
// partir du 1er janvier 2026), `doc/reference/precompte/annexe-iii-2026.pdf`. Les numéros « n° »
// des commentaires renvoient à ce document. Aucun montant n'est écrit ici : tout vient du bloc
// `precompte` du barème (D99).
//
// Arrondi : « tous les montants sont, le cas échéant à chaque étape du calcul, arrondis au cent »
// (n° 12) : chaque sous-étape arrondit son résultat au centime, la moitié monte (D99, arrondi.ts).
//
// Périmètre de la v1 (D102) : un travailleur HABITANT DU ROYAUME payé AU MOIS. Les non-résidents
// sont refusés (`PRECOMPTE_NON_SUPPORTE`), les dirigeants d'entreprise et les paiements par
// quinzaine ou par semaine ne sont pas calculables ici. La réduction du n° 44 (assurance de groupe)
// n'est pas appliquée ; celle du n° 45 (heures supplémentaires) l'est depuis l'étape 8c (D106).

// Situation fiscale du salarié (D95), mêmes critères que le dossier. Le moteur ne lit pas la base
// de données : l'appelant convertit la ligne du dossier en cet objet.
export type SituationFamiliale = 'ISOLE' | 'MARIE_OU_COHABITANT_LEGAL';
export type RevenusConjoint =
  | 'SANS_REVENUS' // section 2 : quotient conjugal
  | 'PENSION_TRES_LIMITEE' // n° 33 : traité comme sans revenus propres
  | 'PENSION_LIMITEE' // n° 40.3
  | 'REVENU_LIMITE' // n° 40.2
  | 'REVENUS';

export interface SituationFiscalePaie {
  situationFamiliale: SituationFamiliale;
  conjointRevenus: RevenusConjoint | null; // null pour un isolé
  beneficiaireHandicape: boolean;
  conjointHandicape: boolean;
  enfantsCharge: number;
  enfantsHandicapes: number; // sous-ensemble de enfantsCharge, compté double (n° 8)
  autresChargeDependantes66: number; // n° 9 et 39.2
  autresChargeHandicapees: number; // comptées double (n° 8)
  autresCharge: number;
  parentIsole: boolean; // n° 40.1
  // n° 6 : quand le conjoint a aussi des revenus, qui du couple reçoit les réductions pour
  // charges de famille ? true = ce salarié, false = son conjoint, null = pas précisé.
  chargesFamilleAttribuees: boolean | null;
}

export interface EntreePrecompte {
  // Les montants viennent des étapes précédentes (brut.ts, onss.ts, bonus-emploi.ts).
  brutCentimes: Centimes;
  cotisationPersonnelleCentimes: Centimes;
  bonusVoletACentimes: Centimes; // bonus à l'emploi réellement accordé, volet A
  bonusVoletBCentimes: Centimes; // idem, volet B
  situation: SituationFiscalePaie;
  habitantRoyaume: boolean; // n° 36 : seuls les habitants du Royaume sont calculés en v1
  // n° 45 et 111.2 : réduction pour heures supplémentaires avec sursalaire, calculée par
  // heures-supplementaires.ts. Facultative : 0 si le mois n'en comporte pas.
  reductionHeuresSupplementairesCentimes?: Centimes;
}

// Le détail de chaque sous-étape, pour l'écran « explication du calcul » et les contrôles.
export interface DetailPrecompte {
  baseMensuelle: Centimes; // a
  baseAnnuelle: Centimes; // b : base mensuelle x 12
  fraisProfessionnels: Centimes; // b
  baseNetteAnnuelle: Centimes; // b : base annuelle - frais
  impotDeBase: Centimes; // c : jamais négatif
  reductionsFamille: Centimes; // d
  precompteAvantBonus: Centimes; // e : (impôt de base - réductions) / 12
  reductionBonusEmploi: Centimes; // f
  reductionHeuresSupplementaires: Centimes; // g : n° 45, déduite comme le bonus
}

export interface ResultatPrecompte {
  precompte: Centimes; // toujours positif ou nul (la ligne de détail est négative)
  detail: DetailPrecompte;
  lignes: LigneCalcul[];
}

const MOIS_PAR_AN = 12;

// ---------------------------------------------------------------------------------------------
// Sous-étape b : les frais professionnels forfaitaires (n° 27-28)
// ---------------------------------------------------------------------------------------------
// La loi retire d'office 30 % de la base annuelle pour les frais du travail, sans dépasser 6 070 €.
// Exemple : base annuelle 31 185,48 € -> 30 % = 9 355,64 €, plafonné à 6 070,00 €.
export function calculerFraisProfessionnels(
  baseAnnuelle: Centimes,
  bloc: ParametresPrecompte,
): Centimes {
  const frais = appliquerTaux(baseAnnuelle, bloc.fraisProfessionnels.taux);
  return Math.min(frais, bloc.fraisProfessionnels.maximum);
}

// ---------------------------------------------------------------------------------------------
// Sous-étape c : l'impôt de base (n° 31 à 34)
// ---------------------------------------------------------------------------------------------
// Le barème est PROGRESSIF : plus le revenu monte, plus la part au-delà de chaque seuil est taxée.
// On prend la dernière tranche dont le seuil est strictement dépassé (« au-delà de 16 710 € »),
// puis impôt = impôt fixe de la tranche + taux x (revenu - seuil).
// Exemple : net 25 115,48 € -> tranche 2 : 4 469,93 + 42,80 % x (25 115,48 - 16 710) = 8 067,48 €.
export function calculerImpotSelonBareme(netAnnuel: Centimes, bloc: ParametresPrecompte): Centimes {
  if (netAnnuel <= 0) return 0;
  let tranche = bloc.bareme[0];
  for (const t of bloc.bareme) {
    if (netAnnuel > t.auDela) tranche = t;
  }
  return tranche.impotFixe + appliquerTaux(netAnnuel - tranche.auDela, tranche.taux);
}

// Le conjoint a-t-il des revenus propres au sens du n° 33 ? Un conjoint sans revenus, ou dont les
// seules ressources sont des pensions très limitées, est traité comme n'ayant AUCUN revenu.
function conjointSansRevenusPropres(s: SituationFiscalePaie): boolean {
  return (
    s.situationFamiliale === 'MARIE_OU_COHABITANT_LEGAL' &&
    (s.conjointRevenus === 'SANS_REVENUS' || s.conjointRevenus === 'PENSION_TRES_LIMITEE')
  );
}

// Impôt de base annuel, SIGNÉ (négatif sous la quotité exemptée : l'appelant le ramène à 0).
//   - isolé, ou conjoint avec revenus (section 1, n° 32) : impôt du barème - 2 987,98 € ;
//   - conjoint sans revenus propres (section 2, n° 34), le QUOTIENT CONJUGAL : on attribue au
//     conjoint 30 % du net (max 13 790 €), on calcule l'impôt sur cette part et sur le reste, on
//     additionne, puis on retire DEUX fois la quotité exemptée (5 975,96 €), une par conjoint.
// Exemple (net 25 115,48 €, conjoint sans revenus) : imputé 7 534,64 € -> 2 015,52 € d'impôt ;
// reste 17 580,84 € -> 4 842,65 € ; total 6 858,17 - 5 975,96 = 882,21 €.
export function calculerImpotDeBase(
  netAnnuel: Centimes,
  situation: SituationFiscalePaie,
  bloc: ParametresPrecompte,
): Centimes {
  if (!conjointSansRevenusPropres(situation)) {
    return calculerImpotSelonBareme(netAnnuel, bloc) - bloc.impotQuotiteExemptee;
  }
  const impute = Math.min(
    appliquerTaux(netAnnuel, bloc.quotientConjugal.taux),
    bloc.quotientConjugal.maximum,
  );
  return (
    calculerImpotSelonBareme(impute, bloc) +
    calculerImpotSelonBareme(netAnnuel - impute, bloc) -
    2 * bloc.impotQuotiteExemptee
  );
}

// ---------------------------------------------------------------------------------------------
// Sous-étape d : les réductions pour charges de famille (n° 38 à 41)
// ---------------------------------------------------------------------------------------------
// Réduction pour `n` enfants à charge (n° 38). Un enfant handicapé compte pour DEUX (n° 8).
// Au-delà du huitième, on ajoute un montant fixe par enfant.
// Exemple : 9 enfants = 21 996 + 1 x 3 864 = 25 860 €.
export function calculerReductionEnfants(n: number, bloc: ParametresPrecompte): Centimes {
  const r = bloc.reductions;
  if (n <= 0) return 0;
  if (n <= r.enfants.length) return r.enfants[n - 1];
  return r.enfants[r.enfants.length - 1] + (n - r.enfants.length) * r.parEnfantAuDela8;
}

// Le conjoint a-t-il des revenus propres (donc, qui des deux reçoit les charges ? n° 6) ?
function conjointAvecRevenusPropres(s: SituationFiscalePaie): boolean {
  return s.situationFamiliale === 'MARIE_OU_COHABITANT_LEGAL' && !conjointSansRevenusPropres(s);
}

// Total des réductions de famille de l'année, en centimes. Cumul de tout ce qui s'applique
// (« toutes les réductions peuvent être cumulées », n° 39 et 40).
function calculerReductionsFamille(s: SituationFiscalePaie, bloc: ParametresPrecompte): Centimes {
  const r = bloc.reductions;
  const personnesACharge =
    s.enfantsCharge + s.autresChargeDependantes66 + s.autresChargeHandicapees + s.autresCharge;

  // n° 6 : quand le conjoint a aussi des revenus, les réductions pour charges de famille vont à
  // UN SEUL des deux, choisi par le couple. S'il y a des charges et que le choix n'est pas connu,
  // on ne choisit pas à sa place : le calcul s'arrête (D95).
  let recoitLesCharges = true;
  if (conjointAvecRevenusPropres(s) && personnesACharge > 0) {
    if (s.chargesFamilleAttribuees === null) {
      throw new ErreurMoteur(
        'ATTRIBUTION_CHARGES_MANQUANTE',
        'Le conjoint a aussi des revenus : il faut préciser lequel des deux reçoit les réductions pour charges de famille.',
      );
    }
    recoitLesCharges = s.chargesFamilleAttribuees;
  }

  let total = 0;
  // Si les charges vont au conjoint, ce salarié ne reçoit aucune de ces réductions.
  // S'il n'y a aucune charge à attribuer, rien n'a été choisi : `recoitLesCharges` reste vrai et
  // un salarié handicapé reçoit sa réduction (le formulaire du dossier ne pose pas la question
  // dans ce cas, D95/D102).
  if (recoitLesCharges) {
    // n° 38 : enfants (les handicapés comptent double, n° 8).
    total += calculerReductionEnfants(s.enfantsCharge + s.enfantsHandicapes, bloc);
    // n° 39.2 : personnes dépendantes de 66 ans ou plus, une fois chacune (n° 9, pas de double compte).
    total += s.autresChargeDependantes66 * r.dependant66;
    // n° 39.3 : autres personnes à charge ; une personne handicapée compte double (n° 8).
    total += (s.autresCharge + 2 * s.autresChargeHandicapees) * r.autreCharge;
    // n° 39.1 : le salarié handicapé. Le n° 6 range toutes les réductions de famille, sauf celle
    // du conjoint handicapé, dans le choix du couple : elle le suit donc aussi (D102).
    if (s.beneficiaireHandicape) total += r.beneficiaireHandicape;
  }

  // n° 40 : seulement quand l'impôt vient de la section 1 (isolé ou conjoint avec revenus).
  if (!conjointSansRevenusPropres(s)) {
    // n° 40.1 : parent isolé avec enfants à charge.
    if (s.parentIsole) total += r.parentIsole;
    // n° 40.2 et 40.3 : conjoint aux revenus très limités. Ces réductions ne passent pas par le
    // choix du n° 6 (D102) : elles ne concernent que le salarié dont le conjoint a si peu de revenus.
    if (s.conjointRevenus === 'REVENU_LIMITE') total += r.conjointRevenuLimite;
    if (s.conjointRevenus === 'PENSION_LIMITEE') total += r.conjointPensionLimitee;
  } else if (s.conjointHandicape) {
    // n° 41 : conjoint handicapé, seulement dans la section 2 (conjoint sans revenus propres).
    total += r.conjointHandicape;
  }
  return total;
}

// ---------------------------------------------------------------------------------------------
// Contrôle de l'entrée : une situation incohérente ne produit jamais un calcul silencieux.
// ---------------------------------------------------------------------------------------------
function verifierSituation(s: SituationFiscalePaie): void {
  const marie = s.situationFamiliale === 'MARIE_OU_COHABITANT_LEGAL';
  if (!marie && s.situationFamiliale !== 'ISOLE') {
    throw new ErreurMoteur('ENTREE_INVALIDE', 'La situation familiale est inconnue.');
  }
  const revenusConnus: readonly (string | null)[] = [
    'SANS_REVENUS',
    'PENSION_TRES_LIMITEE',
    'PENSION_LIMITEE',
    'REVENU_LIMITE',
    'REVENUS',
  ];
  // Un marié précise les revenus de son conjoint ; un isolé n'a pas de conjoint (n° 4).
  if (
    marie !== (s.conjointRevenus !== null) ||
    (marie && !revenusConnus.includes(s.conjointRevenus))
  ) {
    throw new ErreurMoteur(
      'ENTREE_INVALIDE',
      'Les revenus du conjoint doivent être précisés pour un marié, et absents pour un isolé.',
    );
  }
  for (const [nom, valeur] of [
    ["Le nombre d'enfants à charge", s.enfantsCharge],
    ["Le nombre d'enfants handicapés", s.enfantsHandicapes],
    ['Le nombre de personnes dépendantes de 66 ans ou plus', s.autresChargeDependantes66],
    ["Le nombre d'autres personnes handicapées à charge", s.autresChargeHandicapees],
    ["Le nombre d'autres personnes à charge", s.autresCharge],
  ] as const) {
    exigerEntier(nom, valeur, 0, BORNES.personnesAChargeMax);
  }
  if (s.enfantsHandicapes > s.enfantsCharge) {
    throw new ErreurMoteur(
      'ENTREE_INVALIDE',
      'Les enfants handicapés sont inclus dans les enfants à charge : il ne peut pas y en avoir plus.',
    );
  }
  // n° 40.1 : un parent isolé est un isolé qui a des enfants à charge.
  if (s.parentIsole && (marie || s.enfantsCharge === 0)) {
    throw new ErreurMoteur(
      'ENTREE_INVALIDE',
      'Un parent isolé est un isolé qui a au moins un enfant à charge.',
    );
  }
  // n° 41 : le handicap du conjoint ne compte que si le conjoint n'a pas de revenus propres.
  if (s.conjointHandicape && !conjointSansRevenusPropres(s)) {
    throw new ErreurMoteur(
      'ENTREE_INVALIDE',
      "Le handicap du conjoint ne se saisit que si le conjoint n'a pas de revenus propres.",
    );
  }
}

// ---------------------------------------------------------------------------------------------
// Le calcul complet
// ---------------------------------------------------------------------------------------------
// Exemple à la main (employé isolé, sans charge, brut 2 800,00 €, cotisation 365,96 €,
// bonus : volet A 127,54 €, volet B 37,21 €) :
//   a) retenue sociale effective = 365,96 - (127,54 + 37,21) = 201,21 ; base = 2 800,00 - 201,21 = 2 598,79
//   b) base annuelle 31 185,48 ; frais 6 070,00 (plafond) ; net 25 115,48
//   c) impôt 8 067,48 - 2 987,98 = 5 079,50
//   d) aucune réduction de famille
//   e) 5 079,50 / 12 = 423,29
//   f) 33,14 % x 127,54 = 42,27 ; 52,54 % x 37,21 = 19,55 ; total 61,82
//   précompte = 423,29 - 61,82 = 361,47 €
export function calculerPrecompte(
  entree: EntreePrecompte,
  bloc: ParametresPrecompte,
): ResultatPrecompte {
  if (!entree.habitantRoyaume) {
    throw new ErreurMoteur(
      'PRECOMPTE_NON_SUPPORTE',
      "Le précompte des non-résidents n'est pas encore calculé par le moteur.",
    );
  }
  verifierSituation(entree.situation);
  const brut = exigerEntier('Le brut', entree.brutCentimes, 0, BORNES.montantMax);
  const cotisation = exigerEntier(
    'La cotisation personnelle',
    entree.cotisationPersonnelleCentimes,
    0,
    BORNES.montantMax,
  );
  const bonusA = exigerEntier(
    'Le bonus (volet A)',
    entree.bonusVoletACentimes,
    0,
    BORNES.montantMax,
  );
  const bonusB = exigerEntier(
    'Le bonus (volet B)',
    entree.bonusVoletBCentimes,
    0,
    BORNES.montantMax,
  );

  // a) Base mensuelle : le brut diminué des retenues sociales EFFECTIVEMENT retenues (n° 25.1),
  //    c'est-à-dire la cotisation personnelle moins le bonus à l'emploi qui l'a réduite.
  const retenueSociale = cotisation - (bonusA + bonusB);
  if (retenueSociale < 0 || retenueSociale > brut) {
    throw new ErreurMoteur(
      'ENTREE_INVALIDE',
      "Le bonus à l'emploi dépasse la cotisation personnelle, ou la retenue dépasse le brut.",
    );
  }
  const baseMensuelle = brut - retenueSociale;

  // b) Annualisation (n° 26) puis frais forfaitaires (n° 27-30).
  const baseAnnuelle = baseMensuelle * MOIS_PAR_AN;
  const frais = calculerFraisProfessionnels(baseAnnuelle, bloc);
  const baseNette = baseAnnuelle - frais;

  // c) Impôt de base (jamais négatif : sous la quotité exemptée, il n'y a rien à payer).
  const impotDeBase = Math.max(0, calculerImpotDeBase(baseNette, entree.situation, bloc));

  // d) Réductions pour charges de famille, retirées de l'impôt (n° 37).
  const reductionsFamille = calculerReductionsFamille(entree.situation, bloc);
  const impotApresReductions = Math.max(0, impotDeBase - reductionsFamille);

  // e) Mensualisation (n° 42) : un douzième, arrondi au centime.
  const precompteAvantBonus = arrondirFraction(impotApresReductions, MOIS_PAR_AN);

  const reductionHeuresSup = exigerEntier(
    'La réduction pour heures supplémentaires',
    entree.reductionHeuresSupplementairesCentimes ?? 0,
    0,
    BORNES.montantMax,
  );

  // f) Réduction liée au bonus à l'emploi (n° 46) : une part de chaque volet réellement accordé,
  //    arrondie séparément puis additionnée (D102). Le précompte ne devient jamais négatif.
  const reductionBonus =
    appliquerTaux(bonusA, bloc.bonusEmploiFiscal.tauxVoletA) +
    appliquerTaux(bonusB, bloc.bonusEmploiFiscal.tauxVoletB);
  // g) Réduction pour heures supplémentaires (n° 111.2 et 45) : retranchée de la même façon.
  const precompte = Math.max(0, precompteAvantBonus - reductionBonus - reductionHeuresSup);

  const detail: DetailPrecompte = {
    baseMensuelle,
    baseAnnuelle,
    fraisProfessionnels: frais,
    baseNetteAnnuelle: baseNette,
    impotDeBase,
    reductionsFamille,
    precompteAvantBonus,
    reductionBonusEmploi: reductionBonus,
    reductionHeuresSupplementaires: reductionHeuresSup,
  };
  // Rien à retenir : pas de ligne (et pas de « -0 »).
  if (precompte === 0) return { precompte, detail, lignes: [] };
  return {
    precompte,
    detail,
    lignes: [
      {
        code: 'PRECOMPTE_PROFESSIONNEL',
        libelle: 'Précompte professionnel',
        base: baseMensuelle,
        taux: null,
        montant: -precompte, // une retenue est négative sur la fiche
      },
    ],
  };
}
