import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserMenu } from '@/components/layout/user-menu';

const pushMock = vi.fn();
const refreshMock = vi.fn();
const signOutMock = vi.fn().mockResolvedValue(undefined);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

vi.mock('@/lib/auth-client', () => ({
  signOut: () => signOutMock(),
}));

beforeEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  signOutMock.mockClear();
});

describe('UserMenu', () => {
  it('affiche les initiales, le nom et le role, menu ferme par defaut', () => {
    render(<UserMenu userName="Adrien Mertens" roleLabel="SuperAdmin" />);

    expect(screen.getByText('AD')).toBeInTheDocument();
    expect(screen.getByText('Adrien Mertens')).toBeInTheDocument();
    expect(screen.getByText('SuperAdmin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Menu du compte' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: /Mon profil/ })).not.toBeInTheDocument();
  });

  it('ouvre le menu au clic et affiche "Mon profil" et "Se déconnecter"', () => {
    render(<UserMenu userName="Adrien Mertens" roleLabel="SuperAdmin" />);

    fireEvent.click(screen.getByRole('button', { name: 'Menu du compte' }));

    expect(screen.getByRole('button', { name: 'Menu du compte' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: /Mon profil/ })).toHaveAttribute('href', '/profil');
    expect(screen.getByRole('button', { name: /Se déconnecter/ })).toBeInTheDocument();
  });

  it('referme le menu sur un clic exterieur', () => {
    render(
      <div>
        <UserMenu userName="Adrien Mertens" roleLabel="SuperAdmin" />
        <button type="button">Ailleurs</button>
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Menu du compte' }));
    expect(screen.getByRole('link', { name: /Mon profil/ })).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Ailleurs' }));

    expect(screen.queryByRole('link', { name: /Mon profil/ })).not.toBeInTheDocument();
  });

  it('referme le menu sur la touche Echap', () => {
    render(<UserMenu userName="Adrien Mertens" roleLabel="SuperAdmin" />);

    fireEvent.click(screen.getByRole('button', { name: 'Menu du compte' }));
    expect(screen.getByRole('link', { name: /Mon profil/ })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('link', { name: /Mon profil/ })).not.toBeInTheDocument();
  });

  it('referme le menu au clic sur "Mon profil"', () => {
    render(<UserMenu userName="Adrien Mertens" roleLabel="SuperAdmin" />);

    fireEvent.click(screen.getByRole('button', { name: 'Menu du compte' }));
    fireEvent.click(screen.getByRole('link', { name: /Mon profil/ }));

    expect(screen.queryByRole('link', { name: /Mon profil/ })).not.toBeInTheDocument();
  });

  it('se deconnecte, redirige vers /au-revoir et rafraichit', async () => {
    render(<UserMenu userName="Adrien Mertens" roleLabel="SuperAdmin" />);

    fireEvent.click(screen.getByRole('button', { name: 'Menu du compte' }));
    fireEvent.click(screen.getByRole('button', { name: /Se déconnecter/ }));

    expect(screen.getByRole('button', { name: /Se déconnecter/ })).toBeDisabled();

    await waitFor(() => expect(signOutMock).toHaveBeenCalled());
    expect(pushMock).toHaveBeenCalledWith('/au-revoir');
    expect(refreshMock).toHaveBeenCalled();
  });
});
