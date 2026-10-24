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
const { supprimerCabinetsEtDonnees } = await import('@/lib/cabinet/cabinet-purge');
const { GET: exportRoute } = await import('@/app/api/cabinet/export/route');
const { createInvitationToken } = await import('@/lib/invitations/invitations');
const { exportFilename, EXPORT_FORMAT } = await import('@/lib/cabinet/cabinet-export');

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
  await supprimerCabinetsEtDonnees(cabinetIds);
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.verification.deleteMany({
    where: { OR: [{ identifier: { contains: TEST_EMAIL_PREFIX } }, { value: { contains: TEST_EMAIL_PREFIX } }] },
  });
});

type Jar = ReturnType<typeof cookieJar>;

async function creerCabinetRH(label: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(
    await auth.api.signUpEmail({
      body: { name: 'Titulaire Export', cabinetName: `Cabinet ${label}`, email: mail, password: PASSWORD },
      asResponse: true,
    }),
  );
  const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  return { cj, user };
}

async function creerMembre(cabinetId: string, role: string, label: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(await auth.api.signUpEmail({ body: { name: `Membre ${label}`, email: mail, password: PASSWORD }, asResponse: true }));
  const created = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  await prisma.user.update({ where: { id: created.id }, data: { role, cabinetId } });
  await supprimerCabinetsEtDonnees([created.cabinetId!]);
  return { cj, user: await prisma.user.findUniqueOrThrow({ where: { id: created.id } }) };
}

function exporter(cj?: Jar) {
  const headers: Record<string, string> = {};
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return exportRoute(new Request(`${APP_URL}/api/cabinet/export`, { headers }));
}

describe('export des donnees du cabinet (D28, D74)', () => {
  it('refuse sans session (401) et a un role autre que Cabinet RH (403)', async () => {
    const { user } = await creerCabinetRH('exp-roles');
    const { cj: gestionnaire } = await creerMembre(user.cabinetId!, 'GESTIONNAIRE_RH', 'exp-roles-g');
    const { cj: entreprise } = await creerMembre(user.cabinetId!, 'ENTREPRISE_CLIENTE', 'exp-roles-e');

    expect((await exporter()).status).toBe(401);
    expect((await exporter(gestionnaire)).status).toBe(403);
    expect((await exporter(entreprise)).status).toBe(403);
  });

  it('renvoie un fichier JSON a telecharger, jamais mis en cache', async () => {
    const { cj } = await creerCabinetRH('exp-fichier');

    const res = await exporter(cj);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="${exportFilename()}"`);
    expect(res.headers.get('cache-control')).toBe('no-store');

    const data = await res.json();
    expect(data.format).toBe(EXPORT_FORMAT);
    expect(data.version).toBe(1);
    expect(typeof data.exportedAt).toBe('string');
    expect(data.cabinet.name).toBe('Cabinet exp-fichier');
  });

  it('contient l equipe, les entreprises avec leurs assignations et leur administrateur, et les invitations', async () => {
    const { cj, user } = await creerCabinetRH('exp-contenu');
    const cabinetId = user.cabinetId!;
    const { user: gestionnaire } = await creerMembre(cabinetId, 'GESTIONNAIRE_RH', 'exp-contenu-g');
    const { user: admin } = await creerMembre(cabinetId, 'ENTREPRISE_CLIENTE', 'exp-contenu-a');
    await prisma.entreprise.create({
      data: {
        cabinetId,
        name: 'Boulangerie Dupont',
        vatNumber: 'BE0123.456.749',
        city: 'Namur',
        adminUserId: admin.id,
        gestionnaires: { create: [{ userId: gestionnaire.id }] },
      },
    });
    const { tokenHash } = createInvitationToken();
    await prisma.invitation.create({
      data: {
        email: testEmail('exp-contenu-invite'),
        role: 'GESTIONNAIRE_RH',
        tokenHash,
        cabinetId,
        invitedById: user.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const data = await (await exporter(cj)).json();

    expect(data.team.map((m: { email: string }) => m.email)).toEqual([gestionnaire.email]);
    expect(data.entreprises).toHaveLength(1);
    expect(data.entreprises[0]).toMatchObject({
      name: 'Boulangerie Dupont',
      vatNumber: 'BE0123.456.749',
      address: { city: 'Namur' },
      archivedAt: null,
      admin: { email: admin.email },
      gestionnaires: [{ email: gestionnaire.email }],
    });
    expect(data.invitations).toHaveLength(1);
    expect(data.invitations[0]).toMatchObject({ role: 'GESTIONNAIRE_RH', status: 'pending' });
  });

  it('inclut les entreprises archivees et les gestionnaires retires, avec leur date', async () => {
    const { cj, user } = await creerCabinetRH('exp-archives');
    const cabinetId = user.cabinetId!;
    const { user: retire } = await creerMembre(cabinetId, 'GESTIONNAIRE_RH', 'exp-archives-g');
    await prisma.user.update({ where: { id: retire.id }, data: { deletedAt: new Date(), deletedBy: 'CABINET_RH' } });
    await prisma.entreprise.create({
      data: { cabinetId, name: 'Ancienne SPRL', vatNumber: 'BE0200.000.000', deletedAt: new Date() },
    });

    const data = await (await exporter(cj)).json();

    expect(data.team[0].removedAt).not.toBeNull();
    expect(data.entreprises[0]).toMatchObject({ name: 'Ancienne SPRL' });
    expect(data.entreprises[0].archivedAt).not.toBeNull();
  });

  it('n exporte jamais les donnees d un autre cabinet', async () => {
    const { cj } = await creerCabinetRH('exp-iso-a');
    const { user: autre } = await creerCabinetRH('exp-iso-b');
    await creerMembre(autre.cabinetId!, 'GESTIONNAIRE_RH', 'exp-iso-b-g');
    await prisma.entreprise.create({
      data: { cabinetId: autre.cabinetId!, name: 'Entreprise Etrangere', vatNumber: 'BE0300.000.000' },
    });

    const texte = JSON.stringify(await (await exporter(cj)).json());

    expect(texte).not.toContain('Entreprise Etrangere');
    expect(texte).not.toContain(autre.email);
    expect(texte).not.toContain('exp-iso-b-g');
  });

  it('ne contient ni secret ni identifiant interne', async () => {
    const { cj, user } = await creerCabinetRH('exp-secrets');
    const cabinetId = user.cabinetId!;
    await prisma.cabinet.update({
      where: { id: cabinetId },
      data: { stripeCustomerId: `cus_secret_${Date.now()}`, logoPath: 'logos/secret/chemin.png' },
    });
    const { token, tokenHash } = createInvitationToken();
    await prisma.invitation.create({
      data: {
        email: testEmail('exp-secrets-invite'),
        role: 'GESTIONNAIRE_RH',
        tokenHash,
        cabinetId,
        invitedById: user.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const cabinet = await prisma.cabinet.findUniqueOrThrow({ where: { id: cabinetId } });

    const texte = JSON.stringify(await (await exporter(cj)).json());

    for (const secret of [tokenHash, token, cabinet.stripeCustomerId!, cabinet.logoPath!, user.id, cabinetId]) {
      expect(texte).not.toContain(secret);
    }
    expect(texte).not.toContain('tokenHash');
    expect(texte).not.toContain('stripeCustomerId');
    expect(texte).not.toContain('password');
  });

  it('journalise chaque export, et le suivant le voit dans le journal exporte', async () => {
    const { cj, user } = await creerCabinetRH('exp-audit');

    const premier = await (await exporter(cj)).json();
    expect(premier.audit.entries.some((e: { action: string }) => e.action === 'DATA_EXPORTED')).toBe(false);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { cabinetId: user.cabinetId!, action: 'DATA_EXPORTED' },
    });
    expect(log.actorId).toBe(user.id);

    const second = await (await exporter(cj)).json();
    const exports = second.audit.entries.filter((e: { action: string }) => e.action === 'DATA_EXPORTED');
    expect(exports).toHaveLength(1);
    expect(exports[0].actor.email).toBe(user.email);
  });

  it.each([
    ['impaye', { billingStatus: 'IMPAYE' }],
    ['resilie', { billingStatus: 'RESILIE' }],
    ['suspendu en lecture seule', { status: 'suspendu', suspensionType: 'READ_ONLY' }],
  ])('reste disponible quand le cabinet est %s (lecture seule)', async (_label, etat) => {
    const { cj, user } = await creerCabinetRH(`exp-ro-${Math.random().toString(36).slice(2, 7)}`);
    await prisma.cabinet.update({ where: { id: user.cabinetId! }, data: etat });

    const res = await exporter(cj);
    expect(res.status).toBe(200);
    expect((await res.json()).format).toBe(EXPORT_FORMAT);
  });
});
