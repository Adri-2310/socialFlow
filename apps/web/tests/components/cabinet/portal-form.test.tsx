import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PortalForm } from '@/components/cabinet/portal-form';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn();

beforeEach(() => {
  refresh.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

function renderForm(props: Partial<React.ComponentProps<typeof PortalForm>> = {}) {
  return render(<PortalForm slug="cabinet-dupont" baseUrl="https://app.test" readOnly={false} {...props} />);
}

describe('PortalForm (D76)', () => {
  it('affiche l adresse complete du portail et prévient que les liens deja envoyes cesseront de marcher', () => {
    renderForm();

    expect(screen.getByLabelText('Adresse du portail')).toHaveTextContent('https://app.test/connexion/cabinet-dupont');
    expect(screen.getByText(/liens déjà envoyés/)).toBeInTheDocument();
    expect(screen.getByText(/n’y voient pas SocialFlow/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  });

  it('enregistre un nouvel identifiant, met l adresse a jour et rafraichit', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, slug: 'nouveau-portail' }) });
    renderForm();

    const field = screen.getByLabelText('Identifiant du portail');
    await userEvent.clear(field);
    await userEvent.type(field, 'Nouveau Portail');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/cabinet/settings/portal', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'Nouveau Portail' }),
    });
    expect(await screen.findByText('Identifiant enregistré.')).toBeInTheDocument();
    expect(screen.getByLabelText('Adresse du portail')).toHaveTextContent('https://app.test/connexion/nouveau-portail');
    expect(refresh).toHaveBeenCalled();
  });

  it.each([
    ['SLUG_TAKEN', /déjà utilisé par un autre cabinet/],
    ['INVALID_SLUG', /lettres minuscules, chiffres et tirets/],
    ['CABINET_READ_ONLY', /lecture seule/],
  ])('explique l erreur %s', async (code, message) => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: code }) });
    renderForm();

    const field = screen.getByLabelText('Identifiant du portail');
    await userEvent.clear(field);
    await userEvent.type(field, 'autre-identifiant');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(refresh).not.toHaveBeenCalled();
    // L'adresse affichee reste celle qui est enregistree.
    expect(screen.getByLabelText('Adresse du portail')).toHaveTextContent('/connexion/cabinet-dupont');
  });

  it('décrit le champ par l avertissement sur les liens deja envoyes', () => {
    renderForm();

    expect(screen.getByLabelText('Identifiant du portail')).toHaveAccessibleDescription(
      /liens déjà envoyés/,
    );
  });

  it('copie l adresse du portail', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: /Copier/ }));

    expect(writeText).toHaveBeenCalledWith('https://app.test/connexion/cabinet-dupont');
    await waitFor(() => expect(screen.getByRole('button', { name: /Copié/ })).toBeInTheDocument());
  });

  it('est en lecture seule : champ desactive et pas de bouton Enregistrer', () => {
    renderForm({ readOnly: true });

    expect(screen.getByLabelText('Identifiant du portail')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument();
    expect(screen.getByText(/lecture seule/)).toBeInTheDocument();
  });
});
