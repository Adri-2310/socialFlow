// Types de base du moteur de paie (modules/paie.md § 2). Fonctions pures : rien dans
// lib/payroll/ ne lit la base, l'horloge, le réseau ou un fichier (étape 9 : test de convention).

// D14 : toute somme d'argent est un entier de centimes, jamais un flottant.
export type Centimes = number;

// Un taux est un entier exprimé en dix-millièmes de pour cent : 26,75 % = 267 500.
// 100 % = DIVISEUR_TAUX. Le même entier sert aux coefficients (108 % = 1 080 000), pour ne
// jamais manipuler 0,2675 ou 1,08. Annexe III n° 12 : l'arrondi se fait à chaque étape.
export type Taux = number;
export const DIVISEUR_TAUX = 1_000_000;

// Date de calendrier sans heure, au format AAAA-MM-JJ. Les comparaisons de chaînes ISO suivent
// l'ordre chronologique, et le moteur n'a ainsi jamais besoin d'objet Date (ni d'horloge).
export type DateIso = string;

export const STATUTS_BAREME = ['A_VERIFIER', 'ACTIF', 'RETIRE'] as const;
export type StatutBareme = (typeof STATUTS_BAREME)[number];

// Ce que le choix de version lit d'un BaremeVersion (D99). La ligne Prisma est convertie à la
// frontière (Date -> AAAA-MM-JJ) avant d'entrer dans le moteur.
export interface VersionBareme {
  code: string;
  valideDepuis: DateIso;
  valideJusqua: DateIso | null; // null = sans fin
  statut: StatutBareme;
  categorieEmployeur: string; // D98
}
