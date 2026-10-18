import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InvitationActions } from '@/components/cabinet/invitation-actions';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn();

beforeEach(() => {
  refresh.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

const ok = () => ({ ok: true, json: async () => ({ success: true }) });

describe('InvitationActions', () => {
  it("n'offre aucune action pour une invitation acceptee ou revoquee", () => {
    const { container, rerender } = render(
      <InvitationActions invitationId="i1" email="a@b.be" status="accepted" />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<InvitationActions invitationId="i1" email="a@b.be" status="revoked" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('propose seulement de renvoyer une invitation expiree', () => {
    render(<InvitationActions invitationId="i1" email="a@b.be" status="expired" />);
    expect(screen.getByRole('button', { name: /Renvoyer/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Révoquer/ })).not.toBeInTheDocument();
  });

  it('renvoie une invitation puis rafraichit la page', async () => {
    fetchMock.mockResolvedValue(ok());
    render(<InvitationActions invitationId="i1" email="a@b.be" status="pending" />);

    await userEvent.click(screen.getByRole('button', { name: /Renvoyer/ }));

    expect(fetchMock).toHaveBeenCalledWith('/api/invitations/i1/resend', { method: 'POST' });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("demande confirmation avant de revoquer, puis appelle DELETE", async () => {
    fetchMock.mockResolvedValue(ok());
    render(<InvitationActions invitationId="i1" email="a@b.be" status="pending" />);

    await userEvent.click(screen.getByRole('button', { name: /Révoquer/ }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('Révoquer cette invitation ?')).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: 'Révoquer' }).at(-1)!);

    expect(fetchMock).toHaveBeenCalledWith('/api/invitations/i1', { method: 'DELETE' });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("affiche un message lisible quand l'API refuse", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'INVITATION_ALREADY_ACCEPTED' }),
    });
    render(<InvitationActions invitationId="i1" email="a@b.be" status="pending" />);

    await userEvent.click(screen.getByRole('button', { name: /Renvoyer/ }));

    expect(await screen.findByText('Cette invitation a déjà été acceptée.')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
