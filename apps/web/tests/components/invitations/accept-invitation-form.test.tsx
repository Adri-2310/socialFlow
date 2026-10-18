import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AcceptInvitationForm } from '@/components/invitations/accept-invitation-form';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

describe('AcceptInvitationForm', () => {
  it('masque les mots de passe par defaut puis les affiche via le bouton', async () => {
    render(<AcceptInvitationForm token="t" email="a@b.be" />);
    const password = screen.getByLabelText('Mot de passe');
    const confirm = screen.getByLabelText('Confirmer le mot de passe');
    expect(password).toHaveAttribute('type', 'password');
    expect(confirm).toHaveAttribute('type', 'password');

    await userEvent.click(screen.getByRole('button', { name: 'Afficher les mots de passe' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(confirm).toHaveAttribute('type', 'text');

    await userEvent.click(screen.getByRole('button', { name: 'Masquer les mots de passe' }));
    expect(password).toHaveAttribute('type', 'password');
    expect(confirm).toHaveAttribute('type', 'password');
  });
});
