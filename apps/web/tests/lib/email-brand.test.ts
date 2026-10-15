// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const send = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));

const { emailTheme, formatFrom, safeSenderName, senderAddress } = await import('@/lib/email-brand');
const { sendGestionnaireInvitationEmail, sendGestionnaireAccessChangedEmail, sendMagicLinkEmail } =
  await import('@/lib/email');

const brand = {
  name: 'Alicia Cabinet',
  primaryColor: '#008734',
  logoUrl: 'https://blob.test/logos/c1/logo.png',
  replyTo: 'contact@alicia.be',
};

beforeEach(() => {
  send.mockReset().mockResolvedValue({ error: null });
  process.env.RESEND_FROM_EMAIL = 'SocialFlow <noreply@socialflow.page>';
});

describe('email-brand (D30, D33)', () => {
  it('reprend la couleur du cabinet avec un texte lisible', () => {
    const theme = emailTheme(brand)!;
    expect(theme.headerBg).toBe('#008734');
    expect(theme.ctaBg).toBe('#008734');
    expect(theme.headerFg).toBe('#ffffff');
    expect(theme.footer).toBe('Alicia Cabinet — Propulsé par SocialFlow');
  });

  it('choisit un texte fonce sur une couleur claire', () => {
    expect(emailTheme({ ...brand, primaryColor: '#ffff00' })!.headerFg).toBe('#060b19');
  });

  it('garde les couleurs SocialFlow sans couleur personnalisee', () => {
    const theme = emailTheme({ ...brand, primaryColor: null })!;
    expect(theme.headerBg).toBe('#4c1d95');
    expect(theme.ctaBg).toBe('#4f46e5');
  });

  it('n utilise comme logo qu un PNG en https (les SVG ne passent pas dans les clients mail)', () => {
    expect(emailTheme(brand)!.logoUrl).toBe('https://blob.test/logos/c1/logo.png');
    expect(emailTheme({ ...brand, logoUrl: 'https://blob.test/logo.svg' })!.logoUrl).toBeNull();
    expect(emailTheme({ ...brand, logoUrl: 'http://blob.test/logo.png' })!.logoUrl).toBeNull();
    expect(emailTheme({ ...brand, logoUrl: 'javascript:alert(1).png' })!.logoUrl).toBeNull();
    expect(emailTheme({ ...brand, logoUrl: null })!.logoUrl).toBeNull();
  });

  it('nettoie le nom d expediteur : pas d injection d en-tetes', () => {
    expect(safeSenderName('Cabinet "X"\r\nBcc: evil@x.com <a>')).toBe('Cabinet X Bcc: evil@x.com a');
    expect(safeSenderName('x'.repeat(200))).toHaveLength(60);
  });

  it('forme l expediteur : nom du cabinet sur l adresse noreply de SocialFlow', () => {
    expect(senderAddress('SocialFlow <noreply@socialflow.page>')).toBe('noreply@socialflow.page');
    expect(senderAddress('noreply@socialflow.page')).toBe('noreply@socialflow.page');
    expect(formatFrom('Alicia Cabinet', 'SocialFlow <noreply@socialflow.page>')).toBe(
      '"Alicia Cabinet" <noreply@socialflow.page>',
    );
    expect(formatFrom(null, 'SocialFlow <noreply@socialflow.page>')).toBe(
      'SocialFlow <noreply@socialflow.page>',
    );
  });
});

describe('emails au nom du cabinet', () => {
  it('invitation : nom, couleur, logo, expediteur et reponse du cabinet', async () => {
    await sendGestionnaireInvitationEmail('bruno@test.com', brand, 'Alicia', 'https://app/accept?token=x');

    const mail = send.mock.calls[0][0];
    expect(mail.from).toBe('"Alicia Cabinet" <noreply@socialflow.page>');
    expect(mail.replyTo).toBe('contact@alicia.be');
    expect(mail.subject).toBe('Alicia Cabinet vous invite à rejoindre son équipe');
    expect(mail.html).toContain('Vous êtes invité à rejoindre Alicia Cabinet');
    expect(mail.html).toContain('#008734');
    expect(mail.html).toContain('https://blob.test/logos/c1/logo.png');
    expect(mail.html).toContain('Alicia Cabinet — Propulsé par SocialFlow');
    // Plus d'identite SocialFlow en en-tete, ni le violet par defaut.
    expect(mail.html).not.toContain('Social<span');
    expect(mail.html).not.toContain('Tous droits réservés');
    expect(mail.html).toContain('bgcolor="#008734" class="email-header"');
    expect(mail.html).not.toContain('linear-gradient');
  });

  it('echappe le nom du cabinet dans le HTML et neutralise le sujet', async () => {
    await sendGestionnaireInvitationEmail(
      'bruno@test.com',
      { ...brand, name: 'Cab <script>alert(1)</script>\nBcc: x', logoUrl: null },
      'Alicia <b>',
      'https://app/accept?token=x',
    );

    const mail = send.mock.calls[0][0];
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).toContain('Alicia &lt;b&gt;');
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.from).not.toMatch(/[\r\n]/);
    expect(mail.from).toMatch(/^"[^"<>]+" <noreply@socialflow\.page>$/);
  });

  it('sans adresse de contact : pas de reponse forcee', async () => {
    await sendGestionnaireInvitationEmail(
      'bruno@test.com',
      { ...brand, replyTo: null },
      'Alicia',
      'https://app/accept?token=x',
    );
    expect(send.mock.calls[0][0]).not.toHaveProperty('replyTo');
  });

  it('changement d acces : sujet et texte au nom du cabinet, sans SocialFlow dans le corps', async () => {
    await sendGestionnaireAccessChangedEmail('bruno@test.com', 'Bruno', brand, 'suspended');

    const mail = send.mock.calls[0][0];
    expect(mail.subject).toBe('Votre accès à Alicia Cabinet a été suspendu');
    expect(mail.from).toBe('"Alicia Cabinet" <noreply@socialflow.page>');
    expect(mail.html).toContain('Alicia Cabinet a suspendu votre accès');
    expect(mail.html).toContain('#008734');
  });

  it('les emails de securite restent aux couleurs de SocialFlow', async () => {
    await sendMagicLinkEmail('bruno@test.com', 'https://app/magic?t=1');

    const mail = send.mock.calls[0][0];
    expect(mail.from).toBe('SocialFlow <noreply@socialflow.page>');
    expect(mail.html).toContain('Social<span');
    expect(mail.html).toContain('© 2026 SocialFlow — Tous droits réservés.');
    expect(mail.html).toContain('#4c1d95');
  });
});
