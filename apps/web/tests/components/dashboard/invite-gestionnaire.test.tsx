import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InviteGestionnaire } from '@/components/dashboard/invite-gestionnaire';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe('InviteGestionnaire', () => {
  it('affiche les places utilisees et reste actif sous le quota', () => {
    render(<InviteGestionnaire quota={{ used: 2, limit: 3 }} />);

    expect(screen.getByText('2 / 3 gestionnaires')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inviter' })).toBeEnabled();
    expect(screen.queryByText(/quota de gestionnaires de votre plan est atteint/)).toBeNull();
  });

  it('desactive le formulaire et explique quand le quota est atteint', () => {
    render(<InviteGestionnaire quota={{ used: 3, limit: 3 }} />);

    expect(screen.getByRole('button', { name: 'Inviter' })).toBeDisabled();
    expect(screen.getByPlaceholderText('gestionnaire@cabinet.be')).toBeDisabled();
    expect(screen.getByText(/quota de gestionnaires de votre plan est atteint/)).toBeInTheDocument();
  });

  it('ne bloque rien pour un plan illimite ou sans information de quota', () => {
    const { rerender } = render(<InviteGestionnaire quota={{ used: 50, limit: null }} />);
    expect(screen.getByRole('button', { name: 'Inviter' })).toBeEnabled();

    rerender(<InviteGestionnaire />);
    expect(screen.getByRole('button', { name: 'Inviter' })).toBeEnabled();
  });
});
