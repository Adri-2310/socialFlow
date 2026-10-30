import { exigerBloc } from './bareme/bloc';
import { choisirBaremesPourFiche } from './bareme/choisir';
import type { ParametresBareme } from './bareme/schema';
import { detecterAnomalies, type Anomalie } from './anomalies';
import { calculerBonusEmploi, type Prestations } from './bonus-emploi';
import { calculerBrutEmploye, calculerBrutOuvrier } from './brut';
import { calculerCotisationsPatronales } from './cotisations-patronales';
import { calculerCoutEmployeur } from './cout-employeur';
import { calculerCsss } from './csss';
import { ErreurMoteur } from './erreurs';
import {
  calculerHeuresSupplementaires,
  type EntreeHeuresSupplementaires,
} from './heures-supplementaires';
import { calculerJoursFeriesOuvrier, type JourFerieOuvrier } from './jours-feries';
import { calculerNet } from './net';
import { fractionOccupation, type EntreeOccupation } from './occupation';
import { calculerCotisationPersonnelle } from './onss';
import { calculerPrecompte, type DetailPrecompte, type SituationFiscalePaie } from './precompte';
import { calculerReductionStructurelle } from './reduction-structurelle';
import {
  calculerSalaireGarantiEmploye,
  calculerSalaireGarantiOuvrier,
  type EntreeSalaireGarantiEmploye,
  type EntreeSalaireGarantiOuvrier,
} from './salaire-garanti';
import type { CategorieSalarie, Centimes, DateIso, LigneCalcul, VersionBareme } from './types';
import { exigerEntier } from './validation';

// FICHE DE PAIE : ASSEMBLAGE DES CALCULS (modules/paie.md § 2 et 3, étapes 9.2a et 9.2b, D113).
//
// `calculerFiche` ne contient AUCUNE règle légale nouvelle : elle appelle, dans l'ordre de
// modules/paie.md § 3, les calculs déjà écrits et vérifiés un à un (brut, jours fériés, salaire
// garanti, heures supplémentaires, ONSS, bonus à l'emploi, précompte, CSSS, net, cotisations
// patronales, réduction structurelle, coût employeur, anomalies).
// Les paramètres légaux viennent de deux versions de barème, choisies ici (D112) :
//   - la version de la PÉRIODE de la fiche (le mois) pour tous les blocs sauf le précompte ;
//   - la version du JOUR DE PAIEMENT pour le bloc `precompte`.
// Fonction pure : la liste des versions arrive en paramètre, aucune date « du jour » n'est lue.
//
// Règles de composition (D113) :
//   brut total   = brut ordinaire
//                  + (ouvrier) jours fériés + salaire garanti
//                  - (employé) retenue du salaire garanti
//                  + heures supplémentaires avec sursalaire
//   base ONSS    = brut ordinaire
//                  + (ouvrier) jours fériés + salaire garanti à 100 %
//                  - (employé) retenue du salaire garanti et salaire versé en indemnité
//                  + heures supplémentaires ordinaires
//                  (les 60 %, l'indemnité des CCT et les heures volontaires ne sont pas de la
//                  rémunération soumise à l'ONSS : D106, D108, D109)
//   référence du bonus à l'emploi et de la réduction structurelle = base ONSS : la masse salariale
//                  déclarée à 100 %, dont seules les heures supplémentaires horeca et les flexi-jobs sont exclus (ONSS 2026/3 pp. 374 et 449, D113)
//   imposable    = brut total - ONSS personnelle + bonus à l'emploi
//   précompte    : sur le brut total, moins la réduction des heures supplémentaires (n° 45)
//   CSSS et cotisations patronales : sur la base ONSS
//   net          = brut total - ONSS + bonus - précompte - CSSS + heures volontaires sans sursalaire
//   coût employeur = brut total + heures volontaires payées au net + cotisations patronales
//                  - réduction structurelle

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

// Incapacité de travail du mois (D108, D109, D111). Le taux horaire de l'ouvrier, la rémunération et
// les jours de référence de l'employé viennent du salaire de la fiche : on ne les ressaisit pas.
export type IncapaciteOuvrierFiche = Omit<EntreeSalaireGarantiOuvrier, 'tauxHoraireCentimes'> & {
  statut: 'OUVRIER';
};
export type IncapaciteEmployeFiche = Omit<
  EntreeSalaireGarantiEmploye,
  'remunerationMensuelle' | 'joursReferenceMois'
> & { statut: 'EMPLOYE' };

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
  // Cas particuliers, facultatifs (étape 9.2b) :
  heuresSupplementaires?: EntreeHeuresSupplementaires; // D106
  joursFeries?: JourFerieOuvrier[]; // ouvrier seulement (D107)
  incapacite?: IncapaciteOuvrierFiche | IncapaciteEmployeFiche; // salaire garanti (D108 à D111)
}

export interface ResultatFiche {
  brut: Centimes; // brut total (voir les règles de composition en tête du fichier)
  baseOnss: Centimes;
  onssPersonnelle: Centimes;
  bonusEmploi: Centimes;
  imposable: Centimes;
  precompte: Centimes;
  cotisationSpeciale: Centimes; // positive = retenue, négative = remboursement (3e mois)
  netExonere: Centimes; // heures volontaires sans sursalaire, ajoutées au net (0 sans heures)
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
  let brutTotal = brutOrdinaire.brut;
  let baseOnss = brutOrdinaire.brut;
  const lignesSalaire: LigneCalcul[] = [...brutOrdinaire.lignes];

  // 1 bis. Jours fériés de l'ouvrier payé à l'heure (D107) : de la rémunération soumise à l'ONSS.
  // Un employé payé au mois n'a rien à ajouter : son salaire couvre déjà les jours fériés.
  if (entree.joursFeries !== undefined) {
    if (entree.salaire.statut !== 'OUVRIER') {
      throw new ErreurMoteur(
        'ENTREE_INCOMPATIBLE',
        "Les jours fériés se calculent pour un ouvrier ; le salaire mensuel d'un employé les couvre déjà (D107).",
      );
    }
    const feries = calculerJoursFeriesOuvrier(
      {
        tauxHoraireCentimes: entree.salaire.tauxHoraire,
        annee: entree.periode.annee,
        jours: entree.joursFeries,
      },
      exigerBloc(parametres, 'joursFeries'),
    );
    brutTotal += feries.montant;
    baseOnss += feries.montant;
    lignesSalaire.push(...feries.lignes);
  }

  // 1 ter. Salaire garanti en cas d'incapacité (D108 à D111).
  if (entree.incapacite !== undefined) {
    const { incapacite, salaire } = entree;
    if (incapacite.statut !== salaire.statut) {
      throw new ErreurMoteur(
        'ENTREE_INCOMPATIBLE',
        "L'incapacité de travail ne correspond pas au statut du salarié (ouvrier ou employé).",
      );
    }
    const bloc = exigerBloc(parametres, 'salaireGaranti');
    if (incapacite.statut === 'OUVRIER' && salaire.statut === 'OUVRIER') {
      // L'ouvrier est payé aux heures prestées : le salaire garanti S'AJOUTE au brut.
      // Seuls les jours à 100 % sont de la rémunération soumise à l'ONSS (ONSS p. 115).
      const { statut: _statut, ...reste } = incapacite;
      const garanti = calculerSalaireGarantiOuvrier(
        { ...reste, tauxHoraireCentimes: salaire.tauxHoraire },
        bloc,
      );
      brutTotal += garanti.montant;
      baseOnss += garanti.baseOnss;
      lignesSalaire.push(...garanti.lignes);
    } else if (incapacite.statut === 'EMPLOYE' && salaire.statut === 'EMPLOYE') {
      // L'employé garde son salaire mensuel : on RETRANCHE ce que l'employeur ne doit plus. Le
      // salaire versé en indemnité (60 % et complément) reste dans le brut mais sort de la base ONSS.
      if (salaire.joursReferenceMois === null) {
        throw new ErreurMoteur(
          'JOURS_REFERENCE_MANQUANT',
          'Le nombre de jours de référence du mois est nécessaire pour valoriser une incapacité.',
        );
      }
      const { statut: _statut, ...reste } = incapacite;
      const garanti = calculerSalaireGarantiEmploye(
        {
          ...reste,
          remunerationMensuelle: salaire.remunerationMensuelle,
          joursReferenceMois: salaire.joursReferenceMois,
        },
        bloc,
      );
      brutTotal -= garanti.retenue;
      baseOnss -= garanti.retenue + garanti.horsOnss;
      lignesSalaire.push(...garanti.lignes);
    }
  }

  // 1 quater. Heures supplémentaires (D106).
  let netExonere = 0;
  let reductionHeuresSup = 0;
  let heuresVolontaires: { cumulMinutes: number; plafondMinutes: number } | null = null;
  if (entree.heuresSupplementaires !== undefined) {
    const blocHeures = exigerBloc(parametres, 'heuresSupplementaires');
    const heures = calculerHeuresSupplementaires(entree.heuresSupplementaires, blocHeures);
    brutTotal += heures.brutImposable;
    baseOnss += heures.baseOnss;
    netExonere = heures.netExonere;
    reductionHeuresSup = heures.reductionPrecompte;
    heuresVolontaires = {
      cumulMinutes: heures.cumulVolontairesMinutes,
      plafondMinutes: blocHeures.plafondVolontairesMinutes,
    };
    lignesSalaire.push(...heures.lignes);
  }

  // Un brut négatif est une saisie incohérente (trop de retenues) : on le dit clairement.
  if (brutTotal < 0 || baseOnss < 0) {
    throw new ErreurMoteur(
      'BRUT_NEGATIF',
      'Les retenues du mois dépassent le brut : vérifier les absences et les incapacités.',
    );
  }

  // 2-3. Cotisation personnelle de sécurité sociale (13,07 %, base à 108 % pour un ouvrier).
  const onss = calculerCotisationPersonnelle(
    { categorie, brutCentimes: baseOnss },
    exigerBloc(parametres, 'onss'),
  );

  // 4. Bonus à l'emploi (social), plafonné par la cotisation personnelle.
  const bonus = calculerBonusEmploi(
    {
      categorie,
      brutReferenceCentimes: baseOnss,
      prestations: entree.prestations,
      cotisationPersonnelleCentimes: onss.cotisation,
      bonusDejaPrisAnneeCentimes: entree.cumuls.bonusDejaPrisAnneeCentimes,
    },
    exigerBloc(parametres, 'bonusEmploi'),
  );

  // 5. Revenu imposable.
  const imposable = brutTotal - onss.cotisation + bonus.bonus;

  // 6. Précompte professionnel : barème du JOUR DE PAIEMENT (D112), moins la réduction des heures
  // supplémentaires avec sursalaire (n° 45).
  const precompte = calculerPrecompte(
    {
      brutCentimes: brutTotal,
      cotisationPersonnelleCentimes: onss.cotisation,
      bonusVoletACentimes: bonus.voletA,
      bonusVoletBCentimes: bonus.voletB,
      situation: entree.situation,
      habitantRoyaume: entree.habitantRoyaume,
      reductionHeuresSupplementairesCentimes: reductionHeuresSup,
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
    brutCentimes: brutTotal,
    cotisationPersonnelleCentimes: onss.cotisation,
    bonusEmploiCentimes: bonus.bonus,
    precompteCentimes: precompte.precompte,
    csssCentimes: csss.retenue,
    netExonereCentimes: netExonere,
  });

  // 9. Coût employeur : cotisations patronales moins réduction structurelle, plus les heures
  // volontaires payées au net (l'employeur les paie, sans cotisation).
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
      brutReferenceCentimes: baseOnss,
      prestations: entree.prestations,
      contratAuMoinsMiTemps: fraction.numerateur * 2 >= fraction.denominateur,
      cotisationsReductiblesCentimes: patronales.cotisationsReductibles,
    },
    exigerBloc(parametres, 'reductionStructurelle'),
  );
  const coutEmployeur = calculerCoutEmployeur({
    brutCentimes: brutTotal + netExonere,
    cotisationsPatronalesCentimes: patronales.total,
    reductionStructurelleCentimes: reduction.reduction,
  });

  // 10. Anomalies de contrôle (jamais bloquantes, D105).
  const anomalies = detecterAnomalies(
    {
      brutCentimes: brutTotal,
      netCentimes: net,
      prestationsRealisees: entree.prestations.realisees,
      netMoisPrecedentCentimes: entree.cumuls.netMoisPrecedentCentimes,
      heuresVolontaires,
    },
    exigerBloc(parametres, 'anomalies'),
  );

  return {
    brut: brutTotal,
    baseOnss,
    onssPersonnelle: onss.cotisation,
    bonusEmploi: bonus.bonus,
    imposable,
    precompte: precompte.precompte,
    cotisationSpeciale: csss.retenue,
    netExonere,
    net,
    cotisationsPatronales: patronales.total,
    reductionStructurelle: reduction.reduction,
    coutEmployeur,
    lignes: [
      ...lignesSalaire,
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
