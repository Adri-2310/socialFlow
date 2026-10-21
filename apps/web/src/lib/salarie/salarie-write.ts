import { entrepriseWhere, type Scope } from '@/lib/authz/authz';
import { decryptField, encryptField, lookupHash } from '@/lib/crypto/field-encryption';
import { prisma } from '@/lib/prisma';
import type { SalarieInput, SalarieModificationInput } from '@/lib/schemas/salarie';

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

export type SalarieUpdateError =
  | { error: 'SALARIE_NOT_FOUND' }
  | { error: 'NISS_ALREADY_USED' }
  | { error: 'DATE_ENTREE_CONFLICT' };

const isoDay = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

// Modifie identité, contrat et situation fiscale. Seuls les champs qui changent sont
// écrits, et l'audit ne nomme que ces champs (jamais leurs valeurs, D8 et D26). Une
// demande qui ne change rien n'écrit rien et ne laisse aucune trace.
//
// Les conditions de travail (statut, fonction, régime, rémunération) ne passent pas ici :
// elles sont datées. La date d'entrée, elle, ancre la première ligne de l'historique : si on
// la corrige, cette ligne la suit ; refusé si une autre condition se retrouvait avant. Quand
// les fiches existeront (G2), cette règle devra aussi protéger les mois déjà payés.
export async function updateSalarie(
  scope: Scope,
  actorId: string,
  salarieId: string,
  input: SalarieModificationInput,
): Promise<{ ok: true; changed: string[] } | ({ ok: false } & SalarieUpdateError)> {
  if (scope.kind !== 'entreprises') return { ok: false, error: 'SALARIE_NOT_FOUND' };

  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.salarie.findFirst({
        where: {
          id: salarieId,
          cabinetId: scope.cabinetId,
          deletedAt: null,
          entreprise: { AND: [entrepriseWhere(scope), { deletedAt: null }] },
        },
        include: { conditions: { select: { id: true, dateEffet: true } } },
      });
      if (!current) return { ok: false as const, error: 'SALARIE_NOT_FOUND' as const };

      const data: Record<string, unknown> = {};
      const changed: string[] = [];
      const set = (field: string, value: unknown, differs: boolean) => {
        if (!differs) return;
        data[field] = value;
        changed.push(field);
      };

      set('nom', input.nom, input.nom !== current.nom);
      set('prenom', input.prenom, input.prenom !== current.prenom);
      set(
        'dateNaissance',
        toDate(input.dateNaissance),
        isoDay(current.dateNaissance) !== input.dateNaissance,
      );
      set('adresse', input.adresse ?? null, (input.adresse ?? null) !== current.adresse);
      set(
        'codePostal',
        input.codePostal ?? null,
        (input.codePostal ?? null) !== current.codePostal,
      );
      set('ville', input.ville ?? null, (input.ville ?? null) !== current.ville);
      set('pays', input.pays, input.pays !== current.pays);
      set('email', input.email ?? null, (input.email ?? null) !== current.email);
      set('typeContrat', input.typeContrat, input.typeContrat !== current.typeContrat);
      set(
        'dateFinContrat',
        input.dateFinContrat ? toDate(input.dateFinContrat) : null,
        isoDay(current.dateFinContrat) !== (input.dateFinContrat ?? null),
      );
      set(
        'situationFamiliale',
        input.situationFamiliale,
        input.situationFamiliale !== current.situationFamiliale,
      );
      set(
        'conjointAvecRevenus',
        input.conjointAvecRevenus ?? null,
        (input.conjointAvecRevenus ?? null) !== current.conjointAvecRevenus,
      );
      set(
        'personnesCharge',
        input.personnesCharge,
        input.personnesCharge !== current.personnesCharge,
      );

      // NISS : comparé par son empreinte, sans déchiffrer. Un NISS retapé à l'identique ne
      // compte pas comme un changement (et ne se heurte pas à sa propre unicité).
      if (input.niss) {
        const nissHash = lookupHash(current.entrepriseId, input.niss);
        if (nissHash !== current.nissHash) {
          data.nissEncrypted = encryptField(input.niss);
          data.nissHash = nissHash;
          changed.push('niss');
        }
      }

      if (input.iban) {
        let identique = false;
        try {
          identique = decryptField(current.ibanEncrypted) === input.iban;
        } catch {
          // Valeur illisible : on la remplace.
        }
        if (!identique) {
          data.ibanEncrypted = encryptField(input.iban);
          changed.push('iban');
        }
      }

      if (isoDay(current.dateEntree) !== input.dateEntree) {
        const sortie = isoDay(current.dateSortie);
        if (sortie && input.dateEntree > sortie) {
          return { ok: false as const, error: 'DATE_ENTREE_CONFLICT' as const };
        }
        // La première ligne de l'historique suit l'entrée ; toutes les autres doivent rester
        // strictement après (une même date serait refusée par l'unicité).
        const premiere = current.conditions.find(
          (c) => isoDay(c.dateEffet) === isoDay(current.dateEntree),
        );
        const autres = current.conditions.filter((c) => c.id !== premiere?.id);
        if (autres.some((c) => (isoDay(c.dateEffet) as string) <= input.dateEntree)) {
          return { ok: false as const, error: 'DATE_ENTREE_CONFLICT' as const };
        }
        if (premiere) {
          await tx.conditionTravail.update({
            where: { id: premiere.id },
            data: { dateEffet: toDate(input.dateEntree) },
          });
        }
        data.dateEntree = toDate(input.dateEntree);
        changed.push('dateEntree');
      }

      if (changed.length === 0) return { ok: true as const, changed };

      await tx.salarie.update({ where: { id: current.id }, data });
      await tx.auditLog.create({
        data: {
          action: 'SALARIE_UPDATED',
          cabinetId: scope.cabinetId,
          actorId,
          // Noms de champs seulement, jamais les valeurs.
          metadata: { salarieId: current.id, entrepriseId: current.entrepriseId, fields: changed },
        },
      });

      return { ok: true as const, changed };
    });
  } catch (error) {
    // La seule contrainte d'unicité qui peut sauter ici est (entrepriseId, nissHash).
    if (isUniqueViolation(error)) return { ok: false, error: 'NISS_ALREADY_USED' };
    throw error;
  }
}
