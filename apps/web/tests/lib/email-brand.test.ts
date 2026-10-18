// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const send = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));

const { emailTheme, formatFrom, safeSenderName, senderAddress } = await import('@/lib/email-brand');
const {
  sendGestionnaireInvitationEmail,
  sendEntrepriseInvitationEmail,
  sendGestionnaireAccessChangedEmail,
  sendMagicLinkEmail,
  sendWelcomeAccountEmail,
} = await import('@/lib/email');

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

  it('invitation : rappelle le portail de connexion du cabinet (D76)', async () => {
    await sendGestionnaireInvitationEmail('bruno@test.com', brand, 'Alicia', 'https://app/accept?token=x', null, {
      portalUrl: 'https://app.test/connexion/alicia-cabinet',
    });

    const html = send.mock.calls[0][0].html as string;
    expect(html).toContain('Pour vous reconnecter par la suite, utilisez le portail de Alicia Cabinet');
    expect(html).toContain('href="https://app.test/connexion/alicia-cabinet"');
    // Le portail vient apres le bouton d'acceptation, pas a sa place.
    expect(html.indexOf('Accepter l’invitation')).toBeLessThan(html.indexOf('/connexion/alicia-cabinet'));
  });

  it('invitation d un administrateur d entreprise : meme rappel du portail', async () => {
    await sendEntrepriseInvitationEmail(
      'admin@client.be',
      brand,
      'Alicia',
      'Boulangerie Dupont',
      'https://app/accept?token=x',
      null,
      { portalUrl: 'https://app.test/connexion/alicia-cabinet' },
    );

    const html = send.mock.calls[0][0].html as string;
    expect(html).toContain('https://app.test/connexion/alicia-cabinet');
    expect(html).toContain('Accédez à l’espace de Boulangerie Dupont');
  });

  it('invitation : pas de ligne de portail sans adresse, ni pour une adresse qui n est pas http(s)', async () => {
    await sendGestionnaireInvitationEmail('bruno@test.com', brand, 'Alicia', 'https://app/accept?token=x');
    expect(send.mock.calls[0][0].html).not.toContain('Pour vous reconnecter');

    send.mockClear();
    await sendGestionnaireInvitationEmail('bruno@test.com', brand, 'Alicia', 'https://app/accept?token=x', null, {
      portalUrl: 'javascript:alert(1)',
    });
    expect(send.mock.calls[0][0].html).not.toContain('Pour vous reconnecter');
    expect(send.mock.calls[0][0].html).not.toContain('javascript:');
  });

  it('bienvenue : au nom du cabinet, avec l adresse du portail (D76)', async () => {
    await sendWelcomeAccountEmail('bruno@test.com', brand, 'Bruno <b>', 'https://app.test/connexion/alicia-cabinet');

    const sent = send.mock.calls[0][0];
    expect(sent.subject).toBe('Bienvenue chez Alicia Cabinet');
    expect(sent.html).toContain('href="https://app.test/connexion/alicia-cabinet"');
    expect(sent.html).toContain('Ouvrir mon portail');
    expect(sent.html).not.toContain('Bruno <b>');
    expect(sent.html).toContain('Bruno &lt;b&gt;');
  });

  it('bienvenue : sans lien pour une adresse qui n est pas http(s)', async () => {
    await sendWelcomeAccountEmail('bruno@test.com', brand, 'Bruno', 'javascript:alert(1)');

    expect(send.mock.calls[0][0].html).not.toContain('javascript:');
    expect(send.mock.calls[0][0].html).not.toContain('Ouvrir mon portail');
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

  it('invitation : utilise le modele personnalise du cabinet (sujet et corps)', async () => {
    await sendGestionnaireInvitationEmail(
      'bruno@test.com',
      brand,
      'Alicia',
      'https://app/accept?token=x',
      {
        subject: 'Bienvenue chez {{cabinet_nom}} !',
        body: 'Salut,\n\n**{{invitant_nom}}** compte sur toi.',
      },
    );

    const mail = send.mock.calls[0][0];
    expect(mail.subject).toBe('Bienvenue chez Alicia Cabinet !');
    expect(mail.html).toContain('<strong>Alicia</strong> compte sur toi.');
    // Titre, bouton et mention de securite restent fixes.
    expect(mail.html).toContain('Vous êtes invité à rejoindre Alicia Cabinet');
    expect(mail.html).toContain('Accepter l’invitation');
    expect(mail.html).toContain("attendiez pas cette invitation");
    expect(mail.html).not.toContain('valable 7 jours');
  });

  it('l apercu des modeles est exactement l email envoye (meme constructeur)', async () => {
    const { buildGestionnaireInvitation } = await import('@/lib/email-layout');
    const template = { subject: 'Bienvenue {{cabinet_nom}}', body: 'Salut **{{invitant_nom}}**' };

    await sendGestionnaireInvitationEmail('bruno@test.com', brand, 'Alicia', 'https://app/accept?token=x', template);

    const mail = send.mock.calls[0][0];
    const preview = buildGestionnaireInvitation({
      brand,
      inviterName: 'Alicia',
      url: 'https://app/accept?token=x',
      template,
    });
    expect(mail.html).toBe(preview.html);
    expect(mail.subject).toBe(preview.subject);
  });

  it('inertLinks : plus aucun lien cliquable, le reste de l email est conserve', async () => {
    const { inertLinks, buildGestionnaireInvitation } = await import('@/lib/email-layout');
    const { html } = buildGestionnaireInvitation({
      brand,
      inviterName: 'Alicia',
      url: 'https://app/accept?token=x',
      template: { subject: 's', body: '[site](https://exemple.be) et [moi]({{lien}})' },
    });

    // L'email envoye garde ses vrais liens.
    expect(html).toContain('href="https://app/accept?token=x"');
    expect(html).toContain('href="https://exemple.be/"');

    const inert = inertLinks(html);
    expect(inert).not.toContain('href=');
    expect(inert).not.toContain('https://app/accept');
    expect(inert).toContain('pointer-events:none');
    expect(inert).toContain('cursor:default');
    // Le texte, les couleurs et la mise en page sont inchanges.
    expect(inert).toContain('Accepter l’invitation');
    expect(inert).toContain('bgcolor="#008734"');
    expect(inert).toContain('>site</a>');
  });

  it('invitation de test : sujet prefixe et HTML du modele echappe', async () => {
    await sendGestionnaireInvitationEmail(
      'alicia@test.com',
      brand,
      'Alice',
      'https://app/accept?token=exemple',
      { subject: 'Sujet', body: '<script>alert(1)</script> {{invitant_nom}}' },
      { subjectPrefix: '[Test] ' },
    );

    const mail = send.mock.calls[0][0];
    expect(mail.subject).toBe('[Test] Sujet');
    expect(mail.html).not.toContain('<script>alert');
    expect(mail.html).toContain('&lt;script&gt;');
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
