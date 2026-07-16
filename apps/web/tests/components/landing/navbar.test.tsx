import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Navbar } from '@/components/landing/navbar';

const usePathnameMock = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
}));

vi.mock('next/image', () => ({
  default: ({ priority: _priority, ...rest }: Record<string, unknown>) => {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img {...(rest as React.ImgHTMLAttributes<HTMLImageElement>)} alt={rest.alt as string} />
    );
  },
}));

describe('Navbar', () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
  });

  it('met en surbrillance le lien de la page active', () => {
    usePathnameMock.mockReturnValue('/tarifs');
    render(<Navbar />);

    expect(screen.getByText('Tarifs').closest('a')).toHaveClass('text-primary');
    expect(screen.getByText('Accueil').closest('a')).toHaveClass('text-muted-foreground');
  });

  it('met en surbrillance "Entreprise" quand on est sur une page du groupe (Contact, À propos)', () => {
    usePathnameMock.mockReturnValue('/contact');
    render(<Navbar />);

    expect(screen.getByText('Entreprise').closest('button')).toHaveClass('text-primary');
  });

  it("n'active pas Entreprise sur une page hors du groupe", () => {
    usePathnameMock.mockReturnValue('/');
    render(<Navbar />);

    expect(screen.getByText('Entreprise').closest('button')).toHaveClass('text-muted-foreground');
  });

  it('ouvre le menu mobile au clic sur le bouton hamburger', () => {
    usePathnameMock.mockReturnValue('/');
    render(<Navbar />);

    expect(screen.getAllByText('Fonctionnalités')).toHaveLength(1);

    fireEvent.click(screen.getByLabelText('Ouvrir le menu'));

    expect(screen.getAllByText('Fonctionnalités')).toHaveLength(2);
    expect(screen.getAllByText('À propos').length).toBeGreaterThan(0);
  });

  it('referme le menu mobile après avoir cliqué sur un lien', () => {
    usePathnameMock.mockReturnValue('/');
    render(<Navbar />);

    fireEvent.click(screen.getByLabelText('Ouvrir le menu'));
    const mobileLinks = screen.getAllByText('Fonctionnalités');
    fireEvent.click(mobileLinks[mobileLinks.length - 1]);

    expect(screen.getAllByText('Fonctionnalités')).toHaveLength(1);
  });
});
