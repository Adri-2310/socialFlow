import { appliquerTaux, arrondirFraction } from './arrondi';
import type { ParametresSalaireGaranti } from './bareme/schema';
import { numeroDeJour } from './calendrier';
import { ErreurMoteur } from './erreurs';
import { formaterDuree, formaterJours } from './format';
import type { Centimes, DateIso, LigneCalcul } from './types';
import { BORNES, exigerEntier } from './validation';

// SALAIRE GARANTI (modules/paie.md § 3, étape 8b, D108).
// Source : loi du 3 juillet 1978 relative aux contrats de travail, version consolidée
// (`doc/reference/loi-1978-07-03-contrats-de-travail-consolide.html`) : art. 52 et 54 (ouvriers),
// art. 56 (seuls les jours d'activité habituelle comptent), art. 70 à 72 (employés).
// Les durées, le taux de 60 % et le plafond viennent du bloc `salaireGaranti` du barème.
//
// Étape 8b bis (D109) : les CCT n° 12bis (ouvriers) et n° 13bis (employés engagés pour moins de
// 3 mois), textes coordonnés dans `doc/reference/`, ajoutent pendant les 23 jours qui suivent les
// 7 premiers jours (jours 8 à 30) une indemnité complémentaire à la charge de l'employeur :
// 25,88 % (ouvrier) ou 26,93 % (employé) de la part du salaire normal sous le plafond de l'INAMI,
// 85,88 % ou 86,93 % de la part au-dessus (art. 3 et 4). Ce n'est pas de la rémunération soumise à
// l'ONSS (Instructions ONSS 2026/3, p. 115). Elle ne vaut que pour la maladie et l'accident de la
// vie privée : l'accident du travail (CCT 12bis art. 10 et 11) n'est pas géré (D109).
//
// En clair : quand un travailleur est en incapacité, l'employeur continue à le payer pendant une
// période limitée, puis la mutuelle prend le relais (hors fiche de paie).
//   - Ouvrier (payé aux heures prestées) : jours 1 à 7 payés à 100 %, jours 8 à 14 à 60 % de la
//     part du salaire qui ne dépasse pas le plafond. La fonction renvoie un MONTANT À AJOUTER au brut.
//   - Employé (salaire mensuel déjà versé en entier) : la fonction renvoie ce qu'il faut RETRANCHER,
//     c'est-à-dire les jours que l'employeur ne doit plus payer.
// Les jours se comptent en jours CALENDRIER depuis le début de la période de garantie, week-ends
// compris ; le premier jour de l'incapacité porte le numéro 1 (art. 54 § 1 et art. 72 le disent pour
// un accident du travail ; pour une maladie, c'est un choix du moteur, D108). Seuls les jours
// d'activité habituelle donnent lieu à un paiement ou à une retenue (art. 56 pour l'ouvrier ; pour
// l'employé, c'est la règle du salaire mensuel, D100).
//
// Ce que l'appelant décide (le moteur est pur et ne connaît pas l'historique du salarié) :
//   - le début de l'incapacité en cours (`debutPeriodeGarantie`) et, si elle suit une incapacité
//     terminée depuis moins de huit semaines, le nombre de jours calendrier DÉJÀ INDEMNISÉS pendant
//     la précédente (`joursDejaConsommes`) : la garantie n'est pas due une seconde fois, seul le
//     reste de la période l'est (art. 52 § 2, 1° et art. 73 § 1, 1°). Une autre maladie prouvée par
//     certificat ouvre une nouvelle période (art. 52 § 2, 2°) : l'appelant met alors 0 ;
//   - les heures ou demi-journées prévues chaque jour, et les jours déjà rémunérés autrement.
//
// Limites de la v1 (D108) : plafond global de 7 jours de l'art. 54 § 3, travail adapté (art. 52 § 5),
// jours de deuil imputés (art. 52 § 6), occupations visées à l'art. 17 de l'arrêté royal du
// 28 novembre 1969 (art. 52 § 7), sanction d'un certificat tardif (art. 31 § 3/1), indemnités de l'assureur accident du travail et contrat à durée
// déterminée requalifiée ne sont pas gérés.

export type NatureIncapacite = 'MALADIE' | 'ACCIDENT_TRAVAIL';
// Art. 52 § 3 : pas de rémunération pour un accident survenu pendant une compétition sportive
// payante, ni pour une incapacité due à une faute grave du travailleur.
export type ExclusionDroit = 'COMPETITION_SPORTIVE_REMUNEREE' | 'FAUTE_GRAVE';

// Numéro d'un jour dans la période : 1 pour le jour du début. Une date antérieure au début est une
// faute de saisie.
function rangDuJour(debut: DateIso, date: DateIso, joursDejaConsommes: number): number {
  const rang =
    numeroDeJour('La date du jour', date) - numeroDeJour('Le début de la période', debut) + 1;
  if (rang < 1) {
    throw new ErreurMoteur(
      'JOUR_AVANT_DEBUT_PERIODE',
      `Le jour ${date} précède le début de la période de garantie.`,
    );
  }
  // Rechute dans les huit semaines : les jours déjà indemnisés pendant l'incapacité précédente
  // comptent dans la même période de garantie.
  return joursDejaConsommes + rang;
}

function lireJoursDejaConsommes(valeur: number | undefined): number {
  return exigerEntier('Les jours déjà indemnisés', valeur ?? 0, 0, 365);
}

function refuserDoublons(dates: DateIso[]): void {
  if (new Set(dates).size !== dates.length) {
    throw new ErreurMoteur('JOUR_EN_DOUBLE', 'Un jour est listé deux fois.');
  }
}

// ---------------------------------------------------------------------------------------------
// OUVRIER
// ---------------------------------------------------------------------------------------------

export interface JourIncapaciteOuvrier {
  date: DateIso;
  // Heures qu'il aurait prestées ce jour-là (D96 : minutes) ; 0 si ce n'est pas un jour d'activité.
  minutesPrevues: number;
  // Jour déjà rémunéré par ailleurs (un jour férié payé par `jours-feries.ts`, ou la journée de
  // travail interrompue par l'incapacité et payée en vertu de l'art. 27, qui est le jour n° 1 :
  // art. 54 § 1, al. 2) : il compte dans la période mais n'est jamais payé deux fois (D108).
  dejaRemunere: boolean;
}

export interface EntreeSalaireGarantiOuvrier {
  tauxHoraireCentimes: Centimes;
  nature: NatureIncapacite;
  debutPeriodeGarantie: DateIso; // début de l'incapacité en cours
  // Jours calendrier déjà indemnisés pendant l'incapacité précédente, en cas de rechute dans les
  // huit semaines (art. 52 § 2, 1°). Facultatif, 0 par défaut.
  joursDejaConsommes?: number;
  // Art. 52 § 1 : un mois d'ancienneté dans l'entreprise. Date à partir de laquelle la condition
  // est remplie (les jours antérieurs ne sont pas payés), ou null si elle l'est depuis longtemps.
  // Ne s'applique pas à un accident du travail (art. 54).
  dateUnMoisAnciennete: DateIso | null;
  exclusion: ExclusionDroit | null; // art. 52 § 3 : maladie ou accident de la vie privée seulement
  // CCT 12bis, art. 9 : tout avantage complémentaire à ceux de l'assurance maladie-invalidité déjà
  // payé par l'employeur ou un fonds de sécurité d'existence pendant la période s'impute sur
  // l'indemnité complémentaire. Facultatif, 0 par défaut.
  avantageComplementaireImputableCentimes?: Centimes;
  jours: JourIncapaciteOuvrier[];
}

export interface ResultatSalaireGarantiOuvrier {
  // à AJOUTER au brut de l'ouvrier : jours à 100 %, jours à 60 % et indemnité complémentaire CCT
  montant: Centimes;
  // Part du montant soumise à l'ONSS : seuls les jours à 100 % (première semaine). Les jours à 60 %
  // (deuxième semaine) et l'indemnité complémentaire n'en font pas partie : Instructions ONSS 2026/3,
  // p. 115 et p. 506.
  baseOnss: Centimes;
  complement: Centimes; // indemnité complémentaire CCT 12bis, déjà comprise dans `montant`
  lignes: LigneCalcul[];
}

// Indemnité complémentaire des CCT 12bis et 13bis (art. 4) : un taux sur la part sous le plafond,
// un autre sur la part au-dessus. Les deux parts sont les SOMMES des jours concernés ; chaque taux
// s'applique une seule fois (arrondi au cent à chaque étape, D99). L'avantage déjà payé s'impute.
// Exemple à la main (ouvrier, 5 jours à 114,00 €, plafond de test 100,00 €/jour) :
//   part sous le plafond 5 x 100,00 = 500,00 -> 25,88 % = 129,40 € ;
//   part au-dessus 5 x 14,00 = 70,00 -> 85,88 % = 60,116 -> 60,12 € ; total 189,52 €.
function calculerComplement(
  basePlafonnee: Centimes,
  baseExcedent: Centimes,
  tauxPlafonne: number,
  tauxExcedent: number,
  avantageImputable: Centimes,
): { plafonne: Centimes; excedent: Centimes; imputation: Centimes; total: Centimes } {
  const plafonne = appliquerTaux(basePlafonnee, tauxPlafonne);
  const excedent = appliquerTaux(baseExcedent, tauxExcedent);
  const imputation = Math.min(avantageImputable, plafonne + excedent);
  return { plafonne, excedent, imputation, total: plafonne + excedent - imputation };
}

// Lignes de détail de l'indemnité complémentaire (une ligne par part, et l'imputation s'il y en a).
function lignesComplement(
  c: ReturnType<typeof calculerComplement>,
  basePlafonnee: Centimes,
  baseExcedent: Centimes,
  tauxPlafonne: number,
  tauxExcedent: number,
  libelleCct: string,
): LigneCalcul[] {
  const lignes: LigneCalcul[] = [];
  if (c.plafonne > 0) {
    lignes.push({
      code: 'COMPLEMENT_CCT_PLAFONNE',
      libelle: `Indemnité complémentaire ${libelleCct} (part sous le plafond)`,
      base: basePlafonnee,
      taux: tauxPlafonne,
      montant: c.plafonne,
    });
  }
  if (c.excedent > 0) {
    lignes.push({
      code: 'COMPLEMENT_CCT_EXCEDENT',
      libelle: `Indemnité complémentaire ${libelleCct} (part au-dessus du plafond)`,
      base: baseExcedent,
      taux: tauxExcedent,
      montant: c.excedent,
    });
  }
  if (c.imputation > 0) {
    lignes.push({
      code: 'COMPLEMENT_CCT_IMPUTATION',
      libelle: 'Avantage complémentaire déjà payé (imputé)',
      base: null,
      taux: null,
      montant: -c.imputation,
    });
  }
  return lignes;
}

// Exemple à la main (taux 15,00 €/h, 7 h 36 par jour = 456 minutes, plafond de test 100,00 €/jour) :
//   rémunération normale d'un jour = 1 500 x 456 / 60 = 11 400 centimes = 114,00 € ;
//   jours 1 à 7 : 7 x 114,00 = 798,00 € ;
//   jour 8 : loi = 60 % x 100,00 = 60,00 € ; CCT = 25,88 % x 100,00 + 85,88 % x 14,00 = 37,90 € ;
//   total 97,90 € = 85,88 % de 114,00 € (97,903).
export function calculerSalaireGarantiOuvrier(
  entree: EntreeSalaireGarantiOuvrier,
  bloc: ParametresSalaireGaranti,
): ResultatSalaireGarantiOuvrier {
  const taux = exigerEntier('Le taux horaire', entree.tauxHoraireCentimes, 1, BORNES.montantMax);
  refuserDoublons(entree.jours.map((j) => j.date));
  if (entree.exclusion !== null && entree.nature !== 'MALADIE') {
    throw new ErreurMoteur(
      'EXCLUSION_INCOMPATIBLE',
      "Les exclusions de l'art. 52 § 3 ne valent que pour une maladie ou un accident de la vie privée.",
    );
  }
  const consommes = lireJoursDejaConsommes(entree.joursDejaConsommes);
  const avantage = exigerEntier(
    "L'avantage complémentaire imputable",
    entree.avantageComplementaireImputableCentimes ?? 0,
    0,
    BORNES.montantMax,
  );
  const finAnciennete =
    entree.dateUnMoisAnciennete === null
      ? null
      : numeroDeJour("La date d'un mois d'ancienneté", entree.dateUnMoisAnciennete);

  // Jours payés à 100 % (leur total en minutes et en centimes), jours à 60 % (somme des parts
  // plafonnées, sur laquelle on applique le taux une seule fois) et jours de l'indemnité
  // complémentaire CCT (somme des parts sous le plafond et au-dessus).
  let minutesPleines = 0;
  let montantPlein = 0;
  let minutesPartielles = 0;
  let basePartielle = 0;
  let basePlafonnee = 0;
  let baseExcedent = 0;

  for (const jour of entree.jours) {
    const minutes = exigerEntier(
      'Les heures prévues un jour d’incapacité',
      jour.minutesPrevues,
      0,
      BORNES.minutesDansUnJourMax,
    );
    const rang = rangDuJour(entree.debutPeriodeGarantie, jour.date, consommes);
    if (minutes === 0 || jour.dejaRemunere || entree.exclusion !== null) continue;

    // L'ancienneté d'un mois ne conditionne que la maladie ordinaire (art. 52 § 1, art. 54 non).
    if (
      entree.nature === 'MALADIE' &&
      finAnciennete !== null &&
      numeroDeJour('La date du jour', jour.date) < finAnciennete
    ) {
      continue;
    }

    const remunerationNormale = arrondirFraction(taux * minutes, 60);
    const joursPleins =
      entree.nature === 'MALADIE' ? bloc.ouvrierJoursPleins : bloc.accidentTravailJoursPleins;
    if (rang <= joursPleins) {
      minutesPleines += minutes;
      montantPlein += remunerationNormale;
    } else if (entree.nature === 'MALADIE' && rang <= joursPleins + bloc.ouvrierJoursPartiels) {
      // Art. 52 § 1 : 60 % de la partie de la rémunération qui ne dépasse pas le plafond.
      minutesPartielles += minutes;
      basePartielle += Math.min(remunerationNormale, bloc.plafondJournalierCentimes);
    }
    // CCT 12bis, art. 3 : les 23 jours qui suivent les 7 premiers (maladie seulement).
    if (
      entree.nature === 'MALADIE' &&
      rang > joursPleins &&
      rang <= joursPleins + bloc.complementJours
    ) {
      const sousPlafond = Math.min(remunerationNormale, bloc.plafondJournalierCentimes);
      basePlafonnee += sousPlafond;
      baseExcedent += remunerationNormale - sousPlafond;
    }
  }

  const lignes: LigneCalcul[] = [];
  if (montantPlein > 0) {
    lignes.push({
      code: 'SALAIRE_GARANTI_100',
      libelle: `Salaire garanti à 100 % : ${formaterDuree(minutesPleines)}`,
      base: taux,
      taux: null,
      montant: montantPlein,
    });
  }
  const montantPartiel = appliquerTaux(basePartielle, bloc.tauxPartiel);
  if (montantPartiel > 0) {
    lignes.push({
      code: 'SALAIRE_GARANTI_60',
      libelle: `Salaire garanti à 60 % (plafonné) : ${formaterDuree(minutesPartielles)}`,
      base: basePartielle,
      taux: bloc.tauxPartiel,
      montant: montantPartiel,
    });
  }
  const c = calculerComplement(
    basePlafonnee,
    baseExcedent,
    bloc.complementOuvrierPlafonne,
    bloc.complementOuvrierExcedent,
    avantage,
  );
  lignes.push(
    ...lignesComplement(
      c,
      basePlafonnee,
      baseExcedent,
      bloc.complementOuvrierPlafonne,
      bloc.complementOuvrierExcedent,
      'CCT 12bis',
    ),
  );
  return {
    montant: montantPlein + montantPartiel + c.total,
    baseOnss: montantPlein,
    complement: c.total,
    lignes,
  };
}

// ---------------------------------------------------------------------------------------------
// EMPLOYÉ
// ---------------------------------------------------------------------------------------------

export interface JourIncapaciteEmploye {
  date: DateIso;
  // Demi-journées prévues ce jour-là (0 : pas un jour d'activité, 1 : une demi-journée, 2 : un jour).
  demiJoursPrevus: number;
}

export interface EntreeSalaireGarantiEmploye {
  remunerationMensuelle: Centimes;
  // Même règle que `calculerBrutEmploye` : nombre de jours sur lequel se répartit le mois, fourni
  // par l'appelant (règle de la commission paritaire, pas du moteur).
  joursReferenceMois: number;
  // Art. 70 : contrat de 3 mois ou plus (ou à durée indéterminée) ; art. 71 : moins de 3 mois.
  contrat: 'LONGUE_DUREE' | 'COURTE_DUREE';
  nature: NatureIncapacite;
  debutPeriodeGarantie: DateIso; // début de l'incapacité en cours
  joursDejaConsommes?: number; // rechute dans les huit semaines (art. 73 § 1, 1°), 0 par défaut
  // Art. 71, al. 2 (qui rend applicable l'art. 52 § 1) : un mois d'ancienneté pour un contrat de
  // moins de 3 mois en cas de maladie ; date à partir de laquelle la condition est remplie, ou null.
  // Pas de condition pour un contrat de 3 mois ou plus (art. 70) ni pour un accident du travail.
  dateUnMoisAnciennete?: DateIso | null;
  // Art. 73 § 2 : pas de rémunération pour un accident survenu pendant une compétition sportive
  // payante ni pour une incapacité due à une faute grave (maladie ou accident de la vie privée).
  exclusion?: ExclusionDroit | null;
  // CCT 13bis, art. 9 : avantage complémentaire déjà payé, imputé sur l'indemnité (contrat court).
  avantageComplementaireImputableCentimes?: Centimes;
  jours: JourIncapaciteEmploye[];
}

export interface ResultatSalaireGarantiEmploye {
  retenue: Centimes; // à RETRANCHER du brut de l'employé (positif)
  // Part du salaire du mois qui reste versée sous forme d'indemnité (60 % de la loi et indemnité
  // complémentaire CCT 13bis, jours 8 à 30 d'un contrat court) et qu'il faut retrancher de la base
  // ONSS : ce n'est pas une rémunération soumise aux cotisations (Instructions ONSS 2026/3, p. 115).
  horsOnss: Centimes;
  complement: Centimes; // indemnité complémentaire CCT 13bis, déjà comprise dans `horsOnss`
  demiJoursNonGarantis: number; // jours que l'employeur ne paie plus du tout
  demiJoursAPartiel: number; // jours payés à 60 % par la loi (jours 8 à 14, contrat court, maladie)
  demiJoursAvecComplement: number; // jours de l'indemnité CCT (jours 8 à 30)
  lignes: LigneCalcul[]; // montants négatifs, comme une absence non rémunérée
}

// Exemple à la main (salaire 2 400,00 €, 20 jours de référence, contrat long) : après le 30e jour
// d'incapacité, 4 jours d'activité = 8 demi-jours ne sont plus payés :
// 2 400,00 x 8 / (2 x 20) = 480,00 € retranchés.
// Contrat court en maladie, jours 8 à 11 (4 jours = 8 demi-jours) : valeur 480,00 €, plafond
// 100,00 x 8 / 2 = 400,00 € ; loi 60 % x 400,00 = 240,00 € ; CCT 26,93 % x 400,00 + 86,93 % x 80,00 =
// 107,72 + 69,54 = 177,26 € ; payé 417,26 € (= 86,93 % de 480,00), retenue 480,00 - 417,26 = 62,74 €.
export function calculerSalaireGarantiEmploye(
  entree: EntreeSalaireGarantiEmploye,
  bloc: ParametresSalaireGaranti,
): ResultatSalaireGarantiEmploye {
  const mensuel = exigerEntier(
    'La rémunération mensuelle',
    entree.remunerationMensuelle,
    1,
    BORNES.montantMax,
  );
  const jours = exigerEntier(
    'Le nombre de jours de référence',
    entree.joursReferenceMois,
    1,
    BORNES.joursDansUnMoisMax,
  );
  refuserDoublons(entree.jours.map((j) => j.date));
  const consommes = lireJoursDejaConsommes(entree.joursDejaConsommes);
  const avantage = exigerEntier(
    "L'avantage complémentaire imputable",
    entree.avantageComplementaireImputableCentimes ?? 0,
    0,
    BORNES.montantMax,
  );
  const exclusion = entree.exclusion ?? null;
  if (exclusion !== null && entree.nature !== 'MALADIE') {
    throw new ErreurMoteur(
      'EXCLUSION_INCOMPATIBLE',
      "Les exclusions de l'art. 73 § 2 ne valent que pour une maladie ou un accident de la vie privée.",
    );
  }
  const finAnciennete =
    entree.dateUnMoisAnciennete == null
      ? null
      : numeroDeJour("La date d'un mois d'ancienneté", entree.dateUnMoisAnciennete);

  // Jours d'activité de l'incapacité qui sortent de la garantie ou donnent droit à l'indemnité
  // complémentaire (en demi-journées).
  let nonGarantis = 0;
  let aPartiel = 0;
  let avecComplement = 0;
  for (const jour of entree.jours) {
    const demi = exigerEntier(
      "Les demi-journées prévues un jour d'incapacité",
      jour.demiJoursPrevus,
      0,
      2,
    );
    const rang = rangDuJour(entree.debutPeriodeGarantie, jour.date, consommes);
    if (demi === 0) continue;

    // Aucun droit : exclusion de l'art. 73 § 2, ou ancienneté d'un mois pas encore atteinte (contrat
    // court, maladie). L'employeur ne doit rien pour ce jour : il sort entièrement du salaire.
    const ancienneteManquante =
      entree.contrat === 'COURTE_DUREE' &&
      entree.nature === 'MALADIE' &&
      finAnciennete !== null &&
      numeroDeJour('La date du jour', jour.date) < finAnciennete;
    if (exclusion !== null || ancienneteManquante) {
      nonGarantis += demi;
    } else if (entree.contrat === 'LONGUE_DUREE') {
      // Art. 70 : 30 jours, maladie comme accident.
      if (rang > bloc.employeLongueDureeJours) nonGarantis += demi;
    } else if (entree.nature === 'ACCIDENT_TRAVAIL') {
      // Art. 72 : 7 jours seulement, sans période à 60 % ; l'indemnité de la CCT 13bis pour un
      // accident du travail n'est pas gérée (D109).
      if (rang > bloc.employeCourteDureeJoursPleins) nonGarantis += demi;
    } else if (rang > bloc.employeCourteDureeJoursPleins) {
      const finLoi = bloc.employeCourteDureeJoursPleins + bloc.employeCourteDureeJoursPartiels;
      const finComplement = bloc.employeCourteDureeJoursPleins + bloc.complementJours;
      // Art. 71 : 7 jours à 100 %, 7 jours à 60 % ; CCT 13bis : indemnité complémentaire jusqu'au
      // 30e jour ; puis plus rien.
      if (rang <= finComplement) {
        avecComplement += demi;
        if (rang <= finLoi) aPartiel += demi;
      } else {
        nonGarantis += demi;
      }
    }
  }
  // Plus de jours d'incapacité que le mois n'en compte : saisie incohérente.
  if (nonGarantis + avecComplement > 2 * jours) {
    throw new ErreurMoteur(
      'ABSENCE_SUPERIEURE_AU_MOIS',
      "Les jours d'incapacité dépassent le nombre de jours de référence du mois.",
    );
  }

  const lignes: LigneCalcul[] = [];
  let retenue = 0;
  let horsOnss = 0;
  let complement = 0;
  if (nonGarantis > 0) {
    const montant = arrondirFraction(mensuel * nonGarantis, 2 * jours);
    lignes.push({
      code: 'SALAIRE_GARANTI_FIN',
      libelle: `Incapacité au-delà du salaire garanti : ${formaterJours(nonGarantis)} sur ${jours}`,
      base: mensuel,
      taux: null,
      montant: -montant,
    });
    retenue += montant;
  }
  if (avecComplement > 0) {
    // Jours 8 à 30 : le salaire de ces jours est retranché, puis l'employeur verse les 60 % de la loi
    // (jours 8 à 14) et l'indemnité complémentaire de la CCT (jours 8 à 30), qui ne sont pas de la
    // rémunération soumise à l'ONSS. La retenue est la valeur des jours moins ce qui reste versé.
    const valeur = arrondirFraction(mensuel * avecComplement, 2 * jours);
    const plafond = arrondirFraction(bloc.plafondJournalierCentimes * avecComplement, 2);
    const sousPlafond = Math.min(valeur, plafond);
    const valeurLoi = arrondirFraction(mensuel * aPartiel, 2 * jours);
    const plafondLoi = arrondirFraction(bloc.plafondJournalierCentimes * aPartiel, 2);
    const payeLoi = appliquerTaux(Math.min(valeurLoi, plafondLoi), bloc.tauxPartiel);
    const c = calculerComplement(
      sousPlafond,
      valeur - sousPlafond,
      bloc.complementEmployePlafonne,
      bloc.complementEmployeExcedent,
      avantage,
    );
    complement = c.total;
    horsOnss = payeLoi + c.total;
    const montant = valeur - horsOnss;
    if (montant > 0) {
      lignes.push({
        code: 'SALAIRE_GARANTI_PARTIEL_RETENUE',
        libelle: `Incapacité du 8e au 30e jour, salaire à 60 % et complément CCT 13bis : ${formaterJours(avecComplement)} sur ${jours}`,
        base: valeur,
        taux: null,
        montant: -montant,
      });
      retenue += montant;
    }
  }
  return {
    retenue,
    horsOnss,
    complement,
    demiJoursNonGarantis: nonGarantis,
    demiJoursAPartiel: aPartiel,
    demiJoursAvecComplement: avecComplement,
    lignes,
  };
}
