// @vitest-environment node
import { describe, it, expect, vi, afterAll } from 'vitest';
import { cookieJar, testEmail, TEST_EMAIL_PREFIX } from '../helpers/auth-test-utils';

vi.mock('@/lib/email', () => ({
  sendMagicLinkEmail: vi.fn().mockResolvedValue(undefined),
  sendOTPEmail: vi.fn().mockResolvedValue(undefined),
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendChangeEmailConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  sendResetPasswordEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountDeletedEmail: vi.fn().mockResolvedValue(undefined),
  sendDeleteAccountVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendGestionnaireInvitationEmail: vi.fn().mockResolvedValue(undefined),
  sendEntrepriseInvitationEmail: vi.fn().mockResolvedValue(undefined),
  sendWelcomeAccountEmail: vi.fn().mockResolvedValue(undefined),
  sendGestionnaireAccessChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorEnabledEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorDisabledEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountUnlinkedEmail: vi.fn().mockResolvedValue(undefined),
}));

const { auth } = await import('@/lib/auth');
const { prisma } = await import('@/lib/prisma');
const { POST: createInvitation } = await import('@/app/api/invitations/route');
const { POST: acceptInvitation } = await import('@/app/api/invitations/accept/route');
const { createInvitationToken } = await import('@/lib/invitations');
const { ensureCabinetSlug } = await import('@/lib/cabinet-portal');

const PASSWORD = 'InitialPass123!';
const APP_URL = 'http://localhost:3000';

afterAll(async () => {
  const testUsers = await prisma.user.findMany({
    where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    select: { cabinetId: true },
  });
  const cabinetIds = testUsers.map((u) => u.cabinetId).filter((id): id is string => !!id);
  await prisma.auditLog.deleteMany({ where: { cabinetId: { in: cabinetIds } } });
  await prisma.invitation.deleteMany({ where: { cabinetId: { in: cabinetIds } } });
  await prisma.cabinet.deleteMany({ where: { id: { in: cabinetIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.verification.deleteMany({
    where: { OR: [{ identifier: { contains: TEST_EMAIL_PREFIX } }, { value: { contains: TEST_EMAIL_PREFIX } }] },
  });
});

async function creerCabinetRH(label: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(
    await auth.api.signUpEmail({
      body: { name: 'Cabinet Suspension Test', email: mail, password: PASSWORD },
      asResponse: true,
    }),
  );
  const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  return { cj, user, mail };
}

/** Compte rattache au cabinet donne, avec le role donne (invite fictif). */
async function creerMembre(cabinetId: string, role: string, label: string) {
  const mail = testEmail(label);
  await auth.api.signUpEmail({ body: { name: `Membre ${label}`, email: mail, password: PASSWORD }, asResponse: true });
  const created = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  await prisma.user.update({ where: { id: created.id }, data: { role, cabinetId, emailVerified: true } });
  await prisma.cabinet.delete({ where: { id: created.cabinetId! } });
  return { mail };
}

const suspendre = (cabinetId: string, suspensionType: 'READ_ONLY' | 'BLOCKED' | null) =>
  prisma.cabinet.update({ where: { id: cabinetId }, data: { status: 'suspendu', suspensionType } });

// `portalSlug` : portail du cabinet (D76). Gestionnaires et entreprises ne se
// connectent que par lui ; le titulaire se connecte sans.
const connexion = (mail: string, portalSlug?: string) =>
  auth.api.signInEmail({
    body: { email: mail, password: PASSWORD },
    headers: new Headers(portalSlug ? { 'x-sf-portal': portalSlug } : {}),
    asResponse: true,
  });

function inviter(cj: ReturnType<typeof cookieJar>, address: string) {
  return createInvitation(
    new Request(`${APP_URL}/api/invitations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cj.headers().get('cookie') ?? '' },
      body: JSON.stringify({ email: address }),
    }),
  );
}

describe('suspension manuelle en lecture seule (D71)', () => {
  it('laisse tout le monde se connecter : titulaire, gestionnaire et administrateur d entreprise', async () => {
    const { user, mail } = await creerCabinetRH('susp-ro-login');
    const gestionnaire = await creerMembre(user.cabinetId!, 'GESTIONNAIRE_RH', 'susp-ro-g');
    const entreprise = await creerMembre(user.cabinetId!, 'ENTREPRISE_CLIENTE', 'susp-ro-e');
    await suspendre(user.cabinetId!, 'READ_ONLY');
    const slug = await ensureCabinetSlug(user.cabinetId!);

    expect((await connexion(mail)).status).toBe(200);
    for (const adresse of [gestionnaire.mail, entreprise.mail]) {
      expect((await connexion(adresse, slug)).status).toBe(200);
    }
  });

  it('ne coupe pas la session en cours mais refuse toute ecriture (423)', async () => {
    const { cj, user } = await creerCabinetRH('susp-ro-ecriture');
    await suspendre(user.cabinetId!, 'READ_ONLY');

    const session = await auth.api.getSession({ headers: cj.headers() });
    expect(session?.user.id).toBe(user.id);

    const res = await inviter(cj, testEmail('susp-ro-cible'));
    expect(res.status).toBe(423);
    expect((await res.json()).error).toBe('CABINET_READ_ONLY');
  });

  it('refuse d accueillir un nouveau compte par invitation (423)', async () => {
    const { user } = await creerCabinetRH('susp-ro-invitation');
    const { token, tokenHash } = createInvitationToken();
    const cible = testEmail('susp-ro-invite');
    await prisma.invitation.create({
      data: {
        email: cible,
        role: 'GESTIONNAIRE_RH',
        tokenHash,
        cabinetId: user.cabinetId!,
        invitedById: user.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await suspendre(user.cabinetId!, 'READ_ONLY');

    const res = await acceptInvitation(
      new Request(`${APP_URL}/api/invitations/accept`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, name: 'Invite', password: PASSWORD }),
      }),
    );
    expect(res.status).toBe(423);
    expect(await prisma.user.count({ where: { email: cible } })).toBe(0);
  });

  it('rend tout modifiable des la reactivation', async () => {
    const { cj, user } = await creerCabinetRH('susp-ro-reactive');
    await suspendre(user.cabinetId!, 'READ_ONLY');
    expect((await inviter(cj, testEmail('susp-ro-avant'))).status).toBe(423);

    await prisma.cabinet.update({
      where: { id: user.cabinetId! },
      data: { status: 'actif', suspensionType: null, suspensionReason: null },
    });
    expect((await inviter(cj, testEmail('susp-ro-apres'))).status).toBe(200);
  });
});

describe('suspension avec blocage total (D71)', () => {
  it('refuse la connexion de tous les comptes du cabinet', async () => {
    const { user, mail } = await creerCabinetRH('susp-bl-login');
    const gestionnaire = await creerMembre(user.cabinetId!, 'GESTIONNAIRE_RH', 'susp-bl-g');
    await suspendre(user.cabinetId!, 'BLOCKED');

    for (const adresse of [mail, gestionnaire.mail]) {
      const res = await connexion(adresse);
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('CABINET_SUSPENDED');
    }
  });

  it('traite une suspension sans type (anterieure a D71) comme un blocage total', async () => {
    const { user, mail } = await creerCabinetRH('susp-bl-ancienne');
    await suspendre(user.cabinetId!, null);

    const res = await connexion(mail);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('CABINET_SUSPENDED');
  });
});
