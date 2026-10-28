import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Navbar } from '@/components/landing/navbar';

// Compléments au test de la barre de navigation : destinations, actions et menu mobile.
const usePathnameMock = vi.fn();
vi.mock('next/navigation', () => ({ usePathname: () => usePathnameMock() }));
vi.mock('@/components/theme-toggle', () => ({ ThemeToggle: () => null }));
vi.mock('next/image', () => ({
  default: ({ priority: _priority, ...rest }: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...(rest as React.ImgHTMLAttributes<HTMLImageElement>)} alt={rest.alt as string} />
  ),
}));

beforeEach(() => {
  usePathnameMock.mockReset().mockReturnValue('/');
});

describe('Navbar : destinations', () => {
  it('le logo et les liens principaux mènent aux bonnes pages', () => {
    render(<Navbar />);

    expect(screen.getByRole('link', { name: /SocialFlow/ })).toHaveAttribute('href', '/');
    const attendus: [string, string][] = [
      ['Accueil', '/'],
      ['Fonctionnalités', '/fonctionnalites'],
      ['Pour qui ?', '/pour-qui'],
      ['Tarifs', '/tarifs'],
      ['FAQ', '/faq'],
    ];
    for (const [nom, href] of attendus) {
      expect(screen.getByRole('link', { name: nom })).toHaveAttribute('href', href);
    }
  });

  it('« Se connecter » et « Essai gratuit » mènent à la connexion et à l’inscription', () => {
    render(<Navbar />);

    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Essai gratuit' })).toHaveAttribute('href', '/register');
  });

  it('le groupe « Entreprise » propose À propos et Contact', async () => {
    render(<Navbar />);

    // Le panneau n'est plus présent en permanence (invisible mais atteignable) : il s'ouvre.
    await userEvent.click(screen.getByRole('button', { name: 'Entreprise' }));

    expect(await screen.findByRole('menuitem', { name: 'À propos' })).toHaveAttribute('href', '/a-propos');
    expect(screen.getByRole('menuitem', { name: 'Contact' })).toHaveAttribute('href', '/contact');
  });

  it('le menu « Entreprise » se parcourt au clavier et marque la page active', async () => {
    usePathnameMock.mockReturnValue('/contact');
    render(<Navbar />);

    screen.getByRole('button', { name: 'Entreprise' }).focus();
    await userEvent.keyboard('{Enter}');

    expect(await screen.findByRole('menuitem', { name: 'Contact' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('menuitem', { name: 'À propos' })).not.toHaveAttribute('aria-current');
  });
});

describe('Navbar : menu mobile', () => {
  const ouvrir = () => userEvent.click(screen.getByLabelText('Ouvrir le menu'));

  it('est fermé au départ', () => {
    render(<Navbar />);

    expect(screen.getAllByRole('link', { name: 'Se connecter' })).toHaveLength(1);
  });

  it('ajoute les liens du groupe et « Se connecter » une fois ouvert', async () => {
    render(<Navbar />);

    await ouvrir();

    expect(screen.getAllByRole('link', { name: 'Se connecter' })).toHaveLength(2);
    // Les liens du groupe : seule la version mobile est dans la page tant que « Entreprise » est fermé.
    expect(screen.getAllByRole('link', { name: 'Contact' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'À propos' })).toHaveAttribute('href', '/a-propos');
  });

  it('met en évidence la page active dans le menu mobile', async () => {
    usePathnameMock.mockReturnValue('/faq');
    render(<Navbar />);

    await ouvrir();

    const liensFaq = screen.getAllByRole('link', { name: 'FAQ' });
    expect(liensFaq[liensFaq.length - 1]).toHaveClass('bg-muted');
  });

  it('se referme au clic sur « Se connecter »', async () => {
    render(<Navbar />);
    await ouvrir();
    const liens = screen.getAllByRole('link', { name: 'Se connecter' });

    await userEvent.click(liens[liens.length - 1]);

    expect(screen.getAllByRole('link', { name: 'Se connecter' })).toHaveLength(1);
  });

  it('le bouton hamburger referme le menu quand on le rappuie', async () => {
    render(<Navbar />);
    await ouvrir();
    expect(screen.getAllByRole('link', { name: 'Fonctionnalités' })).toHaveLength(2);

    // Une fois ouvert, le bouton propose de fermer le menu.
    await userEvent.click(screen.getByLabelText('Fermer le menu'));

    expect(screen.getAllByRole('link', { name: 'Fonctionnalités' })).toHaveLength(1);
  });

  it('le menu mobile est dans le même bloc que la barre (en-tête)', async () => {
    render(<Navbar />);
    await ouvrir();

    expect(within(screen.getByRole('banner')).getAllByRole('link', { name: 'FAQ' })).toHaveLength(2);
  });
});

describe('Navbar : accessibilité du hamburger', () => {
  it('annonce l’état du menu avec aria-expanded et aria-controls', async () => {
    render(<Navbar />);
    const bouton = screen.getByLabelText('Ouvrir le menu');
    expect(bouton).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(bouton);

    const ouvert = screen.getByLabelText('Fermer le menu');
    expect(ouvert).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(ouvert.getAttribute('aria-controls')!)).toBeInTheDocument();
  });
});
