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
  sendEntrepriseInvitationEmail: vi.fn().mockResolvedValue(undefined),
  sendGestionnaireAccessChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorEnabledEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorDisabledEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountUnlinkedEmail: vi.fn().mockResolvedValue(undefined),
}));

const { auth } = await import('@/lib/auth/auth');
const { prisma } = await import('@/lib/prisma');
const { PATCH: patchPortal } = await import('@/app/api/cabinet/settings/portal/route');
const { ensureCabinetSlug, getPortalCabinet, cabinetIdForSlug, updateCabinetSlug } = await import(
  '@/lib/portal/cabinet-portal'
);

const PASSWORD = 'InitialPass123!';
const APP_URL = 'http://localhost:3000';
const stamp = Date.now();
const cabinetIds: string[] = [];

afterAll(async () => {
  const testUsers = await prisma.user.findMany({
    where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    select: { cabinetId: true },
  });
  const ids = [...cabinetIds, ...testUsers.map((u) => u.cabinetId).filter((id): id is string => !!id)];
  await prisma.auditLog.deleteMany({ where: { cabinetId: { in: ids } } });
  await prisma.cabinet.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.verification.deleteMany({
    where: { OR: [{ identifier: { contains: TEST_EMAIL_PREFIX } }, { value: { contains: TEST_EMAIL_PREFIX } }] },
  });
});

async function creerCabinet(data: { name: string; displayName?: string | null; slug?: string | null; deletedAt?: Date | null }) {
  const cabinet = await prisma.cabinet.create({ data });
  cabinetIds.push(cabinet.id);
  return cabinet;
}

type Jar = ReturnType<typeof cookieJar>;

async function creerCabinetRH(label: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(
    await auth.api.signUpEmail({
      body: { name: 'Cabinet Portail Test', cabinetName: `Portail ${label} ${stamp}`, email: mail, password: PASSWORD },
      asResponse: true,
    }),
  );
  const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  return { cj, user };
}

describe('ensureCabinetSlug (D76)', () => {
  it('genere un identifiant a partir du nom affiche, puis le conserve', async () => {
    const cabinet = await creerCabinet({ name: `Cabinet Interne ${stamp}`, displayName: `Fiduciaire Liège ${stamp}` });

    const slug = await ensureCabinetSlug(cabinet.id);

    expect(slug).toBe(`fiduciaire-liege-${stamp}`);
    expect(await ensureCabinetSlug(cabinet.id)).toBe(slug);
    expect((await prisma.cabinet.findUniqueOrThrow({ where: { id: cabinet.id } })).slug).toBe(slug);
  });

  it('ajoute un suffixe quand l identifiant est deja pris, sans ecraser personne', async () => {
    const nom = `Cabinet Jumeau ${stamp}`;
    const premier = await creerCabinet({ name: nom });
    const second = await creerCabinet({ name: nom });
    const troisieme = await creerCabinet({ name: nom });

    const a = await ensureCabinetSlug(premier.id);
    const b = await ensureCabinetSlug(second.id);
    const c = await ensureCabinetSlug(troisieme.id);

    expect(a).toBe(`cabinet-jumeau-${stamp}`);
    expect(b).toBe(`${a}-2`);
    expect(c).toBe(`${a}-3`);
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('ne donne jamais un identifiant reserve ni trop court', async () => {
    const reserve = await creerCabinet({ name: 'SocialFlow' });
    const court = await creerCabinet({ name: 'AB' });

    for (const cabinet of [reserve, court]) {
      const slug = await ensureCabinetSlug(cabinet.id);
      expect(slug.length).toBeGreaterThanOrEqual(3);
      expect(slug).not.toBe('socialflow');
    }
  });

  it('deux demandes simultanees donnent le meme identifiant', async () => {
    const cabinet = await creerCabinet({ name: `Cabinet Simultane ${stamp}` });

    const [a, b, c] = await Promise.all([
      ensureCabinetSlug(cabinet.id),
      ensureCabinetSlug(cabinet.id),
      ensureCabinetSlug(cabinet.id),
    ]);

    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});

describe('getPortalCabinet et cabinetIdForSlug', () => {
  it('donne l identite visuelle du cabinet, rien d autre', async () => {
    const cabinet = await prisma.cabinet.create({
      data: {
        name: `Raison Sociale ${stamp}`,
        displayName: 'Cabinet Affiche',
        slug: `portail-public-${stamp}`,
        primaryColor: '#008734',
        logoUrl: 'https://blob.test/logo.png',
        vatNumber: 'BE0123.456.749',
        contactEmail: 'secret@cabinet.be',
      },
    });
    cabinetIds.push(cabinet.id);

    const portal = await getPortalCabinet(`portail-public-${stamp}`);

    expect(portal).toEqual({
      id: cabinet.id,
      name: `Raison Sociale ${stamp}`,
      brandName: 'Cabinet Affiche',
      primaryColor: '#008734',
      secondaryColor: null,
      logoUrl: 'https://blob.test/logo.png',
    });
    expect(JSON.stringify(portal)).not.toContain('secret@cabinet.be');
    expect(JSON.stringify(portal)).not.toContain('BE0123');
    expect(await cabinetIdForSlug(`portail-public-${stamp}`)).toBe(cabinet.id);
  });

  it('ne trouve ni un identifiant inconnu, ni invalide, ni un cabinet archive', async () => {
    const archive = await creerCabinet({ name: 'Archive', slug: `portail-archive-${stamp}`, deletedAt: new Date() });

    expect(await getPortalCabinet(`portail-inconnu-${stamp}`)).toBeNull();
    expect(await getPortalCabinet('../etc/passwd')).toBeNull();
    expect(await getPortalCabinet('AB')).toBeNull();
    expect(await getPortalCabinet(`portail-archive-${stamp}`)).toBeNull();
    expect(await cabinetIdForSlug(`portail-archive-${stamp}`)).toBeNull();
    void archive;
  });
});

describe('updateCabinetSlug', () => {
  it('normalise, enregistre et journalise sans donnee superflue', async () => {
    const cabinet = await creerCabinet({ name: `Cabinet Edition ${stamp}` });
    const { user } = await creerCabinetRH('portail-edition');

    const result = await updateCabinetSlug(cabinet.id, user.id, `  Mon Nouveau Portail ${stamp}  `);

    expect(result).toEqual({ ok: true, slug: `mon-nouveau-portail-${stamp}`, changed: true });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { cabinetId: cabinet.id, action: 'CABINET_SETTINGS_UPDATED' },
    });
    expect(audit.metadata).toEqual({ section: 'portal' });
  });

  it('ne change rien et n audite rien quand l identifiant est le meme', async () => {
    const cabinet = await creerCabinet({ name: 'Identique', slug: `identique-${stamp}` });
    const { user } = await creerCabinetRH('portail-identique');

    expect(await updateCabinetSlug(cabinet.id, user.id, `identique-${stamp}`)).toEqual({
      ok: true,
      slug: `identique-${stamp}`,
      changed: false,
    });
    expect(await prisma.auditLog.count({ where: { cabinetId: cabinet.id } })).toBe(0);
  });

  it('refuse un identifiant invalide, reserve, ou deja pris par un autre cabinet', async () => {
    const autre = await creerCabinet({ name: 'Autre', slug: `deja-pris-${stamp}` });
    const cabinet = await creerCabinet({ name: 'Moi', slug: `moi-${stamp}` });
    const { user } = await creerCabinetRH('portail-refus');

    expect(await updateCabinetSlug(cabinet.id, user.id, 'ab')).toEqual({ ok: false, error: 'INVALID_SLUG' });
    expect(await updateCabinetSlug(cabinet.id, user.id, '***')).toEqual({ ok: false, error: 'INVALID_SLUG' });
    expect(await updateCabinetSlug(cabinet.id, user.id, 'SocialFlow')).toEqual({ ok: false, error: 'INVALID_SLUG' });
    expect(await updateCabinetSlug(cabinet.id, user.id, `deja-pris-${stamp}`)).toEqual({ ok: false, error: 'SLUG_TAKEN' });

    expect((await prisma.cabinet.findUniqueOrThrow({ where: { id: cabinet.id } })).slug).toBe(`moi-${stamp}`);
    expect((await prisma.cabinet.findUniqueOrThrow({ where: { id: autre.id } })).slug).toBe(`deja-pris-${stamp}`);
  });

  it('ne modifie pas un cabinet archive ou inconnu', async () => {
    const archive = await creerCabinet({ name: 'Archive 2', slug: `archive2-${stamp}`, deletedAt: new Date() });
    const { user } = await creerCabinetRH('portail-archive');

    expect(await updateCabinetSlug(archive.id, user.id, `nouveau-${stamp}`)).toEqual({
      ok: false,
      error: 'CABINET_NOT_FOUND',
    });
    expect(await updateCabinetSlug('cabinet-inexistant', user.id, `nouveau-${stamp}`)).toEqual({
      ok: false,
      error: 'CABINET_NOT_FOUND',
    });
  });
});

describe('PATCH /api/cabinet/settings/portal', () => {
  function modifier(body: unknown, cj?: Jar) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const cookie = cj?.headers().get('cookie');
    if (cookie) headers.cookie = cookie;
    return patchPortal(
      new Request(`${APP_URL}/api/cabinet/settings/portal`, { method: 'PATCH', headers, body: JSON.stringify(body) }),
    );
  }

  it('refuse sans session (401) et a un role autre que Cabinet RH (403)', async () => {
    const { user } = await creerCabinetRH('portail-api-roles');
    const gestionnaireMail = testEmail('portail-api-g');
    const cj = cookieJar();
    cj.apply(await auth.api.signUpEmail({ body: { name: 'G', email: gestionnaireMail, password: PASSWORD }, asResponse: true }));
    const created = await prisma.user.findUniqueOrThrow({ where: { email: gestionnaireMail } });
    await prisma.user.update({ where: { id: created.id }, data: { role: 'GESTIONNAIRE_RH', cabinetId: user.cabinetId } });
    await prisma.cabinet.delete({ where: { id: created.cabinetId! } });

    expect((await modifier({ slug: `portail-api-${stamp}` })).status).toBe(401);
    expect((await modifier({ slug: `portail-api-${stamp}` }, cj)).status).toBe(403);
  });

  it('enregistre l identifiant du cabinet de la session', async () => {
    const { cj, user } = await creerCabinetRH('portail-api-ok');

    const res = await modifier({ slug: `Mon Portail API ${stamp}` }, cj);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, slug: `mon-portail-api-${stamp}`, changed: true });
    expect((await prisma.cabinet.findUniqueOrThrow({ where: { id: user.cabinetId! } })).slug).toBe(`mon-portail-api-${stamp}`);
  });

  it('valide la demande : 400 invalide, 409 deja pris', async () => {
    const { cj } = await creerCabinetRH('portail-api-erreurs');
    const { cj: autreCj } = await creerCabinetRH('portail-api-erreurs-b');
    await modifier({ slug: `deja-api-${stamp}` }, autreCj);

    expect((await modifier({ slug: 'ab' }, cj)).status).toBe(400);
    expect((await modifier({ slug: 42 }, cj)).status).toBe(400);
    expect((await modifier({}, cj)).status).toBe(400);
    const pris = await modifier({ slug: `deja-api-${stamp}` }, cj);
    expect(pris.status).toBe(409);
    expect((await pris.json()).error).toBe('SLUG_TAKEN');
  });

  it('est refusee en lecture seule (423)', async () => {
    const { cj, user } = await creerCabinetRH('portail-api-lecture');
    await prisma.cabinet.update({ where: { id: user.cabinetId! }, data: { billingStatus: 'IMPAYE' } });

    const res = await modifier({ slug: `lecture-${stamp}` }, cj);
    expect(res.status).toBe(423);
  });
});
