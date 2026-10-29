import { appliquerTaux } from './arrondi';
import type { ParametresCotisationsPatronales } from './bareme/schema';
import { ErreurMoteur } from './erreurs';
import type { CategorieSalarie, Centimes, LigneCalcul } from './types';
import { BORNES, exigerEntier } from './validation';

// COTISATIONS PATRONALES (modules/paie.md § 3, étape 7) : ce que l'employeur paie à l'ONSS EN PLUS
// du brut. Elles ne touchent pas le net du salarié : elles forment le coût employeur.
//
// En clair, pour le secteur privé marchand (D98) :
//   - la cotisation de base (19,88 %) ;
//   - la modération salariale : 4,27 % de la rémunération PLUS 4,27 % de la cotisation de base ;
//   - pour un ouvrier, les vacances annuelles (5,57 % + 10,27 %), parce que son pécule est payé
//     par une caisse et non par l'employeur ;
//   - deux petites cotisations spéciales (Fonds amiante, accidents du travail) ;
//   - si l'employeur occupe 10 travailleurs ou plus, une cotisation de 1,60 % avec sa modération.
// Source : Instructions administratives ONSS 2026/3, pages 174 à 177. Aucun taux n'est écrit ici :
// ils viennent du bloc `cotisationsPatronales` du barème (D99, D104).
//
// Base : le brut, ou le brut à 108 % pour un ouvrier (p. 177). Arrondi : chaque cotisation est
// arrondie au centime, la moitié monte (D99).
//
// Limites de la v1 (D104) : le Fonds de fermeture d'entreprises (FFE) n'est pas calculé, et la
// modération n'est appliquée qu'à la cotisation de base et à celle de 1,60 %.

export interface EntreeCotisationsPatronales {
  categorie: CategorieSalarie;
  brutCentimes: Centimes;
  // Fait de l'employeur, absent du dossier du salarié : 10 travailleurs ou plus en moyenne sur la
  // période de référence (p. 177). L'appelant le connaît ; le moteur ne le devine pas.
  employeurDixTravailleursOuPlus: boolean;
}

export interface ResultatCotisationsPatronales {
  base: Centimes; // rémunération sur laquelle les taux s'appliquent (108 % pour un ouvrier)
  total: Centimes; // toutes les cotisations, positif
  // Cotisation de base + modération salariale : le plafond de la réduction structurelle.
  cotisationsReductibles: Centimes;
  lignes: LigneCalcul[]; // montants positifs (un coût)
}

// Exemple à la main (employé, 2 800,00 €, employeur de moins de 10 travailleurs) :
//   base           = 2 800,00 x 19,88 %                    = 556,64 €
//   modération     = 2 800,00 x 4,27 % = 119,56
//                  + 556,64 x 4,27 %   = 23,7685 -> 23,77  = 143,33 €
//   Fonds amiante  = 2 800,00 x 0,01 %                     =   0,28 €
//   accidents trav.= 2 800,00 x 0,02 %                     =   0,56 €
//   total = 700,81 € dont 699,97 € réductibles.
export function calculerCotisationsPatronales(
  entree: EntreeCotisationsPatronales,
  bloc: ParametresCotisationsPatronales,
): ResultatCotisationsPatronales {
  if (entree.categorie !== 'EMPLOYE' && entree.categorie !== 'OUVRIER') {
    throw new ErreurMoteur('ENTREE_INVALIDE', 'Le statut du salarié doit être EMPLOYE ou OUVRIER.');
  }
  if (typeof entree.employeurDixTravailleursOuPlus !== 'boolean') {
    throw new ErreurMoteur(
      'ENTREE_INVALIDE',
      "Il faut préciser si l'employeur occupe 10 travailleurs ou plus.",
    );
  }
  const brut = exigerEntier('Le brut', entree.brutCentimes, 0, BORNES.montantMax);
  const ouvrier = entree.categorie === 'OUVRIER';
  const base = ouvrier ? appliquerTaux(brut, bloc.coefficientOuvrier) : brut;

  const lignes: LigneCalcul[] = [];
  // Ajoute une ligne de coût, sauf si elle vaut 0 (pas de « 0,00 » sur la fiche).
  const ajouter = (
    code: string,
    libelle: string,
    montant: Centimes,
    taux: number | null,
    baseLigne: Centimes = base,
  ): Centimes => {
    if (montant !== 0) lignes.push({ code, libelle, base: baseLigne, taux, montant });
    return montant;
  };

  const cotisationBase = ajouter(
    'COTISATION_PATRONALE_BASE',
    'Cotisation patronale de base',
    appliquerTaux(base, bloc.tauxBase),
    bloc.tauxBase,
  );
  // Modération : sur la rémunération, puis sur la cotisation de base elle-même (deux arrondis).
  const moderation = ajouter(
    'MODERATION_SALARIALE',
    'Cotisation de modération salariale',
    appliquerTaux(base, bloc.moderation) + appliquerTaux(cotisationBase, bloc.moderation),
    bloc.moderation,
  );

  let total = cotisationBase + moderation;
  const cotisationsReductibles = total;

  if (ouvrier) {
    total += ajouter(
      'VACANCES_ANNUELLES_TRIMESTRIELLE',
      'Cotisation vacances annuelles (perçue chaque trimestre)',
      appliquerTaux(base, bloc.vacancesOuvrier.trimestrielle),
      bloc.vacancesOuvrier.trimestrielle,
    );
    total += ajouter(
      'VACANCES_ANNUELLES_AVIS_DEBIT',
      'Cotisation vacances annuelles (avis de débit annuel)',
      appliquerTaux(base, bloc.vacancesOuvrier.avisDebit),
      bloc.vacancesOuvrier.avisDebit,
    );
  }
  total += ajouter(
    'FONDS_AMIANTE',
    'Cotisation Fonds amiante',
    appliquerTaux(base, bloc.fondsAmiante),
    bloc.fondsAmiante,
  );
  total += ajouter(
    'ACCIDENTS_TRAVAIL_SPECIALE',
    'Cotisation spéciale accidents du travail',
    appliquerTaux(base, bloc.accidentsTravailSpecial),
    bloc.accidentsTravailSpecial,
  );
  if (entree.employeurDixTravailleursOuPlus) {
    const cotisation = appliquerTaux(base, bloc.dixTravailleurs);
    // La modération salariale s'applique aussi à cette cotisation (p. 176-177).
    total += ajouter(
      'COTISATION_DIX_TRAVAILLEURS',
      'Cotisation des employeurs de 10 travailleurs ou plus (modération comprise)',
      cotisation + appliquerTaux(cotisation, bloc.moderation),
      bloc.dixTravailleurs,
    );
  }

  return { base, total, cotisationsReductibles, lignes };
}
