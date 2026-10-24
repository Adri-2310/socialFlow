// @vitest-environment node
import { afterAll, describe, expect, it, vi } from 'vitest';
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
  sendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorEnabledEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorDisabledEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountUnlinkedEmail: vi.fn().mockResolvedValue(undefined),
}));

const { auth } = await import('@/lib/auth/auth');
const { prisma } = await import('@/lib/prisma');
const { supprimerCabinetsEtDonnees } = await import('@/lib/cabinet/cabinet-purge');
const { GET: lister, POST: ouvrir } = await import('@/app/api/entreprises/[id]/periodes/route');
const { PATCH: decaler } = await import('@/app/api/periodes/[id]/route');
const { PUT: verrouiller, DELETE: deverrouiller } =
  await import('@/app/api/periodes/[id]/verrouillage/route');
const { getCabinetAuditLog } = await import('@/lib/cabinet/cabinet-audit');
const { buildCabinetExport } = await import('@/lib/cabinet/cabinet-export');

afterAll(async () => {
  const testUsers = await prisma.user.findMany({
    where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    select: { cabinetId: true },
  });
  const cabinetIds = testUsers.map((u) => u.cabinetId).filter((id): id is string => !!id);
  // Les périodes et leurs prestations sont supprimés avec le cabinet par supprimerCabinetsEtDonnees (D94 : Restrict).
  await prisma.auditLog.deleteMany({ where: { cabinetId: { in: cabinetIds } } });
  await supprimerCabinetsEtDonnees(cabinetIds);
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.verification.deleteMany({
    where: {
      OR: [
        { identifier: { contains: TEST_EMAIL_PREFIX } },
        { value: { contains: TEST_EMAIL_PREFIX } },
      ],
    },
  });
});

type Jar = ReturnType<typeof cookieJar>;

async function creerCompte(label: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(
    await auth.api.signUpEmail({
      body: { name: label, email: mail, password: 'InitialPass123!' },
      asResponse: true,
    }),
  );
  return { cj, user: await prisma.user.findUniqueOrThrow({ where: { email: mail } }) };
}

// L'inscription crée un Cabinet RH et son cabinet ; les autres rôles reprennent
// le cabinet voulu et l'on supprime celui créé à l'inscription.
async function creerAvecRole(label: string, role: string, cabinetId: string) {
  const { cj, user } = await creerCompte(label);
  await prisma.user.update({ where: { id: user.id }, data: { role, cabinetId } });
  await supprimerCabinetsEtDonnees([user.cabinetId!]);
  return { cj, user: await prisma.user.findUniqueOrThrow({ where: { id: user.id } }) };
}

let vat = 96_000_000;
const creerEntreprise = (
  cabinetId: string,
  extra: { deletedAt?: Date; jourLimitePrestations?: number } = {},
) =>
  prisma.entreprise.create({
    data: { cabinetId, name: 'Entreprise de test', vatNumber: `BE0${++vat}`, ...extra },
  });

// Mois relatifs à aujourd'hui : les tests restent justes quand la date réelle avance.
function moisRelatif(delta: number) {
  const d = new Date();
  const index = d.getUTCFullYear() * 12 + d.getUTCMonth() + delta;
  return { annee: Math.floor(index / 12), mois: (index % 12) + 1 };
}

const entetes = (cj?: Jar) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return headers;
};

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const urlEntreprise = (id: string) => `http://localhost:3000/api/entreprises/${id}/periodes`;
const urlPeriode = (id: string, suite = '') => `http://localhost:3000/api/periodes/${id}${suite}`;

const ouvrirPeriode = (entrepriseId: string, body: unknown, cj?: Jar) =>
  ouvrir(
    new Request(urlEntreprise(entrepriseId), {
      method: 'POST',
      headers: entetes(cj),
      body: JSON.stringify(body),
    }),
    ctx(entrepriseId),
  );
const listerPeriodes = (entrepriseId: string, cj?: Jar) =>
  lister(new Request(urlEntreprise(entrepriseId), { headers: entetes(cj) }), ctx(entrepriseId));
const changerDateLimite = (id: string, body: unknown, cj?: Jar) =>
  decaler(
    new Request(urlPeriode(id), {
      method: 'PATCH',
      headers: entetes(cj),
      body: JSON.stringify(body),
    }),
    ctx(id),
  );
const verrouillerPeriode = (id: string, cj?: Jar) =>
  verrouiller(
    new Request(urlPeriode(id, '/verrouillage'), { method: 'PUT', headers: entetes(cj) }),
    ctx(id),
  );
const deverrouillerPeriode = (id: string, cj?: Jar) =>
  deverrouiller(
    new Request(urlPeriode(id, '/verrouillage'), { method: 'DELETE', headers: entetes(cj) }),
    ctx(id),
  );

// Un cabinet, un gestionnaire assigné à une entreprise (jour limite 20 par défaut).
async function mise(label: string, extra: { jourLimitePrestations?: number } = {}) {
  const { user: titulaire, cj: cjTitulaire } = await creerCompte(`${label}-t`);
  const cabinetId = titulaire.cabinetId!;
  const gestionnaire = await creerAvecRole(`${label}-g`, 'GESTIONNAIRE_RH', cabinetId);
  const entreprise = await creerEntreprise(cabinetId, extra);
  await prisma.gestionnaireEntreprise.create({
    data: { entrepriseId: entreprise.id, userId: gestionnaire.user.id },
  });
  return { cabinetId, cjTitulaire, gestionnaire, entreprise };
}

// Une période déjà ouverte par le gestionnaire.
async function miseAvecPeriode(label: string) {
  const base = await mise(label);
  const { annee, mois } = moisRelatif(0);
  const res = await ouvrirPeriode(base.entreprise.id, { annee, mois }, base.gestionnaire.cj);
  const { id } = await res.json();
  return { ...base, annee, mois, periodeId: id as string };
}

const audits = (cabinetId: string, action: string) =>
  prisma.auditLog.findMany({ where: { cabinetId, action } });
const statutDe = async (id: string) =>
  (await prisma.periodePaie.findUniqueOrThrow({ where: { id } })).statut;

describe('POST /api/entreprises/[id]/periodes : ouverture', () => {
  it('ouvre la période avec la date limite du mois et journalise sans la date (D90, D91)', async () => {
    const { cabinetId, gestionnaire, entreprise } = await mise('per-ouvre', {
      jourLimitePrestations: 15,
    });
    const { annee, mois } = moisRelatif(1);

    const res = await ouvrirPeriode(entreprise.id, { annee, mois }, gestionnaire.cj);
    expect(res.status).toBe(201);
    const corps = await res.json();
    const attendue = `${annee}-${String(mois).padStart(2, '0')}-15`;
    expect(corps.dateLimite).toBe(attendue);

    const periode = await prisma.periodePaie.findUniqueOrThrow({ where: { id: corps.id } });
    expect(periode).toMatchObject({
      cabinetId,
      entrepriseId: entreprise.id,
      annee,
      mois,
      statut: 'OUVERTE',
      ouverteParId: gestionnaire.user.id,
      verrouilleeLe: null,
    });
    expect(periode.dateLimite.toISOString().slice(0, 10)).toBe(attendue);

    const [audit] = await audits(cabinetId, 'PERIODE_OPENED');
    expect(audit.actorId).toBe(gestionnaire.user.id);
    expect(audit.metadata).toEqual({
      periodeId: corps.id,
      entrepriseId: entreprise.id,
      annee,
      mois,
    });
    expect(JSON.stringify(audit)).not.toContain(attendue);
  });

  it('pose le jour 20 par défaut', async () => {
    const { gestionnaire, entreprise } = await mise('per-defaut');
    const { annee, mois } = moisRelatif(0);

    const res = await ouvrirPeriode(entreprise.id, { annee, mois }, gestionnaire.cj);
    expect((await res.json()).dateLimite).toBe(`${annee}-${String(mois).padStart(2, '0')}-20`);
  });

  it('accepte un mois passé, y compris l année précédente (rattrapage)', async () => {
    const { gestionnaire, entreprise } = await mise('per-rattrapage');

    for (const delta of [-1, -14]) {
      const res = await ouvrirPeriode(entreprise.id, moisRelatif(delta), gestionnaire.cj);
      expect(res.status, `mois ${delta}`).toBe(201);
    }
  });

  it('refuse un mois au-delà du mois suivant et n écrit rien', async () => {
    const { cabinetId, gestionnaire, entreprise } = await mise('per-trop-loin');

    const res = await ouvrirPeriode(entreprise.id, moisRelatif(2), gestionnaire.cj);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'PERIODE_OUT_OF_RANGE',
      fields: { mois: 'PERIODE_OUT_OF_RANGE' },
    });
    expect(await prisma.periodePaie.count({ where: { entrepriseId: entreprise.id } })).toBe(0);
    expect(await audits(cabinetId, 'PERIODE_OPENED')).toHaveLength(0);
  });

  it('refuse une deuxième période pour le même mois, même ouvertes en même temps', async () => {
    const { cabinetId, gestionnaire, entreprise } = await mise('per-doublon');
    const { annee, mois } = moisRelatif(0);

    const premiere = await ouvrirPeriode(entreprise.id, { annee, mois }, gestionnaire.cj);
    expect(premiere.status).toBe(201);
    const doublon = await ouvrirPeriode(entreprise.id, { annee, mois }, gestionnaire.cj);
    expect(doublon.status).toBe(409);
    expect(await doublon.json()).toEqual({ error: 'PERIODE_ALREADY_EXISTS' });

    // Deux demandes simultanées pour un autre mois : une seule passe.
    const autre = moisRelatif(-3);
    const [a, b] = await Promise.all([
      ouvrirPeriode(entreprise.id, autre, gestionnaire.cj),
      ouvrirPeriode(entreprise.id, autre, gestionnaire.cj),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await prisma.periodePaie.count({ where: { entrepriseId: entreprise.id } })).toBe(2);
    expect(await audits(cabinetId, 'PERIODE_OPENED')).toHaveLength(2);
  });

  it('refuse un corps invalide, champ par champ', async () => {
    const { gestionnaire, entreprise } = await mise('per-invalide');
    const { annee } = moisRelatif(0);

    for (const [corps, champ] of [
      [{ annee, mois: 13 }, 'mois'],
      [{ annee, mois: 0 }, 'mois'],
      [{ annee, mois: 3.5 }, 'mois'],
      [{ annee, mois: '3' }, 'mois'],
      [{ annee: 1999, mois: 3 }, 'annee'],
      [{ annee: '2026', mois: 3 }, 'annee'],
      [{ mois: 3 }, 'annee'],
      [null, undefined],
    ] as const) {
      const res = await ouvrirPeriode(entreprise.id, corps, gestionnaire.cj);
      expect(res.status, JSON.stringify(corps)).toBe(400);
      if (champ) expect(Object.keys((await res.json()).fields)).toContain(champ);
    }
    expect(await prisma.periodePaie.count({ where: { entrepriseId: entreprise.id } })).toBe(0);
  });
});

describe('isolation : ouverture et lecture des périodes', () => {
  it('répond 404 hors périmètre, avant même de regarder le corps (D26, D27)', async () => {
    const { cabinetId, gestionnaire } = await mise('per-iso-a');
    const { annee, mois } = moisRelatif(0);

    // Même cabinet, non assignée / archivée ; autre cabinet ; inexistante.
    const nonAssignee = await creerEntreprise(cabinetId);
    const archivee = await creerEntreprise(cabinetId, { deletedAt: new Date() });
    await prisma.gestionnaireEntreprise.create({
      data: { entrepriseId: archivee.id, userId: gestionnaire.user.id },
    });
    const autre = await mise('per-iso-b');

    for (const id of [nonAssignee.id, archivee.id, autre.entreprise.id, 'inexistante']) {
      // Corps valide, puis corps invalide : le 404 prime sur le 400.
      for (const corps of [{ annee, mois }, { annee: 'x' }]) {
        const res = await ouvrirPeriode(id, corps, gestionnaire.cj);
        expect(res.status, id).toBe(404);
        expect(await res.json()).toEqual({ error: 'ENTREPRISE_NOT_FOUND' });
      }
      expect((await listerPeriodes(id, gestionnaire.cj)).status, id).toBe(404);
    }
    expect(await prisma.periodePaie.count({ where: { cabinetId } })).toBe(0);
  });

  it('liste les périodes de la plus récente à la plus ancienne, sans fuite entre entreprises', async () => {
    const { cabinetId, gestionnaire, entreprise } = await mise('per-liste');
    const autre = await creerEntreprise(cabinetId);
    await prisma.gestionnaireEntreprise.create({
      data: { entrepriseId: autre.id, userId: gestionnaire.user.id },
    });
    for (const delta of [-2, 0, -1]) {
      await ouvrirPeriode(entreprise.id, moisRelatif(delta), gestionnaire.cj);
    }
    await ouvrirPeriode(autre.id, moisRelatif(0), gestionnaire.cj);

    const res = await listerPeriodes(entreprise.id, gestionnaire.cj);
    expect(res.status).toBe(200);
    const corps = await res.json();
    expect(corps.entreprise).toMatchObject({ id: entreprise.id, jourLimitePrestations: 20 });
    expect(corps.periodes.map((p: { annee: number; mois: number }) => [p.annee, p.mois])).toEqual(
      [0, -1, -2].map((d) => {
        const { annee, mois } = moisRelatif(d);
        return [annee, mois];
      }),
    );
    expect(corps.periodes[0]).toMatchObject({ statut: 'OUVERTE', verrouilleeLe: null });
  });

  it('refuse le Cabinet RH, le collaborateur et l absence de session (D26)', async () => {
    const { cabinetId, cjTitulaire, entreprise } = await mise('per-403');
    const { annee, mois } = moisRelatif(0);

    for (const cj of [cjTitulaire]) {
      expect((await ouvrirPeriode(entreprise.id, { annee, mois }, cj)).status).toBe(403);
      expect((await listerPeriodes(entreprise.id, cj)).status).toBe(403);
    }
    const collaborateur = await creerAvecRole('per-403-col', 'COLLABORATEUR', cabinetId);
    expect((await listerPeriodes(entreprise.id, collaborateur.cj)).status).toBe(403);
    expect((await ouvrirPeriode(entreprise.id, { annee, mois }, collaborateur.cj)).status).toBe(
      403,
    );
    expect((await listerPeriodes(entreprise.id)).status).toBe(401);
    expect(await prisma.periodePaie.count({ where: { entrepriseId: entreprise.id } })).toBe(0);
  });

  it('laisse l entreprise lire ses périodes, sans pouvoir en ouvrir ni voir celles d une autre', async () => {
    const { cabinetId, gestionnaire, entreprise } = await mise('per-ent');
    const autre = await creerEntreprise(cabinetId);
    await prisma.gestionnaireEntreprise.create({
      data: { entrepriseId: autre.id, userId: gestionnaire.user.id },
    });
    const { annee, mois } = moisRelatif(0);
    await ouvrirPeriode(entreprise.id, { annee, mois }, gestionnaire.cj);
    await ouvrirPeriode(autre.id, { annee, mois }, gestionnaire.cj);

    const admin = await creerAvecRole('per-ent-admin', 'ENTREPRISE_CLIENTE', cabinetId);
    await prisma.entreprise.update({
      where: { id: entreprise.id },
      data: { adminUserId: admin.user.id },
    });

    const sienne = await listerPeriodes(entreprise.id, admin.cj);
    expect(sienne.status).toBe(200);
    expect((await sienne.json()).periodes).toHaveLength(1);
    expect((await listerPeriodes(autre.id, admin.cj)).status).toBe(404);
    // L'entreprise ne peut ni ouvrir une période ni la verrouiller.
    expect((await ouvrirPeriode(entreprise.id, moisRelatif(-1), admin.cj)).status).toBe(403);
    const periode = await prisma.periodePaie.findFirstOrThrow({
      where: { entrepriseId: entreprise.id },
    });
    expect((await verrouillerPeriode(periode.id, admin.cj)).status).toBe(403);
    expect(await statutDe(periode.id)).toBe('OUVERTE');
  });
});

describe('PATCH /api/periodes/[id] : date limite', () => {
  it('décale la date limite de cette période seulement et journalise le champ, pas la date (D91)', async () => {
    const { cabinetId, gestionnaire, entreprise, periodeId } = await miseAvecPeriode('per-date');
    const voisine = await ouvrirPeriode(entreprise.id, moisRelatif(-1), gestionnaire.cj);
    const voisineId = (await voisine.json()).id as string;
    const avant = await prisma.periodePaie.findUniqueOrThrow({ where: { id: voisineId } });

    const res = await changerDateLimite(periodeId, { dateLimite: '2031-02-03' }, gestionnaire.cj);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, changed: true });

    const periode = await prisma.periodePaie.findUniqueOrThrow({ where: { id: periodeId } });
    expect(periode.dateLimite.toISOString().slice(0, 10)).toBe('2031-02-03');
    // Ni l'autre période ni la règle de l'entreprise ne bougent.
    expect(
      (await prisma.periodePaie.findUniqueOrThrow({ where: { id: voisineId } })).dateLimite,
    ).toEqual(avant.dateLimite);
    expect(
      (await prisma.entreprise.findUniqueOrThrow({ where: { id: entreprise.id } }))
        .jourLimitePrestations,
    ).toBe(20);

    const [audit] = await audits(cabinetId, 'PERIODE_DEADLINE_CHANGED');
    expect(audit.actorId).toBe(gestionnaire.user.id);
    expect(audit.metadata).toEqual({
      periodeId,
      entrepriseId: entreprise.id,
      fields: ['dateLimite'],
    });
    expect(JSON.stringify(audit)).not.toContain('2031');
  });

  it('n écrit rien quand la date ne change pas', async () => {
    const { cabinetId, gestionnaire, periodeId } = await miseAvecPeriode('per-date-id');
    const periode = await prisma.periodePaie.findUniqueOrThrow({ where: { id: periodeId } });
    const date = periode.dateLimite.toISOString().slice(0, 10);

    const res = await changerDateLimite(periodeId, { dateLimite: date }, gestionnaire.cj);
    expect(await res.json()).toEqual({ success: true, changed: false });
    expect(await audits(cabinetId, 'PERIODE_DEADLINE_CHANGED')).toHaveLength(0);
  });

  it('refuse une date invalide ou une période verrouillée', async () => {
    const { gestionnaire, periodeId } = await miseAvecPeriode('per-date-refus');

    for (const corps of [
      { dateLimite: '2026-02-30' },
      { dateLimite: '20/11/2026' },
      { dateLimite: 20 },
      { dateLimite: '1999-12-31' },
      {},
    ]) {
      const res = await changerDateLimite(periodeId, corps, gestionnaire.cj);
      expect(res.status, JSON.stringify(corps)).toBe(400);
      expect((await res.json()).fields).toHaveProperty('dateLimite');
    }

    await verrouillerPeriode(periodeId, gestionnaire.cj);
    const verrouillee = await changerDateLimite(
      periodeId,
      { dateLimite: '2031-02-03' },
      gestionnaire.cj,
    );
    expect(verrouillee.status).toBe(409);
    expect(await verrouillee.json()).toEqual({ error: 'PERIODE_LOCKED' });
  });

  it('répond 404 pour une période hors périmètre, avant la validation du corps', async () => {
    const mien = await miseAvecPeriode('per-date-iso-a');
    const autre = await miseAvecPeriode('per-date-iso-b');
    // Même cabinet, entreprise non assignée.
    const nonAssignee = await creerEntreprise(mien.cabinetId);
    const peri = await prisma.periodePaie.create({
      data: {
        cabinetId: mien.cabinetId,
        entrepriseId: nonAssignee.id,
        annee: mien.annee,
        mois: mien.mois,
        statut: 'OUVERTE',
        dateLimite: new Date('2026-01-20'),
      },
    });

    for (const id of [autre.periodeId, peri.id, 'inexistante']) {
      for (const corps of [{ dateLimite: '2031-02-03' }, { dateLimite: 'x' }]) {
        const res = await changerDateLimite(id, corps, mien.gestionnaire.cj);
        expect(res.status, id).toBe(404);
        expect(await res.json()).toEqual({ error: 'PERIODE_NOT_FOUND' });
      }
    }
    const intacte = await prisma.periodePaie.findUniqueOrThrow({ where: { id: peri.id } });
    expect(intacte.dateLimite.toISOString().slice(0, 10)).toBe('2026-01-20');
  });
});

describe('PUT / DELETE /api/periodes/[id]/verrouillage', () => {
  it('verrouille puis déverrouille, avec un audit à chaque fois (D90)', async () => {
    const { cabinetId, gestionnaire, entreprise, periodeId } = await miseAvecPeriode('per-lock');

    const verrou = await verrouillerPeriode(periodeId, gestionnaire.cj);
    expect(verrou.status).toBe(200);
    const verrouillee = await prisma.periodePaie.findUniqueOrThrow({ where: { id: periodeId } });
    expect(verrouillee.statut).toBe('VERROUILLEE');
    expect(verrouillee.verrouilleeLe).not.toBeNull();
    const [auditVerrou] = await audits(cabinetId, 'PERIODE_LOCKED');
    expect(auditVerrou.actorId).toBe(gestionnaire.user.id);
    expect(auditVerrou.metadata).toEqual({ periodeId, entrepriseId: entreprise.id });

    const deverrou = await deverrouillerPeriode(periodeId, gestionnaire.cj);
    expect(deverrou.status).toBe(200);
    const rouverte = await prisma.periodePaie.findUniqueOrThrow({ where: { id: periodeId } });
    expect(rouverte.statut).toBe('OUVERTE');
    expect(rouverte.verrouilleeLe).toBeNull();
    const [auditDeverrou] = await audits(cabinetId, 'PERIODE_UNLOCKED');
    expect(auditDeverrou.metadata).toEqual({ periodeId, entrepriseId: entreprise.id });
  });

  it('refuse de verrouiller deux fois ou de déverrouiller une période ouverte', async () => {
    const { cabinetId, gestionnaire, periodeId } = await miseAvecPeriode('per-lock-double');

    const rien = await deverrouillerPeriode(periodeId, gestionnaire.cj);
    expect(rien.status).toBe(409);
    expect(await rien.json()).toEqual({ error: 'PERIODE_NOT_LOCKED' });
    expect(await audits(cabinetId, 'PERIODE_UNLOCKED')).toHaveLength(0);

    await verrouillerPeriode(periodeId, gestionnaire.cj);
    const double = await verrouillerPeriode(periodeId, gestionnaire.cj);
    expect(double.status).toBe(409);
    expect(await double.json()).toEqual({ error: 'PERIODE_ALREADY_LOCKED' });
    expect(await audits(cabinetId, 'PERIODE_LOCKED')).toHaveLength(1);
  });

  it('un seul de deux verrouillages simultanés passe', async () => {
    const { cabinetId, gestionnaire, periodeId } = await miseAvecPeriode('per-lock-course');

    const [a, b] = await Promise.all([
      verrouillerPeriode(periodeId, gestionnaire.cj),
      verrouillerPeriode(periodeId, gestionnaire.cj),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await audits(cabinetId, 'PERIODE_LOCKED')).toHaveLength(1);
  });

  it('répond 404 hors périmètre et ne touche pas à la période', async () => {
    const mien = await miseAvecPeriode('per-lock-iso-a');
    const autre = await miseAvecPeriode('per-lock-iso-b');

    for (const id of [autre.periodeId, 'inexistante']) {
      expect((await verrouillerPeriode(id, mien.gestionnaire.cj)).status, id).toBe(404);
      expect((await deverrouillerPeriode(id, mien.gestionnaire.cj)).status, id).toBe(404);
    }
    expect(await statutDe(autre.periodeId)).toBe('OUVERTE');
    await verrouillerPeriode(autre.periodeId, autre.gestionnaire.cj);
    // Déverrouiller la période d'un autre depuis son propre périmètre : refusé, état conservé.
    expect((await deverrouillerPeriode(autre.periodeId, mien.gestionnaire.cj)).status).toBe(404);
    expect(await statutDe(autre.periodeId)).toBe('VERROUILLEE');
  });

  it('retire l accès quand l assignation est retirée', async () => {
    const { gestionnaire, entreprise, periodeId } = await miseAvecPeriode('per-lock-retire');
    await prisma.gestionnaireEntreprise.deleteMany({
      where: { entrepriseId: entreprise.id, userId: gestionnaire.user.id },
    });

    expect((await verrouillerPeriode(periodeId, gestionnaire.cj)).status).toBe(404);
    expect(
      (await changerDateLimite(periodeId, { dateLimite: '2031-02-03' }, gestionnaire.cj)).status,
    ).toBe(404);
    expect((await listerPeriodes(entreprise.id, gestionnaire.cj)).status).toBe(404);
    expect(await statutDe(periodeId)).toBe('OUVERTE');
  });
});

describe('confidentialité du journal (D26, D90)', () => {
  it('garde PERIODE_* hors du journal et de l export du cabinet', async () => {
    const { cabinetId, gestionnaire, periodeId } = await miseAvecPeriode('per-journal');
    await changerDateLimite(periodeId, { dateLimite: '2031-02-03' }, gestionnaire.cj);
    await verrouillerPeriode(periodeId, gestionnaire.cj);
    await deverrouillerPeriode(periodeId, gestionnaire.cj);
    expect(
      await prisma.auditLog.count({ where: { cabinetId, action: { startsWith: 'PERIODE' } } }),
    ).toBe(4);

    const journal = await getCabinetAuditLog(cabinetId);
    expect(journal.entries.some((e) => e.action.startsWith('PERIODE'))).toBe(false);

    const exportCabinet = await buildCabinetExport(cabinetId);
    expect(JSON.stringify(exportCabinet)).not.toContain('PERIODE_');
  });
});
