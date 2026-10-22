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
const { GET: lister } = await import('@/app/api/periodes/[id]/prestations/route');
const { PUT: encoder, DELETE: effacer } =
  await import('@/app/api/periodes/[id]/prestations/[salarieId]/route');
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
  // Les périodes, prestations et salariés partent en cascade avec le cabinet.
  await prisma.auditLog.deleteMany({ where: { cabinetId: { in: cabinetIds } } });
  await prisma.cabinet.deleteMany({ where: { id: { in: cabinetIds } } });
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
  await prisma.cabinet.delete({ where: { id: user.cabinetId! } });
  return { cj, user: await prisma.user.findUniqueOrThrow({ where: { id: user.id } }) };
}

let vat = 97_000_000;
const creerEntreprise = (cabinetId: string) =>
  prisma.entreprise.create({
    data: { cabinetId, name: 'Entreprise de test', vatNumber: `BE0${++vat}` },
  });

// Mois et jours relatifs à aujourd'hui : les tests restent justes quand la date réelle avance.
function moisRelatif(delta: number) {
  const d = new Date();
  const index = d.getUTCFullYear() * 12 + d.getUTCMonth() + delta;
  return { annee: Math.floor(index / 12), mois: (index % 12) + 1 };
}
const jourDans = (jours: number) =>
  new Date(Date.now() + jours * 86_400_000).toISOString().slice(0, 10);
const jourDuMois = (annee: number, mois: number, jour: number) =>
  `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;

let compteurSalarie = 0;
function creerSalarie(
  cabinetId: string,
  entrepriseId: string,
  extra: { dateEntree?: string; dateSortie?: string | null; deletedAt?: Date; nom?: string } = {},
) {
  const n = ++compteurSalarie;
  return prisma.salarie.create({
    data: {
      cabinetId,
      entrepriseId,
      nom: extra.nom ?? `Nom${String(n).padStart(3, '0')}`,
      prenom: 'Marie',
      dateNaissance: new Date('1985-07-30'),
      nissEncrypted: 'v1:test',
      nissHash: `hash-prestation-${Date.now()}-${n}`,
      ibanEncrypted: 'v1:test',
      typeContrat: 'CDI',
      dateEntree: new Date(extra.dateEntree ?? jourDans(-400)),
      dateSortie: extra.dateSortie ? new Date(extra.dateSortie) : null,
      situationFamiliale: 'ISOLE',
      deletedAt: extra.deletedAt ?? null,
    },
  });
}

const entetes = (cj?: Jar) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return headers;
};

const url = (periodeId: string, suite = '') =>
  `http://localhost:3000/api/periodes/${periodeId}${suite}`;
const ctx = (id: string, salarieId = 'x') => ({ params: Promise.resolve({ id, salarieId }) });

const listerPrestations = (periodeId: string, cj?: Jar) =>
  lister(new Request(url(periodeId, '/prestations'), { headers: entetes(cj) }), ctx(periodeId));
const encoderPrestation = (periodeId: string, salarieId: string, body: unknown, cj?: Jar) =>
  encoder(
    new Request(url(periodeId, `/prestations/${salarieId}`), {
      method: 'PUT',
      headers: entetes(cj),
      body: JSON.stringify(body),
    }),
    ctx(periodeId, salarieId),
  );
const effacerPrestation = (periodeId: string, salarieId: string, cj?: Jar) =>
  effacer(
    new Request(url(periodeId, `/prestations/${salarieId}`), {
      method: 'DELETE',
      headers: entetes(cj),
    }),
    ctx(periodeId, salarieId),
  );
const verrouillerPeriode = (id: string, cj?: Jar) =>
  verrouiller(
    new Request(url(id, '/verrouillage'), { method: 'PUT', headers: entetes(cj) }),
    ctx(id),
  );
const deverrouillerPeriode = (id: string, cj?: Jar) =>
  deverrouiller(
    new Request(url(id, '/verrouillage'), { method: 'DELETE', headers: entetes(cj) }),
    ctx(id),
  );

// Un cabinet, un gestionnaire assigné à une entreprise, un salarié actif, une période du mois
// courant (date limite dans 10 jours, sauf demande contraire).
async function mise(label: string, options: { dateLimite?: string; delta?: number } = {}) {
  const { user: titulaire, cj: cjTitulaire } = await creerCompte(`${label}-t`);
  const cabinetId = titulaire.cabinetId!;
  const gestionnaire = await creerAvecRole(`${label}-g`, 'GESTIONNAIRE_RH', cabinetId);
  const entreprise = await creerEntreprise(cabinetId);
  await prisma.gestionnaireEntreprise.create({
    data: { entrepriseId: entreprise.id, userId: gestionnaire.user.id },
  });
  const salarie = await creerSalarie(cabinetId, entreprise.id);
  const { annee, mois } = moisRelatif(options.delta ?? 0);
  const periode = await prisma.periodePaie.create({
    data: {
      cabinetId,
      entrepriseId: entreprise.id,
      annee,
      mois,
      statut: 'OUVERTE',
      dateLimite: new Date(options.dateLimite ?? jourDans(10)),
    },
  });
  return { cabinetId, cjTitulaire, gestionnaire, entreprise, salarie, periode, annee, mois };
}

const audits = (cabinetId: string, action: string) =>
  prisma.auditLog.findMany({ where: { cabinetId, action } });
const prestationDe = (periodeId: string, salarieId: string) =>
  prisma.prestation.findUnique({ where: { periodeId_salarieId: { periodeId, salarieId } } });

const ECARTS = {
  heuresPresteesMinutes: 7 * 60,
  congeDemiJours: 3,
  maladieDemiJours: 1,
  ferieDemiJours: 2,
  absenceNonRemDemiJours: 1,
  heuresSupMinutes: 90,
  primeCents: 15000,
  primeLibelle: 'Prime de fin d’année',
};

describe('PUT /api/periodes/[id]/prestations/[salarieId] : encodage', () => {
  it('enregistre les écarts, les relit, et journalise les champs sans les valeurs (D92)', async () => {
    const { cabinetId, gestionnaire, entreprise, salarie, periode } = await mise('pre-enreg');

    const res = await encoderPrestation(periode.id, salarie.id, ECARTS, gestionnaire.cj);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, changed: true });

    const ligne = await prestationDe(periode.id, salarie.id);
    expect(ligne).toMatchObject({ ...ECARTS, cabinetId, modifieParId: gestionnaire.user.id });

    const lecture = await (await listerPrestations(periode.id, gestionnaire.cj)).json();
    expect(lecture.salaries).toHaveLength(1);
    expect(lecture.salaries[0].prestation).toMatchObject({
      ...ECARTS,
      modifiePar: { name: `pre-enreg-g`, role: 'GESTIONNAIRE_RH' },
    });

    const [audit] = await audits(cabinetId, 'PRESTATION_SAVED');
    expect(audit.actorId).toBe(gestionnaire.user.id);
    expect(audit.metadata).toEqual({
      periodeId: periode.id,
      entrepriseId: entreprise.id,
      salarieId: salarie.id,
      fields: Object.keys(ECARTS),
    });
    const brut = JSON.stringify(audit);
    expect(brut).not.toContain('15000');
    expect(brut).not.toContain('Prime de fin');
  });

  it('ne journalise que les champs modifiés, et rien quand rien ne change', async () => {
    const { cabinetId, gestionnaire, salarie, periode } = await mise('pre-modif');
    await encoderPrestation(periode.id, salarie.id, ECARTS, gestionnaire.cj);

    const identique = await encoderPrestation(periode.id, salarie.id, ECARTS, gestionnaire.cj);
    expect(await identique.json()).toEqual({ success: true, changed: false });
    expect(await audits(cabinetId, 'PRESTATION_SAVED')).toHaveLength(1);

    const modifie = await encoderPrestation(
      periode.id,
      salarie.id,
      { ...ECARTS, congeDemiJours: 4, primeCents: 20000 },
      gestionnaire.cj,
    );
    expect((await modifie.json()).changed).toBe(true);
    const journal = await audits(cabinetId, 'PRESTATION_SAVED');
    expect(journal).toHaveLength(2);
    const dernier = journal.find((a) => (a.metadata as { fields: string[] }).fields.length === 2);
    expect((dernier!.metadata as { fields: string[] }).fields).toEqual([
      'congeDemiJours',
      'primeCents',
    ]);
    expect((await prestationDe(periode.id, salarie.id))?.congeDemiJours).toBe(4);
  });

  it('un corps sans écart, ou DELETE, efface la ligne : « mois complet »', async () => {
    const { cabinetId, gestionnaire, salarie, periode } = await mise('pre-efface');
    await encoderPrestation(periode.id, salarie.id, ECARTS, gestionnaire.cj);

    const neutre = await encoderPrestation(periode.id, salarie.id, {}, gestionnaire.cj);
    expect(await neutre.json()).toEqual({ success: true, changed: true });
    expect(await prestationDe(periode.id, salarie.id)).toBeNull();
    expect(await audits(cabinetId, 'PRESTATION_CLEARED')).toHaveLength(1);

    await encoderPrestation(periode.id, salarie.id, ECARTS, gestionnaire.cj);
    const effacee = await effacerPrestation(periode.id, salarie.id, gestionnaire.cj);
    expect(await effacee.json()).toEqual({ success: true, changed: true });
    expect(await prestationDe(periode.id, salarie.id)).toBeNull();
    expect(await audits(cabinetId, 'PRESTATION_CLEARED')).toHaveLength(2);

    // Effacer ce qui n'existe pas n'écrit rien.
    const rien = await effacerPrestation(periode.id, salarie.id, gestionnaire.cj);
    expect(await rien.json()).toEqual({ success: true, changed: false });
    expect(await audits(cabinetId, 'PRESTATION_CLEARED')).toHaveLength(2);
  });

  it('refuse les valeurs hors limites, champ par champ, sans rien écrire', async () => {
    const { gestionnaire, salarie, periode, annee, mois } = await mise('pre-invalide');
    const jours = new Date(Date.UTC(annee, mois, 0)).getUTCDate();

    for (const [corps, champ] of [
      [{ congeDemiJours: jours * 2 + 1 }, 'congeDemiJours'],
      [{ maladieDemiJours: -1 }, 'maladieDemiJours'],
      [{ ferieDemiJours: 1.5 }, 'ferieDemiJours'],
      [{ absenceNonRemDemiJours: '2' }, 'absenceNonRemDemiJours'],
      [{ heuresSupMinutes: jours * 24 * 60 + 1 }, 'heuresSupMinutes'],
      [{ heuresPresteesMinutes: 12.5 }, 'heuresPresteesMinutes'],
      [{ primeCents: 5000 }, 'primeLibelle'],
      [{ primeLibelle: 'Prime' }, 'primeCents'],
      [{ primeCents: 0, primeLibelle: 'Prime' }, 'primeCents'],
    ] as const) {
      const res = await encoderPrestation(periode.id, salarie.id, corps, gestionnaire.cj);
      expect(res.status, JSON.stringify(corps)).toBe(400);
      expect(Object.keys((await res.json()).fields), JSON.stringify(corps)).toContain(champ);
    }
    expect(await prisma.prestation.count({ where: { periodeId: periode.id } })).toBe(0);
  });
});

describe('période verrouillée (D90)', () => {
  it('refuse d’encoder et d’effacer, puis redevient possible au déverrouillage', async () => {
    const { cabinetId, gestionnaire, salarie, periode } = await mise('pre-verrou');
    await encoderPrestation(periode.id, salarie.id, ECARTS, gestionnaire.cj);
    await verrouillerPeriode(periode.id, gestionnaire.cj);

    const modif = await encoderPrestation(
      periode.id,
      salarie.id,
      { ...ECARTS, congeDemiJours: 9 },
      gestionnaire.cj,
    );
    expect(modif.status).toBe(409);
    expect(await modif.json()).toEqual({ error: 'PERIODE_LOCKED' });
    expect((await effacerPrestation(periode.id, salarie.id, gestionnaire.cj)).status).toBe(409);
    expect((await prestationDe(periode.id, salarie.id))?.congeDemiJours).toBe(3);
    expect(await audits(cabinetId, 'PRESTATION_SAVED')).toHaveLength(1);

    await deverrouillerPeriode(periode.id, gestionnaire.cj);
    const apres = await encoderPrestation(
      periode.id,
      salarie.id,
      { ...ECARTS, congeDemiJours: 9 },
      gestionnaire.cj,
    );
    expect(apres.status).toBe(200);
    expect((await prestationDe(periode.id, salarie.id))?.congeDemiJours).toBe(9);
  });

  it('un encodage et un verrouillage simultanés restent cohérents', async () => {
    const { gestionnaire, salarie, periode } = await mise('pre-course');

    const [encodage, verrou] = await Promise.all([
      encoderPrestation(periode.id, salarie.id, ECARTS, gestionnaire.cj),
      verrouillerPeriode(periode.id, gestionnaire.cj),
    ]);

    expect(verrou.status).toBe(200);
    expect([200, 409]).toContain(encodage.status);
    // L'encodage accepté est bien écrit ; l'encodage refusé n'a rien laissé.
    const ligne = await prestationDe(periode.id, salarie.id);
    expect(ligne !== null).toBe(encodage.status === 200);
    expect((await prisma.periodePaie.findUniqueOrThrow({ where: { id: periode.id } })).statut).toBe(
      'VERROUILLEE',
    );
  });
});

describe('salariés de la période (D92)', () => {
  it('liste les salariés actifs pendant le mois, bornes comprises, sans archivés ni autres entreprises', async () => {
    const { cabinetId, gestionnaire, entreprise, periode, annee, mois } = await mise('pre-actifs');
    // Le salarié de mise() est entré il y a 400 jours : actif.
    const jours = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
    const premier = jourDuMois(annee, mois, 1);
    const dernier = jourDuMois(annee, mois, jours);
    const veille = new Date(new Date(premier).getTime() - 86_400_000).toISOString().slice(0, 10);
    const lendemain = new Date(new Date(dernier).getTime() + 86_400_000).toISOString().slice(0, 10);

    const entreLeDernierJour = await creerSalarie(cabinetId, entreprise.id, {
      dateEntree: dernier,
    });
    const sortiLePremierJour = await creerSalarie(cabinetId, entreprise.id, {
      dateSortie: premier,
    });
    const sortiLaVeille = await creerSalarie(cabinetId, entreprise.id, { dateSortie: veille });
    const entreLeLendemain = await creerSalarie(cabinetId, entreprise.id, {
      dateEntree: lendemain,
    });
    const archive = await creerSalarie(cabinetId, entreprise.id, { deletedAt: new Date() });
    const autre = await creerEntreprise(cabinetId);
    const dansUneAutre = await creerSalarie(cabinetId, autre.id);

    const lecture = await (await listerPrestations(periode.id, gestionnaire.cj)).json();
    const ids = lecture.salaries.map((s: { id: string }) => s.id);
    expect(ids).toContain(entreLeDernierJour.id);
    expect(ids).toContain(sortiLePremierJour.id);
    expect(ids).toHaveLength(3); // + le salarié de mise()
    for (const exclu of [sortiLaVeille, entreLeLendemain, archive, dansUneAutre]) {
      expect(ids).not.toContain(exclu.id);
    }
    expect(lecture.periode).toMatchObject({ id: periode.id, annee, mois, statut: 'OUVERTE' });

    // Hors de la période : encodage refusé, rien d'écrit.
    for (const exclu of [sortiLaVeille, entreLeLendemain]) {
      const res = await encoderPrestation(periode.id, exclu.id, ECARTS, gestionnaire.cj);
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: 'SALARIE_NOT_ACTIVE_IN_PERIOD' });
    }
    expect(await prisma.prestation.count({ where: { periodeId: periode.id } })).toBe(0);
    // Un salarié actif ce mois-là mais déjà sorti aujourd'hui reste encodable (rattrapage).
    expect(
      (await encoderPrestation(periode.id, sortiLePremierJour.id, ECARTS, gestionnaire.cj)).status,
    ).toBe(200);
  });

  it('trie les salariés par nom', async () => {
    const { cabinetId, gestionnaire, entreprise, periode } = await mise('pre-tri');
    await creerSalarie(cabinetId, entreprise.id, { nom: 'Aaa' });
    await creerSalarie(cabinetId, entreprise.id, { nom: 'Zzz' });

    const lecture = await (await listerPrestations(periode.id, gestionnaire.cj)).json();
    const noms = lecture.salaries.map((s: { nom: string }) => s.nom);
    expect(noms).toEqual([...noms].sort());
    expect(noms[0]).toBe('Aaa');
  });
});

describe('isolation : prestations', { timeout: 60_000 }, () => {
  it('répond 404 hors périmètre, avant la validation du corps (D26, D27)', async () => {
    const mien = await mise('pre-iso-a');
    const autre = await mise('pre-iso-b');
    // Même cabinet : entreprise non assignée, avec sa période et son salarié.
    const nonAssignee = await creerEntreprise(mien.cabinetId);
    const salarieNonAssigne = await creerSalarie(mien.cabinetId, nonAssignee.id);
    const periodeNonAssignee = await prisma.periodePaie.create({
      data: {
        cabinetId: mien.cabinetId,
        entrepriseId: nonAssignee.id,
        annee: mien.annee,
        mois: mien.mois,
        statut: 'OUVERTE',
        dateLimite: new Date(jourDans(10)),
      },
    });
    const archive = await creerSalarie(mien.cabinetId, mien.entreprise.id, {
      deletedAt: new Date(),
    });

    const cas: [string, string][] = [
      [autre.periode.id, autre.salarie.id], // autre cabinet
      [periodeNonAssignee.id, salarieNonAssigne.id], // même cabinet, non assignée
      [mien.periode.id, autre.salarie.id], // sa période, salarié d'un autre cabinet
      [mien.periode.id, salarieNonAssigne.id], // sa période, salarié d'une autre entreprise
      [mien.periode.id, archive.id], // salarié archivé
      [mien.periode.id, 'inexistant'],
      ['inexistante', mien.salarie.id],
    ];
    for (const [periodeId, salarieId] of cas) {
      for (const corps of [ECARTS, { congeDemiJours: 'x' }]) {
        const res = await encoderPrestation(periodeId, salarieId, corps, mien.gestionnaire.cj);
        expect(res.status, `${periodeId}/${salarieId}`).toBe(404);
      }
      expect((await effacerPrestation(periodeId, salarieId, mien.gestionnaire.cj)).status).toBe(
        404,
      );
    }
    for (const periodeId of [autre.periode.id, periodeNonAssignee.id, 'inexistante']) {
      expect((await listerPrestations(periodeId, mien.gestionnaire.cj)).status).toBe(404);
    }
    expect(await prisma.prestation.count({ where: { cabinetId: mien.cabinetId } })).toBe(0);
    expect(await prisma.prestation.count({ where: { cabinetId: autre.cabinetId } })).toBe(0);
  });

  it('retire l’accès quand l’assignation est retirée', async () => {
    const { gestionnaire, entreprise, salarie, periode } = await mise('pre-retire');
    await prisma.gestionnaireEntreprise.deleteMany({
      where: { entrepriseId: entreprise.id, userId: gestionnaire.user.id },
    });

    expect((await listerPrestations(periode.id, gestionnaire.cj)).status).toBe(404);
    expect((await encoderPrestation(periode.id, salarie.id, ECARTS, gestionnaire.cj)).status).toBe(
      404,
    );
    expect(await prestationDe(periode.id, salarie.id)).toBeNull();
  });

  it('refuse le Cabinet RH, le collaborateur et l’absence de session (D26)', async () => {
    const { cabinetId, cjTitulaire, salarie, periode } = await mise('pre-403');
    const collaborateur = await creerAvecRole('pre-403-col', 'COLLABORATEUR', cabinetId);

    for (const cj of [cjTitulaire, collaborateur.cj]) {
      expect((await listerPrestations(periode.id, cj)).status).toBe(403);
      expect((await encoderPrestation(periode.id, salarie.id, ECARTS, cj)).status).toBe(403);
      expect((await effacerPrestation(periode.id, salarie.id, cj)).status).toBe(403);
    }
    expect((await listerPrestations(periode.id)).status).toBe(401);
    expect((await encoderPrestation(periode.id, salarie.id, ECARTS)).status).toBe(401);
    expect(await prestationDe(periode.id, salarie.id)).toBeNull();
  });
});

describe('l’entreprise encode jusqu’à la date limite (D91)', () => {
  async function miseEntreprise(label: string, dateLimite: string) {
    const base = await mise(label, { dateLimite });
    const admin = await creerAvecRole(`${label}-admin`, 'ENTREPRISE_CLIENTE', base.cabinetId);
    await prisma.entreprise.update({
      where: { id: base.entreprise.id },
      data: { adminUserId: admin.user.id },
    });
    return { ...base, admin };
  }

  it('encode avant la date limite, et on voit qui a encodé', async () => {
    const { gestionnaire, salarie, periode, admin } = await miseEntreprise(
      'pre-ent-ok',
      jourDans(5),
    );

    const res = await encoderPrestation(periode.id, salarie.id, ECARTS, admin.cj);
    expect(res.status).toBe(200);
    expect((await prestationDe(periode.id, salarie.id))?.modifieParId).toBe(admin.user.id);

    const lecture = await (await listerPrestations(periode.id, gestionnaire.cj)).json();
    expect(lecture.salaries[0].prestation.modifiePar).toEqual({
      name: 'pre-ent-ok-admin',
      role: 'ENTREPRISE_CLIENTE',
    });
    // L'entreprise relit ses propres prestations.
    expect((await listerPrestations(periode.id, admin.cj)).status).toBe(200);
  });

  it('encode encore le jour de la date limite, mais plus le lendemain', async () => {
    const dernierJour = await miseEntreprise('pre-ent-jour', jourDans(0));
    expect(
      (
        await encoderPrestation(
          dernierJour.periode.id,
          dernierJour.salarie.id,
          ECARTS,
          dernierJour.admin.cj,
        )
      ).status,
    ).toBe(200);

    const depasse = await miseEntreprise('pre-ent-apres', jourDans(-1));
    const refus = await encoderPrestation(
      depasse.periode.id,
      depasse.salarie.id,
      ECARTS,
      depasse.admin.cj,
    );
    expect(refus.status).toBe(409);
    expect(await refus.json()).toEqual({ error: 'DEADLINE_PASSED' });
    expect(
      (await effacerPrestation(depasse.periode.id, depasse.salarie.id, depasse.admin.cj)).status,
    ).toBe(409);
    expect(await prestationDe(depasse.periode.id, depasse.salarie.id)).toBeNull();

    // Le gestionnaire complète et corrige après la date, tant que la période n'est pas verrouillée.
    const gestionnaire = await encoderPrestation(
      depasse.periode.id,
      depasse.salarie.id,
      ECARTS,
      depasse.gestionnaire.cj,
    );
    expect(gestionnaire.status).toBe(200);
  });

  it('le gestionnaire peut décaler la date limite pour rouvrir l’encodage à l’entreprise', async () => {
    const { gestionnaire, salarie, periode, admin } = await miseEntreprise(
      'pre-ent-decale',
      jourDans(-3),
    );
    expect((await encoderPrestation(periode.id, salarie.id, ECARTS, admin.cj)).status).toBe(409);

    const { PATCH: decaler } = await import('@/app/api/periodes/[id]/route');
    const decalage = await decaler(
      new Request(url(periode.id), {
        method: 'PATCH',
        headers: entetes(gestionnaire.cj),
        body: JSON.stringify({ dateLimite: jourDans(7) }),
      }),
      ctx(periode.id),
    );
    expect(decalage.status).toBe(200);
    expect((await encoderPrestation(periode.id, salarie.id, ECARTS, admin.cj)).status).toBe(200);
  });

  it('ne touche ni aux autres entreprises ni aux périodes verrouillées', async () => {
    const { cabinetId, gestionnaire, salarie, periode, admin } = await miseEntreprise(
      'pre-ent-iso',
      jourDans(5),
    );
    const autre = await creerEntreprise(cabinetId);
    const salarieAutre = await creerSalarie(cabinetId, autre.id);
    const { annee, mois } = moisRelatif(0);
    const periodeAutre = await prisma.periodePaie.create({
      data: {
        cabinetId,
        entrepriseId: autre.id,
        annee,
        mois,
        statut: 'OUVERTE',
        dateLimite: new Date(jourDans(5)),
      },
    });

    // Période et salarié d'une autre entreprise : 404, et un salarié de la sienne sur la période d'une autre aussi.
    expect(
      (await encoderPrestation(periodeAutre.id, salarieAutre.id, ECARTS, admin.cj)).status,
    ).toBe(404);
    expect((await listerPrestations(periodeAutre.id, admin.cj)).status).toBe(404);
    expect((await encoderPrestation(periode.id, salarieAutre.id, ECARTS, admin.cj)).status).toBe(
      404,
    );

    await verrouillerPeriode(periode.id, gestionnaire.cj);
    const verrouillee = await encoderPrestation(periode.id, salarie.id, ECARTS, admin.cj);
    expect(verrouillee.status).toBe(409);
    expect(await verrouillee.json()).toEqual({ error: 'PERIODE_LOCKED' });
    expect(await prisma.prestation.count({ where: { cabinetId } })).toBe(0);
  });
});

describe('confidentialité du journal (D26, D90)', () => {
  it('garde PRESTATION_* hors du journal et de l’export du cabinet', async () => {
    const { cabinetId, gestionnaire, salarie, periode } = await mise('pre-journal');
    await encoderPrestation(periode.id, salarie.id, ECARTS, gestionnaire.cj);
    await effacerPrestation(periode.id, salarie.id, gestionnaire.cj);
    expect(
      await prisma.auditLog.count({ where: { cabinetId, action: { startsWith: 'PRESTATION' } } }),
    ).toBe(2);

    const journal = await getCabinetAuditLog(cabinetId);
    expect(journal.entries.some((e) => e.action.startsWith('PRESTATION'))).toBe(false);
    expect(JSON.stringify(await buildCabinetExport(cabinetId))).not.toContain('PRESTATION_');
  });
});
