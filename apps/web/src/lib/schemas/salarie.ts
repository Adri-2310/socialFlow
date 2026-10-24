import { z } from 'zod';
import { isValidIban, normalizeIban } from '@/lib/salarie/iban';
import { isValidNiss, normalizeNiss } from '@/lib/salarie/niss';
import {
  REVENUS_CONJOINT,
  SITUATIONS_FAMILIALES,
  attributionDesCharges,
  conjointSansRevenusPropres,
  parentIsolePossible,
} from '@/lib/salarie/situation-fiscale';

export { REVENUS_CONJOINT, SITUATIONS_FAMILIALES };

// Schéma du dossier salarié (roles/03 § 4.1), partagé par l'API et le
// formulaire (CONVENTIONS § 5). Montants en centimes entiers.

export const STATUTS = ['EMPLOYE', 'OUVRIER'] as const; // D39
export const TYPES_CONTRAT = ['CDI', 'CDD'] as const;
// D44 : CP 200 (employés) et CP 100 (ouvriers) ; la liste s'allonge ici.
export const COMMISSIONS_PARITAIRES = ['200', '100'] as const;
// D44 : tant qu'il n'y a que ces deux CP, chacune correspond à un statut. À
// assouplir ici le jour où une autre commission est ajoutée.
const COMMISSION_DU_STATUT = { EMPLOYE: '200', OUVRIER: '100' } as const;
export const REGIMES = ['TEMPS_PLEIN', 'TEMPS_PARTIEL'] as const;
// Un cohabitant de fait se saisit comme ISOLE, un cohabitant légal comme marié (Annexe III,
// n° 2 et 4.2 a ; D95). Les listes de la situation fiscale vivent dans salarie/situation-fiscale.ts.

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));
const isoDate = z.iso.date();
const cents = z.number().int().positive().max(100_000_000);

// Ce qui change dans le temps (roles/03 § 4.2) : chaque changement ajoute une
// ligne datée à l'historique, il ne modifie jamais l'ancienne.
const conditionFields = {
  statut: z.enum(STATUTS),
  commissionParitaire: z.enum(COMMISSIONS_PARITAIRES),
  fonction: text(100),

  // Temps de travail : fraction d'occupation = heuresSemaine / heuresReference
  regime: z.enum(REGIMES),
  heuresSemaine: z.number().positive().max(60).optional(),
  heuresReference: z.number().positive().max(60).optional(),

  // Rémunération : mensuelle pour l'employé, horaire pour l'ouvrier
  salaireMensuelBrutCents: cents.optional(),
  salaireHoraireBrutCents: cents.optional(),
};

type ConditionFields = z.infer<z.ZodObject<typeof conditionFields>>;
type Fail = (path: string) => void;

function checkCondition(c: ConditionFields, fail: Fail) {
  if (c.regime === 'TEMPS_PARTIEL') {
    if (!c.heuresSemaine) fail('heuresSemaine');
    if (!c.heuresReference) fail('heuresReference');
    if (c.heuresSemaine && c.heuresReference && c.heuresSemaine > c.heuresReference) {
      fail('heuresSemaine');
    }
  }

  // Employé : salaire mensuel ; ouvrier : salaire horaire. L'autre est refusé
  // pour ne pas stocker deux rémunérations contradictoires.
  if (c.statut === 'EMPLOYE') {
    if (!c.salaireMensuelBrutCents) fail('salaireMensuelBrutCents');
    if (c.salaireHoraireBrutCents) fail('salaireHoraireBrutCents');
  } else {
    if (!c.salaireHoraireBrutCents) fail('salaireHoraireBrutCents');
    if (c.salaireMensuelBrutCents) fail('salaireMensuelBrutCents');
  }

  if (c.commissionParitaire !== COMMISSION_DU_STATUT[c.statut]) fail('commissionParitaire');
}

const issueAdder =
  (ctx: z.RefinementCtx): Fail =>
  (path) =>
    ctx.addIssue({ code: 'custom', message: 'invalid', path: [path] });

// Nouvelle ligne de l'historique : valable à partir de `dateEffet`.
export const conditionTravailSchema = z
  .object({ dateEffet: isoDate, ...conditionFields })
  .superRefine((c, ctx) => checkCondition(c, issueAdder(ctx)));

export type ConditionTravailInput = z.infer<typeof conditionTravailSchema>;

// Identité : commune à la création et à la modification.
const identiteFields = {
  nom: text(100),
  prenom: text(100),
  dateNaissance: isoDate,
  adresse: optionalText(200),
  codePostal: optionalText(10),
  ville: optionalText(100),
  pays: z.string().trim().length(2).toUpperCase().default('BE'),
  email: z.email().max(254).optional(),
};
const nissField = z.string().transform(normalizeNiss).refine(isValidNiss);
const ibanField = z.string().transform(normalizeIban).refine(isValidIban);

const contratFields = {
  typeContrat: z.enum(TYPES_CONTRAT),
  dateEntree: isoDate,
  dateFinContrat: isoDate.optional(),
  dateSortie: isoDate.optional(),
};

// Fiscal (précompte professionnel, D95) : non daté, voir roles/03 § 4.2. Des critères, jamais
// un montant. Les valeurs par défaut (« non », zéro) laissent un célibataire sans charge ne
// rien remplir ; les règles de cohérence sont dans checkFiscal.
const nombre = z.number().int().min(0).max(20).default(0);
const fiscalFields = {
  situationFamiliale: z.enum(SITUATIONS_FAMILIALES),
  conjointRevenus: z.enum(REVENUS_CONJOINT).optional(),
  beneficiaireHandicape: z.boolean().default(false),
  conjointHandicape: z.boolean().default(false),
  enfantsCharge: nombre,
  enfantsHandicapes: nombre,
  autresChargeDependantes66: nombre,
  autresChargeHandicapees: nombre,
  autresCharge: nombre,
  parentIsole: z.boolean().default(false),
  chargesFamilleAttribuees: z.boolean().optional(),
};

type ContratFields = z.infer<z.ZodObject<typeof contratFields>> & { dateNaissance: string };
type FiscalFields = z.infer<z.ZodObject<typeof fiscalFields>>;

function checkContrat(s: ContratFields, fail: Fail) {
  if (s.typeContrat === 'CDD' && !s.dateFinContrat) fail('dateFinContrat');
  if (s.typeContrat === 'CDI' && s.dateFinContrat) fail('dateFinContrat');
  if (s.dateFinContrat && s.dateFinContrat <= s.dateEntree) fail('dateFinContrat');
  if (s.dateSortie && s.dateSortie < s.dateEntree) fail('dateSortie');
  if (s.dateNaissance >= s.dateEntree) fail('dateNaissance');
}

function checkFiscal(s: FiscalFields, fail: Fail) {
  const marie = s.situationFamiliale === 'MARIE_OU_COHABITANT_LEGAL';
  // Un marié précise les revenus de son conjoint ; un isolé n'a pas de conjoint (n° 4).
  if (marie && s.conjointRevenus === undefined) fail('conjointRevenus');
  if (!marie && s.conjointRevenus !== undefined) fail('conjointRevenus');

  // n° 41 : le handicap du conjoint ne se saisit que s'il n'a pas de revenus propres.
  if (s.conjointHandicape && !conjointSansRevenusPropres(s)) fail('conjointHandicape');

  // Les handicapés sont un sous-ensemble des enfants à charge (n° 8).
  if (s.enfantsHandicapes > s.enfantsCharge) fail('enfantsHandicapes');

  // n° 40.1 : réservé à un isolé qui a des enfants à charge.
  if (s.parentIsole && !parentIsolePossible(s)) fail('parentIsole');

  // n° 6 : question sans objet hors du cas décidé dans D95 ; sans réponse, le moteur de
  // paie refusera de calculer plutôt que de choisir.
  if (s.chargesFamilleAttribuees !== undefined && !attributionDesCharges(s)) {
    fail('chargesFamilleAttribuees');
  }
}

export const salarieSchema = z
  .object({
    ...identiteFields,
    niss: nissField,
    iban: ibanField,
    ...contratFields,
    // Conditions de travail initiales : elles deviennent la première ligne de
    // l'historique daté (ConditionTravail), à la date d'entrée.
    ...conditionFields,
    ...fiscalFields,
  })
  .superRefine((s, ctx) => {
    const fail = issueAdder(ctx);
    checkContrat(s, fail);
    checkCondition(s, fail);
    checkFiscal(s, fail);
  });

// Modification d'un dossier (5c) : le formulaire renvoie tout le dossier, un champ facultatif
// absent est effacé. NISS et IBAN ne sont jamais préremplis en clair (le dévoilement est
// journalisé) : absents, ils restent inchangés. Rémunération, régime, fonction et statut ne
// passent pas ici : ils sont datés et se changent par une nouvelle condition de travail.
export const salarieModificationSchema = z
  .object({
    ...identiteFields,
    niss: nissField.optional(),
    iban: ibanField.optional(),
    ...contratFields,
    ...fiscalFields,
  })
  .superRefine((s, ctx) => {
    const fail = issueAdder(ctx);
    checkContrat(s, fail);
    checkFiscal(s, fail);
  });

export type SalarieModificationInput = z.infer<typeof salarieModificationSchema>;

// Enregistrer (date) ou effacer (null) la sortie d'un salarié. Elle a sa propre action : elle
// déclenchera la DIMONA OUT et la dernière fiche (D40, G2), à la différence d'une modification.
export const sortieSchema = z.object({ dateSortie: isoDate.nullable() });

export type SalarieInput = z.infer<typeof salarieSchema>;

// 400 INVALID_<CHAMP> (CONVENTIONS § 3) : `dateFinContrat` → INVALID_DATE_FIN_CONTRAT.
export function fieldCode(field: string): string {
  return `INVALID_${field.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()}`;
}

// Le code du premier champ en erreur.
export function invalidFieldCode(error: z.ZodError): string {
  const field = String(error.issues[0]?.path[0] ?? '');
  return field ? fieldCode(field) : 'INVALID_REQUEST';
}

// Un code par champ en erreur, pour que le formulaire l'affiche au bon endroit.
export function invalidFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? '');
    if (field && !(field in fields)) fields[field] = fieldCode(field);
  }
  return fields;
}
