// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';

const send = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));

const { prisma } = await import('@/lib/prisma');
const email = await import('@/lib/email/email');

const stamp = Date.now();
const CABINET = {
  name: `Cabinet Compte ${stamp}`,
  displayName: 'Alicia Cabinet',
  primaryColor: '#008734',
  logoUrl: 'https://blob.test/logos/c1/logo.png',
};
const gestionnaire = `vitest-auth-acct-gest-${stamp}@socialflow.page`;
const titulaire = `vitest-auth-acct-tit-${stamp}@socialflow.page`;
const admin = `vitest-auth-acct-adm-${stamp}@socialflow.page`;
const entreprise = `vitest-auth-acct-ent-${stamp}@socialflow.page`;
const collaborateur = `vitest-auth-acct-col-${stamp}@socialflow.page`;
const sansCabinet = `vitest-auth-acct-none-${stamp}@socialflow.page`;
let cabinetId = '';

beforeAll(async () => {
  const cabinet = await prisma.cabinet.create({ data: CABINET });
  cabinetId = cabinet.id;
  const user = (id: string, mail: string, role: string, withCabinet: boolean) =>
    prisma.user.create({
      data: {
        id,
        name: 'Test',
        email: mail,
        emailVerified: true,
        role,
        ...(withCabinet ? { cabinetId } : {}),
      },
    });
  await user(`acct-gest-${stamp}`, gestionnaire, 'GESTIONNAIRE_RH', true);
  await user(`acct-tit-${stamp}`, titulaire, 'CABINET_RH', true);
  await user(`acct-adm-${stamp}`, admin, 'SUPER_ADMIN', false);
  await user(`acct-ent-${stamp}`, entreprise, 'ENTREPRISE_CLIENTE', true);
  await user(`acct-col-${stamp}`, collaborateur, 'COLLABORATEUR', true);
  await user(`acct-none-${stamp}`, sansCabinet, 'GESTIONNAIRE_RH', false);
});

beforeEach(() => {
  send.mockReset().mockResolvedValue({ error: null });
  process.env.RESEND_FROM_EMAIL = 'SocialFlow <noreply@socialflow.page>';
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { startsWith: `acct-` }, email: { contains: String(stamp) } } });
  await prisma.cabinet.deleteMany({ where: { id: cabinetId } });
});

const sent = () => send.mock.calls[0][0] as { from: string; subject: string; html: string; to: string };

describe('emails de compte au nom du cabinet (D66, D72)', () => {
  it('lien de reinitialisation : couleur, nom et logo du cabinet', async () => {
    await email.sendResetPasswordEmail(gestionnaire, 'https://app/reset?t=1');

    const mail = sent();
    expect(mail.from).toBe('"Alicia Cabinet" <noreply@socialflow.page>');
    expect(mail.subject).toBe('Réinitialisez votre mot de passe Alicia Cabinet');
    expect(mail.html).toContain('bgcolor="#008734" class="email-header"');
    expect(mail.html).toContain('https://blob.test/logos/c1/logo.png');
    expect(mail.html).toContain('Alicia Cabinet — Propulsé par SocialFlow');
    expect(mail.html).not.toContain('Social<span');
    expect(mail.html).not.toContain('linear-gradient');
  });

  it.each([
    ['mot de passe modifie', () => email.sendPasswordChangedEmail(gestionnaire), 'Votre mot de passe Alicia Cabinet a été modifié'],
    ['2FA activee', () => email.sendTwoFactorEnabledEmail(gestionnaire), 'Double authentification activée sur Alicia Cabinet'],
    ['2FA desactivee', () => email.sendTwoFactorDisabledEmail(gestionnaire), 'Double authentification désactivée sur Alicia Cabinet'],
    ['compte lie retire', () => email.sendAccountUnlinkedEmail(gestionnaire, 'Google'), 'Compte Google délié de Alicia Cabinet'],
    ['lien magique', () => email.sendMagicLinkEmail(gestionnaire, 'https://app/m'), 'Votre lien de connexion Alicia Cabinet'],
    ['code de connexion', () => email.sendOTPEmail(gestionnaire, '123456'), 'Votre code de connexion Alicia Cabinet'],
    ['verification d adresse', () => email.sendVerificationEmail(gestionnaire, 'https://app/v'), 'Confirmez votre adresse email Alicia Cabinet'],
    ['suppression demandee', () => email.sendDeleteAccountVerificationEmail(gestionnaire, 'Test', 'https://app/d'), 'Confirmez la suppression de votre compte Alicia Cabinet'],
    ['compte supprime', () => email.sendAccountDeletedEmail(gestionnaire, 'Test'), 'Votre compte Alicia Cabinet a été supprimé'],
  ])('%s : au nom du cabinet', async (_label, run, subject) => {
    await run();

    const mail = sent();
    expect(mail.subject).toBe(subject);
    expect(mail.from).toBe('"Alicia Cabinet" <noreply@socialflow.page>');
    expect(mail.html).toContain('bgcolor="#008734" class="email-header"');
    // Aucune mention de SocialFlow en dehors du pied "Propulse par".
    const withoutFooter = mail.html.replace('Alicia Cabinet — Propulsé par SocialFlow', '');
    expect(withoutFooter).not.toContain('SocialFlow');
  });

  it('changement d adresse : theme du cabinet de l ANCIENNE adresse', async () => {
    await email.sendChangeEmailConfirmationEmail(gestionnaire, `nouvelle-${stamp}@test.com`, 'https://app/c');

    const mail = sent();
    expect(mail.to).toBe(gestionnaire);
    expect(mail.from).toBe('"Alicia Cabinet" <noreply@socialflow.page>');
    expect(mail.html).toContain('bgcolor="#008734"');
  });

  it.each([
    ['un administrateur d entreprise', entreprise],
    ['un collaborateur', collaborateur],
  ])('%s recoit aussi les emails de compte au nom du cabinet (D72)', async (_label, address) => {
    await email.sendVerificationEmail(address, 'https://app/v');
    const mail = sent();
    expect(mail.from).toBe('"Alicia Cabinet" <noreply@socialflow.page>');
    expect(mail.subject).toBe('Confirmez votre adresse email Alicia Cabinet');
    expect(mail.html).toContain('bgcolor="#008734" class="email-header"');

    send.mockClear();
    await email.sendPasswordChangedEmail(address);
    expect(sent().subject).toBe('Votre mot de passe Alicia Cabinet a été modifié');
  });

  it('le titulaire du cabinet (Cabinet RH) recoit des emails aux couleurs de SocialFlow (D72)', async () => {
    await email.sendPasswordChangedEmail(titulaire);
    const mail = sent();
    expect(mail.from).toBe('SocialFlow <noreply@socialflow.page>');
    expect(mail.subject).toBe('Votre mot de passe SocialFlow a été modifié');
    expect(mail.html).toContain('Social<span');

    send.mockClear();
    await email.sendVerificationEmail(titulaire, 'https://app/v');
    expect(sent().subject).toBe('Confirmez votre adresse email SocialFlow');
  });

  it('la casse de l adresse ne change rien', async () => {
    await email.sendPasswordChangedEmail(gestionnaire.toUpperCase());
    expect(sent().from).toBe('"Alicia Cabinet" <noreply@socialflow.page>');
  });

  it('un SuperAdmin garde l identite SocialFlow', async () => {
    await email.sendPasswordChangedEmail(admin);

    const mail = sent();
    expect(mail.from).toBe('SocialFlow <noreply@socialflow.page>');
    expect(mail.subject).toBe('Votre mot de passe SocialFlow a été modifié');
    expect(mail.html).toContain('Social<span');
    expect(mail.html).toContain('© 2026 SocialFlow — Tous droits réservés.');
  });

  it('un utilisateur sans cabinet ou une adresse inconnue garde l identite SocialFlow', async () => {
    await email.sendResetPasswordEmail(sansCabinet, 'https://app/r');
    expect(sent().from).toBe('SocialFlow <noreply@socialflow.page>');

    send.mockClear();
    await email.sendResetPasswordEmail(`inconnu-${stamp}@test.com`, 'https://app/r');
    expect(sent().from).toBe('SocialFlow <noreply@socialflow.page>');
    expect(sent().html).toContain('Social<span');
  });

  it('un cabinet sans couleur garde les couleurs par defaut mais son nom', async () => {
    await prisma.cabinet.update({ where: { id: cabinetId }, data: { primaryColor: null, logoUrl: null } });
    try {
      await email.sendPasswordChangedEmail(gestionnaire);
      const mail = sent();
      expect(mail.html).toContain('bgcolor="#4c1d95" class="email-header"');
      expect(mail.html).toContain('Alicia Cabinet');
      expect(mail.html).not.toContain('Social<span');
    } finally {
      await prisma.cabinet.update({
        where: { id: cabinetId },
        data: { primaryColor: CABINET.primaryColor, logoUrl: CABINET.logoUrl },
      });
    }
  });

  it('les emails de la plateforme (paiement) restent aux couleurs de SocialFlow', async () => {
    await email.sendPaymentFailedEmail(
      titulaire,
      'Titulaire',
      'Alicia Cabinet',
      new Date(Date.now() + 86_400_000),
      'cabinet',
    );

    const mail = sent();
    expect(mail.from).toBe('SocialFlow <noreply@socialflow.page>');
    expect(mail.html).toContain('Social<span');
  });
});
