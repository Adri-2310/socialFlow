import { appliquerTaux, arrondirFraction } from './arrondi';
import type { ParametresHeuresSupplementaires } from './bareme/schema';
import { ErreurMoteur } from './erreurs';
import type { Centimes, LigneCalcul, Taux } from './types';
import { BORNES, exigerEntier } from './validation';

// HEURES SUPPLÉMENTAIRES (modules/paie.md § 3, étape 8c, D106).
// Sources : loi du 16 mars 1971 (art. 25bis, 360 heures volontaires dont 240 sans sursalaire),
// SPF Emploi (sursalaire de 50 % la semaine, 100 % le dimanche et les jours fériés), Instructions
// ONSS 2026/3 pp. 115-116 (exonérations) et Annexe III n° 45 et 111.2 (réduction de précompte).
// Tous les taux et plafonds viennent du bloc `heuresSupplementaires` du barème.
//
// En clair, il y a trois sortes d'heures, qui ne sont pas traitées pareil :
//   1. volontaire SANS sursalaire (240 h par an au plus) : payée au taux horaire normal, exonérée
//      d'ONSS et de précompte : elle s'ajoute directement au NET, pas au brut ;
//   2. volontaire AVEC sursalaire (dans les 360 h par an) : payée taux x (1 + sursalaire), exonérée
//      d'ONSS mais pas de précompte ;
//   3. supplémentaire ORDINAIRE (obligatoire, art. 29) : payée taux x (1 + sursalaire), soumise à
//      l'ONSS et au précompte.
// Les heures AVEC sursalaire (2 et 3) donnent en plus droit à une réduction du précompte : 57,75 %
// de la base du sursalaire (heures x taux horaire, sans le sursalaire), sur les 130 premières
// heures par an.
//
// Le moteur est pur : il ne connaît pas l'année civile. L'appelant fournit les CUMULS déjà pris
// depuis le 1er janvier (heures de relance du 1er trimestre 2026 incluses). Dépasser un plafond
// est refusé, jamais payé en silence.
//
// Limites de la v1 (D106) : régime général seulement (ni horeca, ni construction, ni travaux
// routiers), sursalaire légal de 20 % exclu, conditions du temps partiel et plafond européen de
// 174 h par trimestre non vérifiés, repos compensatoire non géré.

// Minutes d'heures supplémentaires par sorte (D96 : toujours des minutes entières).
export interface HeuresSupplementaires {
  volontairesSansSursalaire: number;
  volontaires50: number; // volontaires avec sursalaire de 50 % (lundi au samedi)
  volontaires100: number; // idem à 100 % (dimanche et jours fériés)
  ordinaires50: number;
  ordinaires100: number;
}

export interface EntreeHeuresSupplementaires {
  tauxHoraireCentimes: Centimes; // fourni par l'appelant, pour un employé comme pour un ouvrier
  ceMois: HeuresSupplementaires;
  cumulAvantCeMois: HeuresSupplementaires; // depuis le 1er janvier
}

export interface ResultatHeuresSupplementaires {
  // Ce qui s'ajoute au brut (heures avec sursalaire, sursalaire compris) : base du précompte.
  brutImposable: Centimes;
  // Ce qui, dans le brut imposable, est soumis à l'ONSS (heures ordinaires seulement).
  baseOnss: Centimes;
  netExonere: Centimes; // heures volontaires sans sursalaire, à ajouter au net
  reductionPrecompte: Centimes; // Annexe III n° 45, à retrancher du précompte
  // Cumul des heures volontaires, ce mois compris, pour l'anomalie de proximité du plafond.
  cumulVolontairesMinutes: number;
  lignes: LigneCalcul[];
}

const SORTES = [
  'volontairesSansSursalaire',
  'volontaires50',
  'volontaires100',
  'ordinaires50',
  'ordinaires100',
] as const satisfies readonly (keyof HeuresSupplementaires)[];

const MINUTES_PAR_AN_MAX = 366 * 24 * 60;

function verifier(nom: string, h: HeuresSupplementaires, max: number): void {
  for (const sorte of SORTES) exigerEntier(`${nom} (${sorte})`, h[sorte], 0, max);
}

// Montant des heures au taux horaire : taux x minutes / 60, arrondi au centime.
// Exemple : 20,00 €/h x 90 minutes = 2 000 x 90 / 60 = 3 000 centimes = 30,00 €.
function montantHeures(taux: Centimes, minutes: number): Centimes {
  return arrondirFraction(taux * minutes, 60);
}

export function calculerHeuresSupplementaires(
  entree: EntreeHeuresSupplementaires,
  bloc: ParametresHeuresSupplementaires,
): ResultatHeuresSupplementaires {
  const taux = exigerEntier('Le taux horaire', entree.tauxHoraireCentimes, 1, BORNES.montantMax);
  verifier('Les heures supplémentaires du mois', entree.ceMois, BORNES.minutesDansUnMoisMax);
  verifier('Le cumul annuel', entree.cumulAvantCeMois, MINUTES_PAR_AN_MAX);
  const { ceMois: mois, cumulAvantCeMois: avant } = entree;

  // Plafonds annuels : refus net plutôt qu'une heure payée hors du cadre légal.
  const sansTotal = avant.volontairesSansSursalaire + mois.volontairesSansSursalaire;
  if (sansTotal > bloc.plafondSansSursalaireMinutes) {
    throw new ErreurMoteur(
      'PLAFOND_HEURES_DEPASSE',
      'Le plafond annuel des heures volontaires sans sursalaire est dépassé.',
    );
  }
  const volontaires = (h: HeuresSupplementaires) =>
    h.volontairesSansSursalaire + h.volontaires50 + h.volontaires100;
  const volontairesTotal = volontaires(avant) + volontaires(mois);
  if (volontairesTotal > bloc.plafondVolontairesMinutes) {
    throw new ErreurMoteur(
      'PLAFOND_HEURES_DEPASSE',
      'Le plafond annuel des heures volontaires est dépassé.',
    );
  }

  const lignes: LigneCalcul[] = [];
  let brutImposable = 0;
  let baseOnss = 0;

  // 1. Heures volontaires sans sursalaire : au net, hors brut.
  const netExonere = montantHeures(taux, mois.volontairesSansSursalaire);
  if (netExonere > 0) {
    lignes.push({
      code: 'HEURES_SUP_VOLONTAIRES_NETTES',
      libelle: 'Heures supplémentaires volontaires sans sursalaire (exonérées)',
      base: netExonere,
      taux: null,
      montant: netExonere,
    });
  }

  // 2 et 3. Heures avec sursalaire : base + sursalaire, arrondi sur la base puis sur le sursalaire.
  // Exemple : 4 h à 50 % à 20,00 €/h : base 80,00 ; sursalaire 40,00 ; total 120,00 €.
  const avecSursalaire: {
    code: string;
    libelle: string;
    minutes: number;
    sursalaire: Taux;
    onss: boolean;
  }[] = [
    {
      code: 'HEURES_SUP_ORDINAIRES_50',
      libelle: 'Heures supplémentaires à 50 %',
      minutes: mois.ordinaires50,
      sursalaire: bloc.sursalaireSemaine,
      onss: true,
    },
    {
      code: 'HEURES_SUP_ORDINAIRES_100',
      libelle: 'Heures supplémentaires à 100 %',
      minutes: mois.ordinaires100,
      sursalaire: bloc.sursalaireDimancheFerie,
      onss: true,
    },
    {
      code: 'HEURES_SUP_VOLONTAIRES_50',
      libelle: 'Heures supplémentaires volontaires à 50 % (exonérées d’ONSS)',
      minutes: mois.volontaires50,
      sursalaire: bloc.sursalaireSemaine,
      onss: false,
    },
    {
      code: 'HEURES_SUP_VOLONTAIRES_100',
      libelle: 'Heures supplémentaires volontaires à 100 % (exonérées d’ONSS)',
      minutes: mois.volontaires100,
      sursalaire: bloc.sursalaireDimancheFerie,
      onss: false,
    },
  ];

  // Réduction n° 45 : seules les 130 premières heures de l'année y donnent droit. On les attribue
  // dans l'ordre de la liste ci-dessus (choix du moteur, D106) ; le total est le même quel que soit
  // l'ordre, seuls des arrondis de quelques centimes pourraient différer.
  const dejaAvecSursalaire =
    avant.volontaires50 + avant.volontaires100 + avant.ordinaires50 + avant.ordinaires100;
  let minutesRestantes = Math.max(0, bloc.plafondReductionMinutes - dejaAvecSursalaire);
  let baseReduction = 0;

  for (const s of avecSursalaire) {
    if (s.minutes === 0) continue;
    const base = montantHeures(taux, s.minutes);
    const total = base + appliquerTaux(base, s.sursalaire);
    lignes.push({ code: s.code, libelle: s.libelle, base, taux: s.sursalaire, montant: total });
    brutImposable += total;
    if (s.onss) baseOnss += total;
    const eligibles = Math.min(s.minutes, minutesRestantes);
    minutesRestantes -= eligibles;
    baseReduction += montantHeures(taux, eligibles);
  }

  const reductionPrecompte = appliquerTaux(baseReduction, bloc.tauxReduction);
  return {
    brutImposable,
    baseOnss,
    netExonere,
    reductionPrecompte,
    cumulVolontairesMinutes: volontairesTotal,
    lignes,
  };
}
