import { prisma } from '@/lib/prisma';
import {
  RESERVED_SLUGS,
  SLUG_MAX,
  SLUG_MIN,
  isValidSlug,
  slugify,
} from '@/lib/portal-slug';

// Portail de connexion du cabinet (D76) : acces donnees. Les regles pures (roles,
// identifiant, adresses) sont dans portal-slug.ts. Le cabinet vient toujours de la
// session pour toute ecriture ; l'identifiant, lui, est public.

export * from '@/lib/portal-slug';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

// Identifiant du portail du cabinet, cree a la premiere demande a partir de son
// nom affiche (puis suffixe -2, -3… s'il est pris). Un cabinet existant avant
// D76 n'en a pas : il l'obtient ici, sans migration de donnees.
export async function ensureCabinetSlug(cabinetId: string): Promise<string> {
  const cabinet = await prisma.cabinet.findUniqueOrThrow({
    where: { id: cabinetId },
    select: { slug: true, displayName: true, name: true },
  });
  if (cabinet.slug) return cabinet.slug;

  let base = slugify(cabinet.displayName?.trim() || cabinet.name);
  if (base.length < SLUG_MIN || RESERVED_SLUGS.has(base)) base = `cabinet-${base}`.replace(/-+$/g, '');
  if (!isValidSlug(base)) base = 'cabinet';

  // Les identifiants deja pris qui commencent par la base : un seul aller-retour,
  // puis le premier suffixe libre (-2, -3...), au lieu d'un essai par suffixe.
  const taken = new Set(
    (
      await prisma.cabinet.findMany({
        where: { slug: { startsWith: base.slice(0, SLUG_MAX - 6) } },
        select: { slug: true },
      })
    ).map((row) => row.slug),
  );
  const next = (from: number) => {
    for (let n = from; ; n += 1) {
      const suffix = n === 1 ? '' : `-${n}`;
      const candidate = `${base.slice(0, SLUG_MAX - suffix.length)}${suffix}`;
      if (!taken.has(candidate)) return { candidate, n };
    }
  };

  let from = 1;
  // Quelques reprises seulement : un conflit reel (deux cabinets simultanes) est rare.
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const { candidate, n } = next(from);
    try {
      // Pose seulement si le cabinet n'en a toujours pas : deux demandes
      // simultanees ne l'ecrasent pas.
      const { count } = await prisma.cabinet.updateMany({
        where: { id: cabinetId, slug: null },
        data: { slug: candidate },
      });
      if (count > 0) return candidate;
      const current = await prisma.cabinet.findUniqueOrThrow({
        where: { id: cabinetId },
        select: { slug: true },
      });
      if (current.slug) return current.slug;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Pris entre-temps par un autre cabinet : on passe au suffixe suivant.
      taken.add(candidate);
      from = n;
    }
  }
  throw new Error("Impossible de generer un identifiant de portail");
}

export type PortalCabinet = {
  id: string;
  name: string;
  brandName: string;
  primaryColor: string | null;
  secondaryColor: string | null;
  logoUrl: string | null;
};

// Cabinet d'un portail, ou null si l'identifiant est inconnu ou le cabinet
// archive. Page publique : on ne revele rien d'autre que son identite visuelle.
export async function getPortalCabinet(slug: string): Promise<PortalCabinet | null> {
  if (!isValidSlug(slug)) return null;
  const cabinet = await prisma.cabinet.findFirst({
    where: { slug, deletedAt: null },
    select: {
      id: true,
      name: true,
      displayName: true,
      primaryColor: true,
      secondaryColor: true,
      logoUrl: true,
    },
  });
  if (!cabinet) return null;
  return {
    id: cabinet.id,
    name: cabinet.name,
    brandName: cabinet.displayName?.trim() || cabinet.name,
    primaryColor: cabinet.primaryColor,
    secondaryColor: cabinet.secondaryColor,
    logoUrl: cabinet.logoUrl,
  };
}

// Cabinet (id) d'un identifiant de portail, ou null.
export async function cabinetIdForSlug(slug: string): Promise<string | null> {
  if (!isValidSlug(slug)) return null;
  const cabinet = await prisma.cabinet.findFirst({
    where: { slug, deletedAt: null },
    select: { id: true },
  });
  return cabinet?.id ?? null;
}

export type SlugResult =
  | { ok: true; slug: string; changed: boolean }
  | { ok: false; error: 'INVALID_SLUG' | 'SLUG_TAKEN' | 'CABINET_NOT_FOUND' };

// Le Cabinet RH choisit l'identifiant de son portail. Les liens deja envoyes avec
// l'ancien identifiant cessent de fonctionner : c'est dit dans l'interface. L'audit
// ne consigne que le fait, jamais d'autre donnee.
export async function updateCabinetSlug(
  cabinetId: string,
  actorId: string,
  rawSlug: string,
): Promise<SlugResult> {
  const slug = slugify(rawSlug);
  if (!isValidSlug(slug)) return { ok: false, error: 'INVALID_SLUG' };

  try {
    return await prisma.$transaction(async (tx) => {
      const cabinet = await tx.cabinet.findFirst({
        where: { id: cabinetId, deletedAt: null },
        select: { slug: true },
      });
      if (!cabinet) return { ok: false as const, error: 'CABINET_NOT_FOUND' as const };
      if (cabinet.slug === slug) return { ok: true as const, slug, changed: false };

      await tx.cabinet.update({ where: { id: cabinetId }, data: { slug } });
      await tx.auditLog.create({
        data: {
          action: 'CABINET_SETTINGS_UPDATED',
          cabinetId,
          actorId,
          metadata: { section: 'portal' },
        },
      });
      return { ok: true as const, slug, changed: true };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: 'SLUG_TAKEN' };
    throw error;
  }
}
