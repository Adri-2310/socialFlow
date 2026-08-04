// @vitest-environment node
import crypto from 'node:crypto';
import { describe, it, expect, vi, afterAll } from 'vitest';
import { cookieJar, testEmail, totpCode, TEST_EMAIL_PREFIX } from '../helpers/auth-test-utils';

vi.mock('@/lib/email', () => ({
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

const { auth } = await import('@/lib/auth');
const { prisma } = await import('@/lib/prisma');
const email = await import('@/lib/email');

const PASSWORD = 'InitialPass123!';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.verification.deleteMany({
    where: {
      OR: [{ identifier: { contains: TEST_EMAIL_PREFIX } }, { value: { contains: TEST_EMAIL_PREFIX } }],
    },
  });
});

/** Cree un compte et lui attache un faux compte OAuth (pas d'appel reseau). */
async function creerCompteAvecOAuth(label: string, providerId: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true }));
  const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  await prisma.account.create({
    data: { id: crypto.randomUUID(), providerId, accountId: `${providerId}-${user.id}`, userId: user.id },
  });
  return { mail, cj, user };
}

describe('deliaison de comptes', () => {
  it("refuse de supprimer l'unique methode de connexion", async () => {
    const mail = testEmail('unlink-dernier');
    const cj = cookieJar();
    cj.apply(await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true }));

    // Le compte n'a que sa ligne `credential` : la delier laisserait
    // l'utilisateur sans aucun moyen de se connecter.
    const res = await auth.api.unlinkAccount({ body: { providerId: 'credential' }, headers: cj.headers(), asResponse: true });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('FAILED_TO_UNLINK_LAST_ACCOUNT');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
    expect(await prisma.account.count({ where: { userId: user.id, providerId: 'credential' } })).toBe(1);
  });

  it("refuse de delier un fournisseur qui n'est pas rattache au compte", async () => {
    const { cj } = await creerCompteAvecOAuth('unlink-absent', 'google');

    const res = await auth.api.unlinkAccount({ body: { providerId: 'microsoft' }, headers: cj.headers(), asResponse: true });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('ACCOUNT_NOT_FOUND');
  });

  it('notifie par email avec le libelle du fournisseur', async () => {
    const { mail, cj } = await creerCompteAvecOAuth('unlink-microsoft', 'microsoft');

    const res = await auth.api.unlinkAccount({ body: { providerId: 'microsoft' }, headers: cj.headers(), asResponse: true });

    expect(res.status).toBe(200);
    expect(email.sendAccountUnlinkedEmail).toHaveBeenCalledWith(mail, 'Microsoft');
  });

  it("retombe sur l'identifiant brut pour un fournisseur sans libelle connu", async () => {
    const { mail, cj } = await creerCompteAvecOAuth('unlink-inconnu', 'linkedin');

    // OAUTH_PROVIDER_LABELS (auth.ts) ne connait que google et microsoft :
    // on verifie que le repli n'envoie pas un email vide ou "undefined".
    const res = await auth.api.unlinkAccount({ body: { providerId: 'linkedin' }, headers: cj.headers(), asResponse: true });

    expect(res.status).toBe(200);
    expect(email.sendAccountUnlinkedEmail).toHaveBeenCalledWith(mail, 'linkedin');
  });
});

describe('fournisseurs OAuth configures', () => {
  it("construit une URL d'autorisation Google avec PKCE et le bon callback", async () => {
    const res = await auth.api.signInSocial({
      body: { provider: 'google', disableRedirect: true, callbackURL: '/dashboard' },
      headers: new Headers(),
      asResponse: true,
    });
    const body = await res.json();
    const url = new URL(body.url);

    expect(res.status).toBe(200);
    expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.get('redirect_uri')).toContain('/api/auth/callback/google');
  });

  it("construit une URL d'autorisation Microsoft avec PKCE et le bon callback", async () => {
    const res = await auth.api.signInSocial({
      body: { provider: 'microsoft', disableRedirect: true },
      headers: new Headers(),
      asResponse: true,
    });
    const body = await res.json();
    const url = new URL(body.url);

    expect(res.status).toBe(200);
    expect(url.origin).toBe('https://login.microsoftonline.com');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toContain('/api/auth/callback/microsoft');
  });

  it('refuse un fournisseur non configure', async () => {
    const res = await auth.api.signInSocial({
      body: { provider: 'github', disableRedirect: true },
      headers: new Headers(),
      asResponse: true,
    } as never);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe('PROVIDER_NOT_FOUND');
  });

  it("rejette un retour OAuth dont le state est forge et redirige vers la page d'erreur", async () => {
    const res = await auth.api.callbackOAuth({
      params: { id: 'google' },
      query: { state: 'state-forge-par-un-attaquant', code: 'code-bidon' },
      headers: new Headers(),
      asResponse: true,
    } as never);

    // Le state est le garde-fou anti-CSRF du flux OAuth ; l'URL de repli
    // provient de `onAPIError.errorURL` dans auth.ts.
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/erreur-connexion');
    expect(res.headers.get('location')).toContain('state_mismatch');
  });
});

describe('suppression de compte', () => {
  it('refuse la suppression avec un mauvais mot de passe', async () => {
    const mail = testEmail('delete-mdp');
    const cj = cookieJar();
    cj.apply(await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true }));

    const res = await auth.api.deleteUser({ body: { password: 'MauvaisPass123!' }, headers: cj.headers(), asResponse: true });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('INVALID_PASSWORD');
    expect(await prisma.user.findUnique({ where: { email: mail } })).not.toBeNull();
  });

  it('refuse la suppression sans session', async () => {
    const res = await auth.api.deleteUser({ body: { password: PASSWORD }, headers: new Headers(), asResponse: true });

    expect(res.status).toBe(401);
  });

  it('ne supprime rien tant que le lien de confirmation par email n a pas ete clique, puis archive (pas de suppression reelle)', async () => {
    const mail = testEmail('delete-cascade');
    const cj = cookieJar();
    cj.apply(await auth.api.signUpEmail({ body: { name: 'A Supprimer', email: mail, password: PASSWORD }, asResponse: true }));
    const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });

    await prisma.account.create({
      data: { id: crypto.randomUUID(), providerId: 'google', accountId: `google-${user.id}`, userId: user.id },
    });
    const enable = await auth.api.enableTwoFactor({ body: { password: PASSWORD }, headers: cj.headers(), asResponse: true });
    const secret = new URL((await enable.json()).totpURI).searchParams.get('secret') as string;
    cj.apply(await auth.api.verifyTOTP({ body: { code: totpCode(secret) }, headers: cj.headers(), asResponse: true }));
    await auth.api.sendVerificationOTP({ body: { email: mail, type: 'sign-in' }, headers: new Headers(), asResponse: true });

    expect(await prisma.session.count({ where: { userId: user.id } })).toBeGreaterThan(0);
    expect(await prisma.account.count({ where: { userId: user.id } })).toBe(2);
    expect(await prisma.twoFactor.count({ where: { userId: user.id } })).toBe(1);

    // Etape 1 : un mot de passe correct fait toujours envoyer l'email de
    // confirmation plutot que de supprimer directement (voir
    // doc/analysis/AUDIT_SECURITE_AUTH.md, finding #4) - un cookie de session
    // vole seul ne suffit donc plus jamais a detruire le compte.
    const res = await auth.api.deleteUser({ body: { password: PASSWORD }, headers: cj.headers(), asResponse: true });
    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe('Verification email sent');
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(1);

    // Etape 2 : clic sur le lien recu par email (meme session).
    const verification = await prisma.verification.findFirstOrThrow({
      where: { value: user.id, identifier: { startsWith: 'delete-account-' } },
      orderBy: { createdAt: 'desc' },
    });
    const token = verification.identifier.replace('delete-account-', '');
    const callback = await auth.api.deleteUserCallback({ query: { token }, headers: cj.headers(), asResponse: true });
    expect(callback.status).toBe(200);

    // Archivage (pas de suppression reelle) : la ligne User survit avec
    // deletedAt renseigne, recuperable via scripts/restore-account.ts
    // jusqu'a la purge definitive 30 jours plus tard (voir
    // api/cron/purge-deleted-accounts). Seules les sessions sont revoquees
    // immediatement pour rendre le compte inaccessible ; Account et
    // TwoFactor restent intacts pour une restauration complete.
    const archived = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(archived.deletedAt).not.toBeNull();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.account.count({ where: { userId: user.id } })).toBe(2);
    expect(await prisma.twoFactor.count({ where: { userId: user.id } })).toBe(1);
    expect(await prisma.verification.count({ where: { identifier: `sign-in-otp-${mail}` } })).toBe(1);
  });

  it("necessite aussi une confirmation par email pour un compte OAuth-only (pas de mot de passe a redemander)", async () => {
    const mail = testEmail('delete-oauth-seul');
    const cj = cookieJar();
    cj.apply(await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true }));
    const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
    await prisma.account.create({
      data: { id: crypto.randomUUID(), providerId: 'google', accountId: `google-${user.id}`, userId: user.id },
    });
    // Retire le compte credential : simule un compte cree via OAuth
    // uniquement (la session deja emise reste valide, comme pour un vrai
    // compte OAuth-only).
    await prisma.account.deleteMany({ where: { userId: user.id, providerId: 'credential' } });

    // Avant le correctif, l'absence de mot de passe a fournir signifiait une
    // suppression immediate des qu'un cookie de session (meme vole) etait
    // present. Desormais /delete-user sans mot de passe envoie aussi l'email.
    const res = await auth.api.deleteUser({ body: {}, headers: cj.headers(), asResponse: true });
    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe('Verification email sent');
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(1);

    const verification = await prisma.verification.findFirstOrThrow({
      where: { value: user.id, identifier: { startsWith: 'delete-account-' } },
      orderBy: { createdAt: 'desc' },
    });
    const token = verification.identifier.replace('delete-account-', '');
    const callback = await auth.api.deleteUserCallback({ query: { token }, headers: cj.headers(), asResponse: true });
    expect(callback.status).toBe(200);

    const archived = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(archived.deletedAt).not.toBeNull();
  });

  it('refuse de finaliser la suppression avec un jeton invente ou sans session', async () => {
    const mail = testEmail('delete-callback-invalide');
    const cj = cookieJar();
    cj.apply(await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true }));

    const sansSession = await auth.api.deleteUserCallback({
      query: { token: 'jeton-invente' },
      headers: new Headers(),
      asResponse: true,
    });
    expect(sansSession.status).toBe(404);

    const jetonInvente = await auth.api.deleteUserCallback({
      query: { token: 'jeton-invente' },
      headers: cj.headers(),
      asResponse: true,
    });
    expect(jetonInvente.status).toBe(404);
    expect((await jetonInvente.json()).code).toBe('INVALID_TOKEN');
    expect(await prisma.user.findUnique({ where: { email: mail } })).not.toBeNull();
  });
});
