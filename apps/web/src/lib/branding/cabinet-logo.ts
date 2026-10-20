import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { processPngLogo } from '@/lib/branding/logo-image';
import { getLogoStorage } from '@/lib/branding/logo-storage';
import { validateLogo, type LogoError } from '@/lib/branding/logo-validation';

// Logo du cabinet (D33, D62) : envoi, remplacement et retrait. Le cabinet vient
// toujours de la session. Le fichier est valide sur son contenu, stocke hors
// base, et l'ancien logo est supprime une fois le nouveau enregistre.

export type LogoResult =
  | { ok: true; logoUrl: string | null }
  | { ok: false; error: LogoError | 'CABINET_NOT_FOUND' | 'LOGO_STORAGE_UNAVAILABLE' | 'LOGO_STORAGE_FAILED' };

export async function setCabinetLogo(
  cabinetId: string,
  actorId: string,
  bytes: Uint8Array | null,
): Promise<LogoResult> {
  const validation = validateLogo(bytes);
  if (!validation.ok) return validation;

  const storage = getLogoStorage();
  if (!storage) return { ok: false, error: 'LOGO_STORAGE_UNAVAILABLE' };

  const cabinet = await prisma.cabinet.findFirst({
    where: { id: cabinetId, deletedAt: null },
    select: { logoPath: true },
  });
  if (!cabinet) return { ok: false, error: 'CABINET_NOT_FOUND' };

  // PNG : decode, redimensionne et re-encode (D63). Un fichier qui a la
  // signature PNG mais ne se decode pas est refuse. Le SVG, deja controle,
  // est stocke tel quel.
  let content = bytes as Uint8Array;
  if (validation.kind === 'png') {
    const processed = await processPngLogo(content);
    if (!processed) return { ok: false, error: 'LOGO_INVALID_TYPE' };
    content = processed.bytes;
  }

  // Le nom du fichier ne contient rien venant du client.
  const path = `logos/${cabinetId}/${randomUUID()}.${validation.kind}`;
  let stored;
  try {
    stored = await storage.put(path, content, validation.contentType);
  } catch (error) {
    console.error("Echec de l'enregistrement du logo", error);
    return { ok: false, error: 'LOGO_STORAGE_FAILED' };
  }

  try {
    await prisma.$transaction([
      prisma.cabinet.update({
        where: { id: cabinetId },
        data: { logoUrl: stored.url, logoPath: stored.path },
      }),
      prisma.auditLog.create({
        data: {
          action: 'CABINET_SETTINGS_UPDATED',
          cabinetId,
          actorId,
          metadata: { section: 'branding', fields: ['logo'] },
        },
      }),
    ]);
  } catch (error) {
    // Rien d'enregistre : on ne laisse pas un fichier orphelin.
    await storage.remove(stored.path).catch(() => {});
    throw error;
  }

  // Meilleur effort : un echec ici laisse un fichier orphelin, pas un logo casse.
  if (cabinet.logoPath) {
    await storage.remove(cabinet.logoPath).catch((error) => {
      console.error("Echec de la suppression de l'ancien logo", error);
    });
  }

  return { ok: true, logoUrl: stored.url };
}

export async function removeCabinetLogo(cabinetId: string, actorId: string): Promise<LogoResult> {
  const cabinet = await prisma.cabinet.findFirst({
    where: { id: cabinetId, deletedAt: null },
    select: { logoPath: true },
  });
  if (!cabinet) return { ok: false, error: 'CABINET_NOT_FOUND' };
  if (!cabinet.logoPath) return { ok: true, logoUrl: null };

  await prisma.$transaction([
    prisma.cabinet.update({ where: { id: cabinetId }, data: { logoUrl: null, logoPath: null } }),
    prisma.auditLog.create({
      data: {
        action: 'CABINET_SETTINGS_UPDATED',
        cabinetId,
        actorId,
        metadata: { section: 'branding', fields: ['logo'] },
      },
    }),
  ]);

  const storage = getLogoStorage();
  if (storage) {
    await storage.remove(cabinet.logoPath).catch((error) => {
      console.error('Echec de la suppression du logo', error);
    });
  }

  return { ok: true, logoUrl: null };
}
