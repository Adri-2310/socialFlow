import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeleteAccount } from '@/components/auth/delete-account';

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    listAccounts: vi.fn().mockResolvedValue({ data: [{ providerId: 'credential' }] }),
    deleteUser: vi.fn(),
  },
}));

describe('DeleteAccount', () => {
  it('propose la suppression par defaut', () => {
    render(<DeleteAccount />);

    expect(screen.getByText('Supprimer mon compte')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Gérer mon abonnement' })).not.toBeInTheDocument();
  });

  it('explique pourquoi la suppression est impossible tant que l abonnement court (D67)', () => {
    render(<DeleteAccount blockedBySubscription />);

    expect(screen.getByText(/tant que l.abonnement de votre cabinet est en cours/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gérer mon abonnement' })).toHaveAttribute(
      'href',
      '/dashboard/cabinet/facturation',
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
