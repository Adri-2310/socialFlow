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
const { POST: creerSalarie } = await import('@/app/api/entreprises/[id]/salaries/route');
const { POST: devoiler } = await import('@/app/api/salaries/[id]/reveal/route');

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

let vat = 90_000_000;
const creerEntreprise = (cabinetId: string, extra: { deletedAt?: Date } = {}) =>
  prisma.entreprise.create({
    data: { cabinetId, name: 'Entreprise de test', vatNumber: `BE0${++vat}`, ...extra },
  });

// NISS valides distincts : 9 chiffres de base, clé = 97 − (base mod 97).
let compteurNiss = 0;
const nissValide = () => {
  const base = 850730000 + 900 + ++compteurNiss;
  return `${base}${String(97 - (base % 97)).padStart(2, '0')}`;
};
const formatNiss = (n: string) =>
  `${n.slice(0, 2)}.${n.slice(2, 4)}.${n.slice(4, 6)}-${n.slice(6, 9)}.${n.slice(9)}`;

const IBAN_SAISI = 'BE68 5390 0754 7034';

const salarieValide = (niss: string) => ({
  nom: 'Dupont',
  prenom: 'Marie',
  niss,
  dateNaissance: '1985-07-30',
  iban: IBAN_SAISI,
  typeContrat: 'CDI',
  dateEntree: '2026-11-01',
  statut: 'EMPLOYE',
  commissionParitaire: '200',
  fonction: 'Comptable',
  regime: 'TEMPS_PLEIN',
  salaireMensuelBrutCents: 280000,
  situationFamiliale: 'ISOLE',
  personnesCharge: 0,
});

const entetes = (cj?: Jar) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return headers;
};

function creer(entrepriseId: string, body: unknown, cj?: Jar) {
  return creerSalarie(
    new Request(`http://localhost:3000/api/entreprises/${entrepriseId}/salaries`, {
      method: 'POST',
      headers: entetes(cj),
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: entrepriseId }) },
  );
}

function reveler(salarieId: string, body: unknown, cj?: Jar) {
  return devoiler(
    new Request(`http://localhost:3000/api/salaries/${salarieId}/reveal`, {
      method: 'POST',
      headers: entetes(cj),
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: salarieId }) },
  );
}

// Un cabinet, un gestionnaire assigné à une entreprise, un salarié déjà créé.
async function mise(label: string) {
  const { user: titulaire, cj: cjTitulaire } = await creerCompte(`${label}-t`);
  const cabinetId = titulaire.cabinetId!;
  const gestionnaire = await creerAvecRole(`${label}-g`, 'GESTIONNAIRE_RH', cabinetId);
  const entreprise = await creerEntreprise(cabinetId);
  await prisma.gestionnaireEntreprise.create({
    data: { entrepriseId: entreprise.id, userId: gestionnaire.user.id },
  });
  const niss = nissValide();
  const { id } = await (await creer(entreprise.id, salarieValide(niss), gestionnaire.cj)).json();
  return { cabinetId, cjTitulaire, gestionnaire, entreprise, salarieId: id as string, niss };
}

const audits = (cabinetId: string) =>
  prisma.auditLog.findMany({ where: { cabinetId, action: 'SALARIE_SENSITIVE_REVEALED' } });

describe('POST /api/salaries/[id]/reveal : dévoilement', () => {
  it('renvoie le NISS et l’IBAN en clair, formatés, sans mise en cache', async () => {
    const { gestionnaire, salarieId, niss } = await mise('rev-clair');

    const resNiss = await reveler(salarieId, { field: 'niss' }, gestionnaire.cj);
    expect(resNiss.status).toBe(200);
    expect(await resNiss.json()).toEqual({ value: formatNiss(niss) });
    // Le clair ne doit rester ni dans le navigateur ni dans un proxy.
    expect(resNiss.headers.get('cache-control')).toBe('no-store');

    const resIban = await reveler(salarieId, { field: 'iban' }, gestionnaire.cj);
    expect(await resIban.json()).toEqual({ value: IBAN_SAISI });
    expect(resIban.headers.get('cache-control')).toBe('no-store');
  });

  it('journalise chaque dévoilement avec le nom du champ, jamais sa valeur (D8, D26)', async () => {
    const { cabinetId, gestionnaire, entreprise, salarieId, niss } = await mise('rev-audit');

    await reveler(salarieId, { field: 'niss' }, gestionnaire.cj);
    await reveler(salarieId, { field: 'niss' }, gestionnaire.cj);
    await reveler(salarieId, { field: 'iban' }, gestionnaire.cj);

    // Un dévoilement = une entrée, même répété.
    const entrees = await audits(cabinetId);
    expect(entrees).toHaveLength(3);
    expect(entrees.map((e) => (e.metadata as { field: string }).field).sort()).toEqual([
      'iban',
      'niss',
      'niss',
    ]);
    for (const entree of entrees) {
      expect(entree.actorId).toBe(gestionnaire.user.id);
      expect(entree.metadata).toMatchObject({ salarieId, entrepriseId: entreprise.id });
      const brut = JSON.stringify(entree);
      for (const secret of [niss, '5390', '0754', '7034', 'Dupont']) {
        expect(brut).not.toContain(secret);
      }
    }
  });

  it('reste possible quand le cabinet est en lecture seule : consulter n’est pas modifier (D29)', async () => {
    const { cabinetId, gestionnaire, salarieId, niss } = await mise('rev-lecture-seule');
    await prisma.cabinet.update({ where: { id: cabinetId }, data: { billingStatus: 'RESILIE' } });

    const res = await reveler(salarieId, { field: 'niss' }, gestionnaire.cj);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ value: formatNiss(niss) });
    expect(await audits(cabinetId)).toHaveLength(1);
  });

  it('refuse un champ inconnu ou absent, sans rien journaliser', async () => {
    const { cabinetId, gestionnaire, salarieId } = await mise('rev-invalide');

    for (const body of [{ field: 'salaire' }, { field: 'nissEncrypted' }, {}, null]) {
      const res = await reveler(salarieId, body, gestionnaire.cj);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'INVALID_FIELD' });
    }
    expect(await audits(cabinetId)).toHaveLength(0);
  });

  it('une valeur illisible ne renvoie rien et ne journalise rien (transaction annulée)', async () => {
    const { cabinetId, gestionnaire, salarieId } = await mise('rev-illisible');
    await prisma.salarie.update({
      where: { id: salarieId },
      data: { nissEncrypted: 'v1:AAAA:BBBB:CCCC' },
    });

    const res = await reveler(salarieId, { field: 'niss' }, gestionnaire.cj);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'DECRYPTION_FAILED' });
    expect(await audits(cabinetId)).toHaveLength(0);
  });
});

describe('POST /api/salaries/[id]/reveal : isolation', () => {
  it('404 sans clair ni trace pour un dossier non assigné, d’un autre cabinet, archivé ou inconnu', async () => {
    const { cabinetId, gestionnaire, salarieId } = await mise('rev-404');
    const { user: autreTitulaire } = await creerCompte('rev-404-autre');
    const nonAssignee = await creerEntreprise(cabinetId);
    const autreCabinet = await creerEntreprise(autreTitulaire.cabinetId!);

    const nouveau = (cab: string, entrepriseId: string, nissHash: string) =>
      prisma.salarie.create({
        data: {
          cabinetId: cab,
          entrepriseId,
          nom: 'Autre',
          prenom: 'Eve',
          dateNaissance: new Date('1980-01-01'),
          nissEncrypted: 'v1:a:b:c',
          nissHash,
          ibanEncrypted: 'v1:a:b:c',
          typeContrat: 'CDI',
          dateEntree: new Date('2020-01-01'),
          situationFamiliale: 'ISOLE',
        },
      });
    const chezVoisin = await nouveau(cabinetId, nonAssignee.id, 'h-rev-1');
    const etranger = await nouveau(autreTitulaire.cabinetId!, autreCabinet.id, 'h-rev-2');
    const archive = await prisma.salarie.update({
      where: { id: salarieId },
      data: { deletedAt: new Date() },
    });

    for (const id of [chezVoisin.id, etranger.id, archive.id, 'id-inconnu']) {
      for (const field of ['niss', 'iban']) {
        const res = await reveler(id, { field }, gestionnaire.cj);
        expect(res.status, id).toBe(404);
        expect(await res.json()).toEqual({ error: 'SALARIE_NOT_FOUND' });
      }
    }
    expect(await audits(cabinetId)).toHaveLength(0);
    expect(await audits(autreTitulaire.cabinetId!)).toHaveLength(0);
  });

  it('le périmètre est vérifié avant le corps : un dossier existant hors périmètre répond 404, jamais 400', async () => {
    const { cabinetId, gestionnaire } = await mise('rev-404-avant-400');
    const nonAssignee = await creerEntreprise(cabinetId);
    const chezVoisin = await prisma.salarie.create({
      data: {
        cabinetId,
        entrepriseId: nonAssignee.id,
        nom: 'Voisin',
        prenom: 'Paul',
        dateNaissance: new Date('1980-01-01'),
        nissEncrypted: 'v1:a:b:c',
        nissHash: 'h-rev-3',
        ibanEncrypted: 'v1:a:b:c',
        typeContrat: 'CDI',
        dateEntree: new Date('2020-01-01'),
        situationFamiliale: 'ISOLE',
      },
    });

    // Un 400 révélerait que le dossier existe.
    for (const body of [{ field: 'salaire' }, {}, null]) {
      expect((await reveler(chezVoisin.id, body, gestionnaire.cj)).status).toBe(404);
    }
  });

  it('une assignation retirée coupe le dévoilement dès la requête suivante', async () => {
    const { cabinetId, gestionnaire, salarieId } = await mise('rev-retrait');
    expect((await reveler(salarieId, { field: 'niss' }, gestionnaire.cj)).status).toBe(200);

    await prisma.gestionnaireEntreprise.deleteMany({ where: { userId: gestionnaire.user.id } });

    expect((await reveler(salarieId, { field: 'niss' }, gestionnaire.cj)).status).toBe(404);
    expect(await audits(cabinetId)).toHaveLength(1);
  });
});

describe('POST /api/salaries/[id]/reveal : autorisations', () => {
  it('401 sans session', async () => {
    const { salarieId } = await mise('rev-401');
    expect((await reveler(salarieId, { field: 'niss' })).status).toBe(401);
  });

  it('403 pour le Cabinet RH : il ne voit jamais un dossier (D26)', async () => {
    const { cabinetId, cjTitulaire, salarieId } = await mise('rev-403');
    const res = await reveler(salarieId, { field: 'niss' }, cjTitulaire);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'FORBIDDEN' });
    expect(await audits(cabinetId)).toHaveLength(0);
  });

  it('l’entreprise et le collaborateur n’ont pas encore de portail : ils ne dévoilent rien (404)', async () => {
    const { cabinetId, entreprise, salarieId } = await mise('rev-portails');
    const admin = await creerAvecRole('rev-portails-ent', 'ENTREPRISE_CLIENTE', cabinetId);
    await prisma.entreprise.update({
      where: { id: entreprise.id },
      data: { adminUserId: admin.user.id },
    });
    const collaborateur = await creerAvecRole('rev-portails-col', 'COLLABORATEUR', cabinetId);

    for (const cj of [admin.cj, collaborateur.cj]) {
      const res = await reveler(salarieId, { field: 'niss' }, cj);
      expect(res.status).toBe(404);
      expect(JSON.stringify(await res.json())).not.toMatch(/\d{2}\.\d{2}\.\d{2}/);
    }
    expect(await audits(cabinetId)).toHaveLength(0);
  });
});
