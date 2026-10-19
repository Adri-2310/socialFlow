import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendResetPasswordEmail } from '@/lib/email';

// D18 : le premier SuperAdmin est créé par script (scripts/create-superadmin.ts),
// jamais avec un mot de passe : le compte est créé sans identifiants et reçoit
// le lien de réinitialisation standard pour le définir (D21 : personne ne fixe
// un mot de passe à la place de son titulaire).

export const BOOTSTRAP_ERROR_MESSAGES = {
  INVALID_EMAIL: 'Adresse email invalide.',
  EMAIL_TAKEN:
    'Cette adresse appartient déjà à un compte qui n’est pas SuperAdmin. Un compte existant n’est jamais promu.',
  SUPER_ADMIN_EXISTS:
    'Un SuperAdmin existe déjà. Les suivants s’invitent depuis la console ; utilisez --force pour en créer un quand même.',
  EMAIL_SEND_FAILED:
    'Le compte est créé mais l’email n’a pas pu être envoyé. Relancez la commande avec la même adresse pour renvoyer le lien.',
} as const;

export type BootstrapErrorCode = keyof typeof BOOTSTRAP_ERROR_MESSAGES;

export class BootstrapError extends Error {
  constructor(readonly code: BootstrapErrorCode) {
    super(BOOTSTRAP_ERROR_MESSAGES[code]);
  }
}

export type BootstrapResult = {
  // created : compte créé, lien envoyé ; resent : compte existant sans mot de
  // passe, lien renvoyé ; unchanged : compte déjà prêt, rien n'est fait.
  status: 'created' | 'resent' | 'unchanged';
  userId: string;
};

const SETUP_PAGE = '/reinitialiser-mot-de-passe';
const LINK_VALIDITY_MS = 60 * 60 * 1000; // 1 h, comme le flux « mot de passe oublié »

// Même format que le flux Better Auth (requestPasswordReset) : la page de
// réinitialisation et /reset-password lisent cette ligne `Verification`.
// L'email est attendu ici (pas en arrière-plan) pour signaler un échec d'envoi.
async function sendSetupLink(userId: string, email: string) {
  const ctx = await auth.$context;
  const token = randomBytes(24).toString('base64url');
  await ctx.internalAdapter.createVerificationValue({
    value: userId,
    identifier: `reset-password:${token}`,
    expiresAt: new Date(Date.now() + LINK_VALIDITY_MS),
  });
  const url = `${ctx.baseURL}/reset-password/${token}?callbackURL=${encodeURIComponent(SETUP_PAGE)}`;
  try {
    await sendResetPasswordEmail(email, url);
  } catch {
    throw new BootstrapError('EMAIL_SEND_FAILED');
  }
}

export async function createSuperAdmin(input: {
  email: string;
  name?: string;
  force?: boolean;
}): Promise<BootstrapResult> {
  const parsed = z.email().safeParse(input.email.trim());
  if (!parsed.success) throw new BootstrapError('INVALID_EMAIL');
  // Better Auth enregistre les adresses en minuscules.
  const email = parsed.data.toLowerCase();

  const existing = await prisma.user.findUnique({
    where: { email },
    include: { accounts: { where: { providerId: 'credential' }, select: { id: true } } },
  });

  if (existing) {
    if (existing.role !== 'SUPER_ADMIN') throw new BootstrapError('EMAIL_TAKEN');
    // Relance : sans mot de passe défini, le lien a pu expirer ou ne jamais partir.
    if (existing.accounts.length > 0) return { status: 'unchanged', userId: existing.id };
    await sendSetupLink(existing.id, email);
    await prisma.auditLog.create({
      data: { action: 'SUPERADMIN_BOOTSTRAPPED', targetUserId: existing.id, metadata: { resent: true } },
    });
    return { status: 'resent', userId: existing.id };
  }

  const force = input.force ?? false;
  if (!force && (await prisma.user.count({ where: { role: 'SUPER_ADMIN' } })) > 0) {
    throw new BootstrapError('SUPER_ADMIN_EXISTS');
  }

  const ctx = await auth.$context;
  const userId = ctx.generateId({ model: 'user' }) || randomUUID();
  // L'adresse est saisie par l'opérateur et le lien prouve l'accès à la boîte :
  // elle est considérée comme vérifiée.
  await prisma.$transaction([
    prisma.user.create({
      data: {
        id: userId,
        email,
        name: input.name?.trim() || 'SuperAdmin',
        emailVerified: true,
        role: 'SUPER_ADMIN',
        cabinetId: null,
      },
    }),
    prisma.auditLog.create({
      data: { action: 'SUPERADMIN_BOOTSTRAPPED', targetUserId: userId, metadata: { force } },
    }),
  ]);

  await sendSetupLink(userId, email);
  return { status: 'created', userId };
}
