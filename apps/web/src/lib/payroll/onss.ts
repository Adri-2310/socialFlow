import { appliquerTaux } from './arrondi';
import type { ParametresOnss } from './bareme/schema';
import { ErreurMoteur } from './erreurs';
import type { Centimes, CategorieSalarie, LigneCalcul } from './types';
import { BORNES, exigerEntier } from './validation';

// COTISATION PERSONNELLE DE SÉCURITÉ SOCIALE (modules/paie.md § 3, étape 2).
//
// La règle, en clair : l'ONSS retient au travailleur 13,07 % de sa rémunération.
// - Employé : la base est le brut tel quel (100 %).
// - Ouvrier : la base est le brut MAJORÉ DE 8 % (108 %), parce que son pécule de vacances est payé
//   par une caisse et non par l'employeur ; les cotisations dues sur ce pécule sont donc prélevées
//   en même temps que le salaire ordinaire.
// Source : Instructions administratives ONSS 2026/3, p. 175 (13,07 % = 7,50 pensions + 3,55 soins
// de santé + 1,15 indemnités + 0,87 chômage) et p. 176 (rémunération à 100 % ou à 108 %).
// Les pourcentages ne sont PAS écrits ici : ils viennent du bloc `onss` du barème (D99).
//
// Arrondi : le document ne dit pas comment arrondir la cotisation. On applique la règle du moteur
// (D99, Annexe III n° 12) : au centime le plus proche, la moitié monte, à chaque étape (D101).

export interface EntreeCotisationPersonnelle {
  categorie: CategorieSalarie;
  // Brut du mois en centimes (résultat de l'étape 1, brut.ts).
  brutCentimes: Centimes;
}

export interface ResultatCotisationPersonnelle {
  // Base sur laquelle le taux s'applique : le brut (employé) ou le brut à 108 % (ouvrier).
  base: Centimes;
  // Cotisation due, en centimes, toujours positive (la ligne de détail, elle, est négative).
  cotisation: Centimes;
  lignes: LigneCalcul[];
}

// Exemple à la main (ouvrier, brut 1 336,00 €) :
//   base      = 1 336,00 x 108 %  = 1 442,88 €            (arrondi au centime)
//   cotisation = 1 442,88 x 13,07 % = 188,5844 -> 188,58 €  (arrondi au centime)
// C'est exactement le calcul de l'exemple 2 du document ONSS (p. 453).
export function calculerCotisationPersonnelle(
  entree: EntreeCotisationPersonnelle,
  onss: ParametresOnss,
): ResultatCotisationPersonnelle {
  if (entree.categorie !== 'EMPLOYE' && entree.categorie !== 'OUVRIER') {
    throw new ErreurMoteur('ENTREE_INVALIDE', 'Le statut du salarié doit être EMPLOYE ou OUVRIER.');
  }
  const brut = exigerEntier('Le brut', entree.brutCentimes, 0, BORNES.montantMax);

  // Étape 1 : la base. Un employé garde son brut ; un ouvrier voit son brut majoré (arrondi au centime).
  const base = entree.categorie === 'OUVRIER' ? appliquerTaux(brut, onss.coefficientOuvrier) : brut;
  // Étape 2 : la cotisation (arrondi au centime).
  const cotisation = appliquerTaux(base, onss.tauxPersonnel);

  // Rien à retenir sur un brut nul : pas de ligne (et pas de « -0 », qui s'affiche mal et se compare mal).
  if (cotisation === 0) return { base, cotisation, lignes: [] };

  return {
    base,
    cotisation,
    lignes: [
      {
        code: 'COTISATION_PERSONNELLE',
        libelle:
          entree.categorie === 'OUVRIER'
            ? 'Cotisation personnelle ONSS (base : brut majoré de 8 %)'
            : 'Cotisation personnelle ONSS',
        base,
        taux: onss.tauxPersonnel,
        // Une retenue est négative sur la fiche (types.ts : montant signé).
        montant: -cotisation,
      },
    ],
  };
}
