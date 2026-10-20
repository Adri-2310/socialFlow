import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EmailTemplateEditor } from '@/components/cabinet/email-template-editor';
import { TEMPLATES } from '@/lib/email/email-templates';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const defaults = { ...TEMPLATES.INVITATION_GESTIONNAIRE.defaults, custom: false };

const brand = {
  name: 'Alicia Cabinet',
  primaryColor: '#008734',
  logoUrl: 'https://blob.test/logo.png',
  replyTo: 'contact@alicia.be',
};

// HTML de l'email affiche dans le cadre d'apercu.
const previewHtml = () =>
  (screen.getByTitle('Aperçu de l’email') as HTMLIFrameElement).getAttribute('srcdoc') ?? '';

const renderEditor = (props: Partial<React.ComponentProps<typeof EmailTemplateEditor>> = {}) =>
  render(
    <EmailTemplateEditor
      type="INVITATION_GESTIONNAIRE"
      initial={defaults}
      brand={brand}
      fromLabel={'"Alicia Cabinet" <noreply@socialflow.page>'}
      readOnly={false}
      {...props}
    />,
  );

beforeEach(() => refresh.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe('EmailTemplateEditor', () => {
  it('affiche un apercu identique a l email reel : en-tete, couleur, logo, bouton et pied', () => {
    renderEditor();

    expect(screen.getByText('Modèle par défaut')).toBeInTheDocument();
    expect(screen.getByLabelText('Sujet')).toHaveValue(defaults.subject);
    const preview = screen.getByLabelText('Aperçu');
    expect(preview).toHaveTextContent('De : "Alicia Cabinet" <noreply@socialflow.page>');
    expect(preview).toHaveTextContent('Répondre à : contact@alicia.be');
    expect(preview).toHaveTextContent('Objet : Alicia Cabinet vous invite à rejoindre son équipe');

    const html = previewHtml();
    expect(html).toContain('bgcolor="#008734" class="email-header"');
    expect(html).toContain('https://blob.test/logo.png');
    expect(html).toContain('Vous êtes invité à rejoindre Alicia Cabinet');
    expect(html).toContain('Alice Martin vous invite à rejoindre');
    expect(html).toContain('Accepter l’invitation');
    expect(html).toContain('Alicia Cabinet — Propulsé par SocialFlow');
  });

  it('le cadre d apercu est isole : aucun script ni formulaire', () => {
    renderEditor();

    const frame = screen.getByTitle('Aperçu de l’email') as HTMLIFrameElement;
    const sandbox = frame.getAttribute('sandbox') ?? '';
    expect(sandbox).toContain('allow-same-origin');
    expect(sandbox).not.toContain('allow-scripts');
    expect(sandbox).not.toContain('allow-forms');
    expect(sandbox).not.toContain('allow-top-navigation');
  });

  it('les liens de l apercu ne sont pas cliquables : ni adresse, ni pointeur', () => {
    renderEditor();

    const html = previewHtml();
    expect(html).not.toContain('href=');
    expect(html).not.toContain('exemple.invalid');
    expect(html).toContain('pointer-events:none');
    expect(html).toContain('Accepter l’invitation');
    expect(screen.getByLabelText('Aperçu')).toHaveTextContent('Les liens sont désactivés dans l’aperçu.');
  });

  it('met l apercu a jour en direct, en echappant le HTML', () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: '**Bienvenue** <script>alert(1)</script>' },
    });

    const html = previewHtml();
    expect(html).toContain('<strong>Bienvenue</strong>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)');
  });

  it('met l objet a jour avec les variables remplacees', () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText('Sujet'), { target: { value: 'Bienvenue chez {{cabinet_nom}}' } });

    expect(screen.getByLabelText('Aperçu')).toHaveTextContent('Objet : Bienvenue chez Alicia Cabinet');
  });

  it('insere une variable dans le message', () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Bonjour ' } });

    fireEvent.click(screen.getByRole('button', { name: '{{invitant_nom}}' }));

    expect(screen.getByLabelText('Message')).toHaveValue('Bonjour {{invitant_nom}}');
  });

  it('refuse en direct une variable inconnue et desactive l enregistrement', () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Salaire {{salaire}}' } });

    expect(screen.getByRole('alert')).toHaveTextContent('Variable inconnue : {{salaire}}');
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Envoyer un test/ })).toBeDisabled();
  });

  it('enregistre puis passe en personnalise', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();

    fireEvent.change(screen.getByLabelText('Sujet'), { target: { value: 'Bienvenue {{cabinet_nom}}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Modèle enregistré');
    expect(screen.getByText('Personnalisé')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cabinet/settings/email-templates/INVITATION_GESTIONNAIRE',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it('envoie un test a soi-meme', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: /Envoyer un test/ }));

    expect(await screen.findByRole('status')).toHaveTextContent('Email de test envoyé');
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/cabinet/settings/email-templates/INVITATION_GESTIONNAIRE/test',
    );
  });

  it('retablit le modele par defaut', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetchMock);
    renderEditor({ initial: { subject: 'Perso', body: 'Mon texte', custom: true } });

    fireEvent.click(screen.getByRole('button', { name: 'Rétablir le modèle par défaut' }));

    await waitFor(() => expect(screen.getByLabelText('Sujet')).toHaveValue(defaults.subject));
    expect(screen.getByText('Modèle par défaut')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cabinet/settings/email-templates/INVITATION_GESTIONNAIRE',
      { method: 'DELETE' },
    );
  });

  it('affiche l erreur du serveur', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'CABINET_READ_ONLY' }) }),
    );
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('lecture seule');
  });

  it('en lecture seule : champs desactives, aucune action', () => {
    renderEditor({ readOnly: true });

    expect(screen.getByLabelText('Sujet')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument();
    expect(screen.getByText(/lecture seule/)).toBeInTheDocument();
  });
});
