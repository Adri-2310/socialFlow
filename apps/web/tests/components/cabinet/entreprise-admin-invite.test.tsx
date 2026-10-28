import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntrepriseAdminInvite } from '@/components/cabinet/entreprise-admin-invite';

// Invitation (ou remplacement, D78) de l'administrateur d'une entreprise. L'invitation simple et
// le conflit « a déjà un administrateur » sont testés dans entreprises.test.tsx.
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn();

beforeEach(() => {
  refresh.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function renderInvite(props: Partial<React.ComponentProps<typeof EntrepriseAdminInvite>> = {}) {
  return render(
    <EntrepriseAdminInvite
      entrepriseId="e1"
      name="Boulangerie Dupont"
      defaultEmail="contact@dupont.be"
      readOnly={false}
      {...props}
    />,
  );
}

describe('EntrepriseAdminInvite', () => {
  it('désactive le bouton en lecture seule', () => {
    renderInvite({ readOnly: true });

    expect(screen.getByRole('button', { name: "Inviter l'administrateur de Boulangerie Dupont" })).toBeDisabled();
  });

  it('s’ouvre avec le focus dans le champ, et Annuler referme sans rien envoyer', async () => {
    renderInvite();

    await userEvent.click(screen.getByRole('button', { name: "Inviter l'administrateur de Boulangerie Dupont" }));
    const field = screen.getByLabelText("Email de l'administrateur de Boulangerie Dupont");
    await waitFor(() => expect(field).toHaveFocus());
    expect(field).toBeRequired();
    expect(field).toHaveAttribute('placeholder', 'admin@entreprise.be');

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByLabelText("Email de l'administrateur de Boulangerie Dupont")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('en remplacement : libellés adaptés, avertissement et corps avec replace', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ success: true }) });
    renderInvite({ replace: true });

    expect(screen.queryByRole('button', { name: /Inviter l'administrateur/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: "Remplacer l'administrateur de Boulangerie Dupont" }));
    expect(screen.getByText(/garde son accès jusqu’à ce que le remplaçant accepte/)).toBeInTheDocument();

    const field = screen.getByLabelText("Email du remplaçant de l'administrateur de Boulangerie Dupont");
    await userEvent.clear(field);
    await userEvent.type(field, 'nouveau@dupont.be');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer l’invitation' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/cabinet/entreprises/e1/admin-invitation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nouveau@dupont.be', replace: true }),
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    // Après l'envoi, le formulaire se referme et le bouton réapparaît.
    expect(await screen.findByRole('button', { name: "Remplacer l'administrateur de Boulangerie Dupont" })).toBeInTheDocument();
  });

  it('explique qu il n y a pas d administrateur à remplacer', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'ENTREPRISE_HAS_NO_ADMIN' }) });
    renderInvite({ replace: true });

    await userEvent.click(screen.getByRole('button', { name: "Remplacer l'administrateur de Boulangerie Dupont" }));
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer l’invitation' }));

    expect(await screen.findByText('Cette entreprise n’a pas d’administrateur à remplacer.')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('efface l’erreur quand on annule puis qu on rouvre', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'INVALID_EMAIL' }) });
    renderInvite();

    await userEvent.click(screen.getByRole('button', { name: "Inviter l'administrateur de Boulangerie Dupont" }));
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer l’invitation' }));
    expect(await screen.findByText('Adresse email invalide.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    await userEvent.click(screen.getByRole('button', { name: "Inviter l'administrateur de Boulangerie Dupont" }));

    expect(screen.queryByText('Adresse email invalide.')).not.toBeInTheDocument();
  });

  it('désactive le bouton d’envoi pendant la requête', async () => {
    let finish: (value: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderInvite();

    await userEvent.click(screen.getByRole('button', { name: "Inviter l'administrateur de Boulangerie Dupont" }));
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer l’invitation' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Envoyer l’invitation' })).toBeDisabled());
    finish({ ok: true, status: 201, json: async () => ({ success: true }) });
  });
});
