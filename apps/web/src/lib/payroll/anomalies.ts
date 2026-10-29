import type { ParametresAnomalies } from './bareme/schema';
import { DIVISEUR_TAUX, type Centimes } from './types';
import { BORNES, exigerEntier } from './validation';

// ANOMALIES (modules/paie.md § 2, étape 8d) : des alertes de contrôle pour le gestionnaire, pas des
// règles de droit. Le moteur calcule toujours la fiche ; ces alertes signalent ce qui mérite un
// second regard avant validation (D105). Elles n'empêchent jamais de valider : seule l'interface
// décidera comment les afficher.
//
// Différence avec `validation.ts` : là-bas une valeur IMPOSSIBLE (heures au-delà du mois) est
// refusée ; ici une valeur POSSIBLE mais suspecte (net négatif, grand écart) est signalée.

export type GraviteAnomalie = 'ERREUR' | 'AVERTISSEMENT';

export interface Anomalie {
  code: string; // identifiant stable, sur lequel les tests et l'écran s'appuient
  gravite: GraviteAnomalie;
  message: string;
}

export interface EntreeAnomalies {
  brutCentimes: Centimes;
  // Le net peut être négatif (retenues supérieures au brut) : c'est justement une anomalie.
  netCentimes: Centimes;
  // Prestations du mois dans l'unité de la fiche (jours ou minutes) ; seul compte « zéro ou non ».
  prestationsRealisees: number;
  // Net de la fiche du mois précédent ; absent (null) pour une première fiche.
  netMoisPrecedentCentimes: Centimes | null;
  // Cumul annuel d'heures volontaires (ce mois compris, en minutes) et plafond du barème, pour
  // signaler qu'on approche de la limite. Absent (null) si la fiche n'a pas d'heures supplémentaires.
  heuresVolontaires?: { cumulMinutes: number; plafondMinutes: number } | null;
}

// Détecte les anomalies d'une fiche calculée.
// Exemple (seuil 25 %) : net précédent 2 000,00 €, net actuel 2 600,00 € -> écart 600,00 € = 30 % :
// alerte. Avec 2 500,00 € : écart de 25 % pile, pas d'alerte (« au-delà » du seuil).
export function detecterAnomalies(entree: EntreeAnomalies, bloc: ParametresAnomalies): Anomalie[] {
  const brut = exigerEntier('Le brut', entree.brutCentimes, 0, BORNES.montantMax);
  const net = exigerEntier('Le net', entree.netCentimes, -BORNES.montantMax, BORNES.montantMax);
  const prestations = exigerEntier(
    'Les prestations',
    entree.prestationsRealisees,
    0,
    BORNES.minutesDansUnMoisMax,
  );
  const precedent = entree.netMoisPrecedentCentimes;
  if (precedent !== null) {
    exigerEntier('Le net du mois précédent', precedent, -BORNES.montantMax, BORNES.montantMax);
  }

  const anomalies: Anomalie[] = [];

  if (net < 0) {
    anomalies.push({
      code: 'NET_NEGATIF',
      gravite: 'ERREUR',
      message: 'Le net est négatif : les retenues dépassent le brut.',
    });
  } else if (net === 0 && brut > 0) {
    anomalies.push({
      code: 'NET_NUL',
      gravite: 'AVERTISSEMENT',
      message: "Le net est nul alors que le brut ne l'est pas.",
    });
  }
  if (brut === 0 && prestations > 0) {
    anomalies.push({
      code: 'BRUT_NUL_AVEC_PRESTATIONS',
      gravite: 'AVERTISSEMENT',
      message: 'Le brut est nul alors que des prestations sont encodées.',
    });
  }
  if (brut > 0 && prestations === 0) {
    anomalies.push({
      code: 'BRUT_SANS_PRESTATIONS',
      gravite: 'AVERTISSEMENT',
      message: 'Un brut est payé sans aucune prestation encodée.',
    });
  }

  // Écart relatif en entiers : |net - précédent| / précédent > seuil, soit
  // |net - précédent| x 1 000 000 > seuil x précédent (aucune division, aucun flottant).
  // Pas de comparaison sans mois précédent, ou si celui-ci est nul ou négatif (déjà signalé).
  if (precedent !== null && precedent > 0) {
    const ecart = Math.abs(net - precedent);
    if (ecart * DIVISEUR_TAUX > bloc.ecartNetMoisPrecedent * precedent) {
      anomalies.push({
        code: 'ECART_NET_MOIS_PRECEDENT',
        gravite: 'AVERTISSEMENT',
        message: "Le net s'écarte fortement de celui du mois précédent.",
      });
    }
  }

  // Heures volontaires : au-delà du seuil (90 %) du plafond annuel, la prochaine fiche pourrait être
  // refusée par le moteur. Comparaison en entiers : cumul x 1 000 000 > seuil x plafond.
  const heures = entree.heuresVolontaires;
  if (heures) {
    exigerEntier("Le cumul d'heures volontaires", heures.cumulMinutes, 0, 366 * 24 * 60);
    exigerEntier("Le plafond d'heures volontaires", heures.plafondMinutes, 1, 366 * 24 * 60);
    if (heures.cumulMinutes * DIVISEUR_TAUX > bloc.proximitePlafondHeures * heures.plafondMinutes) {
      anomalies.push({
        code: 'HEURES_SUP_PLAFOND_PROCHE',
        gravite: 'AVERTISSEMENT',
        message: "Le plafond annuel d'heures supplémentaires volontaires est presque atteint.",
      });
    }
  }

  return anomalies;
}
