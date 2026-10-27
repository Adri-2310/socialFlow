import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardShell, type ShellRole } from '@/components/layout/dashboard-shell';

// Coque des espaces connectés : barre latérale (menu par rôle), barre du haut, tiroir mobile.
const usePathnameMock = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));
vi.mock('@/lib/auth/auth-client', () => ({ signOut: vi.fn() }));

function rendre(
  role: ShellRole,
  pathname: string,
  props: Partial<React.ComponentProps<typeof DashboardShell>> = {},
) {
  usePathnameMock.mockReturnValue(pathname);
  return render(
    <DashboardShell role={role} userName="Adrien Mertens" {...props}>
      <p>Contenu de la page</p>
    </DashboardShell>,
  );
}

const lienMenu = (nom: string) => screen.getByRole('link', { name: nom });
const estActif = (nom: string) => lienMenu(nom).classList.contains('bg-sidebar-accent');

beforeEach(() => usePathnameMock.mockReset());

describe('DashboardShell : menu par rôle', () => {
  it('SuperAdmin : sept entrées vers la console', () => {
    rendre('SUPER_ADMIN', '/dashboard/admin');

    expect(lienMenu("Vue d'ensemble")).toHaveAttribute('href', '/dashboard/admin');
    expect(lienMenu('Cabinets')).toHaveAttribute('href', '/dashboard/admin/cabinets');
    expect(lienMenu('Utilisateurs')).toHaveAttribute('href', '/dashboard/admin/utilisateurs');
    expect(lienMenu('Monitoring')).toHaveAttribute('href', '/dashboard/admin/monitoring');
    expect(lienMenu("Journal d'audit")).toHaveAttribute('href', '/dashboard/admin/audit');
    expect(lienMenu('Facturation')).toHaveAttribute('href', '/dashboard/admin/facturation');
    expect(lienMenu('Configuration')).toHaveAttribute('href', '/dashboard/admin/configuration');
    expect(screen.getByText('Console SuperAdmin')).toBeInTheDocument();
  });

  it('Cabinet RH : six entrées', () => {
    rendre('CABINET_RH', '/dashboard/cabinet');

    expect(lienMenu('Gestionnaires')).toHaveAttribute('href', '/dashboard/cabinet/gestionnaires');
    expect(lienMenu('Entreprises')).toHaveAttribute('href', '/dashboard/cabinet/entreprises');
    expect(lienMenu('Mon abonnement')).toHaveAttribute('href', '/dashboard/cabinet/facturation');
    expect(lienMenu('Paramètres')).toHaveAttribute('href', '/dashboard/cabinet/parametres');
    expect(screen.getByText('Espace Cabinet RH')).toBeInTheDocument();
  });

  it('Gestionnaire RH : « Mes entreprises » seulement', () => {
    rendre('GESTIONNAIRE_RH', '/dashboard/gestionnaire');

    expect(lienMenu('Mes entreprises')).toHaveAttribute('href', '/dashboard/gestionnaire');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByText('Espace Gestionnaire')).toBeInTheDocument();
  });

  it('Entreprise cliente : « Accueil » seulement', () => {
    rendre('ENTREPRISE_CLIENTE', '/dashboard/entreprise');

    expect(lienMenu('Accueil')).toHaveAttribute('href', '/dashboard/entreprise');
    expect(screen.getByText('Espace Entreprise')).toBeInTheDocument();
  });
});

describe('DashboardShell : entrée active et titre', () => {
  it('marque l’entrée de la page courante, et elle seule', () => {
    rendre('CABINET_RH', '/dashboard/cabinet/entreprises');

    expect(estActif('Entreprises')).toBe(true);
    expect(estActif('Gestionnaires')).toBe(false);
    expect(estActif("Vue d'ensemble")).toBe(false);
  });

  it('annonce l’entrée active aux lecteurs d’écran par aria-current', () => {
    rendre('CABINET_RH', '/dashboard/cabinet/entreprises');

    expect(lienMenu('Entreprises')).toHaveAttribute('aria-current', 'page');
    expect(lienMenu('Gestionnaires')).not.toHaveAttribute('aria-current');
  });

  it('le titre de la barre du haut est le libellé de l’entrée active', () => {
    rendre('CABINET_RH', '/dashboard/cabinet/gestionnaires');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Gestionnaires');
  });

  it('une page hors menu du gestionnaire donne son propre titre et garde « Mes entreprises » actif', () => {
    rendre('GESTIONNAIRE_RH', '/dashboard/gestionnaire/salaries/s1');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Dossier salarié');
    expect(estActif('Mes entreprises')).toBe(true);
  });

  it('retombe sur la première entrée quand rien ne correspond', () => {
    rendre('CABINET_RH', '/dashboard/cabinet/inconnue');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Vue d'ensemble");
  });

  it('affiche le contenu de la page', () => {
    rendre('CABINET_RH', '/dashboard/cabinet');

    expect(screen.getByText('Contenu de la page')).toBeInTheDocument();
  });
});

describe('DashboardShell : identité (D33)', () => {
  it('par défaut : logo et nom SocialFlow, sans mention « Propulsé par »', () => {
    rendre('CABINET_RH', '/dashboard/cabinet');

    expect(screen.getByRole('img', { name: 'SocialFlow' })).toBeInTheDocument();
    expect(screen.queryByText('Propulsé par SocialFlow')).not.toBeInTheDocument();
  });

  it('avec un cabinet : son nom, son logo et la mention « Propulsé par SocialFlow »', () => {
    rendre('GESTIONNAIRE_RH', '/dashboard/gestionnaire', {
      brandName: 'Cabinet Alicia',
      logoUrl: 'https://blob.test/logo.png',
    });

    expect(screen.getByText('Cabinet Alicia')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Cabinet Alicia' })).toHaveAttribute(
      'src',
      'https://blob.test/logo.png',
    );
    expect(screen.getByText('Propulsé par SocialFlow')).toBeInTheDocument();
  });
});

describe('DashboardShell : tiroir mobile', () => {
  const hamburger = () => screen.getByRole('button', { name: 'Ouvrir le menu' });

  it('est fermé au départ', () => {
    rendre('CABINET_RH', '/dashboard/cabinet');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(hamburger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('le bouton de la barre du haut l’ouvre, avec le même menu', async () => {
    rendre('CABINET_RH', '/dashboard/cabinet');

    await userEvent.click(hamburger());

    const tiroir = await screen.findByRole('dialog', { name: 'Menu de navigation' });
    expect(within(tiroir).getByRole('link', { name: 'Entreprises' })).toHaveAttribute(
      'href',
      '/dashboard/cabinet/entreprises',
    );
  });

  it('un clic sur une entrée du menu le referme', async () => {
    rendre('CABINET_RH', '/dashboard/cabinet');
    await userEvent.click(hamburger());
    const tiroir = await screen.findByRole('dialog');

    await userEvent.click(within(tiroir).getByRole('link', { name: 'Entreprises' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('la touche Échap le referme', async () => {
    rendre('CABINET_RH', '/dashboard/cabinet');
    await userEvent.click(hamburger());
    await screen.findByRole('dialog');

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
