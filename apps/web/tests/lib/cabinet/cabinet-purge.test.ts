// @vitest-environment node
import { randomUUID } from 'node:crypto';
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
const { lookupHash } = await import('@/lib/crypto/field-encryption');
const { chiffrerSalarie } = await import('@/lib/salarie/salarie-crypto');
const { CABINET_DELETION_RETENTION_DAYS } = await import('@/lib/cabinet/cabinet-retention');
const {
  finDeConservation,
  aDesDonneesAConserver,
  calculerFinDeConservation,
  purgerCabinetPartiellement,
  supprimerCabinetsEtDonnees,
} = await import('@/lib/cabinet/cabinet-purge');
const { GET: purgeCabinets } = await import('@/app/api/cron/purge-deleted-cabinets/route');
const { GET: purgeRetention } = await import('@/app/api/cron/purge-expired-retention/route');

const DAY = 24 * 60 * 60 * 1000;
// Les comptes disparaissent à la purge partielle : on retient les cabinets créés plutôt que
// de les retrouver par leurs utilisateurs.
const cabinetsCrees: string[] = [];

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { cabinetId: { in: cabinetsCrees } } });
  await supprimerCabinetsEtDonnees(cabinetsCrees);
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.verification.deleteMany({
    where: { OR: [{ identifier: { contains: TEST_EMAIL_PREFIX } }, { value: { contains: TEST_EMAIL_PREFIX } }] },
  });
});

async function creerCabinet(label: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(await auth.api.signUpEmail({ body: { name: label, email: mail, password: 'InitialPass123!' }, asResponse: true }));
  const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  cabinetsCrees.push(user.cabinetId!);
  return { cabinetId: user.cabinetId!, user };
}

let vat = 70_000_000;
const creerEntreprise = (cabinetId: string) =>
  prisma.entreprise.create({ data: { cabinetId, name: 'Entreprise de test', vatNumber: `BE0${++vat}` } });

let niss = 85_073_003_000;
async function creerSalarie(cabinetId: string, entrepriseId: string) {
  const numero = String(++niss);
  const id = randomUUID();
  return prisma.salarie.create({
    data: {
      id,
      cabinetId,
      entrepriseId,
      nom: 'Dupont',
      prenom: 'Marie',
      dateNaissance: new Date('1985-07-30'),
      nissEncrypted: chiffrerSalarie(id, 'niss', numero),
      nissHash: lookupHash(entrepriseId, numero),
      ibanEncrypted: chiffrerSalarie(id, 'iban', 'BE68539007547034'),
      typeContrat: 'CDI',
      dateEntree: new Date('2020-01-01'),
      situationFamiliale: 'ISOLE',
    },
  });
}

/** Cabinet complet : entreprise, dossier, condition, période et prestation. */
async function cabinetAvecPaie(label: string, annee = 2026) {
  const { cabinetId, user } = await creerCabinet(label);
  const entreprise = await creerEntreprise(cabinetId);
  const salarie = await creerSalarie(cabinetId, entreprise.id);
  await prisma.conditionTravail.create({
    data: {
      cabinetId,
      salarieId: salarie.id,
      dateEffet: new Date('2020-01-01'),
      statut: 'EMPLOYE',
      commissionParitaire: '200',
      fonction: 'Comptable',
      regime: 'TEMPS_PLEIN',
      salaireMensuelBrutCents: 280000,
    },
  });
  const periode = await prisma.periodePaie.create({
    data: { cabinetId, entrepriseId: entreprise.id, annee, mois: 3, statut: 'OUVERTE', dateLimite: new Date(`${annee}-03-20`) },
  });
  await prisma.prestation.create({ data: { cabinetId, periodeId: periode.id, salarieId: salarie.id, congeDemiJours: 2 } });
  return { cabinetId, user, entreprise, salarie };
}

const archiverDepuis = (cabinetId: string, jours: number) =>
  prisma.cabinet.update({ where: { id: cabinetId }, data: { deletedAt: new Date(Date.now() - jours * DAY) } });

const appelCron = () => ({ headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });

const compterPaie = async (cabinetId: string) => ({
  entreprises: await prisma.entreprise.count({ where: { cabinetId } }),
  salaries: await prisma.salarie.count({ where: { cabinetId } }),
  conditions: await prisma.conditionTravail.count({ where: { cabinetId } }),
  periodes: await prisma.periodePaie.count({ where: { cabinetId } }),
  prestations: await prisma.prestation.count({ where: { cabinetId } }),
});

const PAIE_INTACTE = { entreprises: 1, salaries: 1, conditions: 1, periodes: 1, prestations: 1 };
const PAIE_VIDE = { entreprises: 0, salaries: 0, conditions: 0, periodes: 0, prestations: 0 };

describe('finDeConservation (D94)', () => {
  const archiveLe = new Date('2026-10-01T00:00:00Z');

  it("compte 5 ans depuis la fin de l'année civile de la dernière période", () => {
    const fin = finDeConservation({ derniereAnneePeriode: 2026, derniereSortie: new Date('2030-01-01'), archiveLe });
    expect(fin.toISOString()).toBe('2031-12-31T23:59:59.999Z');
  });

  it('sans période, compte 5 ans depuis la sortie la plus récente', () => {
    const fin = finDeConservation({ derniereAnneePeriode: null, derniereSortie: new Date('2024-06-15'), archiveLe });
    expect(fin.toISOString().slice(0, 10)).toBe('2029-06-15');
  });

  it("sans période ni sortie, compte 5 ans depuis l'archivage", () => {
    const fin = finDeConservation({ derniereAnneePeriode: null, derniereSortie: null, archiveLe });
    expect(fin.toISOString().slice(0, 10)).toBe('2031-10-01');
  });
});

describe('données à conserver', () => {
  it("un cabinet qui n'a que des entreprises n'a rien à conserver", async () => {
    const { cabinetId } = await creerCabinet('purge-vide');
    await creerEntreprise(cabinetId);
    expect(await aDesDonneesAConserver(cabinetId)).toBe(false);
  });

  it('un dossier salarié archivé suffit', async () => {
    const { cabinetId } = await creerCabinet('purge-salarie-archive');
    const entreprise = await creerEntreprise(cabinetId);
    await creerSalarie(cabinetId, entreprise.id);
    await prisma.salarie.updateMany({ where: { cabinetId }, data: { deletedAt: new Date() } });
    expect(await aDesDonneesAConserver(cabinetId)).toBe(true);
  });

  it('une période seule suffit', async () => {
    const { cabinetId } = await creerCabinet('purge-periode');
    const entreprise = await creerEntreprise(cabinetId);
    await prisma.periodePaie.create({
      data: { cabinetId, entrepriseId: entreprise.id, annee: 2026, mois: 1, statut: 'OUVERTE', dateLimite: new Date('2026-01-20') },
    });
    expect(await aDesDonneesAConserver(cabinetId)).toBe(true);
  });

  it('la fin suit la dernière période, pas la dernière sortie', async () => {
    const { cabinetId, salarie } = await cabinetAvecPaie('purge-calcul', 2022);
    await prisma.salarie.update({ where: { id: salarie.id }, data: { dateSortie: new Date('2030-01-01') } });
    expect((await calculerFinDeConservation(cabinetId)).toISOString()).toBe('2027-12-31T23:59:59.999Z');
  });
});

describe('filet de sécurité : Restrict', () => {
  it('refuse de supprimer un cabinet, une entreprise ou un dossier qui portent de la paie', async () => {
    const { cabinetId, entreprise, salarie } = await cabinetAvecPaie('purge-restrict');
    await expect(prisma.cabinet.delete({ where: { id: cabinetId } })).rejects.toThrow();
    await expect(prisma.entreprise.delete({ where: { id: entreprise.id } })).rejects.toThrow();
    await expect(prisma.salarie.delete({ where: { id: salarie.id } })).rejects.toThrow();
    expect(await compterPaie(cabinetId)).toEqual(PAIE_INTACTE);
  });
});

describe('purge des cabinets archivés (cron)', () => {
  it('refuse une requête sans le bon secret', async () => {
    const res = await purgeCabinets(new Request('http://localhost/api/cron/purge-deleted-cabinets'));
    expect(res.status).toBe(401);
  });

  it('un cabinet archivé qui a de la paie perd ses comptes mais aucune donnée de paie', async () => {
    const { cabinetId, user } = await cabinetAvecPaie('purge-avec-paie');
    await prisma.emailTemplate.create({ data: { cabinetId, type: 'INVITATION_GESTIONNAIRE', subject: 's', body: 'b' } });
    await prisma.invitation.create({
      data: {
        cabinetId,
        invitedById: user.id,
        email: testEmail('purge-invite'),
        role: 'GESTIONNAIRE_RH',
        tokenHash: `purge-test-${cabinetId}`,
        expiresAt: new Date(Date.now() + DAY),
      },
    });
    await prisma.cabinet.update({
      where: { id: cabinetId },
      data: {
        slug: `purge-${cabinetId}`.toLowerCase(),
        displayName: 'Nom affiché',
        primaryColor: '#112233',
        contactEmail: 'contact@example.test',
        stripeCustomerId: `cus_purge_${cabinetId}`,
      },
    });
    await archiverDepuis(cabinetId, CABINET_DELETION_RETENTION_DAYS + 1);
    const avant = await compterPaie(cabinetId);

    const res = await purgeCabinets(new Request('http://localhost/api/cron/purge-deleted-cabinets', appelCron()));
    expect(res.status).toBe(200);

    expect(await compterPaie(cabinetId)).toEqual(avant);
    expect(await prisma.user.count({ where: { cabinetId } })).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.invitation.count({ where: { cabinetId } })).toBe(0);
    expect(await prisma.emailTemplate.count({ where: { cabinetId } })).toBe(0);
    const cabinet = await prisma.cabinet.findUniqueOrThrow({ where: { id: cabinetId } });
    expect(cabinet.donneesPurgeesLe).not.toBeNull();
    expect(cabinet.name).toBeTruthy();
    expect(cabinet.slug).toBeNull();
    expect(cabinet.displayName).toBeNull();
    expect(cabinet.primaryColor).toBeNull();
    expect(cabinet.contactEmail).toBeNull();
    expect(cabinet.stripeCustomerId).toBeNull();
  });

  it('la purge partielle est auditée une seule fois, sans donnée personnelle, même rejouée', async () => {
    const { cabinetId } = await cabinetAvecPaie('purge-audit');
    await archiverDepuis(cabinetId, CABINET_DELETION_RETENTION_DAYS + 1);

    await purgeCabinets(new Request('http://localhost/api/cron/purge-deleted-cabinets', appelCron()));
    await purgeCabinets(new Request('http://localhost/api/cron/purge-deleted-cabinets', appelCron()));

    const audits = await prisma.auditLog.findMany({ where: { cabinetId, action: 'CABINET_DATA_PURGED' } });
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata).toEqual({ comptesSupprimes: 1 });
  });

  it('un cabinet archivé sans données de paie est purgé entièrement, comme avant', async () => {
    const { cabinetId, user } = await creerCabinet('purge-sans-paie');
    await creerEntreprise(cabinetId);
    await archiverDepuis(cabinetId, CABINET_DELETION_RETENTION_DAYS + 1);

    await purgeCabinets(new Request('http://localhost/api/cron/purge-deleted-cabinets', appelCron()));

    expect(await prisma.cabinet.findUnique({ where: { id: cabinetId } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.entreprise.count({ where: { cabinetId } })).toBe(0);
  });

  it("un cabinet archivé depuis moins de 90 jours n'est pas touché", async () => {
    const { cabinetId, user } = await cabinetAvecPaie('purge-recent');
    await archiverDepuis(cabinetId, CABINET_DELETION_RETENTION_DAYS - 1);

    await purgeCabinets(new Request('http://localhost/api/cron/purge-deleted-cabinets', appelCron()));

    expect((await prisma.cabinet.findUniqueOrThrow({ where: { id: cabinetId } })).donneesPurgeesLe).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
  });
});

describe('fin de conservation (cron)', () => {
  it('refuse une requête sans le bon secret', async () => {
    const res = await purgeRetention(new Request('http://localhost/api/cron/purge-expired-retention'));
    expect(res.status).toBe(401);
  });

  it("supprime tout quand le délai est échu et garde la paie tant qu'il court", async () => {
    const echu = await cabinetAvecPaie('retention-echu', 2015);
    const enCours = await cabinetAvecPaie('retention-en-cours', new Date().getUTCFullYear());
    await archiverDepuis(echu.cabinetId, 1);
    await archiverDepuis(enCours.cabinetId, 1);
    await purgerCabinetPartiellement(echu.cabinetId);
    await purgerCabinetPartiellement(enCours.cabinetId);

    const res = await purgeRetention(new Request('http://localhost/api/cron/purge-expired-retention', appelCron()));
    expect(res.status).toBe(200);

    expect(await prisma.cabinet.findUnique({ where: { id: echu.cabinetId } })).toBeNull();
    expect(await compterPaie(echu.cabinetId)).toEqual(PAIE_VIDE);
    expect(await prisma.cabinet.findUnique({ where: { id: enCours.cabinetId } })).not.toBeNull();
    expect(await compterPaie(enCours.cabinetId)).toEqual(PAIE_INTACTE);
  });

  it("ignore un cabinet archivé dont les comptes n'ont pas été purgés", async () => {
    const { cabinetId } = await cabinetAvecPaie('retention-non-purge', 2015);
    await archiverDepuis(cabinetId, 1);

    await purgeRetention(new Request('http://localhost/api/cron/purge-expired-retention', appelCron()));

    expect(await prisma.cabinet.findUnique({ where: { id: cabinetId } })).not.toBeNull();
  });
});
