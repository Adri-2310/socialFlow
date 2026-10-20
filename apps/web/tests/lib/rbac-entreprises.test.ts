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
  sendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorEnabledEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorDisabledEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountUnlinkedEmail: vi.fn().mockResolvedValue(undefined),
}));

const { auth } = await import('@/lib/auth/auth');
const { prisma } = await import('@/lib/prisma');
const { POST: createRoute } = await import('@/app/api/cabinet/entreprises/route');
const {
  PATCH: patchRoute,
  DELETE: archiveRoute,
  PUT: restoreRoute,
} = await import('@/app/api/cabinet/entreprises/[id]/route');
const { PATCH: patchGestionnaire, DELETE: deleteGestionnaire } = await import(
  '@/app/api/gestionnaires/[id]/route'
);
const { normalizeVatNumber } = await import('@/lib/cabinet/cabinet-identity');
const { getCabinetQuotaUsage } = await import('@/lib/billing/cabinet-quotas');
const { getEntreprises } = await import('@/lib/entreprise/cabinet-entreprises');
const { buildCabinetAlerts } = await import('@/lib/cabinet/cabinet-alerts');

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
  await prisma.verification.deleteMany({
    where: { OR: [{ identifier: { contains: TEST_EMAIL_PREFIX } }, { value: { contains: TEST_EMAIL_PREFIX } }] },
  });
  await prisma.pricingPlan.deleteMany({ where: { planId: { startsWith: 'vitest-quota-' } } });
});

async function creerCabinetRH(label: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(
    await auth.api.signUpEmail({
      body: { name: 'Cabinet Entreprises Test', email: mail, password: PASSWORD },
      asResponse: true,
    }),
  );
  const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  return { cj, user };
}

/** Cree un gestionnaire (avec session) rattache au cabinet donne. */
async function creerGestionnaire(cabinetId: string, label: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(
    await auth.api.signUpEmail({
      body: { name: `Gestionnaire ${label}`, email: mail, password: PASSWORD },
      asResponse: true,
    }),
  );
  const created = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  const phantomCabinetId = created.cabinetId!;
  await prisma.user.update({
    where: { id: created.id },
    data: { role: 'GESTIONNAIRE_RH', cabinetId },
  });
  await prisma.cabinet.delete({ where: { id: phantomCabinetId } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: created.id } });
  return { cj, user };
}

// N° d'entreprise belge valide a partir de 8 chiffres de base (les deux
// derniers chiffres sont le controle modulo 97).
let vatCounter = 10_000_000;
function nouveauNumero(): string {
  vatCounter += 1;
  const base = vatCounter;
  const check = String(97 - (base % 97)).padStart(2, '0');
  const vat = normalizeVatNumber(`${base}${check}`);
  if (!vat) throw new Error('numero de test invalide');
  return vat;
}

function donnees(gestionnaireIds: string[], overrides: Record<string, unknown> = {}) {
  return { name: 'Boulangerie Dupont', vatNumber: nouveauNumero(), gestionnaireIds, ...overrides };
}

type Jar = ReturnType<typeof cookieJar>;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function request(method: string, id: string | null, cj?: Jar, body?: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return new Request(`${APP_URL}/api/cabinet/entreprises${id ? `/${id}` : ''}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const creer = (body: unknown, cj?: Jar) => createRoute(request('POST', null, cj, body));
const modifier = (id: string, body: unknown, cj?: Jar) =>
  patchRoute(request('PATCH', id, cj, body), ctx(id));
const archiver = (id: string, cj?: Jar) => archiveRoute(request('DELETE', id, cj), ctx(id));
const restaurer = (id: string, cj?: Jar) => restoreRoute(request('PUT', id, cj), ctx(id));

function gestionnaireRequest(method: string, id: string, cj: Jar, body?: unknown) {
  return new Request(`${APP_URL}/api/gestionnaires/${id}`, {
    method,
    headers: { 'content-type': 'application/json', cookie: cj.headers().get('cookie') ?? '' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function creerPlan(label: string, maxEntreprises: number | null) {
  const planId = `vitest-quota-${label}-${Date.now()}`;
  await prisma.pricingPlan.create({
    data: { planId, name: planId, description: 'plan de test', features: ['test'], maxEntreprises },
  });
  return planId;
}

describe('creation d une entreprise (D4)', () => {
  it('refuse sans session et a un role autre que Cabinet RH', async () => {
    const { user: titulaire } = await creerCabinetRH('ent-roles');
    const { cj: gestionnaire, user } = await creerGestionnaire(titulaire.cabinetId!, 'ent-roles-g');

    expect((await creer(donnees([user.id]))).status).toBe(401);
    expect((await creer(donnees([user.id]), gestionnaire)).status).toBe(403);
  });

  it('cree l entreprise, ses assignations et l entree d audit', async () => {
    const { cj, user: titulaire } = await creerCabinetRH('ent-ok');
    const cabinetId = titulaire.cabinetId!;
    const { user: g1 } = await creerGestionnaire(cabinetId, 'ent-ok-g1');
    const { user: g2 } = await creerGestionnaire(cabinetId, 'ent-ok-g2');

    const res = await creer(donnees([g1.id, g2.id], { city: 'Namur', contactEmail: 'Contact@Dupont.be' }), cj);
    expect(res.status).toBe(201);
    const { id } = await res.json();

    const entreprise = await prisma.entreprise.findUniqueOrThrow({
      where: { id },
      include: { gestionnaires: true },
    });
    expect(entreprise.cabinetId).toBe(cabinetId);
    expect(entreprise.contactEmail).toBe('contact@dupont.be');
    expect(entreprise.gestionnaires.map((g) => g.userId).sort()).toEqual([g1.id, g2.id].sort());

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { cabinetId, action: 'ENTREPRISE_CREATED' },
    });
    expect(audit.actorId).toBe(titulaire.id);
    expect(audit.metadata).toMatchObject({ entrepriseId: id, entreprise: 'Boulangerie Dupont' });
  });

  it('exige un numero valide, une raison sociale et au moins un gestionnaire', async () => {
    const { cj, user: titulaire } = await creerCabinetRH('ent-valid');
    const { user: g } = await creerGestionnaire(titulaire.cabinetId!, 'ent-valid-g');

    const numero = await creer(donnees([g.id], { vatNumber: 'BE0123.456.700' }), cj);
    expect(numero.status).toBe(400);
    expect((await numero.json()).fields.vatNumber).toBe('INVALID_VAT');

    const nom = await creer(donnees([g.id], { name: ' ' }), cj);
    expect((await nom.json()).fields.name).toBe('NAME_REQUIRED');

    const aucun = await creer(donnees([]), cj);
    expect(aucun.status).toBe(400);
    expect((await aucun.json()).fields.gestionnaireIds).toBe('GESTIONNAIRE_REQUIRED');
  });

  it('refuse un gestionnaire d un autre cabinet ou archive (isolation)', async () => {
    const { cj, user: titulaire } = await creerCabinetRH('ent-iso-a');
    const { user: autreTitulaire } = await creerCabinetRH('ent-iso-b');
    const { user: etranger } = await creerGestionnaire(autreTitulaire.cabinetId!, 'ent-iso-etranger');
    const { user: retire } = await creerGestionnaire(titulaire.cabinetId!, 'ent-iso-retire');
    await prisma.user.update({ where: { id: retire.id }, data: { deletedAt: new Date() } });

    const etrangerRes = await creer(donnees([etranger.id]), cj);
    expect(etrangerRes.status).toBe(400);
    expect((await etrangerRes.json()).fields.gestionnaireIds).toBe('GESTIONNAIRE_INVALID');

    const retireRes = await creer(donnees([retire.id]), cj);
    expect((await retireRes.json()).fields.gestionnaireIds).toBe('GESTIONNAIRE_INVALID');
    expect(await prisma.entreprise.count({ where: { cabinetId: titulaire.cabinetId! } })).toBe(0);
  });

  it('exige au moins un gestionnaire actif (D27)', async () => {
    const { cj, user: titulaire } = await creerCabinetRH('ent-actif');
    const { user: suspendu } = await creerGestionnaire(titulaire.cabinetId!, 'ent-actif-susp');
    await prisma.user.update({ where: { id: suspendu.id }, data: { status: 'suspendu' } });

    const res = await creer(donnees([suspendu.id]), cj);
    expect(res.status).toBe(400);
    expect((await res.json()).fields.gestionnaireIds).toBe('NO_ACTIVE_GESTIONNAIRE');
  });

  it('refuse un numero deja pris dans le cabinet, mais l autorise dans un autre', async () => {
    const { cj, user: titulaire } = await creerCabinetRH('ent-vat-a');
    const { cj: cjB, user: titulaireB } = await creerCabinetRH('ent-vat-b');
    const { user: gA } = await creerGestionnaire(titulaire.cabinetId!, 'ent-vat-ga');
    const { user: gB } = await creerGestionnaire(titulaireB.cabinetId!, 'ent-vat-gb');
    const vatNumber = nouveauNumero();

    expect((await creer(donnees([gA.id], { vatNumber }), cj)).status).toBe(201);
    const doublon = await creer(donnees([gA.id], { vatNumber }), cj);
    expect(doublon.status).toBe(409);
    expect((await doublon.json()).fields.vatNumber).toBe('VAT_ALREADY_USED');

    expect((await creer(donnees([gB.id], { vatNumber }), cjB)).status).toBe(201);
  });

  it('refuse au-dela de maxEntreprises (D15) et libere la place a l archivage', async () => {
    const { cj, user: titulaire } = await creerCabinetRH('ent-quota');
    const cabinetId = titulaire.cabinetId!;
    await prisma.cabinet.update({
      where: { id: cabinetId },
      data: { planId: await creerPlan('ent', 1) },
    });
    const { user: g } = await creerGestionnaire(cabinetId, 'ent-quota-g');

    const premiere = await creer(donnees([g.id]), cj);
    expect(premiere.status).toBe(201);
    const { id } = await premiere.json();

    const refus = await creer(donnees([g.id]), cj);
    expect(refus.status).toBe(403);
    expect(await refus.json()).toEqual({
      error: 'QUOTA_EXCEEDED',
      quota: 'maxEntreprises',
      limit: 1,
      used: 1,
    });
    expect((await getCabinetQuotaUsage(cabinetId)).entreprises.used).toBe(1);

    // Archivee : la place est liberee.
    expect((await archiver(id, cj)).status).toBe(200);
    expect((await getCabinetQuotaUsage(cabinetId)).entreprises.used).toBe(0);
    expect((await creer(donnees([g.id]), cj)).status).toBe(201);

    // Restaurer reprend une place : refuse tant que le quota est atteint.
    const restauration = await restaurer(id, cj);
    expect(restauration.status).toBe(403);
    expect((await restauration.json()).error).toBe('QUOTA_EXCEEDED');
  });

  it('refuse en lecture seule (423) sans rien ecrire', async () => {
    const { cj, user: titulaire } = await creerCabinetRH('ent-readonly');
    const { user: g } = await creerGestionnaire(titulaire.cabinetId!, 'ent-readonly-g');
    await prisma.cabinet.update({
      where: { id: titulaire.cabinetId! },
      data: { billingStatus: 'IMPAYE' },
    });

    const res = await creer(donnees([g.id]), cj);
    expect(res.status).toBe(423);
    expect((await res.json()).error).toBe('CABINET_READ_ONLY');
    expect(await prisma.entreprise.count({ where: { cabinetId: titulaire.cabinetId! } })).toBe(0);
  });
});

describe('modification, archivage et restauration', () => {
  async function entrepriseExistante(label: string) {
    const { cj, user: titulaire } = await creerCabinetRH(label);
    const cabinetId = titulaire.cabinetId!;
    const { user: g1 } = await creerGestionnaire(cabinetId, `${label}-g1`);
    const { user: g2 } = await creerGestionnaire(cabinetId, `${label}-g2`);
    const res = await creer(donnees([g1.id]), cj);
    const { id } = await res.json();
    return { cj, cabinetId, titulaire, g1, g2, id };
  }

  it('modifie les coordonnees et les assignations, et journalise les champs seulement', async () => {
    const { cj, cabinetId, g1, g2, id } = await entrepriseExistante('ent-patch');

    const res = await modifier(
      id,
      { name: 'Boulangerie Dupont SRL', vatNumber: nouveauNumero(), city: 'Liège', gestionnaireIds: [g2.id] },
      cj,
    );
    expect(res.status).toBe(200);

    const apres = await prisma.entreprise.findUniqueOrThrow({
      where: { id },
      include: { gestionnaires: true },
    });
    expect(apres.name).toBe('Boulangerie Dupont SRL');
    expect(apres.gestionnaires.map((g) => g.userId)).toEqual([g2.id]);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { cabinetId, action: 'ENTREPRISE_UPDATED' },
    });
    expect(audit.metadata).toMatchObject({
      entrepriseId: id,
      fields: expect.arrayContaining(['name', 'vatNumber', 'city', 'gestionnaires']),
      assigned: [g2.id],
      unassigned: [g1.id],
    });
    expect(JSON.stringify(audit.metadata)).not.toContain('Liège');
  });

  it('n ecrit rien quand rien ne change', async () => {
    const { cj, cabinetId, g1, id } = await entrepriseExistante('ent-noop');
    const actuelle = await prisma.entreprise.findUniqueOrThrow({ where: { id } });

    const res = await modifier(
      id,
      { name: actuelle.name, vatNumber: actuelle.vatNumber, gestionnaireIds: [g1.id] },
      cj,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).changed).toEqual([]);
    expect(await prisma.auditLog.count({ where: { cabinetId, action: 'ENTREPRISE_UPDATED' } })).toBe(0);
  });

  it('renvoie 404 pour une entreprise d un autre cabinet (isolation)', async () => {
    const { id, g1 } = await entrepriseExistante('ent-iso-cible');
    const { cj: autre, user: autreTitulaire } = await creerCabinetRH('ent-iso-intrus');
    const { user: gAutre } = await creerGestionnaire(autreTitulaire.cabinetId!, 'ent-iso-intrus-g');

    expect((await modifier(id, donnees([gAutre.id]), autre)).status).toBe(404);
    expect((await archiver(id, autre)).status).toBe(404);
    expect((await restaurer(id, autre)).status).toBe(404);
    // Meme en nommant un gestionnaire du cabinet cible, rien ne change.
    expect((await modifier(id, donnees([g1.id]), autre)).status).toBe(404);

    const intacte = await prisma.entreprise.findUniqueOrThrow({ where: { id } });
    expect(intacte.name).toBe('Boulangerie Dupont');
    expect(intacte.deletedAt).toBeNull();
  });

  it('archive puis restaure, avec audit, et refuse les doubles actions', async () => {
    const { cj, cabinetId, g1, id } = await entrepriseExistante('ent-cycle');

    expect((await archiver(id, cj)).status).toBe(200);
    expect((await archiver(id, cj)).status).toBe(409);
    expect((await prisma.entreprise.findUniqueOrThrow({ where: { id } })).deletedAt).not.toBeNull();
    // Une entreprise archivee n'est plus modifiable.
    expect((await modifier(id, donnees([g1.id]), cj)).status).toBe(404);

    expect((await restaurer(id, cj)).status).toBe(200);
    expect((await restaurer(id, cj)).status).toBe(409);
    expect((await prisma.entreprise.findUniqueOrThrow({ where: { id } })).deletedAt).toBeNull();

    const actions = (
      await prisma.auditLog.findMany({
        where: { cabinetId, action: { startsWith: 'ENTREPRISE_' } },
        orderBy: { createdAt: 'asc' },
      })
    ).map((a) => a.action);
    expect(actions).toEqual(['ENTREPRISE_CREATED', 'ENTREPRISE_ARCHIVED', 'ENTREPRISE_RESTORED']);
  });

  it('refuse l archivage en lecture seule (423)', async () => {
    const { cj, cabinetId, id } = await entrepriseExistante('ent-ro-archive');
    await prisma.cabinet.update({ where: { id: cabinetId }, data: { billingStatus: 'RESILIE' } });

    expect((await archiver(id, cj)).status).toBe(423);
    expect((await prisma.entreprise.findUniqueOrThrow({ where: { id } })).deletedAt).toBeNull();
  });
});

describe('couverture des entreprises (D27)', () => {
  it('refuse de suspendre ou retirer le seul gestionnaire d une entreprise (409)', async () => {
    const { cj, user: titulaire } = await creerCabinetRH('d27-seul');
    const cabinetId = titulaire.cabinetId!;
    const { user: seul } = await creerGestionnaire(cabinetId, 'd27-seul-g');
    const { id } = await (await creer(donnees([seul.id], { name: 'Couverte Seule' }), cj)).json();

    const suspension = await patchGestionnaire(
      gestionnaireRequest('PATCH', seul.id, cj, { status: 'suspendu' }),
      ctx(seul.id),
    );
    expect(suspension.status).toBe(409);
    expect(await suspension.json()).toEqual({
      error: 'GESTIONNAIRE_HAS_UNCOVERED_ENTREPRISES',
      entreprises: [{ id, name: 'Couverte Seule' }],
    });

    const retrait = await deleteGestionnaire(gestionnaireRequest('DELETE', seul.id, cj), ctx(seul.id));
    expect(retrait.status).toBe(409);

    const intact = await prisma.user.findUniqueOrThrow({ where: { id: seul.id } });
    expect(intact.status).toBe('actif');
    expect(intact.deletedAt).toBeNull();
  });

  it('autorise la suspension quand un autre gestionnaire actif couvre l entreprise', async () => {
    const { cj, user: titulaire } = await creerCabinetRH('d27-duo');
    const cabinetId = titulaire.cabinetId!;
    const { user: g1 } = await creerGestionnaire(cabinetId, 'd27-duo-g1');
    const { user: g2 } = await creerGestionnaire(cabinetId, 'd27-duo-g2');
    await creer(donnees([g1.id, g2.id]), cj);

    const suspension = await patchGestionnaire(
      gestionnaireRequest('PATCH', g1.id, cj, { status: 'suspendu' }),
      ctx(g1.id),
    );
    expect(suspension.status).toBe(200);

    // g1 suspendu : g2 devient le seul gestionnaire actif, il est protege a son tour.
    const refus = await patchGestionnaire(
      gestionnaireRequest('PATCH', g2.id, cj, { status: 'suspendu' }),
      ctx(g2.id),
    );
    expect(refus.status).toBe(409);
  });

  it('ignore les entreprises archivees et signale une entreprise sans gestionnaire actif', async () => {
    const { cj, user: titulaire } = await creerCabinetRH('d27-archivee');
    const cabinetId = titulaire.cabinetId!;
    const { user: g } = await creerGestionnaire(cabinetId, 'd27-archivee-g');
    const { id } = await (await creer(donnees([g.id], { name: 'Sera Archivee' }), cj)).json();
    await archiver(id, cj);

    // Entreprise archivee : plus de blocage.
    const suspension = await patchGestionnaire(
      gestionnaireRequest('PATCH', g.id, cj, { status: 'suspendu' }),
      ctx(g.id),
    );
    expect(suspension.status).toBe(200);

    // Restauree alors que son seul gestionnaire est suspendu : alerte.
    await restaurer(id, cj);
    const entreprises = await getEntreprises(cabinetId);
    expect(entreprises).toHaveLength(1);
    expect(entreprises[0].covered).toBe(false);

    const alerts = buildCabinetAlerts({
      quotas: await getCabinetQuotaUsage(cabinetId),
      invitations: [],
      gestionnaires: [],
      archived: [],
      entreprises,
    });
    expect(alerts.find((a) => a.id === 'entreprises-sans-gestionnaire')).toMatchObject({
      level: 'danger',
      href: '/dashboard/cabinet/entreprises',
    });
  });
});
