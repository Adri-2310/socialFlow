import { describe, it, expect } from 'vitest';
import { buildCollaborateurInvitation } from '@/lib/email/email-layout';
import {
  BODY_MAX,
  SUBJECT_MAX,
  TEMPLATES,
  isTemplateType,
  renderBody,
  renderSubject,
  validateTemplate,
  variablesIn,
} from '@/lib/email/email-templates';

const values = { cabinet_nom: 'Alicia Cabinet', invitant_nom: 'Alice', lien: 'https://app.test/accept?token=abc&x=1' };

describe('validateTemplate (D68)', () => {
  it('accepte le modele par defaut', () => {
    expect(validateTemplate('INVITATION_GESTIONNAIRE', TEMPLATES.INVITATION_GESTIONNAIRE.defaults).ok).toBe(true);
  });

  it('normalise : espaces et fins de ligne Windows', () => {
    const result = validateTemplate('INVITATION_GESTIONNAIRE', {
      subject: '  Bienvenue  ',
      body: 'Ligne 1\r\n\r\nLigne 2  ',
    });
    expect(result).toEqual({ ok: true, value: { subject: 'Bienvenue', body: 'Ligne 1\n\nLigne 2' } });
  });

  it('refuse une variable inconnue, dans le sujet comme dans le corps', () => {
    const result = validateTemplate('INVITATION_GESTIONNAIRE', {
      subject: 'Bonjour {{prenom}}',
      body: 'Salaire : {{salaire}} et {{cabinet_nom}}',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.subject).toEqual({ code: 'UNKNOWN_VARIABLE', variables: ['prenom'] });
      expect(result.errors.body).toEqual({ code: 'UNKNOWN_VARIABLE', variables: ['salaire'] });
    }
  });

  it('refuse sujet ou corps vides, sujet multiligne, longueurs depassees', () => {
    const empty = validateTemplate('INVITATION_GESTIONNAIRE', { subject: '  ', body: '' });
    expect(empty).toMatchObject({ ok: false, errors: { subject: { code: 'SUBJECT_REQUIRED' }, body: { code: 'BODY_REQUIRED' } } });

    const multi = validateTemplate('INVITATION_GESTIONNAIRE', { subject: 'a\nb', body: 'x' });
    expect(multi).toMatchObject({ ok: false, errors: { subject: { code: 'SUBJECT_MULTILINE' } } });

    const long = validateTemplate('INVITATION_GESTIONNAIRE', {
      subject: 'x'.repeat(SUBJECT_MAX + 1),
      body: 'y'.repeat(BODY_MAX + 1),
    });
    expect(long).toMatchObject({
      ok: false,
      errors: { subject: { code: 'SUBJECT_TOO_LONG' }, body: { code: 'BODY_TOO_LONG' } },
    });
  });

  it('variablesIn : insensible a la casse et aux espaces, sans doublon', () => {
    expect(variablesIn('{{ Cabinet_Nom }} {{cabinet_nom}} {{lien}}')).toEqual(['cabinet_nom', 'lien']);
    expect(isTemplateType('INVITATION_GESTIONNAIRE')).toBe(true);
    expect(isTemplateType('AUTRE')).toBe(false);
  });
});

describe('renderSubject', () => {
  it('remplace les variables et reste sur une ligne', () => {
    expect(renderSubject('{{cabinet_nom}} vous invite', values)).toBe('Alicia Cabinet vous invite');
    expect(renderSubject('{{cabinet_nom}}', { cabinet_nom: 'Cab\r\nBcc: x@y.z' })).toBe('Cab Bcc: x@y.z');
  });
});

describe('renderBody : un cabinet ne peut pas injecter de HTML ni de script', () => {
  it('paragraphes, retours a la ligne et variables', () => {
    const html = renderBody('Bonjour {{invitant_nom}}\nsuite\n\nSecond paragraphe', values);
    expect(html.match(/<p /g)).toHaveLength(2);
    expect(html).toContain('Bonjour Alice<br />suite');
    expect(html).toContain('Second paragraphe');
  });

  it('gras, italique et liens https', () => {
    const html = renderBody('**gras** et *italique* et [site](https://exemple.be/page?a=1&b=2)', values);
    expect(html).toContain('<strong>gras</strong>');
    expect(html).toContain('<em>italique</em>');
    expect(html).toContain('href="https://exemple.be/page?a=1&amp;b=2"');
    expect(html).toContain('>site</a>');
  });

  it('le lien {{lien}} devient cliquable', () => {
    const html = renderBody('[Créer mon compte]({{lien}})', values);
    expect(html).toContain('href="https://app.test/accept?token=abc&amp;x=1"');
    expect(html).toContain('>Créer mon compte</a>');
  });

  it('echappe tout HTML fourni par le cabinet', () => {
    const html = renderBody('<script>alert(1)</script> <img src=x onerror=alert(1)> <b>x</b>', values);
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('echappe les valeurs des variables (nom de la personne qui invite)', () => {
    const html = renderBody('Bonjour {{invitant_nom}}', { ...values, invitant_nom: '<img src=x onerror=1>' });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('refuse les liens javascript:, data: et autres schemas', () => {
    for (const target of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', 'ftp://x.test', '//x.test']) {
      const html = renderBody(`[clic](${target})`, values);
      expect(html).not.toContain('<a ');
      expect(html).not.toMatch(/href=/);
    }
  });

  it('un {{lien}} dont la valeur n est pas http(s) ne devient pas un lien', () => {
    const html = renderBody('[clic]({{lien}})', { ...values, lien: 'javascript:alert(1)' });
    expect(html).not.toContain('<a ');
  });

  it('ne laisse pas une variable fermer l attribut href', () => {
    const html = renderBody('[clic]({{lien}})', { ...values, lien: 'https://x.test/"onmouseover="alert(1)' });
    expect(html).not.toMatch(/onmouseover="/);
  });

  it('une variable inconnue au rendu est laissee vide', () => {
    expect(renderBody('A {{inconnue}} B', values)).toContain('A  B');
  });
});


describe('invitation d’un salarié à son espace (roles/03 § 4.3)', () => {
  const brand = { name: 'Alicia Cabinet', primaryColor: null, logoUrl: null, replyTo: null };
  const lien = 'https://app.test/invitations/accept?token=abc';

  it('est un type de modèle reconnu, avec ses propres variables', () => {
    expect(isTemplateType('INVITATION_COLLABORATEUR')).toBe(true);
    expect(TEMPLATES.INVITATION_COLLABORATEUR.variables.map((v) => v.name)).toEqual([
      'cabinet_nom',
      'entreprise_nom',
      'prenom',
      'lien',
    ]);
  });

  it('propose un modèle par défaut valide, qui contient le lien d’invitation', () => {
    const { defaults } = TEMPLATES.INVITATION_COLLABORATEUR;
    expect(validateTemplate('INVITATION_COLLABORATEUR', defaults).ok).toBe(true);
    expect(defaults.subject).toContain('{{cabinet_nom}}');
    expect(defaults.body).toContain('{{prenom}}');
  });

  it('n’expose pas le nom du gestionnaire : {{invitant_nom}} y est inconnu', () => {
    const resultat = validateTemplate('INVITATION_COLLABORATEUR', {
      subject: 'Bonjour',
      body: '{{invitant_nom}} vous invite',
    });
    expect(resultat.ok).toBe(false);
    // Et inversement, {{prenom}} n'existe pas pour les autres invitations.
    expect(validateTemplate('INVITATION_ENTREPRISE', { subject: '{{prenom}}', body: 'x' }).ok).toBe(
      false,
    );
  });

  it('remplit le prénom, l’entreprise et le cabinet, avec le titre propre au salarié', () => {
    const { subject, html } = buildCollaborateurInvitation({
      brand,
      prenom: 'Camille',
      entrepriseName: 'Boulangerie Dupont',
      url: lien,
    });
    expect(subject).toBe('Alicia Cabinet vous invite à accéder à votre espace salarié');
    expect(html).toContain('Bonjour Camille');
    expect(html).toContain('Boulangerie Dupont');
    expect(html).toContain('Accédez à votre espace salarié');
    expect(html).toContain(`href="${lien}"`);
  });

  it('échappe un prénom ou une entreprise piégés : aucun HTML ne passe', () => {
    const { html } = buildCollaborateurInvitation({
      brand,
      prenom: '<script>alert(1)</script>',
      entrepriseName: '"><img src=x onerror=alert(2)>',
      url: lien,
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });

  it('applique le modèle personnalisé du cabinet', () => {
    const { subject, html } = buildCollaborateurInvitation({
      brand,
      prenom: 'Camille',
      entrepriseName: 'Boulangerie Dupont',
      url: lien,
      template: {
        subject: 'Salut {{prenom}} !',
        body: 'Votre espace chez **{{entreprise_nom}}** est prêt.',
      },
    });
    expect(subject).toBe('Salut Camille !');
    expect(html).toContain('<strong>Boulangerie Dupont</strong>');
  });
});
