import { arrondirFraction } from './arrondi';
import { ErreurMoteur } from './erreurs';
import { formaterDuree, formaterJours } from './format';
import type { Centimes, LigneCalcul } from './types';
import { BORNES, exigerEntier } from './validation';

// ÉTAPE 1 DU CALCUL : LE BRUT (modules/paie.md § 3, ligne 1).
//
// Étape 3 de la mission : seulement le brut « simple » (rémunération, absences non rémunérées,
// prime). Jours fériés, congés, maladie, heures supplémentaires et entrée ou sortie en cours de
// mois viennent à l'étape 8, avec leurs sources légales. Rien n'est inventé en attendant.

// Résultat commun aux deux statuts : le montant du brut et le détail qui l'explique, ligne par
// ligne, pour la fiche de paie.
export interface ResultatBrut {
  brut: Centimes;
  lignes: LigneCalcul[];
}

// La prime (D92) : un montant en centimes et un libellé court, tous deux facultatifs.
interface Prime {
  primeCents: number | null;
  primeLibelle: string | null;
}

// Construit la ligne « Prime », ou rien si le mois n'en comporte pas (absente ou égale à 0).
// Le libellé saisi est nettoyé des espaces ; à défaut on écrit simplement « Prime ».
function ligneDePrime({ primeCents, primeLibelle }: Prime): LigneCalcul | null {
  if (primeCents === null || primeCents === 0) return null;
  const montant = exigerEntier('La prime', primeCents, 0, BORNES.montantMax);
  return {
    code: 'PRIME',
    libelle: primeLibelle?.trim() || 'Prime',
    base: null,
    taux: null,
    montant,
  };
}

export interface EntreeBrutEmploye extends Prime {
  // D100 : salaire fixe réellement dû, saisi tel quel dans le dossier. Aucune fraction
  // d'occupation ici : un temps partiel a déjà son salaire au prorata dans le contrat.
  remunerationMensuelle: Centimes;
  // Absences non rémunérées du mois, en DEMI-journées (2 = un jour), comme les prestations (D92).
  absenceNonRemDemiJours: number;
  // Nombre de jours sur lequel se répartit le mois pour valoriser une absence. C'est une règle de
  // la commission paritaire, pas du moteur : l'appelant la fournit, le moteur refuse de deviner.
  joursReferenceMois: number | null;
}

// Employé (D39, D100) : brut = rémunération mensuelle fixe, moins les absences non rémunérées,
// plus la prime. Un arrondi au cent à chaque étape (Annexe III n° 12, D99).
//
// Valeur d'une absence = salaire x (demi-jours / 2) / jours de référence, soit
// salaire x demi-jours / (2 x jours de référence). On garde les demi-journées entières pour ne
// jamais diviser en flottant.
//
// Exemple à la main : salaire de 2 400,00 € ; une journée d'absence sur 20 jours
// = 2 400,00 x 2 / (2 x 20) = 120,00 € ; prime de 50,00 € -> brut 2 330,00 €.
export function calculerBrutEmploye(entree: EntreeBrutEmploye): ResultatBrut {
  // 1. Contrôle des entrées : toute valeur impossible arrête le calcul avec un message précis.
  const mensuel = exigerEntier(
    'La rémunération mensuelle',
    entree.remunerationMensuelle,
    1,
    BORNES.montantMax,
  );
  const demiJours = exigerEntier(
    "Les jours d'absence non rémunérée",
    entree.absenceNonRemDemiJours,
    0,
    2 * BORNES.joursDansUnMoisMax,
  );

  // 2. Première ligne : le salaire tel que saisi (pas de base ni de taux à afficher).
  const lignes: LigneCalcul[] = [
    {
      code: 'SALAIRE_BASE',
      libelle: 'Rémunération mensuelle',
      base: null,
      taux: null,
      montant: mensuel,
    },
  ];
  let brut = mensuel;

  // 3. Absences non rémunérées : retranchées du salaire, valorisées au prorata des jours.
  if (demiJours > 0) {
    // Sans le nombre de jours de référence, on ne peut pas valoriser une journée : on refuse
    // plutôt que de supposer 20, 21,67 ou 26 jours sans source (règle 5 de la mission).
    if (entree.joursReferenceMois === null) {
      throw new ErreurMoteur(
        'JOURS_REFERENCE_MANQUANT',
        'Le nombre de jours de référence du mois est nécessaire pour valoriser une absence non rémunérée.',
      );
    }
    const jours = exigerEntier(
      'Le nombre de jours de référence',
      entree.joursReferenceMois,
      1,
      BORNES.joursDansUnMoisMax,
    );
    // Absent plus de jours que le mois n'en compte : saisie incohérente, jamais un brut négatif.
    if (demiJours > 2 * jours) {
      throw new ErreurMoteur(
        'ABSENCE_SUPERIEURE_AU_MOIS',
        'Les absences non rémunérées dépassent le nombre de jours de référence du mois.',
      );
    }
    const absence = arrondirFraction(mensuel * demiJours, 2 * jours);
    lignes.push({
      code: 'ABSENCE_NON_REMUNEREE',
      libelle: `Absence non rémunérée : ${formaterJours(demiJours)} sur ${jours}`,
      base: mensuel,
      taux: null,
      // Négatif : la ligne vient en déduction du brut.
      montant: -absence,
    });
    brut -= absence;
  }

  // 4. Prime éventuelle, ajoutée en dernier.
  const prime = ligneDePrime(entree);
  if (prime) {
    lignes.push(prime);
    brut += prime.montant;
  }
  return { brut, lignes };
}

export interface EntreeBrutOuvrier extends Prime {
  // Taux horaire brut en centimes (ex. 15,00 €/h = 1 500).
  tauxHoraire: Centimes;
  // Un ouvrier est payé aux heures réellement prestées : obligatoires, jamais déduites du régime.
  heuresPresteesMinutes: number | null;
}

// Ouvrier (D39) : brut = heures prestées x taux horaire, plus la prime. Les absences non
// rémunérées ne se déduisent pas : elles sont déjà absentes des heures prestées.
//
// Les heures sont en minutes (D96) : montant = taux x minutes / 60, arrondi au cent.
//
// Exemple à la main : 15,00 €/h x 30 h 24 = 1 500 x 1 824 / 60 = 45 600 centimes = 456,00 €.
export function calculerBrutOuvrier(entree: EntreeBrutOuvrier): ResultatBrut {
  const taux = exigerEntier('Le taux horaire', entree.tauxHoraire, 1, BORNES.montantMax);
  // Pas de « repli » sur le régime : un ouvrier sans heures prestées n'a pas de brut calculable.
  if (entree.heuresPresteesMinutes === null) {
    throw new ErreurMoteur(
      'HEURES_PRESTEES_MANQUANTES',
      "Les heures prestées sont obligatoires pour calculer la rémunération d'un ouvrier.",
    );
  }
  // Zéro heure est admis (mois sans prestation) ; au-delà d'un mois de minutes, c'est une faute.
  const minutes = exigerEntier(
    'Les heures prestées',
    entree.heuresPresteesMinutes,
    0,
    BORNES.minutesDansUnMoisMax,
  );

  const montant = arrondirFraction(taux * minutes, 60);
  const lignes: LigneCalcul[] = [
    {
      code: 'HEURES_PRESTEES',
      libelle: `Heures prestées : ${formaterDuree(minutes)}`,
      // La base affichée est le taux horaire : « 15,00 € x 30 h 24 ».
      base: taux,
      taux: null,
      montant,
    },
  ];
  let brut = montant;

  const prime = ligneDePrime(entree);
  if (prime) {
    lignes.push(prime);
    brut += prime.montant;
  }
  return { brut, lignes };
}
