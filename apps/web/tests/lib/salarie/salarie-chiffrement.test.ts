// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { cookieJar, testEmail, TEST_EMAIL_PREFIX } from '../../helpers/auth-test-utils';
import { encryptLegacyV1 } from '../../helpers/legacy-encryption';

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

// D97 : NISS et IBAN liés à l'identifiant du dossier et au champ (format v2), anciennes valeurs v1
// toujours lisibles, et reconversion des v1 par le script.

const { auth } = await import('@/lib/auth/auth');
const { prisma } = await import('@/lib/prisma');
const { supprimerCabinetsEtDonnees } = await import('@/lib/cabinet/cabinet-purge');
const { resolveScope } = await import('@/lib/authz/authz');
const { DecryptionError, lookupHash } = await import('@/lib/crypto/field-encryption');
const { maskIban, maskNiss } = await import('@/lib/crypto/masking');
const { chiffrerSalarie, dechiffrerSalarie } = await import('@/lib/salarie/salarie-crypto');
const { getSalarieDetail, getSalariesEntreprise } = await import('@/lib/salarie/salarie-data');
const { revealSensitiveField } = await import('@/lib/salarie/salarie-reveal');
const { updateSalarie } = await import('@/lib/salarie/salarie-write');
const { salarieModificationSchema } = await import('@/lib/schemas/salarie');
const { reencryptSalaries } = await import('@/lib/crypto/reencrypt-salaries');

const IBAN = 'BE68539007547034';
const cabinetsCrees: string[] = [];

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { cabinetId: { in: cabinetsCrees } } });
  await supprimerCabinetsEtDonnees(cabinetsCrees);
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

async function creerCompte(label: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(
    await auth.api.signUpEmail({
      body: { name: label, email: mail, password: 'InitialPass123!' },
      asResponse: true,
    }),
  );
  return prisma.user.findUniqueOrThrow({ where: { email: mail } });
}

async function creerAvecRole(label: string, role: string, cabinetId: string) {
  const user = await creerCompte(label);
  await prisma.user.update({ where: { id: user.id }, data: { role, cabinetId } });
  await supprimerCabinetsEtDonnees([user.cabinetId!]);
  return prisma.user.findUniqueOrThrow({ where: { id: user.id } });
}

let vat = 60_000_000;
let nissCompteur = 0;
const nissValide = () => {
  const base = 850730000 + 800 + ++nissCompteur;
  return `${base}${String(97 - (base % 97)).padStart(2, '0')}`;
};

// Cabinet + gestionnaire assigné + entreprise.
async function mise(label: string) {
  const titulaire = await creerCompte(`${label}-t`);
  const cabinetId = titulaire.cabinetId!;
  cabinetsCrees.push(cabinetId);
  const gestionnaire = await creerAvecRole(`${label}-g`, 'GESTIONNAIRE_RH', cabinetId);
  const entreprise = await prisma.entreprise.create({
    data: { cabinetId, name: 'Entreprise de test', vatNumber: `BE0${++vat}` },
  });
  await prisma.gestionnaireEntreprise.create({
    data: { entrepriseId: entreprise.id, userId: gestionnaire.id },
  });
  const scope = (await resolveScope(gestionnaire))!;
  return { cabinetId, gestionnaire, entreprise, scope };
}

// Un dossier posé directement en base, avec le format de chiffrement voulu.
async function poserDossier(
  cabinetId: string,
  entrepriseId: string,
  format: 'v1' | 'v2',
  niss = nissValide(),
) {
  const id = randomUUID();
  const chiffrer = (champ: 'niss' | 'iban', valeur: string) =>
    format === 'v2' ? chiffrerSalarie(id, champ, valeur) : encryptLegacyV1(valeur);
  const dossier = await prisma.salarie.create({
    data: {
      id,
      cabinetId,
      entrepriseId,
      nom: 'Dupont',
      prenom: 'Marie',
      dateNaissance: new Date('1985-07-30'),
      nissEncrypted: chiffrer('niss', niss),
      nissHash: lookupHash(entrepriseId, niss),
      ibanEncrypted: chiffrer('iban', IBAN),
      typeContrat: 'CDI',
      dateEntree: new Date('2026-11-01'),
      situationFamiliale: 'ISOLE',
    },
  });
  await prisma.conditionTravail.create({
    data: {
      cabinetId,
      salarieId: id,
      dateEffet: new Date('2026-11-01'),
      statut: 'EMPLOYE',
      commissionParitaire: '200',
      fonction: 'Comptable',
      regime: 'TEMPS_PLEIN',
      salaireMensuelBrutCents: 280000,
    },
  });
  return { dossier, niss };
}

const enBase = (id: string) => prisma.salarie.findUniqueOrThrow({ where: { id } });
const auditsReveal = (cabinetId: string) =>
  prisma.auditLog.count({ where: { cabinetId, action: 'SALARIE_SENSITIVE_REVEALED' } });

describe.each(['v1', 'v2'] as const)('dossier chiffré au format %s', (format) => {
  it('se lit : fiche, liste et dévoilement journalisé', async () => {
    const { cabinetId, gestionnaire, entreprise, scope } = await mise(`chif-lecture-${format}`);
    const { dossier, niss } = await poserDossier(cabinetId, entreprise.id, format);

    const detail = await getSalarieDetail(scope, dossier.id);
    expect(detail?.nissMasque).toBe(maskNiss(niss));
    expect(detail?.ibanMasque).toBe(maskIban(IBAN));

    const liste = await getSalariesEntreprise(scope, entreprise.id);
    expect(liste?.salaries[0].nissMasque).toBe(maskNiss(niss));

    const nissClair = await revealSensitiveField(scope, gestionnaire.id, dossier.id, 'niss');
    const ibanClair = await revealSensitiveField(scope, gestionnaire.id, dossier.id, 'iban');
    expect(nissClair).toEqual({ ok: true, value: expect.stringContaining('.') });
    expect(ibanClair).toEqual({ ok: true, value: 'BE68 5390 0754 7034' });
    expect(await auditsReveal(cabinetId)).toBe(2);
  });

  it('une modification qui ne touche pas au NISS ni à l’IBAN les laisse tels quels', async () => {
    const { cabinetId, gestionnaire, entreprise, scope } = await mise(`chif-nom-${format}`);
    const { dossier } = await poserDossier(cabinetId, entreprise.id, format);
    const avant = await enBase(dossier.id);

    const res = await updateSalarie(
      scope,
      gestionnaire.id,
      dossier.id,
      salarieModificationSchema.parse({
        nom: 'Martin',
        prenom: 'Marie',
        dateNaissance: '1985-07-30',
        typeContrat: 'CDI',
        dateEntree: '2026-11-01',
        situationFamiliale: 'ISOLE',
        enfantsCharge: 0,
      }),
    );
    expect(res).toEqual({ ok: true, changed: ['nom'] });

    const apres = await enBase(dossier.id);
    expect(apres.nissEncrypted).toBe(avant.nissEncrypted);
    expect(apres.ibanEncrypted).toBe(avant.ibanEncrypted);
    expect(apres.nissEncrypted.startsWith(`${format}:`)).toBe(true);
  });
});

describe('modification de l’IBAN d’un ancien dossier', () => {
  const dossierModifie = (iban: string) =>
    salarieModificationSchema.parse({
      nom: 'Dupont',
      prenom: 'Marie',
      dateNaissance: '1985-07-30',
      typeContrat: 'CDI',
      dateEntree: '2026-11-01',
      situationFamiliale: 'ISOLE',
      enfantsCharge: 0,
      iban,
    });

  it('retaper l’IBAN à l’identique ne compte pas, même si l’ancienne valeur est en v1', async () => {
    const { cabinetId, gestionnaire, entreprise, scope } = await mise('chif-iban-identique');
    const { dossier } = await poserDossier(cabinetId, entreprise.id, 'v1');

    const res = await updateSalarie(scope, gestionnaire.id, dossier.id, dossierModifie(IBAN));
    expect(res).toEqual({ ok: true, changed: [] });
    expect((await enBase(dossier.id)).ibanEncrypted.startsWith('v1:')).toBe(true);
  });

  it('un nouvel IBAN s’écrit en v2, lié au dossier', async () => {
    const { cabinetId, gestionnaire, entreprise, scope } = await mise('chif-iban-nouveau');
    const { dossier } = await poserDossier(cabinetId, entreprise.id, 'v1');

    const res = await updateSalarie(
      scope,
      gestionnaire.id,
      dossier.id,
      dossierModifie('BE26 4587 4596 3529'),
    );
    expect(res).toEqual({ ok: true, changed: ['iban'] });

    const apres = await enBase(dossier.id);
    expect(apres.ibanEncrypted.startsWith('v2:')).toBe(true);
    expect(dechiffrerSalarie(dossier.id, 'iban', apres.ibanEncrypted)).toBe('BE26458745963529');
    // Le NISS, lui, n'a pas été touché : il reste v1 jusqu'au passage du script.
    expect(apres.nissEncrypted.startsWith('v1:')).toBe(true);
  });
});

describe('valeur recopiée dans un autre dossier ou un autre champ (v2)', () => {
  it('ne se lit plus : fiche masquée en entier, dévoilement refusé et sans trace', async () => {
    const { cabinetId, gestionnaire, entreprise, scope } = await mise('chif-transplant');
    const a = await poserDossier(cabinetId, entreprise.id, 'v2');
    const b = await poserDossier(cabinetId, entreprise.id, 'v2');

    // Quelqu'un qui écrit en base recopie le NISS chiffré de A chez B.
    await prisma.salarie.update({
      where: { id: b.dossier.id },
      data: { nissEncrypted: (await enBase(a.dossier.id)).nissEncrypted },
    });

    const detail = await getSalarieDetail(scope, b.dossier.id);
    expect(detail?.nissMasque).toBe('**.**.**-***.**'); // illisible : masqué en entier
    expect(detail?.ibanMasque).toBe(maskIban(IBAN)); // l'IBAN de B, lui, est intact

    await expect(
      revealSensitiveField(scope, gestionnaire.id, b.dossier.id, 'niss'),
    ).rejects.toThrow(DecryptionError);
    expect(await auditsReveal(cabinetId)).toBe(0);
    // Le dossier de A reste lisible.
    expect((await revealSensitiveField(scope, gestionnaire.id, a.dossier.id, 'niss')).ok).toBe(true);
  });

  it('un NISS recopié dans la colonne de l’IBAN du même dossier ne se lit pas non plus', async () => {
    const { cabinetId, gestionnaire, entreprise, scope } = await mise('chif-croise');
    const { dossier } = await poserDossier(cabinetId, entreprise.id, 'v2');
    await prisma.salarie.update({
      where: { id: dossier.id },
      data: { ibanEncrypted: (await enBase(dossier.id)).nissEncrypted },
    });

    await expect(
      revealSensitiveField(scope, gestionnaire.id, dossier.id, 'iban'),
    ).rejects.toThrow(DecryptionError);
    expect((await getSalarieDetail(scope, dossier.id))?.ibanMasque).toBe('**** ****');
  });

  it('limite connue : une valeur v1 n’est pas liée à son dossier, d’où la reconversion', async () => {
    const { cabinetId, entreprise, scope } = await mise('chif-limite-v1');
    const a = await poserDossier(cabinetId, entreprise.id, 'v1');
    const b = await poserDossier(cabinetId, entreprise.id, 'v1');
    await prisma.salarie.update({
      where: { id: b.dossier.id },
      data: { nissEncrypted: (await enBase(a.dossier.id)).nissEncrypted },
    });
    // Recopié, un v1 se lit encore chez B : c'est précisément ce que le format v2 corrige.
    expect((await getSalarieDetail(scope, b.dossier.id))?.nissMasque).toBe(maskNiss(a.niss));
  });
});

describe('reconversion des valeurs v1 en v2 (scripts/reencrypt-salaries.ts)', () => {
  it('une simulation compte sans rien écrire', async () => {
    const { cabinetId, entreprise } = await mise('chif-script-simulation');
    const v1 = await poserDossier(cabinetId, entreprise.id, 'v1');
    await poserDossier(cabinetId, entreprise.id, 'v2');
    const avant = await enBase(v1.dossier.id);

    const rapport = await reencryptSalaries({ dryRun: true, cabinetIds: [cabinetId] });

    expect(rapport).toEqual({
      dossiers: 2,
      dejaV2: 2,
      valeursV1: 2,
      convertibles: 2,
      converties: 0,
      conflits: 0,
      illisibles: 0,
    });
    const apres = await enBase(v1.dossier.id);
    expect(apres.nissEncrypted).toBe(avant.nissEncrypted);
    expect(apres.ibanEncrypted).toBe(avant.ibanEncrypted);
  });

  it('convertit sans changer les valeurs lues, puis ne fait plus rien (rejouable)', async () => {
    const { cabinetId, entreprise } = await mise('chif-script-conversion');
    const a = await poserDossier(cabinetId, entreprise.id, 'v1');
    const b = await poserDossier(cabinetId, entreprise.id, 'v1');

    const premier = await reencryptSalaries({ cabinetIds: [cabinetId] });
    expect(premier).toMatchObject({ dossiers: 2, valeursV1: 4, converties: 4, conflits: 0, illisibles: 0 });

    for (const { dossier, niss } of [a, b]) {
      const apres = await enBase(dossier.id);
      expect(apres.nissEncrypted.startsWith('v2:')).toBe(true);
      expect(apres.ibanEncrypted.startsWith('v2:')).toBe(true);
      expect(dechiffrerSalarie(dossier.id, 'niss', apres.nissEncrypted)).toBe(niss);
      expect(dechiffrerSalarie(dossier.id, 'iban', apres.ibanEncrypted)).toBe(IBAN);
    }

    const second = await reencryptSalaries({ cabinetIds: [cabinetId] });
    expect(second).toMatchObject({ dossiers: 2, dejaV2: 4, valeursV1: 0, converties: 0 });
  });

  it('ne touche qu’aux cabinets demandés', async () => {
    const cible = await mise('chif-script-cible');
    const autre = await mise('chif-script-autre');
    const dossierCible = await poserDossier(cible.cabinetId, cible.entreprise.id, 'v1');
    const dossierAutre = await poserDossier(autre.cabinetId, autre.entreprise.id, 'v1');

    await reencryptSalaries({ cabinetIds: [cible.cabinetId] });

    expect((await enBase(dossierCible.dossier.id)).nissEncrypted.startsWith('v2:')).toBe(true);
    expect((await enBase(dossierAutre.dossier.id)).nissEncrypted.startsWith('v1:')).toBe(true);
  });

  it('laisse en l’état une valeur illisible, la compte, et convertit le reste', async () => {
    const { cabinetId, entreprise } = await mise('chif-script-illisible');
    const { dossier } = await poserDossier(cabinetId, entreprise.id, 'v1');

    // Un NISS chiffré avec une autre clé (v1 valide en apparence, mais illisible ici).
    const cleCourante = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
    const etranger = encryptLegacyV1('85073003328');
    process.env.ENCRYPTION_KEY = cleCourante;
    await prisma.salarie.update({ where: { id: dossier.id }, data: { nissEncrypted: etranger } });

    const rapport = await reencryptSalaries({ cabinetIds: [cabinetId] });

    expect(rapport).toMatchObject({ valeursV1: 2, converties: 1, illisibles: 1, conflits: 0 });
    const apres = await enBase(dossier.id);
    expect(apres.nissEncrypted).toBe(etranger); // laissée telle quelle
    expect(apres.ibanEncrypted.startsWith('v2:')).toBe(true);
  });

  it('un format inconnu est compté comme illisible et jamais modifié', async () => {
    const { cabinetId, entreprise } = await mise('chif-script-inconnu');
    const { dossier } = await poserDossier(cabinetId, entreprise.id, 'v2');
    await prisma.salarie.update({ where: { id: dossier.id }, data: { nissEncrypted: 'v9:x:y:z' } });

    const rapport = await reencryptSalaries({ cabinetIds: [cabinetId] });

    expect(rapport).toMatchObject({ dejaV2: 1, valeursV1: 0, illisibles: 1 });
    expect((await enBase(dossier.id)).nissEncrypted).toBe('v9:x:y:z');
  });

  it('n’écrit rien si la valeur a changé entre la lecture et l’écriture (conflit)', async () => {
    const { cabinetId, entreprise } = await mise('chif-script-conflit');
    const { dossier } = await poserDossier(cabinetId, entreprise.id, 'v1');
    const concurrente = encryptLegacyV1('85073003328');

    // Simule une modification concurrente juste avant l'écriture du script.
    type UpdateMany = typeof prisma.salarie.updateMany;
    const reel = prisma.salarie.updateMany.bind(prisma.salarie) as unknown as (
      args: unknown,
    ) => Promise<{ count: number }>;
    const espion = vi.spyOn(prisma.salarie, 'updateMany').mockImplementationOnce((async (
      args: unknown,
    ) => {
      await prisma.salarie.update({ where: { id: dossier.id }, data: { nissEncrypted: concurrente } });
      return reel(args);
    }) as unknown as UpdateMany);

    const rapport = await reencryptSalaries({ cabinetIds: [cabinetId] });
    espion.mockRestore();

    expect(rapport).toMatchObject({ valeursV1: 2, conflits: 1, converties: 1, illisibles: 0 });
    // La valeur posée par l'autre écriture n'a pas été écrasée.
    expect((await enBase(dossier.id)).nissEncrypted).toBe(concurrente);
  });

  it('le rapport ne contient que des compteurs, jamais une valeur', async () => {
    const { cabinetId, entreprise } = await mise('chif-script-rapport');
    const { niss } = await poserDossier(cabinetId, entreprise.id, 'v1');

    const rapport = await reencryptSalaries({ cabinetIds: [cabinetId] });

    expect(Object.values(rapport).every((v) => typeof v === 'number')).toBe(true);
    expect(JSON.stringify(rapport)).not.toContain(niss);
    expect(JSON.stringify(rapport)).not.toContain(IBAN);
  });
});
