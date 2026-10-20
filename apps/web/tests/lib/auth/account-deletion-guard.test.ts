// @vitest-environment node
import { describe, it, expect, vi, afterAll } from 'vitest';
import { cookieJar, testEmail, TEST_EMAIL_PREFIX } from '../../helpers/auth-test-utils';

vi.mock('@/lib/email/email', () => ({
  sendMagicLinkEmail: vi.fn().mockResolvedValue(undefined),
  sendOTPEmail: vi.fn().mockResolvedValue(undefined),
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendChangeEmailConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  sendResetPasswordEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountDeletedEmail: vi.fn().mockResolvedValue(undefined),
  sendDeleteAccountVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendGestionnaireInvitationEmail: vi.fn().mockResolvedValue(undefined),
  sendGestionnaireAccessChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendPaymentFailedEmail: vi.fn().mockResolvedValue(undefined),
  sendPaymentSuspensionEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorEnabledEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorDisabledEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountUnlinkedEmail: vi.fn().mockResolvedValue(undefined),
}));

const { auth } = await import('@/lib/auth/auth');
const { prisma } = await import('@/lib/prisma');
const email = await import('@/lib/email/email');
const { isSubscriptionBlockingDeletion, accountDeletionBlock, ACCOUNT_DELETION_BLOCKED_CODE } =
  await import('@/lib/auth/account-deletion-guard');
const { translateAuthError } = await import('@/lib/auth/auth-errors');

const PASSWORD = 'InitialPass123!';

afterAll(async () => {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    select: { cabinetId: true },
  });
  const ids = users.map((u) => u.cabinetId).filter((id): id is string => !!id);
  await prisma.auditLog.deleteMany({ where: { cabinetId: { in: ids } } });
  await prisma.cabinet.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.verification.deleteMany({
    where: { OR: [{ identifier: { contains: TEST_EMAIL_PREFIX } }, { value: { contains: TEST_EMAIL_PREFIX } }] },
  });
});

async function titulaire(label: string, billingStatus: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(
    await auth.api.signUpEmail({
      body: { name: 'Titulaire Suppression', email: mail, password: PASSWORD },
      asResponse: true,
    }),
  );
  const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  await prisma.cabinet.update({ where: { id: user.cabinetId! }, data: { billingStatus } });
  return { mail, cj, user };
}

// better-auth leve une APIError quand un hook refuse la requete, meme avec
// asResponse : on ramene les deux cas a { status, code }.
async function attempt(run: () => Promise<Response>) {
  try {
    const res = await run();
    const body = await res.clone().json().catch(() => null);
    return { status: res.status, code: body?.code as string | undefined };
  } catch (error) {
    const e = error as { statusCode?: number; body?: { code?: string } };
    return { status: e.statusCode ?? 0, code: e.body?.code };
  }
}

const requestDeletion = (cj: ReturnType<typeof cookieJar>) =>
  attempt(() =>
    auth.api.deleteUser({ body: { password: PASSWORD }, headers: cj.headers(), asResponse: true }),
  );

describe('isSubscriptionBlockingDeletion (D67)', () => {
  it.each(['ESSAI', 'ACTIF', 'DELAI_GRACE', 'IMPAYE'])('%s : abonnement en cours, suppression refusee', (status) => {
    expect(isSubscriptionBlockingDeletion(status)).toBe(true);
  });

  it.each(['RESILIE', 'EN_ATTENTE_PAIEMENT'])('%s : rien a resilier, suppression permise', (status) => {
    expect(isSubscriptionBlockingDeletion(status)).toBe(false);
  });

  it('un statut inconnu est traite comme en attente de paiement', () => {
    expect(isSubscriptionBlockingDeletion('???')).toBe(false);
    expect(isSubscriptionBlockingDeletion(null)).toBe(false);
  });
});

describe('suppression du compte du titulaire (D67)', () => {
  it('refuse la demande tant que l abonnement court, sans envoyer d email', async () => {
    const { cj } = await titulaire('del-actif', 'ACTIF');
    vi.mocked(email.sendDeleteAccountVerificationEmail).mockClear();

    const res = await requestDeletion(cj);

    expect(res.status).toBe(403);
    expect(res.code).toBe(ACCOUNT_DELETION_BLOCKED_CODE);
    expect(email.sendDeleteAccountVerificationEmail).not.toHaveBeenCalled();
  });

  it.each(['ESSAI', 'DELAI_GRACE', 'IMPAYE'])('refuse aussi en %s', async (status) => {
    const { cj } = await titulaire(`del-${status.toLowerCase()}`, status);

    const res = await requestDeletion(cj);

    expect(res.status).toBe(403);
  });

  it('refuse meme quand une resiliation est seulement programmee (l abonnement court encore)', async () => {
    const { cj, user } = await titulaire('del-programmee', 'ACTIF');
    await prisma.cabinet.update({ where: { id: user.cabinetId! }, data: { cancelAtPeriodEnd: true } });

    const res = await requestDeletion(cj);

    expect(res.status).toBe(403);
  });

  it('permet la suppression une fois l abonnement resilie', async () => {
    const { cj, mail } = await titulaire('del-resilie', 'RESILIE');
    vi.mocked(email.sendDeleteAccountVerificationEmail).mockClear();

    const res = await requestDeletion(cj);

    expect(res.status).toBe(200);
    expect(email.sendDeleteAccountVerificationEmail).toHaveBeenCalledWith(
      mail,
      'Titulaire Suppression',
      expect.any(String),
    );
  });

  it('refuse a la confirmation si l abonnement a demarre entre la demande et le clic', async () => {
    const { cj, user, mail } = await titulaire('del-entre-deux', 'RESILIE');
    await auth.api.deleteUser({ body: { password: PASSWORD }, headers: cj.headers(), asResponse: true });
    const verification = await prisma.verification.findFirstOrThrow({
      where: { value: user.id, identifier: { startsWith: 'delete-account-' } },
      orderBy: { createdAt: 'desc' },
    });
    const token = verification.identifier.replace('delete-account-', '');
    // Le cabinet reprend un abonnement avant de cliquer.
    await prisma.cabinet.update({ where: { id: user.cabinetId! }, data: { billingStatus: 'ACTIF' } });

    const callback = await attempt(() =>
      auth.api.deleteUserCallback({ query: { token }, headers: cj.headers(), asResponse: true }),
    );

    expect(callback.status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: mail } })).deletedAt).toBeNull();
  });

  it('ne concerne pas les gestionnaires : ils peuvent supprimer leur propre compte', async () => {
    const { cj, user } = await titulaire('del-gestionnaire', 'ACTIF');
    await prisma.user.update({ where: { id: user.id }, data: { role: 'GESTIONNAIRE_RH' } });

    expect(await accountDeletionBlock(user.id)).toBeNull();
    const res = await requestDeletion(cj);
    expect(res.status).toBe(200);
  });

  it('accountDeletionBlock : titulaire bloque en ACTIF, libre en RESILIE', async () => {
    const actif = await titulaire('del-guard-actif', 'ACTIF');
    const resilie = await titulaire('del-guard-resilie', 'RESILIE');

    expect(await accountDeletionBlock(actif.user.id)).toBe(ACCOUNT_DELETION_BLOCKED_CODE);
    expect(await accountDeletionBlock(resilie.user.id)).toBeNull();
    expect(await accountDeletionBlock('inconnu')).toBeNull();
  });

  it('le message affiche renvoie vers Mon abonnement', () => {
    expect(translateAuthError(ACCOUNT_DELETION_BLOCKED_CODE)).toContain('Mon abonnement');
  });
});
