// @vitest-environment node
import { describe, it, expect, vi, afterAll } from 'vitest';
import { cookieJar, testEmail, TEST_EMAIL_PREFIX } from '../helpers/auth-test-utils';

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
const { getCabinetBranding, updateCabinetBranding } = await import('@/lib/branding/cabinet-branding');
const { PATCH: brandingRoute } = await import('@/app/api/cabinet/settings/branding/route');

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

async function creerCabinetRH(label: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(
    await auth.api.signUpEmail({
      body: { name: 'Titulaire Branding', email: mail, password: PASSWORD },
      asResponse: true,
    }),
  );
  const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  return { cj, user, cabinetId: user.cabinetId! };
}

function patch(cj: ReturnType<typeof cookieJar> | undefined, body: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return new Request('http://localhost:3000/api/cabinet/settings/branding', {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
}

const valid = { displayName: 'Cabinet Dupont', primaryColor: '#1e3a8a', secondaryColor: '#f59e0b' };

describe('branding du cabinet (D33, D62)', () => {
  it('enregistre le branding et journalise les champs, jamais leurs valeurs', async () => {
    const { user, cabinetId } = await creerCabinetRH('branding-service');

    const result = await updateCabinetBranding(cabinetId, user.id, valid);

    expect(result.ok).toBe(true);
    expect(await getCabinetBranding(cabinetId)).toEqual(valid);
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { cabinetId, action: 'CABINET_SETTINGS_UPDATED' },
    });
    expect(log.actorId).toBe(user.id);
    expect(log.metadata).toMatchObject({ section: 'branding' });
    expect(JSON.stringify(log.metadata)).not.toContain('1e3a8a');
    expect(JSON.stringify(log.metadata)).not.toContain('Dupont');
  });

  it('n ecrit ni n audite rien quand rien ne change', async () => {
    const { user, cabinetId } = await creerCabinetRH('branding-idem');
    await updateCabinetBranding(cabinetId, user.id, valid);

    expect(await updateCabinetBranding(cabinetId, user.id, valid)).toMatchObject({
      ok: true,
      changed: [],
    });
    expect(
      await prisma.auditLog.count({ where: { cabinetId, action: 'CABINET_SETTINGS_UPDATED' } }),
    ).toBe(1);
  });

  it('route : refuse sans session et pour un autre role', async () => {
    expect((await brandingRoute(patch(undefined, valid))).status).toBe(401);

    const { cj, user } = await creerCabinetRH('branding-role');
    await prisma.user.update({ where: { id: user.id }, data: { role: 'GESTIONNAIRE_RH' } });
    expect((await brandingRoute(patch(cj, valid))).status).toBe(403);
  });

  it('route : enregistre pour le cabinet de la session', async () => {
    const { cj, cabinetId } = await creerCabinetRH('branding-route');

    const res = await brandingRoute(patch(cj, valid));

    expect(res.status).toBe(200);
    expect(await getCabinetBranding(cabinetId)).toEqual(valid);
  });

  it('route : refuse une couleur au contraste insuffisant, avec une suggestion', async () => {
    const { cj, cabinetId } = await creerCabinetRH('branding-contraste');

    const res = await brandingRoute(patch(cj, { ...valid, primaryColor: '#00c49f' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fields.primaryColor.code).toBe('LOW_CONTRAST');
    expect(body.fields.primaryColor.suggestion).toMatch(/^#[0-9a-f]{6}$/);
    expect((await getCabinetBranding(cabinetId)).primaryColor).toBeNull();
  });

  it('route : refuse un format de couleur invalide (pas d injection CSS)', async () => {
    const { cj, cabinetId } = await creerCabinetRH('branding-injection');

    const res = await brandingRoute(
      patch(cj, { ...valid, primaryColor: '#000000;}body{display:none' }),
    );

    expect(res.status).toBe(400);
    expect((await getCabinetBranding(cabinetId)).primaryColor).toBeNull();
  });

  it('route : permet de revenir aux valeurs par defaut', async () => {
    const { cj, cabinetId } = await creerCabinetRH('branding-reset');
    await brandingRoute(patch(cj, valid));

    const res = await brandingRoute(
      patch(cj, { displayName: '', primaryColor: '', secondaryColor: '' }),
    );

    expect(res.status).toBe(200);
    expect(await getCabinetBranding(cabinetId)).toEqual({
      displayName: null,
      primaryColor: null,
      secondaryColor: null,
    });
  });

  it('route : ignore un cabinetId fourni par le client', async () => {
    const mine = await creerCabinetRH('branding-mine');
    const other = await creerCabinetRH('branding-other');

    const res = await brandingRoute(patch(mine.cj, { ...valid, cabinetId: other.cabinetId }));

    expect(res.status).toBe(200);
    expect((await getCabinetBranding(other.cabinetId)).displayName).toBeNull();
    expect((await getCabinetBranding(mine.cabinetId)).displayName).toBe('Cabinet Dupont');
  });

  it('route : refusee en lecture seule (423)', async () => {
    const { cj, cabinetId } = await creerCabinetRH('branding-readonly');
    await prisma.cabinet.update({ where: { id: cabinetId }, data: { billingStatus: 'IMPAYE' } });

    const res = await brandingRoute(patch(cj, valid));

    expect(res.status).toBe(423);
  });
});
