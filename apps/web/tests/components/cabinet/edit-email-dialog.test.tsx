import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditEmailDialog } from '@/components/cabinet/edit-email-dialog';

// Modification de l'adresse de connexion d'un gestionnaire (D53). L'envoi nominal et
// l'adresse déjà utilisée sont testés dans gestionnaire-actions.test.tsx.
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn();

beforeEach(() => {
  refresh.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function renderDialog() {
  const onClose = vi.fn();
  render(
    <EditEmailDialog
      gestionnaireId="g1"
      name="Alice Martin"
      currentEmail="alice@cabinet.be"
      onClose={onClose}
    />,
  );
  return { onClose };
}

describe('EditEmailDialog', () => {
  it('annonce la boîte de dialogue, ses conséquences et pré-remplit l’adresse actuelle', () => {
    renderDialog();

    expect(screen.getByText('Modifier l\'email de Alice Martin')).toBeInTheDocument();
    expect(screen.getByText(/ses sessions en cours seront fermées/)).toBeInTheDocument();
    const field = screen.getByLabelText('Nouvelle adresse email');
    expect(field).toHaveValue('alice@cabinet.be');
    expect(field).toBeRequired();
    expect(field).toHaveAttribute('type', 'email');
  });

  it('met le focus dans le champ à l’ouverture', async () => {
    renderDialog();

    await waitFor(() => expect(screen.getByLabelText('Nouvelle adresse email')).toHaveFocus());
  });

  it('se ferme avec Annuler sans rien envoyer', async () => {
    const { onClose } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('se ferme après un envoi réussi', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, verificationEmailSent: true }) });
    const { onClose } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(refresh).toHaveBeenCalled();
  });

  it('signale l’email de confirmation non parti au lieu de fermer en silence', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, verificationEmailSent: false }) });
    const { onClose } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText(/l'email de confirmation n'a pas pu être envoyé/)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // Plus rien à enregistrer : le bouton devient « Fermer », le champ est figé.
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nouvelle adresse email')).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['EMAIL_UNCHANGED', 'Cette adresse est déjà celle du compte.'],
    ['INVITATION_ALREADY_PENDING', 'Une invitation est déjà en attente pour cette adresse.'],
    ['INVALID_EMAIL', 'Adresse email invalide.'],
  ])('explique l’erreur %s et reste ouvert', async (code, message) => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: code }) });
    const { onClose } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('retombe sur un message générique pour une erreur inconnue', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'INCONNUE' }) });
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Une erreur est survenue. Veuillez réessayer.')).toBeInTheDocument();
  });

  it('désactive le champ et les boutons pendant l’envoi', async () => {
    let finish: (value: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(screen.getByLabelText('Nouvelle adresse email')).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
    finish({ ok: true, json: async () => ({ success: true, verificationEmailSent: true }) });
  });
});
