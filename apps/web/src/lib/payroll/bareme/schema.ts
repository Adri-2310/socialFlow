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

// `strictObject` refuse toute clé inconnue : une faute de frappe dans un nom de paramètre
// (« onsss ») est une erreur, pas un paramètre ignoré en silence.
export const parametresBaremeSchema = z.strictObject({
  // Version de la FORME des paramètres, pour pouvoir la faire évoluer sans casser les anciens barèmes.
  version: z.literal(1),
  categorieEmployeur: categorieEmployeurSchema,
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
