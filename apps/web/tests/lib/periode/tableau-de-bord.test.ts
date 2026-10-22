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
const { etatPeriodeMois, getTableauDeBord } = await import('@/lib/periode/tableau-de-bord');

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

describe('état de la période du mois', () => {
  const periode = { id: 'p1', statut: 'OUVERTE', dateLimite: '2026-10-20' };

  it('non ouverte quand il n’y a pas de période', () => {
    expect(etatPeriodeMois(null, '2026-10-05')).toEqual({ kind: 'NON_OUVERTE' });
  });

  it('en attente jusqu’à la date limite incluse, en retard après', () => {
    expect(etatPeriodeMois(periode, '2026-10-20').kind).toBe('EN_ATTENTE');
    expect(etatPeriodeMois(periode, '2026-10-21')).toEqual({
      kind: 'EN_RETARD',
      periodeId: 'p1',
      dateLimite: '2026-10-20',
    });
  });

  it('verrouillée l’emporte sur le retard', () => {
    expect(etatPeriodeMois({ ...periode, statut: 'VERROUILLEE' }, '2026-10-30').kind).toBe(
      'VERROUILLEE',
    );
  });
});

async function creerTitulaire(label: string) {
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

let vat = 96_000_000;
const creerEntreprise = (cabinetId: string, name: string) =>
  prisma.entreprise.create({ data: { cabinetId, name, vatNumber: `BE0${++vat}` } });

let n = 0;
function creerSalarie(
  cabinetId: string,
  entrepriseId: string,
  extra: { dateEntree: string; dateSortie?: string; deletedAt?: Date },
) {
  n += 1;
  return prisma.salarie.create({
    data: {
      cabinetId,
      entrepriseId,
      nom: `Nom${n}`,
      prenom: 'Marie',
      dateNaissance: new Date('1985-07-30'),
      nissEncrypted: 'v1:test',
      nissHash: `hash-tdb-${Date.now()}-${n}`,
      ibanEncrypted: 'v1:test',
      typeContrat: 'CDI',
      dateEntree: new Date(extra.dateEntree),
      dateSortie: extra.dateSortie ? new Date(extra.dateSortie) : null,
      situationFamiliale: 'ISOLE',
      deletedAt: extra.deletedAt ?? null,
    },
  });
}

describe('tableau de bord du gestionnaire (D93)', () => {
  // 15 octobre 2026 : le mois courant est fixé par le paramètre, pas par l'horloge.
  const aujourdhui = new Date('2026-10-15T10:00:00Z');

  it('donne l’état du mois courant et les salariés en poste, entreprise par entreprise', async () => {
    const titulaire = await creerTitulaire('tdb-etat');
    const cabinetId = titulaire.cabinetId!;
    const [a, b, c, d] = await Promise.all(
      ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((nom) => creerEntreprise(cabinetId, nom)),
    );

    // Alpha : trois salariés en poste (dont un sorti le 1er du mois), un entré le mois suivant,
    // un sorti le mois précédent, un archivé : ces trois-là ne comptent pas.
    await creerSalarie(cabinetId, a.id, { dateEntree: '2020-01-01' });
    await creerSalarie(cabinetId, a.id, { dateEntree: '2026-10-31' });
    await creerSalarie(cabinetId, a.id, { dateEntree: '2020-01-01', dateSortie: '2026-10-01' });
    await creerSalarie(cabinetId, a.id, { dateEntree: '2026-11-01' });
    await creerSalarie(cabinetId, a.id, { dateEntree: '2020-01-01', dateSortie: '2026-09-30' });
    await creerSalarie(cabinetId, a.id, { dateEntree: '2020-01-01', deletedAt: new Date() });
    await prisma.periodePaie.create({
      data: {
        cabinetId,
        entrepriseId: a.id,
        annee: 2026,
        mois: 10,
        statut: 'OUVERTE',
        dateLimite: new Date('2026-10-20'),
      },
    });
    // Bravo : date limite dépassée. Charlie : verrouillée. Delta : seulement le mois précédent.
    for (const [e, statut, limite] of [
      [b, 'OUVERTE', '2026-10-10'],
      [c, 'VERROUILLEE', '2026-10-10'],
    ] as const) {
      await prisma.periodePaie.create({
        data: {
          cabinetId,
          entrepriseId: e.id,
          annee: 2026,
          mois: 10,
          statut,
          dateLimite: new Date(limite),
        },
      });
    }
    await prisma.periodePaie.create({
      data: {
        cabinetId,
        entrepriseId: d.id,
        annee: 2026,
        mois: 9,
        statut: 'OUVERTE',
        dateLimite: new Date('2026-09-20'),
      },
    });

    const scope = {
      kind: 'entreprises' as const,
      cabinetId,
      entrepriseIds: [a.id, b.id, c.id, d.id],
    };
    const res = await getTableauDeBord(scope, aujourdhui);

    expect(res).toMatchObject({ annee: 2026, mois: 10 });
    expect(res.entreprises.map((e) => [e.name, e.salariesEnPoste, e.etat.kind])).toEqual([
      ['Alpha', 3, 'EN_ATTENTE'],
      ['Bravo', 0, 'EN_RETARD'],
      ['Charlie', 0, 'VERROUILLEE'],
      ['Delta', 0, 'NON_OUVERTE'],
    ]);
  });

  it('ne montre que les entreprises assignées, pas celles du même cabinet ni d’un autre', async () => {
    const t1 = await creerTitulaire('tdb-iso-1');
    const t2 = await creerTitulaire('tdb-iso-2');
    const assignee = await creerEntreprise(t1.cabinetId!, 'Assignée');
    await creerEntreprise(t1.cabinetId!, 'Non assignée');
    const etrangere = await creerEntreprise(t2.cabinetId!, 'Étrangère');
    const archivee = await creerEntreprise(t1.cabinetId!, 'Archivée');
    await prisma.entreprise.update({ where: { id: archivee.id }, data: { deletedAt: new Date() } });

    // Même une liste d'ids fautive (archivée, autre cabinet) ne fait rien sortir.
    const res = await getTableauDeBord(
      {
        kind: 'entreprises',
        cabinetId: t1.cabinetId!,
        entrepriseIds: [assignee.id, archivee.id, etrangere.id],
      },
      aujourdhui,
    );
    expect(res.entreprises.map((e) => e.id)).toEqual([assignee.id]);
  });

  it('reste vide pour un périmètre qui n’est pas celui d’un gestionnaire', async () => {
    const t = await creerTitulaire('tdb-kind');
    const res = await getTableauDeBord({ kind: 'cabinet', cabinetId: t.cabinetId! }, aujourdhui);
    expect(res.entreprises).toEqual([]);
  });
});
