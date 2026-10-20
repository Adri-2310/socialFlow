import { prisma } from '@/lib/prisma';
import type { CabinetBranding } from '@/lib/branding/branding-rules';

// Branding du cabinet (D30, D33, D35, D62) : lecture et ecriture. Les regles
// (validation, contraste, theme) sont dans branding-rules.ts, pur. Le cabinet
// vient toujours de la session.

const SELECT = { displayName: true, primaryColor: true, secondaryColor: true } as const;

// Le logo est gere a part (lib/branding/cabinet-logo.ts) : il n'est ni lu ni ecrit ici.

export async function getCabinetBranding(cabinetId: string): Promise<CabinetBranding> {
  return prisma.cabinet.findUniqueOrThrow({ where: { id: cabinetId }, select: SELECT });
}

export type UpdateBrandingResult =
  | { ok: true; changed: string[]; branding: CabinetBranding }
  | { ok: false; error: 'CABINET_NOT_FOUND' };

// Met a jour le branding et journalise les champs modifies (jamais leurs
// valeurs) dans la meme transaction. Rien n'est ecrit si rien ne change.
export async function updateCabinetBranding(
  cabinetId: string,
  actorId: string,
  input: CabinetBranding,
): Promise<UpdateBrandingResult> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.cabinet.findFirst({
      where: { id: cabinetId, deletedAt: null },
      select: SELECT,
    });
    if (!current) return { ok: false as const, error: 'CABINET_NOT_FOUND' as const };

    const fields = ['displayName', 'primaryColor', 'secondaryColor'] as const;
    const changed = fields.filter((field) => current[field] !== input[field]);
    if (changed.length === 0) return { ok: true as const, changed: [], branding: current };

    const branding = await tx.cabinet.update({
      where: { id: cabinetId },
      data: {
        displayName: input.displayName,
        primaryColor: input.primaryColor,
        secondaryColor: input.secondaryColor,
      },
      select: SELECT,
    });

    await tx.auditLog.create({
      data: {
        action: 'CABINET_SETTINGS_UPDATED',
        cabinetId,
        actorId,
        metadata: { section: 'branding', fields: changed },
      },
    });

    return { ok: true as const, changed: [...changed], branding };
  });
}
