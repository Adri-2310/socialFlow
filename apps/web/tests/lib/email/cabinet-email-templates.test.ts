// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
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
  sendGestionnaireAccessChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendPaymentFailedEmail: vi.fn().mockResolvedValue(undefined),
  sendPaymentSuspensionEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorEnabledEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorDisabledEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountUnlinkedEmail: vi.fn().mockResolvedValue(undefined),
}));

const { auth } = await import('@/lib/auth/auth');
const { prisma } = await import('@/lib/prisma');
const email = await import('@/lib/email/email');
const { getEmailTemplate, getCustomTemplate, saveEmailTemplate, resetEmailTemplate, listEmailTemplates } =
  await import('@/lib/email/cabinet-email-templates');
const { TEMPLATES, validateTemplate } = await import('@/lib/email/email-templates');
const { PUT: putRoute, DELETE: deleteRoute } = await import(
  '@/app/api/cabinet/settings/email-templates/[type]/route'
);
const { POST: testRoute } = await import(
  '@/app/api/cabinet/settings/email-templates/[type]/test/route'
);
const { POST: invitationsRoute } = await import('@/app/api/invitations/route');

const PASSWORD = 'InitialPass123!';
const TYPE = 'INVITATION_GESTIONNAIRE';
const params = (type: string) => ({ params: Promise.resolve({ type }) });

beforeEach(() => {
  vi.mocked(email.sendGestionnaireInvitationEmail).mockClear();
});

afterAll(async () => {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    select: { cabinetId: true },
  });
  const ids = users.map((u) => u.cabinetId).filter((id): id is string => !!id);
  await prisma.invitation.deleteMany({ where: { cabinetId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { cabinetId: { in: ids } } });
  await prisma.cabinet.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.verification.deleteMany({
    where: { OR: [{ identifier: { contains: TEST_EMAIL_PREFIX } }, { value: { contains: TEST_EMAIL_PREFIX } }] },
  });
});

async function creerCabinetRH(label: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(
    await auth.api.signUpEmail({
      body: { name: 'Titulaire Modeles', email: mail, password: PASSWORD },
      asResponse: true,
    }),
  );
  const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  await prisma.cabinet.update({ where: { id: user.cabinetId! }, data: { billingStatus: 'ACTIF' } });
  return { cj, user, mail, cabinetId: user.cabinetId! };
}

function req(method: string, cj?: ReturnType<typeof cookieJar>, body?: unknown, url = 'http://localhost:3000/api/x') {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return new Request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

const valid = { subject: 'Bienvenue chez {{cabinet_nom}}', body: 'Bonjour,\n\n**{{invitant_nom}}** vous attend.' };

describe('modeles d email du cabinet (D68)', () => {
  it('sans modele personnalise : le modele par defaut', async () => {
    const { cabinetId } = await creerCabinetRH('tpl-defaut');

    expect(await getEmailTemplate(cabinetId, TYPE)).toEqual({
      type: TYPE,
      ...TEMPLATES[TYPE].defaults,
      custom: false,
    });
    expect(await getCustomTemplate(cabinetId, TYPE)).toBeNull();
    expect((await listEmailTemplates(cabinetId)).map((t) => t.type)).toEqual([
      TYPE,
      'INVITATION_ENTREPRISE',
      'INVITATION_COLLABORATEUR',
    ]);
  });

  it('propose un modele par defaut pour l invitation d un administrateur d entreprise (D70)', async () => {
    const { cabinetId } = await creerCabinetRH('tpl-entreprise');

    const modele = await getEmailTemplate(cabinetId, 'INVITATION_ENTREPRISE');
    expect(modele.custom).toBe(false);
    expect(modele.subject).toContain('{{entreprise_nom}}');
    expect(
      validateTemplate('INVITATION_ENTREPRISE', { subject: modele.subject, body: modele.body }).ok,
    ).toBe(true);
    // Une variable propre a l'invitation de gestionnaire n'existe pas ici, et inversement.
    expect(
      validateTemplate('INVITATION_GESTIONNAIRE', { subject: '{{entreprise_nom}}', body: 'x' }).ok,
    ).toBe(false);
  });

  it('enregistre un modele et l audite sans en consigner le contenu', async () => {
    const { user, cabinetId } = await creerCabinetRH('tpl-save');

    expect(await saveEmailTemplate(cabinetId, user.id, TYPE, valid)).toEqual({ ok: true, changed: true });

    expect(await getEmailTemplate(cabinetId, TYPE)).toMatchObject({ ...valid, custom: true });
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { cabinetId, action: 'CABINET_SETTINGS_UPDATED' },
    });
    expect(log.metadata).toEqual({ section: 'email_template', type: TYPE });
    expect(JSON.stringify(log.metadata)).not.toContain('Bienvenue');
  });

  it('n ecrit ni n audite rien quand le contenu est identique', async () => {
    const { user, cabinetId } = await creerCabinetRH('tpl-idem');
    await saveEmailTemplate(cabinetId, user.id, TYPE, valid);

    expect(await saveEmailTemplate(cabinetId, user.id, TYPE, valid)).toEqual({ ok: true, changed: false });
    expect(await prisma.auditLog.count({ where: { cabinetId, action: 'CABINET_SETTINGS_UPDATED' } })).toBe(1);
  });

  it('retablit le modele par defaut', async () => {
    const { user, cabinetId } = await creerCabinetRH('tpl-reset');
    await saveEmailTemplate(cabinetId, user.id, TYPE, valid);

    expect(await resetEmailTemplate(cabinetId, user.id, TYPE)).toEqual({ ok: true, changed: true });
    expect((await getEmailTemplate(cabinetId, TYPE)).custom).toBe(false);
    expect(await resetEmailTemplate(cabinetId, user.id, TYPE)).toEqual({ ok: true, changed: false });
  });

  it('route PUT : refuse sans session et pour un autre role', async () => {
    expect((await putRoute(req('PUT', undefined, valid), params(TYPE))).status).toBe(401);

    const { cj, user } = await creerCabinetRH('tpl-role');
    await prisma.user.update({ where: { id: user.id }, data: { role: 'GESTIONNAIRE_RH' } });
    expect((await putRoute(req('PUT', cj, valid), params(TYPE))).status).toBe(403);
    expect((await deleteRoute(req('DELETE', cj), params(TYPE))).status).toBe(403);
  });

  it('route PUT : enregistre pour le cabinet de la session', async () => {
    const { cj, cabinetId } = await creerCabinetRH('tpl-put');

    const res = await putRoute(req('PUT', cj, valid), params(TYPE));

    expect(res.status).toBe(200);
    expect(await getCustomTemplate(cabinetId, TYPE)).toEqual(valid);
  });

  it('route PUT : 400 pour une variable inconnue, 404 pour un type inconnu', async () => {
    const { cj, cabinetId } = await creerCabinetRH('tpl-invalide');

    const res = await putRoute(req('PUT', cj, { subject: 'x', body: 'Bonjour {{salaire}}' }), params(TYPE));
    expect(res.status).toBe(400);
    expect((await res.json()).fields.body).toEqual({ code: 'UNKNOWN_VARIABLE', variables: ['salaire'] });
    expect(await getCustomTemplate(cabinetId, TYPE)).toBeNull();

    expect((await putRoute(req('PUT', cj, valid), params('SECURITE_MOT_DE_PASSE'))).status).toBe(404);
    expect((await putRoute(req('PUT', cj, { subject: 1 }), params(TYPE))).status).toBe(400);
  });

  it('route PUT : ignore un cabinetId fourni par le client', async () => {
    const mine = await creerCabinetRH('tpl-mine');
    const other = await creerCabinetRH('tpl-other');

    await putRoute(req('PUT', mine.cj, { ...valid, cabinetId: other.cabinetId }), params(TYPE));

    expect(await getCustomTemplate(other.cabinetId, TYPE)).toBeNull();
    expect(await getCustomTemplate(mine.cabinetId, TYPE)).toEqual(valid);
  });

  it('route DELETE : retablit le modele par defaut', async () => {
    const { cj, user, cabinetId } = await creerCabinetRH('tpl-delete');
    await saveEmailTemplate(cabinetId, user.id, TYPE, valid);

    const res = await deleteRoute(req('DELETE', cj), params(TYPE));

    expect(res.status).toBe(200);
    expect(await getCustomTemplate(cabinetId, TYPE)).toBeNull();
  });

  it('routes : refusees en lecture seule (423)', async () => {
    const { cj, cabinetId } = await creerCabinetRH('tpl-readonly');
    await prisma.cabinet.update({ where: { id: cabinetId }, data: { billingStatus: 'IMPAYE' } });

    expect((await putRoute(req('PUT', cj, valid), params(TYPE))).status).toBe(423);
    expect((await deleteRoute(req('DELETE', cj), params(TYPE))).status).toBe(423);
    expect((await testRoute(req('POST', cj, valid), params(TYPE))).status).toBe(423);
  });

  it('test : part uniquement vers l adresse du titulaire, avec le brouillon et un prefixe [Test]', async () => {
    const { cj, mail } = await creerCabinetRH('tpl-test');

    const res = await testRoute(
      req('POST', cj, { ...valid, to: 'victime@exemple.be', email: 'victime@exemple.be' }),
      params(TYPE),
    );

    expect(res.status).toBe(200);
    const call = vi.mocked(email.sendGestionnaireInvitationEmail).mock.calls[0];
    expect(call[0]).toBe(mail);
    expect(call[4]).toEqual(valid);
    expect(call[5]).toEqual({ subjectPrefix: '[Test] ' });
    // Lien du test : la page d'acceptation de l'application, jamais un site tiers.
    expect(call[3]).toBe(`${process.env.NEXT_PUBLIC_APP_URL}/invitations/accept?token=exemple`);
    expect(TEMPLATES[TYPE].sample.lien).toContain('.invalid');
  });

  it('test : refuse un brouillon invalide sans rien envoyer', async () => {
    const { cj } = await creerCabinetRH('tpl-test-invalide');

    const res = await testRoute(req('POST', cj, { subject: '', body: 'x' }), params(TYPE));

    expect(res.status).toBe(400);
    expect(email.sendGestionnaireInvitationEmail).not.toHaveBeenCalled();
  });

  it('test : signale un echec d envoi', async () => {
    const { cj } = await creerCabinetRH('tpl-test-echec');
    vi.mocked(email.sendGestionnaireInvitationEmail).mockRejectedValueOnce(new Error('resend down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await testRoute(req('POST', cj, valid), params(TYPE));

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'EMAIL_SEND_FAILED' });
  });

  it('une invitation reelle utilise le modele personnalise du cabinet', async () => {
    const { cj, user, cabinetId } = await creerCabinetRH('tpl-invitation');
    await saveEmailTemplate(cabinetId, user.id, TYPE, valid);

    const res = await invitationsRoute(
      req('POST', cj, { email: `invite-${Date.now()}@test.com` }, 'http://localhost:3000/api/invitations'),
    );

    expect(res.status).toBe(200);
    const call = vi.mocked(email.sendGestionnaireInvitationEmail).mock.calls[0];
    expect(call[4]).toEqual(valid);
    // D76 : le portail du cabinet est rappele dans l'email.
    expect(call[5]).toEqual({ portalUrl: expect.stringContaining('/connexion/') });
  });
});
