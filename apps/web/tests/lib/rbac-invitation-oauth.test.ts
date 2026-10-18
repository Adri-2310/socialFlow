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
  sendGestionnaireAccessChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorEnabledEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorDisabledEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountUnlinkedEmail: vi.fn().mockResolvedValue(undefined),
}));

const { auth } = await import('@/lib/auth');
const { prisma } = await import('@/lib/prisma');
const { POST: acceptOAuth } = await import('@/app/api/invitations/accept/oauth/route');
const { createInvitationToken } = await import('@/lib/invitations');

const PASSWORD = 'InitialPass123!';
const APP_URL = 'http://localhost:3000';

afterAll(async () => {
  const testUsers = await prisma.user.findMany({
    where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    select: { cabinetId: true },
  });
  const cabinetIds = testUsers.map((u) => u.cabinetId).filter((id): id is string => !!id);
  await prisma.auditLog.deleteMany({ where: { cabinetId: { in: cabinetIds } } });
  await prisma.cabinet.deleteMany({ where: { id: { in: cabinetIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.invitation.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.verification.deleteMany({
    where: { OR: [{ identifier: { contains: TEST_EMAIL_PREFIX } }, { value: { contains: TEST_EMAIL_PREFIX } }] },
  });
});

type Jar = ReturnType<typeof cookieJar>;

async function creerCabinetRH(label: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(
    await auth.api.signUpEmail({ body: { name: 'Cabinet OAuth Test', email: mail, password: PASSWORD }, asResponse: true }),
  );
  const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  return { cj, user };
}

/**
 * Compte tel que le laisse une connexion Google/Microsoft toute neuve : adresse
 * verifiee par le fournisseur, role par defaut, aucun cabinet.
 */
async function compteOAuth(label: string, options: { verified?: boolean } = {}) {
  const { cj, user } = await creerCabinetRH(label);
  const phantom = user.cabinetId!;
  await prisma.user.update({
    where: { id: user.id },
    data: { cabinetId: null, emailVerified: options.verified ?? true },
  });
  await prisma.cabinet.delete({ where: { id: phantom } });
  return { cj, user: await prisma.user.findUniqueOrThrow({ where: { id: user.id } }) };
}

/** Invitation en attente vers `email`, dans le cabinet de `titulaire`. */
async function inviter(
  titulaire: { id: string; cabinetId: string | null },
  address: string,
  extra: { role?: string; entrepriseId?: string } = {},
) {
  const { token, tokenHash } = createInvitationToken();
  const invitation = await prisma.invitation.create({
    data: {
      email: address,
      role: extra.role ?? 'GESTIONNAIRE_RH',
      tokenHash,
      cabinetId: titulaire.cabinetId!,
      invitedById: titulaire.id,
      entrepriseId: extra.entrepriseId ?? null,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  return { token, invitation };
}

function accepter(token: string, cj?: Jar) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return acceptOAuth(
    new Request(`${APP_URL}/api/invitations/accept/oauth`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ token }),
    }),
  );
}

describe('acceptation d une invitation par Google ou Microsoft (C4)', () => {
  it('refuse sans session (401)', async () => {
    const { user } = await creerCabinetRH('oauth-sans-session');
    const { token } = await inviter(user, testEmail('oauth-sans-session-cible'));
    expect((await accepter(token)).status).toBe(401);
  });

  it('rattache le compte au cabinet avec le role de l invitation et journalise', async () => {
    const { user: titulaire } = await creerCabinetRH('oauth-ok');
    const { cj, user } = await compteOAuth('oauth-ok-cible');
    const { token, invitation } = await inviter(titulaire, user.email);

    const res = await accepter(token, cj);
    expect(res.status).toBe(200);

    const apres = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(apres.role).toBe('GESTIONNAIRE_RH');
    expect(apres.cabinetId).toBe(titulaire.cabinetId);
    expect(apres.emailVerified).toBe(true);
    const lue = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(lue.status).toBe('accepted');
    expect(lue.acceptedAt).not.toBeNull();

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { cabinetId: titulaire.cabinetId!, action: 'INVITATION_ACCEPTED', actorId: user.id },
    });
    expect(audit.metadata).toMatchObject({ invitationId: invitation.id, email: user.email });
  });

  it('devient l administrateur de l entreprise pour une invitation ENTREPRISE_CLIENTE (D5)', async () => {
    const { user: titulaire } = await creerCabinetRH('oauth-ent');
    const entreprise = await prisma.entreprise.create({
      data: { cabinetId: titulaire.cabinetId!, name: 'Garage Pirard', vatNumber: 'BE0999.888.777' },
    });
    const { cj, user } = await compteOAuth('oauth-ent-cible');
    const { token } = await inviter(titulaire, user.email, {
      role: 'ENTREPRISE_CLIENTE',
      entrepriseId: entreprise.id,
    });

    expect((await accepter(token, cj)).status).toBe(200);

    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe('ENTREPRISE_CLIENTE');
    expect((await prisma.entreprise.findUniqueOrThrow({ where: { id: entreprise.id } })).adminUserId).toBe(user.id);
  });

  it('refuse une adresse differente de celle de l invitation ou non verifiee (403)', async () => {
    const { user: titulaire } = await creerCabinetRH('oauth-mismatch');

    const { cj, user } = await compteOAuth('oauth-mismatch-autre');
    const { token } = await inviter(titulaire, testEmail('oauth-mismatch-invite'));
    const different = await accepter(token, cj);
    expect(different.status).toBe(403);
    expect((await different.json()).error).toBe('EMAIL_MISMATCH');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).cabinetId).toBeNull();

    const { cj: cjNonVerifie, user: nonVerifie } = await compteOAuth('oauth-non-verifie', { verified: false });
    const { token: token2 } = await inviter(titulaire, nonVerifie.email);
    expect((await accepter(token2, cjNonVerifie)).status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: nonVerifie.id } })).cabinetId).toBeNull();
  });

  it('refuse un compte deja rattache a un cabinet : pas de detournement (D7, 409)', async () => {
    const { user: titulaire } = await creerCabinetRH('oauth-detourne-a');
    // Un autre titulaire, deja rattache a SON cabinet, ne peut pas rejoindre celui-ci.
    const { cj, user: autreTitulaire } = await creerCabinetRH('oauth-detourne-b');
    await prisma.user.update({ where: { id: autreTitulaire.id }, data: { emailVerified: true } });
    const { token } = await inviter(titulaire, autreTitulaire.email);

    const res = await accepter(token, cj);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('ACCOUNT_NOT_ELIGIBLE');
    const inchange = await prisma.user.findUniqueOrThrow({ where: { id: autreTitulaire.id } });
    expect(inchange.cabinetId).toBe(autreTitulaire.cabinetId);
    expect(inchange.role).toBe('CABINET_RH');
  });

  it('refuse un lien invente, deja utilise ou expire (404)', async () => {
    const { user: titulaire } = await creerCabinetRH('oauth-lien');
    const { cj, user } = await compteOAuth('oauth-lien-cible');
    expect((await accepter('jeton-invente', cj)).status).toBe(404);

    const { token, invitation } = await inviter(titulaire, user.email);
    await prisma.invitation.update({ where: { id: invitation.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await accepter(token, cj)).status).toBe(404);

    const { token: valide } = await inviter(titulaire, user.email);
    expect((await accepter(valide, cj)).status).toBe(200);
    // Le meme lien rejoue : plus valable.
    expect((await accepter(valide, cj)).status).toBe(404);
  });

  it('refuse quand le cabinet est en lecture seule (423)', async () => {
    const { user: titulaire } = await creerCabinetRH('oauth-lecture');
    await prisma.cabinet.update({ where: { id: titulaire.cabinetId! }, data: { billingStatus: 'IMPAYE' } });
    const { cj, user } = await compteOAuth('oauth-lecture-cible');
    const { token } = await inviter(titulaire, user.email);

    const res = await accepter(token, cj);
    expect(res.status).toBe(423);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).cabinetId).toBeNull();
  });
});
