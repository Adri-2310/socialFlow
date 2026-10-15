// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import sharp from 'sharp';
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
const { InMemoryLogoStorage, setLogoStorage } = await import('@/lib/logo-storage');
const { setCabinetLogo, removeCabinetLogo } = await import('@/lib/cabinet-logo');
const { POST: logoPost, DELETE: logoDelete } = await import('@/app/api/cabinet/settings/logo/route');

const PASSWORD = 'InitialPass123!';
// Vrai PNG (sharp le decode) ; FAKE_PNG n'a que la signature.
const makePng = (size: number) =>
  sharp({ create: { width: size, height: size, channels: 4, background: '#4f46e5' } })
    .png()
    .toBuffer()
    .then((buffer) => new Uint8Array(buffer));
const PNG = await makePng(64);
const FAKE_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
);

let storage = new InMemoryLogoStorage();

beforeEach(() => {
  storage = new InMemoryLogoStorage();
  setLogoStorage(storage);
});

afterAll(async () => {
  setLogoStorage(null);
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
      body: { name: 'Titulaire Logo', email: mail, password: PASSWORD },
      asResponse: true,
    }),
  );
  const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  return { cj, user, cabinetId: user.cabinetId! };
}

const logoOf = (cabinetId: string) =>
  prisma.cabinet.findUniqueOrThrow({
    where: { id: cabinetId },
    select: { logoUrl: true, logoPath: true },
  });

function upload(cj: ReturnType<typeof cookieJar> | undefined, bytes: Uint8Array | null, name = 'logo.png') {
  const form = new FormData();
  if (bytes) form.append('logo', new File([bytes as BlobPart], name));
  const headers: Record<string, string> = {};
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return new Request('http://localhost:3000/api/cabinet/settings/logo', {
    method: 'POST',
    headers,
    body: form,
  });
}

function remove(cj: ReturnType<typeof cookieJar> | undefined) {
  const headers: Record<string, string> = {};
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return new Request('http://localhost:3000/api/cabinet/settings/logo', { method: 'DELETE', headers });
}

describe('logo du cabinet (D33, D62)', () => {
  it('stocke le logo hors base, enregistre son URL et l audite', async () => {
    const { user, cabinetId } = await creerCabinetRH('logo-service');

    const result = await setCabinetLogo(cabinetId, user.id, PNG);

    expect(result.ok).toBe(true);
    const logo = await logoOf(cabinetId);
    expect(logo.logoUrl).toMatch(/^https:\/\/logos\.test\/logos\//);
    expect(logo.logoPath).toMatch(new RegExp(`^logos/${cabinetId}/[0-9a-f-]+-\\d+\\.png$`));
    expect(storage.files.get(logo.logoPath!)?.contentType).toBe('image/png');

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { cabinetId, action: 'CABINET_SETTINGS_UPDATED' },
    });
    expect(log.metadata).toEqual({ section: 'branding', fields: ['logo'] });
  });

  it('remplace le logo et supprime l ancien fichier', async () => {
    const { user, cabinetId } = await creerCabinetRH('logo-remplace');
    await setCabinetLogo(cabinetId, user.id, PNG);
    const first = (await logoOf(cabinetId)).logoPath!;

    await setCabinetLogo(cabinetId, user.id, SVG);

    const second = (await logoOf(cabinetId)).logoPath!;
    expect(second).not.toBe(first);
    expect(storage.files.has(first)).toBe(false);
    expect(storage.files.get(second)?.contentType).toBe('image/svg+xml');
  });

  it('retire le logo : base nettoyee et fichier supprime', async () => {
    const { user, cabinetId } = await creerCabinetRH('logo-retire');
    await setCabinetLogo(cabinetId, user.id, PNG);
    const path = (await logoOf(cabinetId)).logoPath!;

    expect(await removeCabinetLogo(cabinetId, user.id)).toEqual({ ok: true, logoUrl: null });

    expect(await logoOf(cabinetId)).toEqual({ logoUrl: null, logoPath: null });
    expect(storage.files.has(path)).toBe(false);
  });

  it('redimensionne un grand PNG a 512 px maximum, sans l agrandir', async () => {
    const { user, cabinetId } = await creerCabinetRH('logo-redim');

    await setCabinetLogo(cabinetId, user.id, await makePng(2000));
    const stored = storage.files.get((await logoOf(cabinetId)).logoPath!)!;
    const meta = await sharp(Buffer.from(stored.bytes)).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);

    await setCabinetLogo(cabinetId, user.id, await makePng(64));
    const small = await sharp(
      Buffer.from(storage.files.get((await logoOf(cabinetId)).logoPath!)!.bytes),
    ).metadata();
    expect(small.width).toBe(64);
  });

  it('conserve les proportions d un logo rectangulaire', async () => {
    const { user, cabinetId } = await creerCabinetRH('logo-ratio');
    const wide = new Uint8Array(
      await sharp({ create: { width: 1600, height: 400, channels: 3, background: '#000' } })
        .png()
        .toBuffer(),
    );

    await setCabinetLogo(cabinetId, user.id, wide);

    const meta = await sharp(
      Buffer.from(storage.files.get((await logoOf(cabinetId)).logoPath!)!.bytes),
    ).metadata();
    expect([meta.width, meta.height]).toEqual([512, 128]);
  });

  it('retire les metadonnees EXIF du PNG stocke', async () => {
    const { user, cabinetId } = await creerCabinetRH('logo-exif');
    const withExif = new Uint8Array(
      await sharp({ create: { width: 32, height: 32, channels: 3, background: '#fff' } })
        .withExif({ IFD0: { Copyright: 'secret-exif' } })
        .png()
        .toBuffer(),
    );

    await setCabinetLogo(cabinetId, user.id, withExif);

    const stored = storage.files.get((await logoOf(cabinetId)).logoPath!)!;
    expect(Buffer.from(stored.bytes).includes('secret-exif')).toBe(false);
  });

  it('refuse un fichier qui a la signature PNG mais ne se decode pas', async () => {
    const { user, cabinetId } = await creerCabinetRH('logo-faux-png');

    expect(await setCabinetLogo(cabinetId, user.id, FAKE_PNG)).toEqual({
      ok: false,
      error: 'LOGO_INVALID_TYPE',
    });
    expect(storage.files.size).toBe(0);
  });

  it('refuse un contenu invalide sans rien stocker', async () => {
    const { user, cabinetId } = await creerCabinetRH('logo-invalide');

    expect(await setCabinetLogo(cabinetId, user.id, new TextEncoder().encode('pas une image'))).toEqual({
      ok: false,
      error: 'LOGO_INVALID_TYPE',
    });
    expect(storage.files.size).toBe(0);
    expect((await logoOf(cabinetId)).logoUrl).toBeNull();
  });

  it('indique que l envoi est indisponible sans stockage configure', async () => {
    const { user, cabinetId } = await creerCabinetRH('logo-sans-stockage');
    setLogoStorage(null);
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    try {
      expect(await setCabinetLogo(cabinetId, user.id, PNG)).toEqual({
        ok: false,
        error: 'LOGO_STORAGE_UNAVAILABLE',
      });
    } finally {
      if (token) process.env.BLOB_READ_WRITE_TOKEN = token;
    }
  });

  it('route : refuse sans session et pour un autre role', async () => {
    expect((await logoPost(upload(undefined, PNG))).status).toBe(401);

    const { cj, user } = await creerCabinetRH('logo-role');
    await prisma.user.update({ where: { id: user.id }, data: { role: 'GESTIONNAIRE_RH' } });
    expect((await logoPost(upload(cj, PNG))).status).toBe(403);
    expect((await logoDelete(remove(cj))).status).toBe(403);
    expect(storage.files.size).toBe(0);
  });

  it('route : enregistre le logo du cabinet de la session', async () => {
    const { cj, cabinetId } = await creerCabinetRH('logo-route');

    const res = await logoPost(upload(cj, PNG));

    expect(res.status).toBe(200);
    expect((await res.json()).logoUrl).toMatch(/^https:\/\/logos\.test\//);
    expect((await logoOf(cabinetId)).logoPath).not.toBeNull();
  });

  it('route : ne se fie pas au nom ni au type declares du fichier', async () => {
    const { cj, cabinetId } = await creerCabinetRH('logo-trompeur');

    const res = await logoPost(upload(cj, new TextEncoder().encode('<html>x</html>'), 'logo.png'));

    expect(res.status).toBe(415);
    expect((await logoOf(cabinetId)).logoUrl).toBeNull();
  });

  it('route : codes HTTP pour fichier absent, trop gros et SVG dangereux', async () => {
    const { cj } = await creerCabinetRH('logo-codes');

    expect((await logoPost(upload(cj, null))).status).toBe(400);

    const big = new Uint8Array(1024 * 1024 + 1);
    big.set(PNG);
    expect((await logoPost(upload(cj, big))).status).toBe(413);

    const unsafe = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>');
    expect((await logoPost(upload(cj, unsafe, 'logo.svg'))).status).toBe(422);
  });

  it('route : refusee en lecture seule (423)', async () => {
    const { cj, cabinetId } = await creerCabinetRH('logo-readonly');
    await prisma.cabinet.update({ where: { id: cabinetId }, data: { billingStatus: 'IMPAYE' } });

    expect((await logoPost(upload(cj, PNG))).status).toBe(423);
    expect((await logoDelete(remove(cj))).status).toBe(423);
  });

  it('route : un cabinet ne touche jamais le logo d un autre', async () => {
    const mine = await creerCabinetRH('logo-mine');
    const other = await creerCabinetRH('logo-other');
    await setCabinetLogo(other.cabinetId, other.user.id, PNG);

    await logoDelete(remove(mine.cj));

    expect((await logoOf(other.cabinetId)).logoUrl).not.toBeNull();
  });
});
