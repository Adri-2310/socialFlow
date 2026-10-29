import { z } from 'zod';
import { DIVISEUR_TAUX, STATUTS_BAREME } from '../types';

// D99 : forme des paramètres légaux d'une version de barème. Étape 2 : seulement l'ossature,
// aucune valeur légale. Chaque étape suivante ajoute son bloc (onss, bonusEmploi, precompte…) ;
// un bloc absent fera lever une erreur au calcul, jamais une valeur par défaut.
//
// Zod valide la FORME à la frontière (saisie du SuperAdmin, lecture en base) ; une fois validé,
// le reste du moteur peut se fier aux types sans re-vérifier.

// Montant en centimes : entier positif ou nul (Zod 4 refuse les flottants et les entiers non sûrs).
export const montantCentimesSchema = z.int().min(0);

// Taux en dix-millièmes de pour cent. Plafond à 10 fois 100 % : couvre les coefficients
// (108 % ouvriers, sursalaire 100 %) sans admettre une faute de frappe de plusieurs ordres de grandeur.
export const tauxSchema = z
  .int()
  .min(0)
  .max(10 * DIVISEUR_TAUX);

// Tranche d'un barème progressif : plafond inclus en centimes (null = dernière tranche) et taux.
// Exemple : { jusqua: 1_671_000, taux: 267_500 } = « jusqu'à 16 710 €, 26,75 % ».
export const trancheSchema = z.strictObject({
  jusqua: montantCentimesSchema.nullable(),
  taux: tauxSchema,
});

// D98 : la catégorie est un paramètre, pas une valeur codée en dur dans le calcul.
// Forme imposée : MAJUSCULES, chiffres et tirets bas (ex. PRIVE_MARCHAND).
export const categorieEmployeurSchema = z.string().regex(/^[A-Z][A-Z0-9_]*$/);

// Clés qui décrivent le barème lui-même ; toutes les autres sont des blocs de paramètres
// légaux et doivent citer leur source.
const CLES_METADONNEES = ['version', 'categorieEmployeur'] as const;

// BLOC `onss` (étape 4) : la cotisation personnelle de sécurité sociale du travailleur.
// Source : Instructions administratives ONSS 2026/3, pages 175 (13,07 %) et 176 (base à 108 %).
export const onssSchema = z.strictObject({
  // Part du brut retenue au travailleur. 13,07 % s'écrit 130 700 (100 % = 1 000 000).
  tauxPersonnel: tauxSchema,
  // Majoration de la base des ouvriers (qui reçoivent leur pécule de vacances d'une caisse et
  // non de l'employeur) : 108 % s'écrit 1 080 000. Les employés ont une base à 100 %.
  coefficientOuvrier: tauxSchema,
});
export type ParametresOnss = z.infer<typeof onssSchema>;

// Un VOLET du bonus à l'emploi : un montant de base qui reste plein jusqu'à un premier plafond de
// salaire, puis diminue d'une fraction du salaire en trop, jusqu'à s'annuler au second plafond.
// Exemple (employé, volet B, depuis le 1er septembre 2026) : 171,99 € jusqu'à 2 300,62 €, puis
// 171,99 - 0,2699 x (S - 2 300,62), et 0 € à partir de 2 937,93 €.
export const voletBonusSchema = z
  .strictObject({
    montantMax: montantCentimesSchema, // R quand S <= plafondPlein
    plafondPlein: montantCentimesSchema, // S jusqu'auquel le montant reste plein
    // Réduction par euro de salaire au-dessus de plafondPlein : 0,2699 s'écrit 269 900.
    coefficient: tauxSchema,
    plafondNul: montantCentimesSchema, // S à partir duquel le montant est nul
  })
  .refine((v) => v.plafondNul >= v.plafondPlein, {
    message: 'Le plafond à partir duquel la réduction est nulle précède le plafond plein.',
  });

const voletsBonusSchema = z.strictObject({
  voletA: voletBonusSchema, // volet A : bas salaires
  voletB: voletBonusSchema, // volet B : très bas salaires
});

// BLOC `bonusEmploi` (étape 4). Source : Instructions administratives ONSS 2026/3, pages
// 448 à 453. Les montants des employés (déclarés à 100 %) et des ouvriers (déclarés à 108 %) diffèrent.
export const bonusEmploiSchema = z.strictObject({
  employe: voletsBonusSchema,
  ouvrier: voletsBonusSchema,
  // Plafond du total du bonus par travailleur et par année civile (3 594,36 € depuis le 1er juillet 2026).
  plafondAnnuel: montantCentimesSchema,
});
export type ParametresBonusEmploi = z.infer<typeof bonusEmploiSchema>;

// BLOC `precompte` (étape 5) : précompte professionnel sur les rémunérations mensuelles des
// travailleurs. Source : Annexe III à l'arrêté royal d'exécution du CIR 92 (AR du 11/12/2025,
// revenus payés à partir du 1er janvier 2026), `doc/reference/precompte/annexe-iii-2026.pdf`.
// Chaque champ cite son numéro (n°) dans le commentaire.

// Une tranche du barème, écrite COMME LE DOCUMENT : « impôt fixe + taux sur ce qui dépasse
// `auDela` ». Exemple (n° 31) : au-delà de 16 710 €, 4 469,93 € + 42,80 % de l'excédent.
const trancheBaremeSchema = z.strictObject({
  auDela: montantCentimesSchema,
  impotFixe: montantCentimesSchema,
  taux: tauxSchema,
});

export const precompteSchema = z.strictObject({
  // n° 28 : frais professionnels forfaitaires des travailleurs : 30 %, au maximum 6 070 €
  // (maximum atteint dès 20 233,33 € de base annuelle).
  fraisProfessionnels: z.strictObject({ taux: tauxSchema, maximum: montantCentimesSchema }),
  // n° 31 : barème de base, tranches classées. La première commence à 0 et chaque `auDela`
  // dépasse le précédent.
  bareme: z
    .array(trancheBaremeSchema)
    .min(1)
    .refine((t) => t[0]?.auDela === 0 && t.every((x, i) => i === 0 || x.auDela > t[i - 1].auDela), {
      message: 'Les tranches doivent commencer à 0 et être strictement croissantes.',
    }),
  // n° 32 : impôt sur la quotité du revenu exemptée d'impôt (11 170 €) : 2 987,98 €. Le quotient
  // conjugal (n° 34.2) en retire le DOUBLE (5 975,96 €) ; le moteur le calcule, on ne le stocke pas.
  impotQuotiteExemptee: montantCentimesSchema,
  // n° 34.1.1 : revenu imputé au conjoint sans revenus : 30 % du net, au maximum 13 790 €.
  quotientConjugal: z.strictObject({ taux: tauxSchema, maximum: montantCentimesSchema }),
  // Réductions annuelles de l'impôt de base (n° 38 à 41).
  reductions: z.strictObject({
    // n° 38 : de 1 à 8 enfants à charge (un enfant handicapé compte pour deux, n° 8).
    enfants: z.array(montantCentimesSchema).length(8),
    // n° 38 : par enfant au-delà du huitième.
    parEnfantAuDela8: montantCentimesSchema,
    beneficiaireHandicape: montantCentimesSchema, // n° 39.1
    dependant66: montantCentimesSchema, // n° 39.2 : par personne dépendante de 66 ans ou plus
    autreCharge: montantCentimesSchema, // n° 39.3 : par autre personne à charge
    parentIsole: montantCentimesSchema, // n° 40.1
    conjointRevenuLimite: montantCentimesSchema, // n° 40.2 (revenus <= 290 € nets par mois)
    conjointPensionLimitee: montantCentimesSchema, // n° 40.3 (pensions <= 579 € nets par mois)
    conjointHandicape: montantCentimesSchema, // n° 41
  }),
  // n° 46 : le bonus à l'emploi donne aussi droit à une réduction de précompte : une part du
  // volet A (33,14 %) et une part du volet B (52,54 %) du bonus réellement accordé.
  bonusEmploiFiscal: z.strictObject({ tauxVoletA: tauxSchema, tauxVoletB: tauxSchema }),
});
export type ParametresPrecompte = z.infer<typeof precompteSchema>;

// BLOC `csss` (étape 6) : cotisation spéciale pour la sécurité sociale, retenue au travailleur.
// Source : Instructions administratives ONSS 2026/3, « Les cotisations spéciales > La cotisation
// spéciale pour la sécurité sociale », `doc/reference/onss-csss-2026-3.html` (barèmes en vigueur
// depuis le 1er avril 2022).
//
// Une tranche donne le montant dû POUR UN TRIMESTRE quand la rémunération trimestrielle Q est au
// moins `depuis` : montant = `fixe` + `taux` x (Q - `excedentDe`), ramené entre `plancher` et
// `plafond` quand ils existent. Exemple (isolé, 6 570,55 € et plus) : 30,99 € + 1,10 % de ce qui
// dépasse 6 570,54 €. Les seuils du document (« > 6 570,54 € », « >= 3 285,29 € ») s'écrivent tous
// « Q >= depuis » une fois comptés en centimes, d'où 6 570,55 €.
const trancheCsssSchema = z
  .strictObject({
    depuis: montantCentimesSchema, // Q à partir duquel (inclus) la tranche s'applique
    fixe: montantCentimesSchema,
    excedentDe: montantCentimesSchema, // le taux porte sur Q - excedentDe
    taux: tauxSchema,
    plancher: montantCentimesSchema.optional(),
    plafond: montantCentimesSchema.optional(),
  })
  .refine((t) => t.plancher === undefined || t.plafond === undefined || t.plancher <= t.plafond, {
    message: 'Le plancher dépasse le plafond.',
  });

// Au moins une tranche, seuils strictement croissants. En dessous de la première tranche : 0.
const baremeCsssSchema = z
  .array(trancheCsssSchema)
  .min(1)
  .refine((t) => t.every((x, i) => i === 0 || x.depuis > t[i - 1].depuis), {
    message: 'Les tranches doivent être strictement croissantes.',
  });

export const csssSchema = z.strictObject({
  // Les ouvriers sont pris à 108 % de leur rémunération, comme pour la cotisation personnelle.
  coefficientOuvrier: tauxSchema,
  // Imposition individuelle (isolé).
  individuelle: baremeCsssSchema,
  // Imposition commune : le conjoint a ou n'a pas de revenus professionnels.
  communeConjointRevenus: baremeCsssSchema,
  communeConjointSansRevenus: baremeCsssSchema,
});
export type ParametresCsss = z.infer<typeof csssSchema>;

// `strictObject` refuse toute clé inconnue : une faute de frappe dans un nom de paramètre
// (« onsss ») est une erreur, pas un paramètre ignoré en silence.
// Les blocs légaux sont FACULTATIFS dans la forme (un barème de l'étape 2 n'en a aucun) mais
// OBLIGATOIRES au calcul : `exigerBloc` (bloc.ts) lève une erreur s'il manque, jamais de valeur par défaut.
export const parametresBaremeSchema = z.strictObject({
  // Version de la FORME des paramètres, pour pouvoir la faire évoluer sans casser les anciens barèmes.
  version: z.literal(1),
  categorieEmployeur: categorieEmployeurSchema,
  onss: onssSchema.optional(),
  bonusEmploi: bonusEmploiSchema.optional(),
  precompte: precompteSchema.optional(),
  csss: csssSchema.optional(),
});
export type ParametresBareme = z.infer<typeof parametresBaremeSchema>;

const dateIsoSchema = z.iso.date(); // AAAA-MM-JJ, jour existant (le 30 février est refusé)
const texteSchema = z.string().trim().min(1);

// Source d'un bloc : où la valeur a été lue, pour qu'on puisse toujours la retrouver.
export const sourceBlocSchema = z.strictObject({
  document: texteSchema, // ex. « Annexe III à l'AR/CIR 92 »
  reference: texteSchema, // numéro, article ou page
  versionDocument: texteSchema, // ex. « 2026/3 », « AR du 11/12/2025 »
  consulteLe: dateIsoSchema, // date à laquelle le document a été lu
});
// Une source par bloc de paramètres : { onss: {…}, precompte: {…} }.
export const sourceBaremeSchema = z.record(texteSchema, sourceBlocSchema);
export type SourceBareme = z.infer<typeof sourceBaremeSchema>;

// Une version complète telle qu'on la saisit ou la charge (dates déjà converties en AAAA-MM-JJ).
// Les règles qui lient plusieurs champs entre eux sont vérifiées dans `superRefine`.
export const versionBaremeCompleteSchema = z
  .strictObject({
    code: texteSchema,
    valideDepuis: dateIsoSchema,
    valideJusqua: dateIsoSchema.nullable(),
    statut: z.enum(STATUTS_BAREME),
    categorieEmployeur: categorieEmployeurSchema,
    parametres: parametresBaremeSchema,
    source: sourceBaremeSchema,
  })
  .superRefine((v, ctx) => {
    // Une période de validité ne peut pas finir avant d'avoir commencé.
    if (v.valideJusqua !== null && v.valideJusqua < v.valideDepuis) {
      ctx.addIssue({
        code: 'custom',
        path: ['valideJusqua'],
        message: 'La fin de validité précède le début.',
      });
    }
    // La catégorie existe deux fois (colonne et paramètres) : les deux doivent concorder.
    if (v.parametres.categorieEmployeur !== v.categorieEmployeur) {
      ctx.addIssue({
        code: 'custom',
        path: ['parametres', 'categorieEmployeur'],
        message: 'La catégorie des paramètres diffère de celle de la version.',
      });
    }
    // Règle de traçabilité : un bloc de paramètres sans source est refusé, et inversement.
    const blocs = Object.keys(v.parametres).filter(
      (cle) => !(CLES_METADONNEES as readonly string[]).includes(cle),
    );
    for (const bloc of blocs) {
      if (!(bloc in v.source)) {
        ctx.addIssue({
          code: 'custom',
          path: ['source', bloc],
          message: `Source manquante : ${bloc}.`,
        });
      }
    }
    for (const bloc of Object.keys(v.source)) {
      if (!blocs.includes(bloc)) {
        ctx.addIssue({
          code: 'custom',
          path: ['source', bloc],
          message: `Source sans bloc de paramètres : ${bloc}.`,
        });
      }
    }
  });
export type VersionBaremeComplete = z.infer<typeof versionBaremeCompleteSchema>;
