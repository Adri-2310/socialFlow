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
const { normalizeVatNumber, identitySchema, getCabinetIdentity, updateCabinetIdentity } = await import(
  '@/lib/cabinet-identity'
);
const { PATCH: identityRoute } = await import('@/app/api/cabinet/settings/identity/route');

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

describe('normalizeVatNumber', () => {
  it.each([
    ['BE0202.239.951', 'BE0202.239.951'],
    ['be 0202 239 951', 'BE0202.239.951'],
    ['0202239951', 'BE0202.239.951'],
    ['BE0123456749', 'BE0123.456.749'],
    ['BE 0123.456.749', 'BE0123.456.749'],
  ])('accepte et normalise %s', (input, expected) => {
    expect(normalizeVatNumber(input)).toBe(expected);
  });

  it.each([
    ['BE0202.239.950', 'controle modulo 97 faux'],
    ['BE2202.239.951', 'ne commence pas par 0 ou 1'],
    ['BE0202.239', 'trop court'],
    ['FR12345678901', 'autre pays'],
    ['', 'vide'],
    ['abc', 'texte'],
  ])('refuse %s (%s)', (input) => {
    expect(normalizeVatNumber(input)).toBeNull();
  });
});

describe('identitySchema', () => {
  it('normalise : vides en null, TVA canonique, pays en majuscules, email en minuscules', () => {
    const parsed = identitySchema.parse({
      name: '  Cabinet Dupont  ',
      vatNumber: 'be0123456749',
      addressLine: '',
      postalCode: ' 1000 ',
      city: null,
      country: 'be',
      contactEmail: ' Contact@Cabinet.BE ',
      contactPhone: '',
    });

    expect(parsed).toEqual({
      name: 'Cabinet Dupont',
      vatNumber: 'BE0123.456.749',
      addressLine: null,
      postalCode: '1000',
      city: null,
      country: 'BE',
      contactEmail: 'contact@cabinet.be',
      contactPhone: null,
    });
  });

  it('signale chaque champ invalide avec un code', () => {
    const result = identitySchema.safeParse({
      name: 'A',
      vatNumber: 'BE0000.000.000',
      country: 'XX',
      contactEmail: 'pas-un-email',
      contactPhone: 'abc',
    });

    expect(result.success).toBe(false);
    const codes = Object.fromEntries(
      result.error!.issues.map((i) => [String(i.path[0]), i.message]),
    );
    expect(codes).toMatchObject({
      name: 'NAME_REQUIRED',
      vatNumber: 'INVALID_VAT',
      country: 'INVALID_COUNTRY',
      contactEmail: 'INVALID_EMAIL',
      contactPhone: 'INVALID_PHONE',
    });
  });
});

describe('identite du cabinet (D30)', () => {
  async function creerCabinetRH(label: string) {
    const mail = testEmail(label);
    const cj = cookieJar();
    cj.apply(
      await auth.api.signUpEmail({
        body: { name: 'Titulaire Identite', email: mail, password: PASSWORD },
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
    return new Request('http://localhost:3000/api/cabinet/settings/identity', {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    });
  }

  const valid = {
    name: 'Cabinet Dupont',
    vatNumber: 'BE0123.456.749',
    addressLine: 'Rue de la Loi 16',
    postalCode: '1000',
    city: 'Bruxelles',
    country: 'BE',
    contactEmail: 'contact@dupont.be',
    contactPhone: '+32 2 123 45 67',
  };

  it('met a jour l identite et journalise les champs modifies, sans leurs valeurs', async () => {
    const { user, cabinetId } = await creerCabinetRH('identite-service');

    const result = await updateCabinetIdentity(cabinetId, user.id, valid);

    expect(result.ok).toBe(true);
    expect(await getCabinetIdentity(cabinetId)).toEqual(valid);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { cabinetId, action: 'CABINET_SETTINGS_UPDATED' },
    });
    expect(log.actorId).toBe(user.id);
    expect((log.metadata as { fields: string[] }).fields).toEqual(
      expect.arrayContaining(['name', 'vatNumber', 'city']),
    );
    // Aucune valeur (adresse, TVA, email) dans le journal.
    expect(JSON.stringify(log.metadata)).not.toContain('Dupont');
    expect(JSON.stringify(log.metadata)).not.toContain('0123');
  });

  it('n ecrit ni n audite rien quand rien ne change', async () => {
    const { user, cabinetId } = await creerCabinetRH('identite-idem');
    await updateCabinetIdentity(cabinetId, user.id, valid);
    const before = await prisma.auditLog.count({
      where: { cabinetId, action: 'CABINET_SETTINGS_UPDATED' },
    });

    const result = await updateCabinetIdentity(cabinetId, user.id, valid);

    expect(result).toMatchObject({ ok: true, changed: [] });
    expect(
      await prisma.auditLog.count({ where: { cabinetId, action: 'CABINET_SETTINGS_UPDATED' } }),
    ).toBe(before);
  });

  it('route : refuse sans session et pour un autre role', async () => {
    expect((await identityRoute(patch(undefined, valid))).status).toBe(401);

    const { cj, user } = await creerCabinetRH('identite-role');
    await prisma.user.update({ where: { id: user.id }, data: { role: 'GESTIONNAIRE_RH' } });
    expect((await identityRoute(patch(cj, valid))).status).toBe(403);
  });

  it('route : enregistre pour le cabinet de la session et renvoie la forme canonique', async () => {
    const { cj, cabinetId } = await creerCabinetRH('identite-route');

    const res = await identityRoute(patch(cj, { ...valid, vatNumber: 'be 0123 456 749' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.identity.vatNumber).toBe('BE0123.456.749');
    expect((await getCabinetIdentity(cabinetId)).name).toBe('Cabinet Dupont');
  });

  it('route : 400 avec le code de chaque champ invalide', async () => {
    const { cj } = await creerCabinetRH('identite-invalide');

    const res = await identityRoute(patch(cj, { ...valid, vatNumber: 'BE0000.000.000', contactEmail: 'x' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fields).toMatchObject({ vatNumber: 'INVALID_VAT', contactEmail: 'INVALID_EMAIL' });
  });

  it('route : ignore un cabinetId fourni par le client', async () => {
    const mine = await creerCabinetRH('identite-mine');
    const other = await creerCabinetRH('identite-other');
    const before = (await getCabinetIdentity(other.cabinetId)).name;

    const res = await identityRoute(patch(mine.cj, { ...valid, cabinetId: other.cabinetId }));

    expect(res.status).toBe(200);
    expect((await getCabinetIdentity(other.cabinetId)).name).toBe(before);
    expect((await getCabinetIdentity(mine.cabinetId)).name).toBe('Cabinet Dupont');
  });

  it('route : refusee en lecture seule (423)', async () => {
    const { cj, cabinetId } = await creerCabinetRH('identite-readonly');
    await prisma.cabinet.update({ where: { id: cabinetId }, data: { billingStatus: 'IMPAYE' } });

    const res = await identityRoute(patch(cj, valid));

    expect(res.status).toBe(423);
    expect(await res.json()).toEqual({ error: 'CABINET_READ_ONLY' });
  });
});
