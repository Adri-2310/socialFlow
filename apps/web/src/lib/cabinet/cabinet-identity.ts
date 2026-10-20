import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { DEFAULT_COUNTRY, isCountryCode } from '@/lib/countries';

// Identite du cabinet (D30, roles/02-cabinet-rh.md § 4.4) : raison sociale,
// n° de TVA, adresse et contact, affiches a ses clients. Le cabinet vient
// toujours de la session, jamais de la requete.

// --- Validation pure --------------------------------------------------------

// N° d'entreprise belge : 10 chiffres, le premier est 0 ou 1, et les deux
// derniers sont 97 - (les 8 premiers modulo 97). Format canonique affiche :
// BE0XXX.XXX.XXX (le meme que celui des entreprises clientes, § 4.3).
export function normalizeVatNumber(input: string): string | null {
  const digits = input.replace(/^\s*BE/i, '').replace(/[\s.\-]/g, '');
  if (!/^[01]\d{9}$/.test(digits)) return null;

  const base = Number(digits.slice(0, 8));
  const check = Number(digits.slice(8));
  if (97 - (base % 97) !== check) return null;

  return `BE${digits.slice(0, 4)}.${digits.slice(4, 7)}.${digits.slice(7)}`;
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

export const IDENTITY_FIELDS = [
  'name',
  'vatNumber',
  'addressLine',
  'postalCode',
  'city',
  'country',
  'contactEmail',
  'contactPhone',
] as const;

export type IdentityField = (typeof IDENTITY_FIELDS)[number];

export type CabinetIdentity = {
  name: string;
  vatNumber: string | null;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  contactEmail: string | null;
  contactPhone: string | null;
};

export const identitySchema = z.object({
  name: z.string().trim().min(2, 'NAME_REQUIRED').max(120, 'NAME_TOO_LONG'),
  vatNumber: z
    .string()
    .trim()
    .max(30)
    .nullable()
    .optional()
    .transform((value, ctx) => {
      if (!value) return null;
      const normalized = normalizeVatNumber(value);
      if (!normalized) {
        ctx.addIssue({ code: 'custom', message: 'INVALID_VAT' });
        return z.NEVER;
      }
      return normalized;
    }),
  addressLine: optionalText(120),
  postalCode: optionalText(12),
  city: optionalText(80),
  // Code pays ISO 3166-1 alpha-2, choisi dans la liste deroulante : le
  // serveur refuse tout code qui n'y figure pas.
  country: z
    .string()
    .trim()
    .toUpperCase()
    .refine(isCountryCode, 'INVALID_COUNTRY')
    .default(DEFAULT_COUNTRY),
  contactEmail: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .nullable()
    .optional()
    .transform((value, ctx) => {
      if (!value) return null;
      if (!z.email().safeParse(value).success) {
        ctx.addIssue({ code: 'custom', message: 'INVALID_EMAIL' });
        return z.NEVER;
      }
      return value;
    }),
  contactPhone: z
    .string()
    .trim()
    .max(25)
    .nullable()
    .optional()
    .transform((value, ctx) => {
      if (!value) return null;
      // Chiffres, +, espaces, points, tirets et parentheses ; 6 chiffres minimum.
      if (!/^\+?[\d\s.\-()]+$/.test(value) || value.replace(/\D/g, '').length < 6) {
        ctx.addIssue({ code: 'custom', message: 'INVALID_PHONE' });
        return z.NEVER;
      }
      return value;
    }),
});

// --- Lecture / ecriture -----------------------------------------------------

export async function getCabinetIdentity(cabinetId: string): Promise<CabinetIdentity> {
  const cabinet = await prisma.cabinet.findUniqueOrThrow({
    where: { id: cabinetId },
    select: {
      name: true,
      vatNumber: true,
      addressLine: true,
      postalCode: true,
      city: true,
      country: true,
      contactEmail: true,
      contactPhone: true,
    },
  });
  return cabinet;
}

export type UpdateIdentityResult =
  | { ok: true; changed: IdentityField[]; identity: CabinetIdentity }
  | { ok: false; error: 'CABINET_NOT_FOUND' };

// Met a jour l'identite et journalise les champs modifies (jamais leurs
// valeurs) dans la meme transaction (CONVENTIONS.md § 3). Aucune ecriture ni
// audit quand rien ne change.
export async function updateCabinetIdentity(
  cabinetId: string,
  actorId: string,
  input: CabinetIdentity,
): Promise<UpdateIdentityResult> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.cabinet.findFirst({
      where: { id: cabinetId, deletedAt: null },
      select: {
        name: true,
        vatNumber: true,
        addressLine: true,
        postalCode: true,
        city: true,
        country: true,
        contactEmail: true,
        contactPhone: true,
      },
    });
    if (!current) return { ok: false as const, error: 'CABINET_NOT_FOUND' as const };

    const changed = IDENTITY_FIELDS.filter((field) => current[field] !== input[field]);
    if (changed.length === 0) return { ok: true as const, changed, identity: current };

    const identity = await tx.cabinet.update({
      where: { id: cabinetId },
      data: {
        name: input.name,
        vatNumber: input.vatNumber,
        addressLine: input.addressLine,
        postalCode: input.postalCode,
        city: input.city,
        country: input.country,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
      },
      select: {
        name: true,
        vatNumber: true,
        addressLine: true,
        postalCode: true,
        city: true,
        country: true,
        contactEmail: true,
        contactPhone: true,
      },
    });

    await tx.auditLog.create({
      data: {
        action: 'CABINET_SETTINGS_UPDATED',
        cabinetId,
        actorId,
        metadata: { section: 'identity', fields: changed },
      },
    });

    return { ok: true as const, changed, identity };
  });
}
