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
const { supprimerCabinetsEtDonnees } = await import('@/lib/cabinet/cabinet-purge');
const { lookupHash } = await import('@/lib/crypto/field-encryption');
const { chiffrerSalarie, dechiffrerSalarie } = await import('@/lib/salarie/salarie-crypto');

afterAll(async () => {
  const testUsers = await prisma.user.findMany({
    where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    select: { cabinetId: true },
  });
  const cabinetIds = testUsers.map((u) => u.cabinetId).filter((id): id is string => !!id);
  // Les salariés et leurs conditions sont supprimés avec le cabinet par supprimerCabinetsEtDonnees (D94 : Restrict).
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

async function creerCabinet(label: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(
    await auth.api.signUpEmail({
      body: { name: label, email: mail, password: 'InitialPass123!' },
      asResponse: true,
    }),
  );
  const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  return user.cabinetId!;
}

let vat = 40_000_000;
const creerEntreprise = (cabinetId: string) =>
  prisma.entreprise.create({
    data: { cabinetId, name: 'Entreprise de test', vatNumber: `BE0${++vat}` },
  });

const NISS = '85073003328';
const IBAN = 'BE68539007547034';

function donneesSalarie(cabinetId: string, entrepriseId: string, niss = NISS) {
  const id = randomUUID();
  return {
    id,
    cabinetId,
    entrepriseId,
    nom: 'Dupont',
    prenom: 'Marie',
    dateNaissance: new Date('1985-07-30'),
    nissEncrypted: chiffrerSalarie(id, 'niss', niss),
    nissHash: lookupHash(entrepriseId, niss),
    ibanEncrypted: chiffrerSalarie(id, 'iban', IBAN),
    typeContrat: 'CDI',
    dateEntree: new Date('2026-11-01'),
    situationFamiliale: 'ISOLE',
  };
}

const condition = (cabinetId: string, salarieId: string, dateEffet: string) => ({
  cabinetId,
  salarieId,
  dateEffet: new Date(dateEffet),
  statut: 'EMPLOYE',
  commissionParitaire: '200',
  fonction: 'Comptable',
  regime: 'TEMPS_PLEIN',
  salaireMensuelBrutCents: 280000,
});

describe('modèle Salarie', () => {
  it('ne stocke jamais le NISS ni l’IBAN en clair, et les restitue au déchiffrement', async () => {
    const cabinetId = await creerCabinet('salarie-clair');
    const entreprise = await creerEntreprise(cabinetId);
    const salarie = await prisma.salarie.create({ data: donneesSalarie(cabinetId, entreprise.id) });

    const enBase = await prisma.salarie.findUniqueOrThrow({ where: { id: salarie.id } });
    const brut = JSON.stringify(enBase);
    expect(brut).not.toContain(NISS);
    expect(brut).not.toContain(IBAN);
    expect(dechiffrerSalarie(enBase.id, 'niss', enBase.nissEncrypted)).toBe(NISS);
    expect(dechiffrerSalarie(enBase.id, 'iban', enBase.ibanEncrypted)).toBe(IBAN);
  });

  it('refuse le même NISS deux fois dans une entreprise, archivé compris', async () => {
    const cabinetId = await creerCabinet('salarie-unique');
    const entreprise = await creerEntreprise(cabinetId);
    const premier = await prisma.salarie.create({ data: donneesSalarie(cabinetId, entreprise.id) });

    await expect(
      prisma.salarie.create({ data: donneesSalarie(cabinetId, entreprise.id) }),
    ).rejects.toMatchObject({ code: 'P2002' });

    // Archivé : le NISS reste pris, on restaure plutôt qu'on ne recrée (D69).
    await prisma.salarie.update({ where: { id: premier.id }, data: { deletedAt: new Date() } });
    await expect(
      prisma.salarie.create({ data: donneesSalarie(cabinetId, entreprise.id) }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('accepte le même NISS dans une autre entreprise, sans que l’empreinte le révèle', async () => {
    const cabinetId = await creerCabinet('salarie-deux-entreprises');
    const a = await creerEntreprise(cabinetId);
    const b = await creerEntreprise(cabinetId);

    const dansA = await prisma.salarie.create({ data: donneesSalarie(cabinetId, a.id) });
    const dansB = await prisma.salarie.create({ data: donneesSalarie(cabinetId, b.id) });
    expect(dansA.nissHash).not.toBe(dansB.nissHash);
  });
});

describe('modèle ConditionTravail', () => {
  it('garde un historique daté, une seule ligne par date d’effet', async () => {
    const cabinetId = await creerCabinet('condition-historique');
    const entreprise = await creerEntreprise(cabinetId);
    const salarie = await prisma.salarie.create({ data: donneesSalarie(cabinetId, entreprise.id) });

    await prisma.conditionTravail.create({ data: condition(cabinetId, salarie.id, '2026-11-01') });
    await prisma.conditionTravail.create({
      data: { ...condition(cabinetId, salarie.id, '2027-04-01'), salaireMensuelBrutCents: 310000 },
    });
    await expect(
      prisma.conditionTravail.create({ data: condition(cabinetId, salarie.id, '2027-04-01') }),
    ).rejects.toMatchObject({ code: 'P2002' });

    // La condition d'une période = la plus récente dont la date d'effet ne la dépasse pas.
    const enVigueur = (date: string) =>
      prisma.conditionTravail.findFirst({
        where: { salarieId: salarie.id, dateEffet: { lte: new Date(date) } },
        orderBy: { dateEffet: 'desc' },
      });
    expect((await enVigueur('2027-03-31'))?.salaireMensuelBrutCents).toBe(280000);
    expect((await enVigueur('2027-04-01'))?.salaireMensuelBrutCents).toBe(310000);
    expect(await enVigueur('2026-10-31')).toBeNull();
  });

  // D94 : la paie se conserve 5 ans, donc supprimer une entreprise ou un dossier qui en porte
  // échoue au lieu de tout effacer en cascade (Restrict).
  it('ne disparaît pas avec l’entreprise ni avec le dossier (Restrict)', async () => {
    const cabinetId = await creerCabinet('condition-restrict');
    const a = await creerEntreprise(cabinetId);
    const b = await creerEntreprise(cabinetId);
    const dansA = await prisma.salarie.create({ data: donneesSalarie(cabinetId, a.id) });
    const dansB = await prisma.salarie.create({ data: donneesSalarie(cabinetId, b.id) });
    await prisma.conditionTravail.create({ data: condition(cabinetId, dansA.id, '2026-11-01') });
    await prisma.conditionTravail.create({ data: condition(cabinetId, dansB.id, '2026-11-01') });

    await expect(prisma.entreprise.delete({ where: { id: a.id } })).rejects.toThrow();
    await expect(prisma.salarie.delete({ where: { id: dansA.id } })).rejects.toThrow();

    expect(await prisma.salarie.count({ where: { id: dansA.id } })).toBe(1);
    expect(await prisma.conditionTravail.count({ where: { salarieId: dansA.id } })).toBe(1);
    expect(await prisma.conditionTravail.count({ where: { salarieId: dansB.id } })).toBe(1);
  });
});
