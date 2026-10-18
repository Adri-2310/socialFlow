import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GestionnaireActions } from '@/components/cabinet/gestionnaire-actions';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn();

beforeEach(() => {
  refresh.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

const ok = () => ({ ok: true, json: async () => ({ success: true }) });

function renderActions(
  props: Partial<React.ComponentProps<typeof GestionnaireActions>> = {},
) {
  return render(
    <GestionnaireActions
      gestionnaireId="g1"
      name="Alice Martin"
      email="alice@cabinet.be"
      status="actif"
      reactivatableByCabinet={false}
      {...props}
    />,
  );
}

describe('GestionnaireActions', () => {
  it('demande confirmation avant de suspendre, puis appelle PATCH', async () => {
    fetchMock.mockResolvedValue(ok());
    renderActions();

    await userEvent.click(screen.getByRole('button', { name: 'Suspendre Alice Martin' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('Suspendre Alice Martin ?')).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: 'Suspendre' }).at(-1)!);

    expect(fetchMock).toHaveBeenCalledWith('/api/gestionnaires/g1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'suspendu' }),
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('reactive directement un gestionnaire suspendu par le cabinet', async () => {
    fetchMock.mockResolvedValue(ok());
    renderActions({ status: 'suspendu', reactivatableByCabinet: true });

    await userEvent.click(screen.getByRole('button', { name: 'Réactiver Alice Martin' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/gestionnaires/g1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'actif' }),
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('masque la reactivation quand la suspension vient du SuperAdmin', () => {
    renderActions({ status: 'suspendu', reactivatableByCabinet: false });

    expect(screen.queryByRole('button', { name: /Réactiver/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Suspendu par l'administration SocialFlow/)).toBeInTheDocument();
  });

  it('demande confirmation avant de retirer, puis appelle DELETE', async () => {
    fetchMock.mockResolvedValue(ok());
    renderActions();

    await userEvent.click(screen.getByRole('button', { name: 'Retirer Alice Martin' }));
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.click(screen.getAllByRole('button', { name: 'Retirer' }).at(-1)!);

    expect(fetchMock).toHaveBeenCalledWith('/api/gestionnaires/g1', { method: 'DELETE' });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("modifie l'email via la fenetre dediee", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, verificationEmailSent: true }),
    });
    renderActions();

    await userEvent.click(screen.getByRole('button', { name: "Modifier l'email de Alice Martin" }));
    const input = screen.getByLabelText('Nouvelle adresse email');
    expect(input).toHaveValue('alice@cabinet.be');

    await userEvent.clear(input);
    await userEvent.type(input, 'alice@nouveau.be');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/gestionnaires/g1/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'alice@nouveau.be' }),
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("signale l'erreur quand l'adresse est deja utilisee", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'EMAIL_ALREADY_USED' }),
    });
    renderActions();

    await userEvent.click(screen.getByRole('button', { name: "Modifier l'email de Alice Martin" }));
    const input = screen.getByLabelText('Nouvelle adresse email');
    await userEvent.clear(input);
    await userEvent.type(input, 'bob@cabinet.be');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(
      await screen.findByText('Un compte existe déjà avec cette adresse email.'),
    ).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("affiche un message lisible quand l'API refuse", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'SUSPENDED_BY_ADMIN' }),
    });
    renderActions({ status: 'suspendu', reactivatableByCabinet: true });

    await userEvent.click(screen.getByRole('button', { name: 'Réactiver Alice Martin' }));

    expect(await screen.findByText(/seule celle-ci peut la lever/)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
