import { prisma } from '@/lib/prisma';
import { TEMPLATES, type TemplateType } from '@/lib/email-templates';

// Modeles d'emails d'un cabinet (D30, D68) : lecture, enregistrement et retour
// au modele par defaut. Le cabinet vient de la session ; la validation du
// contenu (variables, longueurs) est faite en amont par validateTemplate.

export type CabinetEmailTemplate = {
  type: TemplateType;
  subject: string;
  body: string;
  // true = modele personnalise par le cabinet ; false = modele par defaut.
  custom: boolean;
};

export async function getEmailTemplate(
  cabinetId: string,
  type: TemplateType,
): Promise<CabinetEmailTemplate> {
  const row = await prisma.emailTemplate.findUnique({
    where: { cabinetId_type: { cabinetId, type } },
    select: { subject: true, body: true },
  });
  return row
    ? { type, subject: row.subject, body: row.body, custom: true }
    : { type, ...TEMPLATES[type].defaults, custom: false };
}

// Seulement le modele personnalise (null = utiliser celui par defaut) : ce que
// recoit la fonction d'envoi.
export async function getCustomTemplate(
  cabinetId: string,
  type: TemplateType,
): Promise<{ subject: string; body: string } | null> {
  const row = await prisma.emailTemplate.findUnique({
    where: { cabinetId_type: { cabinetId, type } },
    select: { subject: true, body: true },
  });
  return row;
}

export async function listEmailTemplates(cabinetId: string): Promise<CabinetEmailTemplate[]> {
  const types = Object.keys(TEMPLATES) as TemplateType[];
  return Promise.all(types.map((type) => getEmailTemplate(cabinetId, type)));
}

export type SaveTemplateResult =
  | { ok: true; changed: boolean }
  | { ok: false; error: 'CABINET_NOT_FOUND' };

// Enregistre le modele ; l'audit ne consigne que le type, jamais le contenu,
// dans la meme transaction (CONVENTIONS.md § 3). Rien n'est ecrit si le
// contenu est identique.
export async function saveEmailTemplate(
  cabinetId: string,
  actorId: string,
  type: TemplateType,
  input: { subject: string; body: string },
): Promise<SaveTemplateResult> {
  return prisma.$transaction(async (tx) => {
    const cabinet = await tx.cabinet.findFirst({
      where: { id: cabinetId, deletedAt: null },
      select: { id: true },
    });
    if (!cabinet) return { ok: false as const, error: 'CABINET_NOT_FOUND' as const };

    const current = await tx.emailTemplate.findUnique({
      where: { cabinetId_type: { cabinetId, type } },
      select: { subject: true, body: true },
    });
    if (current && current.subject === input.subject && current.body === input.body) {
      return { ok: true as const, changed: false };
    }

    await tx.emailTemplate.upsert({
      where: { cabinetId_type: { cabinetId, type } },
      create: { cabinetId, type, subject: input.subject, body: input.body, updatedById: actorId },
      update: { subject: input.subject, body: input.body, updatedById: actorId },
    });
    await tx.auditLog.create({
      data: {
        action: 'CABINET_SETTINGS_UPDATED',
        cabinetId,
        actorId,
        metadata: { section: 'email_template', type },
      },
    });
    return { ok: true as const, changed: true };
  });
}

// Retour au modele par defaut : supprime le modele personnalise.
export async function resetEmailTemplate(
  cabinetId: string,
  actorId: string,
  type: TemplateType,
): Promise<{ ok: true; changed: boolean }> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.emailTemplate.deleteMany({ where: { cabinetId, type } });
    if (count === 0) return { ok: true as const, changed: false };

    await tx.auditLog.create({
      data: {
        action: 'CABINET_SETTINGS_UPDATED',
        cabinetId,
        actorId,
        metadata: { section: 'email_template', type, reset: true },
      },
    });
    return { ok: true as const, changed: true };
  });
}
