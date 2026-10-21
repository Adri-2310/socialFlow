import { entrepriseWhere, type Scope } from '@/lib/authz/authz';
import { encryptField, lookupHash } from '@/lib/crypto/field-encryption';
import { prisma } from '@/lib/prisma';
import type { SalarieInput } from '@/lib/schemas/salarie';

// Écritures sur les dossiers salariés (D6, roles/03 § 4). Même principe que les
// lectures (salarie-data.ts) : le périmètre arrive en paramètre et est revérifié dans
// la transaction, pour qu'une assignation retirée entre-temps coupe aussi l'écriture.

export type SalarieError = { error: 'ENTREPRISE_NOT_FOUND' } | { error: 'NISS_ALREADY_USED' };

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
  );
}

// Dates ISO (AAAA-MM-JJ) → minuit UTC, lues telles quelles par les colonnes DATE.
const toDate = (iso: string) => new Date(iso);

// Crée le dossier, sa première condition de travail (à la date d'entrée) et l'audit,
// en une seule transaction. NISS et IBAN sont chiffrés ; `nissHash` ne sert qu'à
// l'unicité du NISS par entreprise (archivés compris : on restaure, on ne recrée pas).
export async function createSalarie(
  scope: Scope,
  actorId: string,
  entrepriseId: string,
  input: SalarieInput,
): Promise<{ ok: true; id: string } | ({ ok: false } & SalarieError)> {
  if (scope.kind !== 'entreprises') return { ok: false, error: 'ENTREPRISE_NOT_FOUND' };

  try {
    return await prisma.$transaction(async (tx) => {
      const entreprise = await tx.entreprise.findFirst({
        where: { AND: [entrepriseWhere(scope), { id: entrepriseId, deletedAt: null }] },
        select: { id: true },
      });
      if (!entreprise) return { ok: false as const, error: 'ENTREPRISE_NOT_FOUND' as const };

      const salarie = await tx.salarie.create({
        data: {
          cabinetId: scope.cabinetId,
          entrepriseId: entreprise.id,
          nom: input.nom,
          prenom: input.prenom,
          dateNaissance: toDate(input.dateNaissance),
          adresse: input.adresse,
          codePostal: input.codePostal,
          ville: input.ville,
          pays: input.pays,
          email: input.email,
          nissEncrypted: encryptField(input.niss),
          nissHash: lookupHash(entreprise.id, input.niss),
          ibanEncrypted: encryptField(input.iban),
          typeContrat: input.typeContrat,
          dateEntree: toDate(input.dateEntree),
          dateFinContrat: input.dateFinContrat ? toDate(input.dateFinContrat) : null,
          situationFamiliale: input.situationFamiliale,
          conjointAvecRevenus: input.conjointAvecRevenus ?? null,
          personnesCharge: input.personnesCharge,
        },
        select: { id: true },
      });

      // Première ligne de l'historique daté : valable dès l'entrée (roles/03 § 4.2).
      await tx.conditionTravail.create({
        data: {
          cabinetId: scope.cabinetId,
          salarieId: salarie.id,
          dateEffet: toDate(input.dateEntree),
          statut: input.statut,
          commissionParitaire: input.commissionParitaire,
          fonction: input.fonction,
          regime: input.regime,
          heuresSemaine: input.heuresSemaine,
          heuresReference: input.heuresReference,
          salaireMensuelBrutCents: input.salaireMensuelBrutCents,
          salaireHoraireBrutCents: input.salaireHoraireBrutCents,
          createdById: actorId,
        },
      });

      // D8, D26 : le journal est lu par le SuperAdmin et le Cabinet RH, qui ne voient
      // jamais un dossier. Des identifiants seulement : ni nom, ni NISS, ni montant.
      await tx.auditLog.create({
        data: {
          action: 'SALARIE_CREATED',
          cabinetId: scope.cabinetId,
          actorId,
          metadata: { salarieId: salarie.id, entrepriseId: entreprise.id },
        },
      });

      return { ok: true as const, id: salarie.id };
    });
  } catch (error) {
    // La seule contrainte d'unicité qui peut sauter ici est (entrepriseId, nissHash).
    if (isUniqueViolation(error)) return { ok: false, error: 'NISS_ALREADY_USED' };
    throw error;
  }
}
