// @vitest-environment node
import { describe, it, expect, vi, afterAll } from 'vitest';
import { testEmail, TEST_EMAIL_PREFIX } from '../../helpers/auth-test-utils';
import { brandInitial, buildPortalManifest, parseIconSize, safeColor } from '@/lib/portal/portal-pwa';

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
  sendWelcomeAccountEmail: vi.fn().mockResolvedValue(undefined),
  sendGestionnaireAccessChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorEnabledEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorDisabledEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountUnlinkedEmail: vi.fn().mockResolvedValue(undefined),
}));

describe('regles de l application installable (D77)', () => {
  it('manifeste au nom du cabinet : portail comme point d entree, jamais SocialFlow', () => {
    const manifest = buildPortalManifest({ brandName: 'Cabinet Dupont', primaryColor: '#123456' }, 'cabinet-dupont');

    expect(manifest.name).toBe('Cabinet Dupont');
    expect(manifest.start_url).toBe('/connexion/cabinet-dupont');
    expect(manifest.id).toBe('/connexion/cabinet-dupont');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#123456');
    expect(manifest.icons.map((i) => i.sizes)).toEqual(['192x192', '512x512']);
    expect(manifest.icons[0].src).toBe('/connexion/cabinet-dupont/icone/192');
    expect(JSON.stringify(manifest)).not.toMatch(/socialflow/i);
  });

  it('raccourcit un nom trop long pour l ecran d accueil', () => {
    const manifest = buildPortalManifest({ brandName: 'Secretariat Social Dupont et Fils', primaryColor: null }, 'dupont');
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.short_name.endsWith('…')).toBe(true);
    expect(manifest.name).toBe('Secretariat Social Dupont et Fils');
  });

  it('refuse une couleur qui n est pas #rrggbb et prend la couleur par defaut', () => {
    expect(safeColor('#aBc123')).toBe('#aBc123');
    expect(safeColor('red; background:url(x)')).toBe('#4f46e5');
    expect(safeColor(null)).toBe('#4f46e5');
  });

  it('n accepte que les tailles d icone declarees', () => {
    expect(parseIconSize('192')).toBe(192);
    expect(parseIconSize('512')).toBe(512);
    expect(parseIconSize('64')).toBeNull();
    expect(parseIconSize('abc')).toBeNull();
  });

  it('initiale du nom : sans accent, en majuscule', () => {
    expect(brandInitial('élodie paie')).toBe('E');
    expect(brandInitial('  3 Suisses')).toBe('3');
    expect(brandInitial('???')).toBe('C');
  });
});

const { auth } = await import('@/lib/auth/auth');
const { prisma } = await import('@/lib/prisma');
const { supprimerCabinetsEtDonnees } = await import('@/lib/cabinet/cabinet-purge');
const { ensureCabinetSlug } = await import('@/lib/portal/cabinet-portal');
const { GET: getManifest } = await import('@/app/(auth)/connexion/[slug]/manifest.webmanifest/route');
const { GET: getIcon } = await import('@/app/(auth)/connexion/[slug]/icone/[taille]/route');

afterAll(async () => {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    select: { cabinetId: true },
  });
  const cabinetIds = users.map((u) => u.cabinetId).filter((id): id is string => !!id);
  await prisma.auditLog.deleteMany({ where: { cabinetId: { in: cabinetIds } } });
  await supprimerCabinetsEtDonnees(cabinetIds);
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.verification.deleteMany({
    where: { OR: [{ identifier: { contains: TEST_EMAIL_PREFIX } }, { value: { contains: TEST_EMAIL_PREFIX } }] },
  });
});

const url = (path: string) => new Request(`http://localhost:3000${path}`);
const params = (slug: string, taille = '192') => ({ params: Promise.resolve({ slug, taille }) });

describe('routes du manifeste et de l icone (D77)', () => {
  it('sert le manifeste du cabinet et une icone PNG, sans session', async () => {
    const mail = testEmail('portail-pwa').toLowerCase();
    await auth.api.signUpEmail({ body: { name: 'Titulaire Pwa', email: mail, password: 'InitialPass123!' } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
    const slug = await ensureCabinetSlug(user.cabinetId!);

    const manifest = await getManifest(url(`/connexion/${slug}/manifest.webmanifest`), params(slug));
    expect(manifest.status).toBe(200);
    expect(manifest.headers.get('content-type')).toContain('application/manifest+json');
    expect((await manifest.json()).start_url).toBe(`/connexion/${slug}`);

    const icon = await getIcon(url(`/connexion/${slug}/icone/192`), params(slug, '192'));
    expect(icon.status).toBe(200);
    expect(icon.headers.get('content-type')).toBe('image/png');
    const bytes = new Uint8Array(await icon.arrayBuffer());
    // Signature PNG.
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('404 pour un portail inconnu, une taille non declaree', async () => {
    expect((await getManifest(url('/x'), params('portail-qui-nexiste-pas'))).status).toBe(404);
    expect((await getIcon(url('/x'), params('portail-qui-nexiste-pas', '192'))).status).toBe(404);

    const mail = testEmail('portail-pwa-taille').toLowerCase();
    await auth.api.signUpEmail({ body: { name: 'Titulaire Pwa', email: mail, password: 'InitialPass123!' } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
    const slug = await ensureCabinetSlug(user.cabinetId!);
    expect((await getIcon(url('/x'), params(slug, '64'))).status).toBe(404);
  });
});
