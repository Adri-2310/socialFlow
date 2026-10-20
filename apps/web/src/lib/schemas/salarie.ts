import { z } from 'zod';
import { isValidIban, normalizeIban } from '@/lib/salarie/iban';
import { isValidNiss, normalizeNiss } from '@/lib/salarie/niss';

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
// Un cohabitant de fait se saisit comme ISOLE, un cohabitant légal comme marié
// (précompte professionnel). [à vérifier sur l'Annexe III du SPF Finances]
export const SITUATIONS_FAMILIALES = ['ISOLE', 'MARIE_OU_COHABITANT_LEGAL'] as const;

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

export const salarieSchema = z
  .object({
    // Identité
    nom: text(100),
    prenom: text(100),
    niss: z.string().transform(normalizeNiss).refine(isValidNiss),
    dateNaissance: isoDate,
    adresse: optionalText(200),
    codePostal: optionalText(10),
    ville: optionalText(100),
    pays: z.string().trim().length(2).toUpperCase().default('BE'),
    email: z.email().max(254).optional(),
    iban: z.string().transform(normalizeIban).refine(isValidIban),

    // Contrat
    statut: z.enum(STATUTS),
    typeContrat: z.enum(TYPES_CONTRAT),
    dateEntree: isoDate,
    dateFinContrat: isoDate.optional(),
    dateSortie: isoDate.optional(),
    commissionParitaire: z.enum(COMMISSIONS_PARITAIRES),
    fonction: text(100),

    // Temps de travail : fraction d'occupation = heuresSemaine / heuresReference
    regime: z.enum(REGIMES),
    heuresSemaine: z.number().positive().max(60).optional(),
    heuresReference: z.number().positive().max(60).optional(),

    // Rémunération : mensuelle pour l'employé, horaire pour l'ouvrier
    salaireMensuelBrutCents: cents.optional(),
    salaireHoraireBrutCents: cents.optional(),

    // Fiscal (précompte professionnel)
    situationFamiliale: z.enum(SITUATIONS_FAMILIALES),
    conjointAvecRevenus: z.boolean().optional(),
    personnesCharge: z.number().int().min(0).max(20),
  })
  .superRefine((s, ctx) => {
    const fail = (path: string) =>
      ctx.addIssue({ code: 'custom', message: 'invalid', path: [path] });

    if (s.typeContrat === 'CDD' && !s.dateFinContrat) fail('dateFinContrat');
    if (s.typeContrat === 'CDI' && s.dateFinContrat) fail('dateFinContrat');
    if (s.dateFinContrat && s.dateFinContrat <= s.dateEntree) fail('dateFinContrat');
    if (s.dateSortie && s.dateSortie < s.dateEntree) fail('dateSortie');
    if (s.dateNaissance >= s.dateEntree) fail('dateNaissance');

    if (s.regime === 'TEMPS_PARTIEL') {
      if (!s.heuresSemaine) fail('heuresSemaine');
      if (!s.heuresReference) fail('heuresReference');
      if (s.heuresSemaine && s.heuresReference && s.heuresSemaine > s.heuresReference) {
        fail('heuresSemaine');
      }
    }

    // Employé : salaire mensuel ; ouvrier : salaire horaire. L'autre est refusé
    // pour ne pas stocker deux rémunérations contradictoires.
    if (s.statut === 'EMPLOYE') {
      if (!s.salaireMensuelBrutCents) fail('salaireMensuelBrutCents');
      if (s.salaireHoraireBrutCents) fail('salaireHoraireBrutCents');
    } else {
      if (!s.salaireHoraireBrutCents) fail('salaireHoraireBrutCents');
      if (s.salaireMensuelBrutCents) fail('salaireMensuelBrutCents');
    }

    if (s.commissionParitaire !== COMMISSION_DU_STATUT[s.statut]) fail('commissionParitaire');

    if (
      s.situationFamiliale === 'MARIE_OU_COHABITANT_LEGAL' &&
      s.conjointAvecRevenus === undefined
    ) {
      fail('conjointAvecRevenus');
    }
    if (s.situationFamiliale === 'ISOLE' && s.conjointAvecRevenus !== undefined) {
      fail('conjointAvecRevenus');
    }
  });

export type SalarieInput = z.infer<typeof salarieSchema>;

// 400 INVALID_<CHAMP> (CONVENTIONS § 3) : le code du premier champ en erreur,
// par exemple `dateFinContrat` → INVALID_DATE_FIN_CONTRAT.
export function invalidFieldCode(error: z.ZodError): string {
  const field = String(error.issues[0]?.path[0] ?? '');
  if (!field) return 'INVALID_REQUEST';
  return `INVALID_${field.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()}`;
}
