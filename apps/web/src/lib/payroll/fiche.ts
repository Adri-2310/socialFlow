import { exigerBloc } from './bareme/bloc';
import { choisirBaremesPourFiche } from './bareme/choisir';
import type { ParametresBareme } from './bareme/schema';
import { calculerBonusEmploi, type Prestations } from './bonus-emploi';
import { calculerBrutEmploye, calculerBrutOuvrier } from './brut';
import { calculerCotisationsPatronales } from './cotisations-patronales';
import { calculerCoutEmployeur } from './cout-employeur';
import { calculerCsss } from './csss';
import { detecterAnomalies, type Anomalie } from './anomalies';
import { calculerNet } from './net';
import { calculerCotisationPersonnelle } from './onss';
import { fractionOccupation, type EntreeOccupation } from './occupation';
import { calculerPrecompte, type DetailPrecompte, type SituationFiscalePaie } from './precompte';
import { calculerReductionStructurelle } from './reduction-structurelle';
import type { Centimes, CategorieSalarie, DateIso, LigneCalcul, VersionBareme } from './types';
import { exigerEntier } from './validation';

// FICHE DE PAIE : ASSEMBLAGE DES CALCULS (modules/paie.md § 2 et 3, étape 9.2a).
//
// `calculerFiche` ne contient AUCUNE règle légale nouvelle : elle appelle, dans l'ordre de
// modules/paie.md § 3, les calculs déjà écrits et vérifiés un à un (brut, ONSS, bonus à l'emploi,
// précompte, CSSS, net, cotisations patronales, réduction structurelle, coût employeur, anomalies).
// Les paramètres légaux viennent de deux versions de barème, choisies ici (D112) :
//   - la version de la PÉRIODE de la fiche (le mois) pour tous les blocs sauf le précompte ;
//   - la version du JOUR DE PAIEMENT pour le bloc `precompte`.
// Fonction pure : la liste des versions arrive en paramètre, aucune date « du jour » n'est lue.
//
// Cette première version (9.2a) couvre la fiche ordinaire : salaire (employé) ou heures prestées
// (ouvrier), prime, absences non rémunérées, entrée ou sortie en cours de mois (employé). Les heures
// supplémentaires, les jours fériés et le salaire garanti s'y ajouteront à l'étape 9.2b.
//
// Règles de composition (celles de modules/paie.md § 3) :
//   brut          = brut ordinaire (brut.ts)
//   base ONSS     = brut (l'ouvrier est majoré de 8 % dans onss.ts, pas ici)
//   imposable     = brut - ONSS personnelle + bonus à l'emploi
//   net           = brut - ONSS + bonus - précompte - CSSS
//   coût employeur = brut + cotisations patronales - réduction structurelle
// Le bonus à l'emploi et la réduction structurelle reçoivent le brut ordinaire comme salaire de
// référence (limite de la v1 déjà notée dans bonus-emploi.ts).

// Une version de barème avec ses paramètres : ce que la base de données renvoie, converti à la
// frontière (dates en AAAA-MM-JJ, D99).
export interface VersionAvecParametres extends VersionBareme {
  parametres: ParametresBareme;
}

export interface PrimeFiche {
  primeCents: number | null;
  primeLibelle: string | null;
}

export interface SalaireEmploye extends PrimeFiche {
  statut: 'EMPLOYE';
  // D100 : le salaire fixe réellement dû, tel que saisi dans le dossier.
  remunerationMensuelle: Centimes;
  absenceNonRemDemiJours: number;
  // Demi-journées avant l'entrée ou après la sortie dans le mois (D107) ; 0 par défaut.
  horsContratDemiJours?: number;
  joursReferenceMois: number | null;
}

export interface SalaireOuvrier extends PrimeFiche {
  statut: 'OUVRIER';
  tauxHoraire: Centimes;
  heuresPresteesMinutes: number | null;
}

// Ce que l'appelant fournit sur ce qui s'est passé avant ce mois : le moteur est pur, il ne va pas
// le chercher dans les fiches précédentes.
export interface CumulsFiche {
  // Total du bonus à l'emploi déjà accordé depuis le 1er janvier (plafond annuel).
  bonusDejaPrisAnneeCentimes: Centimes;
  // CSSS : au 3e mois du trimestre, brut des deux premiers mois et CSSS déjà retenue.
  brutMoisPrecedentsCentimes: Centimes;
  csssDejaRetenueCentimes: Centimes;
  // Net de la fiche du mois précédent (anomalie d'écart) ; null pour une première fiche.
  netMoisPrecedentCentimes: Centimes | null;
}

export interface EntreeFiche {
  periode: { annee: number; mois: number }; // mois de 1 à 12
  datePaiement: DateIso; // jour de paiement, obligatoire (D112)
  categorieEmployeur: string; // D98, ex. PRIVE_MARCHAND
  versions: readonly VersionAvecParametres[]; // toutes les versions connues : le moteur choisit
  salaire: SalaireEmploye | SalaireOuvrier;
  prestations: Prestations;
  occupation: EntreeOccupation;
  situation: SituationFiscalePaie;
  habitantRoyaume: boolean;
  employeurDixTravailleursOuPlus: boolean;
  cumuls: CumulsFiche;
}

export interface ResultatFiche {
  brut: Centimes;
  baseOnss: Centimes;
  onssPersonnelle: Centimes;
  bonusEmploi: Centimes;
  imposable: Centimes;
  precompte: Centimes;
  cotisationSpeciale: Centimes; // positive = retenue, négative = remboursement (3e mois)
  net: Centimes;
  cotisationsPatronales: Centimes;
  reductionStructurelle: Centimes;
  coutEmployeur: Centimes;
  lignes: LigneCalcul[]; // détail ordonné de la fiche du salarié (montants signés)
  lignesEmployeur: LigneCalcul[]; // cotisations patronales et réduction structurelle
  anomalies: Anomalie[];
  detailPrecompte: DetailPrecompte;
  // Les codes des versions utilisées, à conserver avec la fiche (fiche rectificative, D13).
  baremes: { periode: string; paiement: string };
}

export function calculerFiche(entree: EntreeFiche): ResultatFiche {
  const categorie: CategorieSalarie = entree.salaire.statut;
  exigerEntier('Le mois de la fiche', entree.periode.mois, 1, 12);

  // 0. Les deux versions de barème (D112) : la période pour tout sauf le précompte.
  const choisies = choisirBaremesPourFiche(
    entree.versions,
    entree.periode.annee,
    entree.periode.mois,
    entree.datePaiement,
    entree.categorieEmployeur,
  );
  const parametres = choisies.periode.parametres;
  const parametresPaiement = choisies.paiement.parametres;

  // 1. Brut ordinaire.
  const brutOrdinaire =
    entree.salaire.statut === 'EMPLOYE'
      ? calculerBrutEmploye(entree.salaire)
      : calculerBrutOuvrier(entree.salaire);
  const brut = brutOrdinaire.brut;
  const baseOnss = brut;

  // 2-3. Cotisation personnelle de sécurité sociale (13,07 %, base à 108 % pour un ouvrier).
  const onss = calculerCotisationPersonnelle(
    { categorie, brutCentimes: baseOnss },
    exigerBloc(parametres, 'onss'),
  );

  // 4. Bonus à l'emploi (social), plafonné par la cotisation personnelle.
  const bonus = calculerBonusEmploi(
    {
      categorie,
      brutReferenceCentimes: brut,
      prestations: entree.prestations,
      cotisationPersonnelleCentimes: onss.cotisation,
      bonusDejaPrisAnneeCentimes: entree.cumuls.bonusDejaPrisAnneeCentimes,
    },
    exigerBloc(parametres, 'bonusEmploi'),
  );

  // 5. Revenu imposable.
  const imposable = brut - onss.cotisation + bonus.bonus;

  // 6. Précompte professionnel : barème du JOUR DE PAIEMENT (D112).
  const precompte = calculerPrecompte(
    {
      brutCentimes: brut,
      cotisationPersonnelleCentimes: onss.cotisation,
      bonusVoletACentimes: bonus.voletA,
      bonusVoletBCentimes: bonus.voletB,
      situation: entree.situation,
      habitantRoyaume: entree.habitantRoyaume,
    },
    exigerBloc(parametresPaiement, 'precompte'),
  );

  // 7. Cotisation spéciale de sécurité sociale (selon le rang du mois dans le trimestre).
  const csss = calculerCsss(
    {
      categorie,
      brutCentimes: baseOnss,
      moisCivil: entree.periode.mois,
      situation: {
        situationFamiliale: entree.situation.situationFamiliale,
        conjointRevenus: entree.situation.conjointRevenus,
      },
      brutMoisPrecedentsCentimes: entree.cumuls.brutMoisPrecedentsCentimes,
      csssDejaRetenueCentimes: entree.cumuls.csssDejaRetenueCentimes,
    },
    exigerBloc(parametres, 'csss'),
  );

  // 8. Net.
  const net = calculerNet({
    brutCentimes: brut,
    cotisationPersonnelleCentimes: onss.cotisation,
    bonusEmploiCentimes: bonus.bonus,
    precompteCentimes: precompte.precompte,
    csssCentimes: csss.retenue,
  });

  // 9. Coût employeur : cotisations patronales moins réduction structurelle.
  const patronales = calculerCotisationsPatronales(
    {
      categorie,
      brutCentimes: baseOnss,
      employeurDixTravailleursOuPlus: entree.employeurDixTravailleursOuPlus,
    },
    exigerBloc(parametres, 'cotisationsPatronales'),
  );
  // Contrat au moins à mi-temps : fraction d'occupation >= 1/2 (ONSS p. 377).
  const fraction = fractionOccupation(entree.occupation);
  const reduction = calculerReductionStructurelle(
    {
      brutReferenceCentimes: brut,
      prestations: entree.prestations,
      contratAuMoinsMiTemps: fraction.numerateur * 2 >= fraction.denominateur,
      cotisationsReductiblesCentimes: patronales.cotisationsReductibles,
    },
    exigerBloc(parametres, 'reductionStructurelle'),
  );
  const coutEmployeur = calculerCoutEmployeur({
    brutCentimes: brut,
    cotisationsPatronalesCentimes: patronales.total,
    reductionStructurelleCentimes: reduction.reduction,
  });

  // 10. Anomalies de contrôle (jamais bloquantes, D105).
  const anomalies = detecterAnomalies(
    {
      brutCentimes: brut,
      netCentimes: net,
      prestationsRealisees: entree.prestations.realisees,
      netMoisPrecedentCentimes: entree.cumuls.netMoisPrecedentCentimes,
    },
    exigerBloc(parametres, 'anomalies'),
  );

  return {
    brut,
    baseOnss,
    onssPersonnelle: onss.cotisation,
    bonusEmploi: bonus.bonus,
    imposable,
    precompte: precompte.precompte,
    cotisationSpeciale: csss.retenue,
    net,
    cotisationsPatronales: patronales.total,
    reductionStructurelle: reduction.reduction,
    coutEmployeur,
    lignes: [
      ...brutOrdinaire.lignes,
      ...onss.lignes,
      ...bonus.lignes,
      ...precompte.lignes,
      ...csss.lignes,
    ],
    lignesEmployeur: [...patronales.lignes, ...reduction.lignes],
    anomalies,
    detailPrecompte: precompte.detail,
    baremes: { periode: choisies.periode.code, paiement: choisies.paiement.code },
  };
}
