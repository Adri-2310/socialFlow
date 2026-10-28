// Types de base du moteur de paie (modules/paie.md § 2).
//
// Tout le dossier `lib/payroll/` est fait de FONCTIONS PURES : pour les mêmes entrées, le même
// résultat, toujours. Rien ici ne lit la base de données, l'horloge, le réseau ou un fichier
// (un test de convention le vérifiera à l'étape 9). C'est ce qui rend le moteur testable au
// centime et explicable devant un jury.

// D14 : toute somme d'argent est un entier de CENTIMES, jamais un flottant.
// Pourquoi : en flottant, 0,1 + 0,2 vaut 0,30000000000000004 ; une fiche de paie ne peut pas
// se permettre ces écarts. 2 400,00 € s'écrit donc 240 000.
export type Centimes = number;

// Un taux est un entier exprimé en DIX-MILLIÈMES DE POUR CENT : 26,75 % = 267 500.
// 100 % vaut DIVISEUR_TAUX. Le même entier sert aux coefficients (108 % = 1 080 000), pour ne
// jamais manipuler 0,2675 ou 1,08. Annexe III n° 12 : l'arrondi se fait à chaque étape (D99).
export type Taux = number;
export const DIVISEUR_TAUX = 1_000_000;

// Un rapport exact entre deux entiers (fraction d'occupation, part de jours) : jamais de décimal.
// Exemple : 4/5 s'écrit { numerateur: 4, denominateur: 5 } ; 1/3 resterait inexact en décimal.
export interface Fraction {
  numerateur: number;
  denominateur: number;
}

// Une ligne du détail de calcul affiché sur la fiche (modules/paie.md § 2) : on doit toujours
// pouvoir expliquer un montant au salarié ou au contrôleur.
// - `code` : identifiant stable de la ligne (ex. SALAIRE_BASE), indépendant du libellé affiché ;
// - `montant` : SIGNÉ. Une absence ou une retenue est négative, une prime positive ;
// - `base` et `taux` : facultatifs, absents quand la ligne n'en a pas (une prime fixe, par exemple).
export interface LigneCalcul {
  code: string;
  libelle: string;
  base: Centimes | null;
  taux: Taux | null;
  montant: Centimes;
}

// Date de calendrier sans heure, au format AAAA-MM-JJ. Les chaînes ISO se comparent dans l'ordre
// chronologique ('2026-03-01' < '2026-10-28'), donc le moteur n'a jamais besoin d'objet Date,
// et donc jamais d'horloge : il reste pur.
export type DateIso = string;

// Cycle de vie d'une version de barème (D22) : importée à vérifier, activée par le SuperAdmin
// après passage des cas de référence, puis retirée quand elle est remplacée.
export const STATUTS_BAREME = ['A_VERIFIER', 'ACTIF', 'RETIRE'] as const;
export type StatutBareme = (typeof STATUTS_BAREME)[number];

// Ce que le choix de version lit d'un BaremeVersion (D99). La ligne Prisma est convertie à la
// frontière (Date -> AAAA-MM-JJ) avant d'entrer dans le moteur, qui ne connaît pas Prisma.
export interface VersionBareme {
  code: string; // ex. « BE-2026-01 »
  valideDepuis: DateIso; // premier jour de validité, inclus
  valideJusqua: DateIso | null; // dernier jour de validité, inclus ; null = sans fin
  statut: StatutBareme;
  categorieEmployeur: string; // D98 : une version ne vaut que pour une catégorie
}

// Statut du salarié (D39, colonne `statut` du dossier) : il décide de la base de la cotisation
// personnelle (ouvrier : brut majoré de 8 %) et du tableau du bonus à l'emploi.
export type CategorieSalarie = 'EMPLOYE' | 'OUVRIER';
