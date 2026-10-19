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
  sendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorEnabledEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorDisabledEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountUnlinkedEmail: vi.fn().mockResolvedValue(undefined),
}));

const { auth } = await import('@/lib/auth');
const { prisma } = await import('@/lib/prisma');
const { authorize, resolveScope, entrepriseWhere } = await import('@/lib/authz');

const PASSWORD = 'InitialPass123!';

afterAll(async () => {
  const testUsers = await prisma.user.findMany({
    where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    select: { cabinetId: true },
  });
  const cabinetIds = testUsers.map((u) => u.cabinetId).filter((id): id is string => !!id);
  await prisma.auditLog.deleteMany({ where: { cabinetId: { in: cabinetIds } } });
  await prisma.cabinet.deleteMany({ where: { id: { in: cabinetIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.verification.deleteMany({
    where: { OR: [{ identifier: { contains: TEST_EMAIL_PREFIX } }, { value: { contains: TEST_EMAIL_PREFIX } }] },
  });
});

type Jar = ReturnType<typeof cookieJar>;

async function creerCompte(label: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(await auth.api.signUpEmail({ body: { name: label, email: mail, password: PASSWORD }, asResponse: true }));
  return { cj, user: await prisma.user.findUniqueOrThrow({ where: { email: mail } }) };
}

// L'inscription crée un Cabinet RH et son cabinet ; les autres rôles reprennent
// le cabinet voulu et l'on supprime celui créé à l'inscription.
async function creerAvecRole(label: string, role: string, cabinetId: string) {
  const { cj, user } = await creerCompte(label);
  await prisma.user.update({ where: { id: user.id }, data: { role, cabinetId } });
  await prisma.cabinet.delete({ where: { id: user.cabinetId! } });
  return { cj, user: await prisma.user.findUniqueOrThrow({ where: { id: user.id } }) };
}

let vat = 30_000_000;
const creerEntreprise = (cabinetId: string, extra: { deletedAt?: Date; adminUserId?: string } = {}) =>
  prisma.entreprise.create({ data: { cabinetId, name: 'Entreprise de test', vatNumber: `BE0${++vat}`, ...extra } });

const requete = (cj: Jar) => new Request('http://localhost/api/test', { headers: { cookie: cj.headers().get('cookie') ?? '' } });
const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe('périmètre d un gestionnaire (assignations lues à chaque requête)', () => {
  it('ne voit que les entreprises assignées, non archivées, de son cabinet', async () => {
    const { user: titulaire } = await creerCompte('scope-gest-cabinet-a');
    const { user: autreTitulaire } = await creerCompte('scope-gest-cabinet-b');
    const cabinetA = titulaire.cabinetId!;
    const { user: gestionnaire } = await creerAvecRole('scope-gest', 'GESTIONNAIRE_RH', cabinetA);

    const assignee = await creerEntreprise(cabinetA);
    const nonAssignee = await creerEntreprise(cabinetA);
    const archivee = await creerEntreprise(cabinetA, { deletedAt: new Date() });
    const autreCabinet = await creerEntreprise(autreTitulaire.cabinetId!);
    await prisma.gestionnaireEntreprise.createMany({
      data: [assignee, archivee, autreCabinet].map((e) => ({ entrepriseId: e.id, userId: gestionnaire.id })),
    });

    const scope = await resolveScope(gestionnaire);
    expect(scope).toEqual({ kind: 'entreprises', cabinetId: cabinetA, entrepriseIds: [assignee.id] });

    const visibles = await prisma.entreprise.findMany({ where: entrepriseWhere(scope!), select: { id: true } });
    expect(ids(visibles)).toEqual([assignee.id]);
    expect(ids(visibles)).not.toContain(nonAssignee.id);
  });

  it('suit immédiatement un changement d assignation, sans cache', async () => {
    const { user: titulaire } = await creerCompte('scope-gest-live');
    const cabinetId = titulaire.cabinetId!;
    const { user: gestionnaire } = await creerAvecRole('scope-gest-live-g', 'GESTIONNAIRE_RH', cabinetId);
    const e1 = await creerEntreprise(cabinetId);
    const e2 = await creerEntreprise(cabinetId);

    const lire = async () => {
      const scope = await resolveScope(gestionnaire);
      return scope?.kind === 'entreprises' ? [...scope.entrepriseIds].sort() : null;
    };
    expect(await lire()).toEqual([]);

    await prisma.gestionnaireEntreprise.create({ data: { entrepriseId: e1.id, userId: gestionnaire.id } });
    expect(await lire()).toEqual([e1.id]);

    await prisma.gestionnaireEntreprise.create({ data: { entrepriseId: e2.id, userId: gestionnaire.id } });
    expect(await lire()).toEqual([e1.id, e2.id].sort());

    await prisma.gestionnaireEntreprise.delete({
      where: { entrepriseId_userId: { entrepriseId: e1.id, userId: gestionnaire.id } },
    });
    expect(await lire()).toEqual([e2.id]);
  });
});

describe('périmètre d une entreprise cliente', () => {
  it('se limite à sa seule entreprise', async () => {
    const { user: titulaire } = await creerCompte('scope-ent');
    const cabinetId = titulaire.cabinetId!;
    const sienne = await creerEntreprise(cabinetId);
    const autre = await creerEntreprise(cabinetId);
    const { user: admin } = await creerAvecRole('scope-ent-admin', 'ENTREPRISE_CLIENTE', cabinetId);
    await prisma.entreprise.update({ where: { id: sienne.id }, data: { adminUserId: admin.id } });

    const scope = await resolveScope(admin);
    expect(scope).toEqual({ kind: 'entreprise', cabinetId, entrepriseId: sienne.id });

    const visibles = await prisma.entreprise.findMany({ where: entrepriseWhere(scope!), select: { id: true } });
    expect(ids(visibles)).toEqual([sienne.id]);
    expect(ids(visibles)).not.toContain(autre.id);
  });

  it('n a aucun périmètre sans entreprise, ou si elle est archivée', async () => {
    const { user: titulaire } = await creerCompte('scope-ent-vide');
    const cabinetId = titulaire.cabinetId!;
    const { user: sansEntreprise } = await creerAvecRole('scope-ent-sans', 'ENTREPRISE_CLIENTE', cabinetId);
    expect(await resolveScope(sansEntreprise)).toBeNull();

    const archivee = await creerEntreprise(cabinetId, { deletedAt: new Date() });
    const { user: adminArchive } = await creerAvecRole('scope-ent-archivee', 'ENTREPRISE_CLIENTE', cabinetId);
    await prisma.entreprise.update({ where: { id: archivee.id }, data: { adminUserId: adminArchive.id } });
    expect(await resolveScope(adminArchive)).toBeNull();
  });
});

describe('périmètre du Cabinet RH et isolation entre cabinets', () => {
  it('voit les entreprises de son cabinet et aucune d un autre', async () => {
    const { user: a } = await creerCompte('scope-cab-a');
    const { user: b } = await creerCompte('scope-cab-b');
    const eA = await creerEntreprise(a.cabinetId!);
    const eB = await creerEntreprise(b.cabinetId!);

    const scope = await resolveScope(a);
    expect(scope).toEqual({ kind: 'cabinet', cabinetId: a.cabinetId });
    const visibles = await prisma.entreprise.findMany({ where: entrepriseWhere(scope!), select: { id: true } });
    expect(ids(visibles)).toEqual([eA.id]);
    expect(ids(visibles)).not.toContain(eB.id);
  });

  it('ne donne aucune entreprise à la plateforme ni au collaborateur (D8)', async () => {
    const { user } = await creerCompte('scope-plateforme');
    await creerEntreprise(user.cabinetId!);

    for (const scope of [{ kind: 'platform' }, { kind: 'self', userId: user.id }] as const) {
      expect(await prisma.entreprise.findMany({ where: entrepriseWhere(scope) })).toEqual([]);
    }
  });
});

describe('authorize avec de vraies sessions', () => {
  it('renvoie le périmètre déduit de la base, jamais de la requête', async () => {
    const { cj: cjTitulaire, user: titulaire } = await creerCompte('scope-auth-titulaire');
    const cabinetId = titulaire.cabinetId!;
    const { cj: cjGest, user: gest } = await creerAvecRole('scope-auth-gest', 'GESTIONNAIRE_RH', cabinetId);
    const entreprise = await creerEntreprise(cabinetId);
    await prisma.gestionnaireEntreprise.create({ data: { entrepriseId: entreprise.id, userId: gest.id } });

    const titulaireRes = await authorize(requete(cjTitulaire), 'entreprise.lister');
    expect(titulaireRes.scope).toEqual({ kind: 'cabinet', cabinetId });
    expect(titulaireRes.level).toBe('ALLOW');

    const gestRes = await authorize(requete(cjGest), 'entreprise.lister');
    expect(gestRes.scope).toEqual({ kind: 'entreprises', cabinetId, entrepriseIds: [entreprise.id] });
    expect(gestRes.level).toBe('SCOPED');
  });

  it('refuse le gestionnaire pour une action réservée au Cabinet RH', async () => {
    const { user: titulaire } = await creerCompte('scope-auth-refus');
    const { cj } = await creerAvecRole('scope-auth-refus-g', 'GESTIONNAIRE_RH', titulaire.cabinetId!);
    const res = await authorize(requete(cj), 'entreprise.gerer');
    expect(res.response?.status).toBe(403);
  });
});
