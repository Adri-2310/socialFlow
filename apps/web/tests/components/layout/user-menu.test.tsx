import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserMenu } from '@/components/layout/user-menu';

const pushMock = vi.fn();
const refreshMock = vi.fn();
const signOutMock = vi.fn().mockResolvedValue(undefined);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

vi.mock('@/lib/auth/auth-client', () => ({
  signOut: () => signOutMock(),
}));

beforeEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  signOutMock.mockClear();
});

describe('UserMenu', () => {
  it('affiche les initiales, le nom et le role, menu ferme par defaut', async () => {
    render(<UserMenu userName="Adrien Mertens" roleLabel="SuperAdmin" />);

    expect(screen.getByText('AD')).toBeInTheDocument();
    expect(screen.getByText('Adrien Mertens')).toBeInTheDocument();
    expect(screen.getByText('SuperAdmin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Menu du compte' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menuitem', { name: /Mon profil/ })).not.toBeInTheDocument();
  });

  it('ouvre le menu au clic et affiche "Mon profil" et "Se déconnecter"', async () => {
    render(<UserMenu userName="Adrien Mertens" roleLabel="SuperAdmin" />);

    await userEvent.click(screen.getByRole('button', { name: 'Menu du compte' }));

    expect(await screen.findByRole('menuitem', { name: /Mon profil/ })).toHaveAttribute('href', '/profil');
    expect(screen.getByRole('button', { name: 'Menu du compte' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: /Se déconnecter/ })).toBeInTheDocument();
  });

  it('referme le menu sur un clic exterieur', async () => {
    render(
      <div>
        <UserMenu userName="Adrien Mertens" roleLabel="SuperAdmin" />
        <button type="button">Ailleurs</button>
      </div>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Menu du compte' }));
    expect(await screen.findByRole('menuitem', { name: /Mon profil/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ailleurs' }));

    await waitFor(() =>
      expect(screen.queryByRole('menuitem', { name: /Mon profil/ })).not.toBeInTheDocument(),
    );
  });

  it('referme le menu sur la touche Echap', async () => {
    render(<UserMenu userName="Adrien Mertens" roleLabel="SuperAdmin" />);

    await userEvent.click(screen.getByRole('button', { name: 'Menu du compte' }));
    expect(await screen.findByRole('menuitem', { name: /Mon profil/ })).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('menuitem', { name: /Mon profil/ })).not.toBeInTheDocument(),
    );
  });

  it('referme le menu au clic sur "Mon profil"', async () => {
    render(<UserMenu userName="Adrien Mertens" roleLabel="SuperAdmin" />);

    await userEvent.click(screen.getByRole('button', { name: 'Menu du compte' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Mon profil/ }));

    await waitFor(() =>
      expect(screen.queryByRole('menuitem', { name: /Mon profil/ })).not.toBeInTheDocument(),
    );
  });

  it('se deconnecte, redirige vers /au-revoir et rafraichit', async () => {
    render(<UserMenu userName="Adrien Mertens" roleLabel="SuperAdmin" />);

    await userEvent.click(screen.getByRole('button', { name: 'Menu du compte' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Se déconnecter/ }));

    // Base UI marque l'élément de menu désactivé par aria-disabled (il garde le focus clavier).
    expect(screen.getByRole('menuitem', { name: /Se déconnecter/ })).toHaveAttribute('aria-disabled', 'true');

    await waitFor(() => expect(signOutMock).toHaveBeenCalled());
    expect(pushMock).toHaveBeenCalledWith('/au-revoir');
    expect(refreshMock).toHaveBeenCalled();
  });

  it('ramene un compte de cabinet client sur le portail de son cabinet apres la deconnexion (D76)', async () => {
    render(<UserMenu userName="Marie Client" roleLabel="Entreprise cliente" logoutHref="/connexion/mon-cabinet" />);

    await userEvent.click(screen.getByRole('button', { name: 'Menu du compte' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Se déconnecter/ }));

    await waitFor(() => expect(signOutMock).toHaveBeenCalled());
    expect(pushMock).toHaveBeenCalledWith('/connexion/mon-cabinet');
    expect(pushMock).not.toHaveBeenCalledWith('/au-revoir');
  });
});
