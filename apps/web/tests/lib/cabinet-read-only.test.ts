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
  sendWelcomeAccountEmail: vi.fn().mockResolvedValue(undefined),
  sendGestionnaireAccessChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendPaymentFailedEmail: vi.fn().mockResolvedValue(undefined),
  sendPaymentSuspensionEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorEnabledEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorDisabledEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountUnlinkedEmail: vi.fn().mockResolvedValue(undefined),
}));

const { auth } = await import('@/lib/auth');
const { prisma } = await import('@/lib/prisma');
const { POST: createInvitation } = await import('@/app/api/invitations/route');
const { POST: acceptInvitation } = await import('@/app/api/invitations/accept/route');
const { POST: resendInvitation } = await import('@/app/api/invitations/[id]/resend/route');
const { DELETE: revokeInvitation } = await import('@/app/api/invitations/[id]/route');
const {
  PATCH: patchGestionnaire,
  DELETE: deleteGestionnaire,
  PUT: restoreGestionnaire,
} = await import('@/app/api/gestionnaires/[id]/route');
const { POST: changeEmail } = await import('@/app/api/gestionnaires/[id]/email/route');

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
      body: { name: 'Cabinet Lecture Seule', email: mail, password: PASSWORD },
      asResponse: true,
    }),
  );
  const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  return { cj, user };
}

/** Gestionnaire rattache au cabinet donne (compte reel, sans session utile ici). */
async function creerGestionnaire(cabinetId: string, label: string) {
  const mail = testEmail(label);
  await auth.api.signUpEmail({
    body: { name: 'Gestionnaire Test', email: mail, password: PASSWORD },
    asResponse: true,
  });
  const created = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  const phantom = created.cabinetId!;
  await prisma.user.update({
    where: { id: created.id },
    data: { role: 'GESTIONNAIRE_RH', cabinetId },
  });
  await prisma.cabinet.delete({ where: { id: phantom } });
  return prisma.user.findUniqueOrThrow({ where: { id: created.id } });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function req(method: string, url: string, cj?: ReturnType<typeof cookieJar>, body?: unknown) {
  const headers: Record<string, string> = {};
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function setBilling(cabinetId: string, billingStatus: string) {
  await prisma.cabinet.update({ where: { id: cabinetId }, data: { billingStatus } });
}

describe('cabinet en lecture seule (D29, PERMISSIONS "Etats bloquants")', () => {
  it.each(['IMPAYE', 'RESILIE'])(
    'refuse toute ecriture du Cabinet RH quand le cabinet est en %s',
    async (etat) => {
      const { cj, user } = await creerCabinetRH(`ro-${etat.toLowerCase()}`);
      const gest = await creerGestionnaire(user.cabinetId!, `ro-gest-${etat.toLowerCase()}`);
      const invitation = await prisma.invitation.create({
        data: {
          email: testEmail('ro-invite'),
          role: 'GESTIONNAIRE_RH',
          tokenHash: `ro-${etat}-${Date.now()}`,
          expiresAt: new Date(Date.now() + 86_400_000),
          cabinetId: user.cabinetId!,
          invitedById: user.id,
        },
      });
      await setBilling(user.cabinetId!, etat);

      const responses = await Promise.all([
        createInvitation(req('POST', `${APP_URL}/api/invitations`, cj, { email: testEmail('ro-nouveau') })),
        resendInvitation(req('POST', `${APP_URL}/api/invitations/${invitation.id}/resend`, cj), ctx(invitation.id)),
        revokeInvitation(req('DELETE', `${APP_URL}/api/invitations/${invitation.id}`, cj), ctx(invitation.id)),
        patchGestionnaire(req('PATCH', `${APP_URL}/api/gestionnaires/${gest.id}`, cj, { status: 'suspendu' }), ctx(gest.id)),
        deleteGestionnaire(req('DELETE', `${APP_URL}/api/gestionnaires/${gest.id}`, cj), ctx(gest.id)),
        restoreGestionnaire(req('PUT', `${APP_URL}/api/gestionnaires/${gest.id}`, cj), ctx(gest.id)),
        changeEmail(req('POST', `${APP_URL}/api/gestionnaires/${gest.id}/email`, cj, { email: testEmail('ro-autre') }), ctx(gest.id)),
      ]);

      for (const res of responses) {
        expect(res.status).toBe(423);
        expect(await res.json()).toEqual({ error: 'CABINET_READ_ONLY' });
      }

      // Rien n'a ete modifie.
      const apres = await prisma.user.findUniqueOrThrow({ where: { id: gest.id } });
      expect(apres.status).toBe('actif');
      expect(apres.deletedAt).toBeNull();
      expect((await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } })).status).toBe('pending');
    },
  );

  it.each(['ESSAI', 'ACTIF', 'DELAI_GRACE'])(
    'laisse tout fonctionner quand le cabinet est en %s',
    async (etat) => {
      const { cj, user } = await creerCabinetRH(`ok-${etat.toLowerCase()}`);
      await setBilling(user.cabinetId!, etat);

      const res = await createInvitation(
        req('POST', `${APP_URL}/api/invitations`, cj, { email: testEmail(`ok-${etat.toLowerCase()}-cible`) }),
      );

      expect(res.status).toBe(200);
    },
  );

  it('refuse l acceptation d une invitation dans un cabinet en lecture seule', async () => {
    const { user } = await creerCabinetRH('ro-accept');
    const cible = testEmail('ro-accept-cible');
    const token = `jeton-ro-${Date.now()}`;
    const { hashInvitationToken } = await import('@/lib/invitations');
    await prisma.invitation.create({
      data: {
        email: cible,
        role: 'GESTIONNAIRE_RH',
        tokenHash: hashInvitationToken(token),
        expiresAt: new Date(Date.now() + 86_400_000),
        cabinetId: user.cabinetId!,
        invitedById: user.id,
      },
    });
    await setBilling(user.cabinetId!, 'IMPAYE');

    const res = await acceptInvitation(
      req('POST', `${APP_URL}/api/invitations/accept`, undefined, {
        token,
        name: 'Nouveau',
        password: PASSWORD,
      }),
    );

    expect(res.status).toBe(423);
    expect(await prisma.user.findUnique({ where: { email: cible } })).toBeNull();
  });

  it('ne bloque pas un autre cabinet en regle', async () => {
    const { user: impaye } = await creerCabinetRH('ro-isole-a');
    const { cj: enRegle } = await creerCabinetRH('ro-isole-b');
    await setBilling(impaye.cabinetId!, 'IMPAYE');

    const res = await createInvitation(
      req('POST', `${APP_URL}/api/invitations`, enRegle, { email: testEmail('ro-isole-cible') }),
    );
    expect(res.status).toBe(200);
  });
});
