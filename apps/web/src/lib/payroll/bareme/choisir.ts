import { ErreurMoteur } from '../erreurs';
import type { DateIso, VersionBareme } from '../types';

// D99 : choix de la version de barème valable pour un mois et une catégorie d'employeur.
// Fonction pure : la liste arrive en paramètre, aucune date « du jour » n'est lue.
//
// Pourquoi c'est important : chaque fiche doit être calculée avec les paramètres légaux de SA
// période, jamais avec ceux d'aujourd'hui (D13, D22). Une fiche de janvier recalculée en juillet
// doit retrouver le barème de janvier.

// Écrit un nombre sur deux chiffres : 3 -> « 03 » (pour fabriquer une date AAAA-MM-JJ).
const deuxChiffres = (n: number) => String(n).padStart(2, '0');

// Règle grégorienne : divisible par 4, sauf les siècles non divisibles par 400.
// 2028 est bissextile, 2100 ne l'est pas.
function estBissextile(annee: number): boolean {
  return (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;
}

// Nombre de jours d'un mois, calculé à la main pour ne pas dépendre de l'objet Date.
function joursDuMois(annee: number, mois: number): number {
  if (mois === 2) return estBissextile(annee) ? 29 : 28;
  return [4, 6, 9, 11].includes(mois) ? 30 : 31;
}

// Refuse une année ou un mois impossibles avant de chercher quoi que ce soit.
function verifierMois(annee: number, mois: number): void {
  if (!Number.isInteger(annee) || annee < 2000 || annee > 2100) {
    throw new ErreurMoteur('ENTREE_INVALIDE', `Année invalide : ${annee}.`);
  }
  if (!Number.isInteger(mois) || mois < 1 || mois > 12) {
    throw new ErreurMoteur('ENTREE_INVALIDE', `Mois invalide : ${mois}.`);
  }
}

// Deux intervalles fermés [début, fin] se recoupent si chacun commence avant la fin de l'autre ;
// une fin nulle est « sans fin ». Les chaînes AAAA-MM-JJ se comparent comme des dates.
// Exemple : [01/01, 30/06] et [01/07, …] ne se recoupent pas ; [01/01, 01/07] et [01/07, …] si
// (le 1er juillet appartient aux deux).
function seRecoupent(a: VersionBareme, b: VersionBareme): boolean {
  const aCommenceAvantFinDeB = b.valideJusqua === null || a.valideDepuis <= b.valideJusqua;
  const bCommenceAvantFinDeA = a.valideJusqua === null || b.valideDepuis <= a.valideJusqua;
  return aCommenceAvantFinDeB && bCommenceAvantFinDeA;
}

// Refuse deux versions ACTIF de même catégorie dont les périodes de validité se chevauchent.
// Sera appelée par l'activation d'un barème (chantier F). Les versions A_VERIFIER et RETIRE
// ne comptent pas : seule une version active est utilisée pour calculer.
// On compare toutes les paires (le nombre de versions reste très petit : une par an environ).
export function verifierPasDeChevauchement(versions: readonly VersionBareme[]): void {
  const actives = versions.filter((v) => v.statut === 'ACTIF');
  for (let i = 0; i < actives.length; i++) {
    for (let j = i + 1; j < actives.length; j++) {
      const a = actives[i];
      const b = actives[j];
      if (a.categorieEmployeur === b.categorieEmployeur && seRecoupent(a, b)) {
        throw new ErreurMoteur(
          'BAREME_CHEVAUCHEMENT',
          `Les barèmes ${a.code} et ${b.code} sont actifs sur une même période.`,
        );
      }
    }
  }
}

// Version ACTIF de la catégorie qui couvre le mois ENTIER. Une version qui ne couvre qu'une
// partie du mois est refusée : calculer une fiche avec deux barèmes demanderait une règle
// de découpe que personne n'a écrite (D99).
//
// Le type générique `T` permet de recevoir des versions plus riches (avec leurs paramètres) et de
// récupérer exactement la même version en retour.
export function choisirBareme<T extends VersionBareme>(
  versions: readonly T[],
  annee: number,
  mois: number,
  categorieEmployeur: string,
): T {
  verifierMois(annee, mois);
  // Premier et dernier jour du mois demandé, au format AAAA-MM-JJ.
  const premier: DateIso = `${annee}-${deuxChiffres(mois)}-01`;
  const dernier: DateIso = `${annee}-${deuxChiffres(mois)}-${deuxChiffres(joursDuMois(annee, mois))}`;

  // Versions actives de la bonne catégorie dont la validité touche au moins un jour du mois.
  const touchees = versions.filter(
    (v) =>
      v.statut === 'ACTIF' &&
      v.categorieEmployeur === categorieEmployeur &&
      v.valideDepuis <= dernier &&
      (v.valideJusqua === null || v.valideJusqua >= premier),
  );

  if (touchees.length === 0) {
    throw new ErreurMoteur(
      'BAREME_INTROUVABLE',
      `Aucun barème actif pour ${deuxChiffres(mois)}/${annee} (catégorie ${categorieEmployeur}).`,
    );
  }
  // Partielle : commence après le 1er du mois ou se termine avant le dernier jour.
  const partielle = touchees.find(
    (v) => v.valideDepuis > premier || (v.valideJusqua !== null && v.valideJusqua < dernier),
  );
  if (partielle) {
    throw new ErreurMoteur(
      'BAREME_PARTIEL',
      `Le barème ${partielle.code} ne couvre pas tout le mois ${deuxChiffres(mois)}/${annee}.`,
    );
  }
  // Plusieurs versions couvrent le mois entier : on ne choisit pas au hasard.
  if (touchees.length > 1) {
    throw new ErreurMoteur(
      'BAREME_AMBIGU',
      `Plusieurs barèmes actifs couvrent ${deuxChiffres(mois)}/${annee} : ${touchees.map((v) => v.code).join(', ')}.`,
    );
  }
  return touchees[0];
}
