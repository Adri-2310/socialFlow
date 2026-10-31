import { prisma } from '@/lib/prisma';
import { peutActiverBareme } from '@/lib/payroll/bareme/activation';
import { versionBaremeCompleteSchema } from '@/lib/payroll/bareme/schema';
import type { VersionAvecParametres } from '@/lib/payroll/fiche';
import type { ParametresBareme } from '@/lib/payroll/bareme/schema';

// Activation d'une version de barème (modules/paie.md § 5, D22, D119, D122).
//
// Le moteur (`lib/payroll`) reste pur : c'est ici, hors du moteur, que l'on lit la base, que l'on appelle
// `peutActiverBareme` et que l'on écrit le statut. Le tout se fait dans UNE transaction Serializable avec
// l'audit `BAREME_ACTIVATED` (« audit dans la même transaction que l'action ») : deux activations
// simultanées ne peuvent pas laisser deux versions actives sur la même période.
// L'audit ne contient aucune donnée de paie (D8) : le code de la version, la dérogation et son motif.

export class ErreurActivationBareme extends Error {
  constructor(
    readonly code: 'VERSION_INTROUVABLE' | 'SUPERADMIN_INTROUVABLE' | 'ACTIVATION_REFUSEE' | 'ENTREE_INVALIDE',
    message: string,
    readonly raisons: string[] = [],
  ) {
    super(message);
  }
}

export interface DemandeActivation {
  code: string;
  parEmail: string;
  // D122 : si présent, active sans cas de référence (jamais en cas d'échec d'un cas). Motif obligatoire.
  derogationMotif?: string;
  // Vérifie tout, n'écrit rien.
  essai?: boolean;
}

export interface ResultatActivationBareme {
  code: string;
  active: boolean; // faux en essai
  sansCasReference: boolean;
}

// Les dates `@db.Date` reviennent en Date UTC à minuit : on ne garde que AAAA-MM-JJ.
const jour = (d: Date): string => d.toISOString().slice(0, 10);

export async function activerBareme(demande: DemandeActivation): Promise<ResultatActivationBareme> {
  const motif = demande.derogationMotif?.trim() ?? '';
  if (demande.derogationMotif !== undefined && motif === '') {
    throw new ErreurActivationBareme('ENTREE_INVALIDE', 'Le motif de la dérogation ne peut pas être vide.');
  }

  return prisma.$transaction(
    async (tx) => {
      const ligne = await tx.baremeVersion.findUnique({ where: { code: demande.code } });
      if (!ligne) {
        throw new ErreurActivationBareme('VERSION_INTROUVABLE', `Version inconnue : ${demande.code}.`);
      }

      // Seul un SuperAdmin active un barème (l'acteur est tracé dans `activeParId` et l'audit).
      const acteur = await tx.user.findFirst({
        where: { email: demande.parEmail, role: 'SUPER_ADMIN' },
        select: { id: true },
      });
      if (!acteur) {
        throw new ErreurActivationBareme(
          'SUPERADMIN_INTROUVABLE',
          `Aucun SuperAdmin avec l'adresse ${demande.parEmail}.`,
        );
      }

      // On revalide la ligne avec le même schéma que les fichiers JSON : une ligne abîmée est refusée.
      const lue = versionBaremeCompleteSchema.safeParse({
        code: ligne.code,
        valideDepuis: jour(ligne.valideDepuis),
        valideJusqua: ligne.valideJusqua ? jour(ligne.valideJusqua) : null,
        statut: ligne.statut,
        categorieEmployeur: ligne.categorieEmployeur,
        parametres: ligne.parametres,
        source: ligne.source,
      });
      if (!lue.success) {
        throw new ErreurActivationBareme(
          'ACTIVATION_REFUSEE',
          'La version enregistrée ne respecte pas le schéma des barèmes.',
          lue.error.issues.slice(0, 5).map((i) => `${i.path.join('.')} : ${i.message}`),
        );
      }

      // Les autres versions de la même catégorie : seules les ACTIF comptent pour le chevauchement.
      const autres = await tx.baremeVersion.findMany({
        where: { categorieEmployeur: ligne.categorieEmployeur, id: { not: ligne.id } },
      });
      const autresVersions: VersionAvecParametres[] = autres.map((v) => ({
        code: v.code,
        valideDepuis: jour(v.valideDepuis),
        valideJusqua: v.valideJusqua ? jour(v.valideJusqua) : null,
        statut: v.statut as VersionAvecParametres['statut'],
        categorieEmployeur: v.categorieEmployeur,
        // Le contenu n'est utilisé que pour calculer une fiche : ici seules les dates et le statut comptent.
        parametres: v.parametres as unknown as ParametresBareme,
      }));

      const verdict = peutActiverBareme(lue.data, autresVersions, undefined, {
        derogationSansCasReference: motif !== '',
      });
      if (!verdict.ok) {
        throw new ErreurActivationBareme(
          'ACTIVATION_REFUSEE',
          `La version ${ligne.code} ne peut pas être activée.`,
          verdict.raisons,
        );
      }
      const sansCasReference = verdict.sansCasReference === true;

      if (demande.essai) {
        return { code: ligne.code, active: false, sansCasReference };
      }

      await tx.baremeVersion.update({
        where: { id: ligne.id },
        data: {
          statut: 'ACTIF',
          activeParId: acteur.id,
          activeLe: new Date(),
          // Le motif n'est gardé que si la dérogation a réellement servi.
          derogationMotif: sansCasReference ? motif : null,
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'BAREME_ACTIVATED',
          actorId: acteur.id,
          metadata: {
            code: ligne.code,
            derogation: sansCasReference,
            ...(sansCasReference ? { motif } : {}),
          },
        },
      });
      return { code: ligne.code, active: true, sansCasReference };
    },
    { isolationLevel: 'Serializable' },
  );
}
