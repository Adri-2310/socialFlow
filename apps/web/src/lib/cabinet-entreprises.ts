import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { identitySchema, normalizeVatNumber } from '@/lib/cabinet-identity';
import { getCabinetPlanQuotas, isQuotaReached } from '@/lib/cabinet-quotas';

// Portefeuille d'entreprises clientes d'un cabinet (D4, D27,
// roles/02-cabinet-rh.md § 4.3). Le cabinet vient toujours de la session,
// jamais de la requete : toutes les requetes filtrent dessus, et une
// entreprise d'un autre cabinet est "introuvable".

// --- Validation pure --------------------------------------------------------

export const ENTREPRISE_NAME_MAX = 120;

export const entrepriseSchema = identitySchema
  .pick({
    addressLine: true,
    postalCode: true,
    city: true,
    country: true,
    contactEmail: true,
    contactPhone: true,
  })
  .extend({
    name: z.string().trim().min(2, 'NAME_REQUIRED').max(ENTREPRISE_NAME_MAX, 'NAME_TOO_LONG'),
    // Obligatoire ici (contrairement a l'identite du cabinet) : c'est la cle
    // d'unicite de l'entreprise dans le cabinet.
    vatNumber: z
      .string()
      .trim()
      .min(1, 'VAT_REQUIRED')
      .max(30, 'INVALID_VAT')
      .transform((value, ctx) => {
        const normalized = normalizeVatNumber(value);
        if (!normalized) {
          ctx.addIssue({ code: 'custom', message: 'INVALID_VAT' });
          return z.NEVER;
        }
        return normalized;
      }),
    // D4 : au moins un gestionnaire assigne.
    gestionnaireIds: z
      .array(z.string().min(1).max(64))
      .min(1, 'GESTIONNAIRE_REQUIRED')
      .max(200)
      .transform((ids) => [...new Set(ids)]),
  })
  // Un champ absent vaut "vide" (null) : la comparaison avec la base et
  // l'ecriture restent coherentes, sans prendre un champ omis pour un champ
  // modifie.
  .transform((value) => ({
    ...value,
    addressLine: value.addressLine ?? null,
    postalCode: value.postalCode ?? null,
    city: value.city ?? null,
    contactEmail: value.contactEmail ?? null,
    contactPhone: value.contactPhone ?? null,
  }));

export type EntrepriseInput = z.output<typeof entrepriseSchema>;

const FIELDS = [
  'name',
  'vatNumber',
  'addressLine',
  'postalCode',
  'city',
  'country',
  'contactEmail',
  'contactPhone',
] as const;

type EntrepriseField = (typeof FIELDS)[number];

// --- Lecture ------------------------------------------------------------------

export type EntrepriseRow = {
  id: string;
  name: string;
  vatNumber: string;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: Date;
  gestionnaires: { id: string; name: string; status: 'actif' | 'suspendu' }[];
  // D27 : couverte = au moins un gestionnaire ACTIF assigne.
  covered: boolean;
};

export type ArchivedEntrepriseRow = { id: string; name: string; vatNumber: string; deletedAt: Date };

const ENTREPRISE_SELECT = {
  id: true,
  name: true,
  vatNumber: true,
  addressLine: true,
  postalCode: true,
  city: true,
  country: true,
  contactEmail: true,
  contactPhone: true,
  createdAt: true,
  gestionnaires: {
    where: { user: { deletedAt: null } },
    select: { user: { select: { id: true, name: true, status: true } } },
  },
} as const;

export async function getEntreprises(cabinetId: string): Promise<EntrepriseRow[]> {
  const rows = await prisma.entreprise.findMany({
    where: { cabinetId, deletedAt: null },
    orderBy: { name: 'asc' },
    select: ENTREPRISE_SELECT,
  });

  return rows.map(({ gestionnaires, ...row }) => {
    const assigned = gestionnaires
      .map(({ user }) => ({
        id: user.id,
        name: user.name,
        status: user.status === 'suspendu' ? ('suspendu' as const) : ('actif' as const),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    return { ...row, gestionnaires: assigned, covered: assigned.some((g) => g.status === 'actif') };
  });
}

export async function getArchivedEntreprises(cabinetId: string): Promise<ArchivedEntrepriseRow[]> {
  const rows = await prisma.entreprise.findMany({
    where: { cabinetId, deletedAt: { not: null } },
    orderBy: { deletedAt: 'desc' },
    select: { id: true, name: true, vatNumber: true, deletedAt: true },
  });
  return rows.map((row) => ({ ...row, deletedAt: row.deletedAt as Date }));
}

export async function countActiveEntreprises(cabinetId: string): Promise<number> {
  return prisma.entreprise.count({ where: { cabinetId, deletedAt: null } });
}

// D27 : entreprises qui n'auraient plus aucun gestionnaire actif si `userId`
// cessait de l'etre (suspension, retrait). Vide = on peut le desactiver.
export async function getUncoveredEntreprises(
  cabinetId: string,
  userId: string,
): Promise<{ id: string; name: string }[]> {
  return prisma.entreprise.findMany({
    where: {
      cabinetId,
      deletedAt: null,
      gestionnaires: { some: { userId } },
      NOT: {
        gestionnaires: {
          some: { userId: { not: userId }, user: { status: 'actif', deletedAt: null } },
        },
      },
    },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
}

// --- Ecriture -----------------------------------------------------------------

export type EntrepriseError =
  | { error: 'ENTREPRISE_NOT_FOUND' }
  | { error: 'VAT_ALREADY_USED' }
  | { error: 'GESTIONNAIRE_INVALID' }
  | { error: 'NO_ACTIVE_GESTIONNAIRE' }
  | { error: 'QUOTA_EXCEEDED'; limit: number; used: number }
  | { error: 'ALREADY_ARCHIVED' }
  | { error: 'NOT_ARCHIVED' };

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Verrouille la ligne du cabinet pour la duree de la transaction : deux
// creations simultanees ne peuvent pas franchir ensemble le quota.
async function lockCabinet(tx: Tx, cabinetId: string) {
  await tx.$queryRaw`SELECT id FROM cabinet WHERE id = ${cabinetId} FOR UPDATE`;
}

async function quotaError(tx: Tx, cabinetId: string): Promise<EntrepriseError | null> {
  const limits = await getCabinetPlanQuotas(cabinetId);
  if (!limits || limits.maxEntreprises === null) return null;
  const used = await tx.entreprise.count({ where: { cabinetId, deletedAt: null } });
  return isQuotaReached(used, limits.maxEntreprises)
    ? { error: 'QUOTA_EXCEEDED', limit: limits.maxEntreprises, used }
    : null;
}

// Les gestionnaires assignes doivent etre de CE cabinet (jamais d'un autre),
// non archives, et au moins un doit etre actif (D4, D27).
async function checkGestionnaires(
  tx: Tx,
  cabinetId: string,
  ids: string[],
): Promise<EntrepriseError | null> {
  const found = await tx.user.findMany({
    where: { id: { in: ids }, cabinetId, role: 'GESTIONNAIRE_RH', deletedAt: null },
    select: { status: true },
  });
  if (found.length !== ids.length) return { error: 'GESTIONNAIRE_INVALID' };
  if (!found.some((g) => g.status === 'actif')) return { error: 'NO_ACTIVE_GESTIONNAIRE' };
  return null;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

export async function createEntreprise(
  cabinetId: string,
  actorId: string,
  input: EntrepriseInput,
): Promise<{ ok: true; id: string } | ({ ok: false } & EntrepriseError)> {
  try {
    return await prisma.$transaction(async (tx) => {
      await lockCabinet(tx, cabinetId);

      const quota = await quotaError(tx, cabinetId);
      if (quota) return { ok: false as const, ...quota };
      const invalid = await checkGestionnaires(tx, cabinetId, input.gestionnaireIds);
      if (invalid) return { ok: false as const, ...invalid };

      const { gestionnaireIds, ...data } = input;
      const created = await tx.entreprise.create({
        data: {
          ...data,
          cabinetId,
          gestionnaires: { create: gestionnaireIds.map((userId) => ({ userId })) },
        },
        select: { id: true },
      });

      await tx.auditLog.create({
        data: {
          action: 'ENTREPRISE_CREATED',
          cabinetId,
          actorId,
          metadata: { entrepriseId: created.id, entreprise: input.name },
        },
      });
      return { ok: true as const, id: created.id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: 'VAT_ALREADY_USED' };
    throw error;
  }
}

export async function updateEntreprise(
  cabinetId: string,
  actorId: string,
  id: string,
  input: EntrepriseInput,
): Promise<{ ok: true; changed: (EntrepriseField | 'gestionnaires')[] } | ({ ok: false } & EntrepriseError)> {
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.entreprise.findFirst({
        where: { id, cabinetId, deletedAt: null },
        select: {
          name: true,
          vatNumber: true,
          addressLine: true,
          postalCode: true,
          city: true,
          country: true,
          contactEmail: true,
          contactPhone: true,
          gestionnaires: { select: { userId: true } },
        },
      });
      if (!current) return { ok: false as const, error: 'ENTREPRISE_NOT_FOUND' as const };

      const invalid = await checkGestionnaires(tx, cabinetId, input.gestionnaireIds);
      if (invalid) return { ok: false as const, ...invalid };

      const before = new Set(current.gestionnaires.map((g) => g.userId));
      const after = new Set(input.gestionnaireIds);
      const added = [...after].filter((userId) => !before.has(userId));
      const removed = [...before].filter((userId) => !after.has(userId));

      const changed: (EntrepriseField | 'gestionnaires')[] = FIELDS.filter(
        (field) => current[field] !== input[field],
      );
      if (added.length > 0 || removed.length > 0) changed.push('gestionnaires');
      if (changed.length === 0) return { ok: true as const, changed };

      const { gestionnaireIds, ...data } = input;
      void gestionnaireIds;
      await tx.entreprise.update({ where: { id }, data });
      if (removed.length > 0) {
        await tx.gestionnaireEntreprise.deleteMany({
          where: { entrepriseId: id, userId: { in: removed } },
        });
      }
      if (added.length > 0) {
        await tx.gestionnaireEntreprise.createMany({
          data: added.map((userId) => ({ entrepriseId: id, userId })),
          skipDuplicates: true,
        });
      }

      // Noms de champs et identifiants seulement, jamais les valeurs saisies.
      await tx.auditLog.create({
        data: {
          action: 'ENTREPRISE_UPDATED',
          cabinetId,
          actorId,
          metadata: {
            entrepriseId: id,
            entreprise: input.name,
            fields: changed,
            assigned: added,
            unassigned: removed,
          },
        },
      });
      return { ok: true as const, changed };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: 'VAT_ALREADY_USED' };
    throw error;
  }
}

// Archivage (soft-delete) : l'entreprise sort du quota (liberee), ses
// assignations sont conservees pour une restauration.
export async function archiveEntreprise(
  cabinetId: string,
  actorId: string,
  id: string,
): Promise<{ ok: true } | ({ ok: false } & EntrepriseError)> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.entreprise.findFirst({
      where: { id, cabinetId },
      select: { name: true, deletedAt: true },
    });
    if (!current) return { ok: false as const, error: 'ENTREPRISE_NOT_FOUND' as const };
    if (current.deletedAt) return { ok: false as const, error: 'ALREADY_ARCHIVED' as const };

    await tx.entreprise.update({ where: { id }, data: { deletedAt: new Date() } });
    await tx.auditLog.create({
      data: {
        action: 'ENTREPRISE_ARCHIVED',
        cabinetId,
        actorId,
        metadata: { entrepriseId: id, entreprise: current.name },
      },
    });
    return { ok: true as const };
  });
}

// Restaurer reprend une place du quota : entre l'archivage et la restauration,
// le cabinet a pu en creer d'autres.
export async function restoreEntreprise(
  cabinetId: string,
  actorId: string,
  id: string,
): Promise<{ ok: true } | ({ ok: false } & EntrepriseError)> {
  return prisma.$transaction(async (tx) => {
    await lockCabinet(tx, cabinetId);

    const current = await tx.entreprise.findFirst({
      where: { id, cabinetId },
      select: { name: true, deletedAt: true },
    });
    if (!current) return { ok: false as const, error: 'ENTREPRISE_NOT_FOUND' as const };
    if (!current.deletedAt) return { ok: false as const, error: 'NOT_ARCHIVED' as const };

    const quota = await quotaError(tx, cabinetId);
    if (quota) return { ok: false as const, ...quota };

    await tx.entreprise.update({ where: { id }, data: { deletedAt: null } });
    await tx.auditLog.create({
      data: {
        action: 'ENTREPRISE_RESTORED',
        cabinetId,
        actorId,
        metadata: { entrepriseId: id, entreprise: current.name },
      },
    });
    return { ok: true as const };
  });
}
