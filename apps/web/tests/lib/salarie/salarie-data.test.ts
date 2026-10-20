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
const { resolveScope } = await import('@/lib/authz/authz');
const { encryptField, lookupHash } = await import('@/lib/crypto/field-encryption');
const { getEntreprisesAvecEffectif, getSalariesEntreprise } =
  await import('@/lib/salarie/salarie-data');

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

// L'inscription crée un Cabinet RH et son cabinet ; les autres rôles reprennent
// le cabinet voulu et l'on supprime celui créé à l'inscription.
async function creerAvecRole(label: string, role: string, cabinetId: string) {
  const user = await creerCompte(label);
  await prisma.user.update({ where: { id: user.id }, data: { role, cabinetId } });
  await prisma.cabinet.delete({ where: { id: user.cabinetId! } });
  return prisma.user.findUniqueOrThrow({ where: { id: user.id } });
}

let vat = 50_000_000;
const creerEntreprise = (cabinetId: string, extra: { deletedAt?: Date } = {}) =>
  prisma.entreprise.create({
    data: { cabinetId, name: `Entreprise ${vat}`, vatNumber: `BE0${++vat}`, ...extra },
  });

let nissCompteur = 0;
async function creerSalarie(
  cabinetId: string,
  entrepriseId: string,
  extra: { nom?: string; deletedAt?: Date; fonction?: string } = {},
) {
  // Le contrôle du NISS n'est pas l'objet de ces tests : une valeur par salarié suffit.
  const niss = `8507300${String(++nissCompteur).padStart(4, '0')}`;
  const salarie = await prisma.salarie.create({
    data: {
      cabinetId,
      entrepriseId,
      nom: extra.nom ?? 'Dupont',
      prenom: 'Marie',
      dateNaissance: new Date('1985-07-30'),
      nissEncrypted: encryptField(niss),
      nissHash: lookupHash(entrepriseId, niss),
      ibanEncrypted: encryptField('BE68539007547034'),
      typeContrat: 'CDI',
      dateEntree: new Date('2026-11-01'),
      situationFamiliale: 'ISOLE',
      deletedAt: extra.deletedAt,
    },
  });
  await prisma.conditionTravail.create({
    data: {
      cabinetId,
      salarieId: salarie.id,
      dateEffet: new Date('2026-11-01'),
      statut: 'EMPLOYE',
      commissionParitaire: '200',
      fonction: extra.fonction ?? 'Comptable',
      regime: 'TEMPS_PLEIN',
      salaireMensuelBrutCents: 280000,
    },
  });
  return { salarie, niss };
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe('entreprises du gestionnaire', () => {
  it('ne liste que les entreprises assignées, non archivées, de son cabinet, avec leur effectif actif', async () => {
    const titulaire = await creerCompte('sal-data-liste-a');
    const autreTitulaire = await creerCompte('sal-data-liste-b');
    const cabinetA = titulaire.cabinetId!;
    const gestionnaire = await creerAvecRole('sal-data-liste-g', 'GESTIONNAIRE_RH', cabinetA);

    const assignee = await creerEntreprise(cabinetA);
    const nonAssignee = await creerEntreprise(cabinetA);
    const archivee = await creerEntreprise(cabinetA, { deletedAt: new Date() });
    const autreCabinet = await creerEntreprise(autreTitulaire.cabinetId!);
    await prisma.gestionnaireEntreprise.createMany({
      data: [assignee, archivee, autreCabinet].map((e) => ({
        entrepriseId: e.id,
        userId: gestionnaire.id,
      })),
    });
    await creerSalarie(cabinetA, assignee.id);
    await creerSalarie(cabinetA, assignee.id, { nom: 'Martin' });
    await creerSalarie(cabinetA, assignee.id, { nom: 'Archivé', deletedAt: new Date() });
    await creerSalarie(cabinetA, nonAssignee.id);

    const scope = (await resolveScope(gestionnaire))!;
    const liste = await getEntreprisesAvecEffectif(scope);

    expect(ids(liste)).toEqual([assignee.id]);
    expect(liste[0].salariesActifs).toBe(2);
  });

  it('une assignation retirée coupe l’accès dès la requête suivante', async () => {
    const titulaire = await creerCompte('sal-data-retrait-a');
    const cabinetId = titulaire.cabinetId!;
    const gestionnaire = await creerAvecRole('sal-data-retrait-g', 'GESTIONNAIRE_RH', cabinetId);
    const entreprise = await creerEntreprise(cabinetId);
    await prisma.gestionnaireEntreprise.create({
      data: { entrepriseId: entreprise.id, userId: gestionnaire.id },
    });
    await creerSalarie(cabinetId, entreprise.id);

    expect(
      await getSalariesEntreprise((await resolveScope(gestionnaire))!, entreprise.id),
    ).not.toBeNull();

    await prisma.gestionnaireEntreprise.deleteMany({ where: { userId: gestionnaire.id } });

    expect(
      await getSalariesEntreprise((await resolveScope(gestionnaire))!, entreprise.id),
    ).toBeNull();
    expect(await getEntreprisesAvecEffectif((await resolveScope(gestionnaire))!)).toEqual([]);
  });
});

describe('salariés d’une entreprise du gestionnaire', () => {
  it('liste les salariés actifs avec NISS masqué, sans jamais exposer NISS ni IBAN en clair', async () => {
    const titulaire = await creerCompte('sal-data-masque-a');
    const cabinetId = titulaire.cabinetId!;
    const gestionnaire = await creerAvecRole('sal-data-masque-g', 'GESTIONNAIRE_RH', cabinetId);
    const entreprise = await creerEntreprise(cabinetId);
    await prisma.gestionnaireEntreprise.create({
      data: { entrepriseId: entreprise.id, userId: gestionnaire.id },
    });
    const { niss } = await creerSalarie(cabinetId, entreprise.id, { nom: 'Actif' });
    await creerSalarie(cabinetId, entreprise.id, { nom: 'Archivé', deletedAt: new Date() });

    const data = await getSalariesEntreprise((await resolveScope(gestionnaire))!, entreprise.id);

    expect(data?.salaries.map((s) => s.nom)).toEqual(['Actif']);
    expect(data?.salaries[0]).toMatchObject({
      nissMasque: '85.07.**-***.**',
      fonction: 'Comptable',
      statut: 'EMPLOYE',
    });
    const brut = JSON.stringify(data);
    expect(brut).not.toContain(niss);
    expect(brut).not.toContain('BE68539007547034');
    expect(brut).not.toContain('Encrypted');
  });

  it('renvoie null (404) pour une entreprise non assignée, archivée, d’un autre cabinet ou inconnue', async () => {
    const titulaire = await creerCompte('sal-data-404-a');
    const autreTitulaire = await creerCompte('sal-data-404-b');
    const cabinetId = titulaire.cabinetId!;
    const gestionnaire = await creerAvecRole('sal-data-404-g', 'GESTIONNAIRE_RH', cabinetId);

    const nonAssignee = await creerEntreprise(cabinetId);
    const archivee = await creerEntreprise(cabinetId, { deletedAt: new Date() });
    const autreCabinet = await creerEntreprise(autreTitulaire.cabinetId!);
    for (const e of [nonAssignee, archivee]) await creerSalarie(cabinetId, e.id);
    await creerSalarie(autreTitulaire.cabinetId!, autreCabinet.id);
    // Même une assignation posée par erreur ne donne pas accès à un autre cabinet ni à une archivée.
    await prisma.gestionnaireEntreprise.createMany({
      data: [archivee, autreCabinet].map((e) => ({ entrepriseId: e.id, userId: gestionnaire.id })),
    });

    const scope = (await resolveScope(gestionnaire))!;
    for (const id of [nonAssignee.id, archivee.id, autreCabinet.id, 'id-inconnu']) {
      expect(await getSalariesEntreprise(scope, id)).toBeNull();
    }
  });

  it('ne voit pas les salariés d’une autre entreprise du même cabinet', async () => {
    const titulaire = await creerCompte('sal-data-voisine-a');
    const cabinetId = titulaire.cabinetId!;
    const gestionnaire = await creerAvecRole('sal-data-voisine-g', 'GESTIONNAIRE_RH', cabinetId);
    const assignee = await creerEntreprise(cabinetId);
    const voisine = await creerEntreprise(cabinetId);
    await prisma.gestionnaireEntreprise.create({
      data: { entrepriseId: assignee.id, userId: gestionnaire.id },
    });
    await creerSalarie(cabinetId, assignee.id, { nom: 'Mien' });
    await creerSalarie(cabinetId, voisine.id, { nom: 'Voisin' });

    const data = await getSalariesEntreprise((await resolveScope(gestionnaire))!, assignee.id);
    expect(data?.salaries.map((s) => s.nom)).toEqual(['Mien']);
  });
});

describe('les autres périmètres ne passent pas par les lectures du gestionnaire', () => {
  it('plateforme, cabinet, entreprise et collaborateur ne voient rien', async () => {
    const titulaire = await creerCompte('sal-data-autres-a');
    const cabinetId = titulaire.cabinetId!;
    const entreprise = await creerEntreprise(cabinetId);
    await creerSalarie(cabinetId, entreprise.id);

    const scopes = [
      { kind: 'platform' as const }, // D8 : jamais de données de paie
      { kind: 'cabinet' as const, cabinetId }, // D26 : compteurs seulement
      { kind: 'entreprise' as const, cabinetId, entrepriseId: entreprise.id },
      { kind: 'self' as const, userId: titulaire.id },
    ];
    for (const scope of scopes) {
      expect(await getEntreprisesAvecEffectif(scope)).toEqual([]);
      expect(await getSalariesEntreprise(scope, entreprise.id)).toBeNull();
    }
  });
});
