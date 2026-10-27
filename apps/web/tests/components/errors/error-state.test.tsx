import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorState } from '@/components/errors/error-state';

// Page d'erreur commune (erreur inattendue, 404, erreur de connexion) : texte, actions, tons.
vi.mock('@/components/theme-toggle', () => ({ ThemeToggle: () => null }));
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

const base = {
  icon: <svg data-testid="icone" />,
  eyebrow: 'Erreur 404',
  title: 'Cette page n’existe pas',
  description: 'Elle a peut-être été déplacée.',
};

describe('ErrorState : contenu', () => {
  it('affiche l’étiquette, le titre et la description', () => {
    render(<ErrorState {...base} actions={[{ label: 'Accueil', href: '/', icon: <svg /> }]} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Cette page n’existe pas' })).toBeInTheDocument();
    expect(screen.getByText('Erreur 404')).toBeInTheDocument();
    expect(screen.getByText('Elle a peut-être été déplacée.')).toBeInTheDocument();
    expect(screen.getByTestId('icone')).toBeInTheDocument();
  });

  it('affiche le code, la référence et le pied de page quand ils sont fournis', () => {
    render(
      <ErrorState
        {...base}
        code="404"
        digest="abc123"
        footer={<span>Besoin d’aide ?</span>}
        actions={[{ label: 'Accueil', href: '/', icon: <svg /> }]}
      />,
    );

    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('Référence : abc123')).toBeInTheDocument();
    expect(screen.getByText('Besoin d’aide ?')).toBeInTheDocument();
  });

  it('sans code, référence ni pied de page, ne les affiche pas', () => {
    render(<ErrorState {...base} actions={[{ label: 'Accueil', href: '/', icon: <svg /> }]} />);

    expect(screen.queryByText(/Référence/)).not.toBeInTheDocument();
    expect(screen.queryByText('404')).not.toBeInTheDocument();
  });

  it('le logo mène à l’accueil', () => {
    render(<ErrorState {...base} actions={[{ label: 'Contact', href: '/contact', icon: <svg /> }]} />);

    expect(screen.getByRole('link', { name: /SocialFlow/ })).toHaveAttribute('href', '/');
  });
});

describe('ErrorState : actions', () => {
  it('une action avec href est un lien', () => {
    render(<ErrorState {...base} actions={[{ label: 'Contacter le support', href: '/contact', icon: <svg /> }]} />);

    expect(screen.getByRole('link', { name: 'Contacter le support' })).toHaveAttribute('href', '/contact');
  });

  it('une action avec onClick est un bouton qui appelle onClick', async () => {
    const onClick = vi.fn();
    render(<ErrorState {...base} actions={[{ label: 'Réessayer', onClick, icon: <svg /> }]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('garde l’ordre des actions, liens et boutons mélangés', () => {
    render(
      <ErrorState
        {...base}
        actions={[
          { label: 'Réessayer', onClick: vi.fn(), icon: <svg /> },
          { label: 'Retour à l’accueil', href: '/', icon: <svg /> },
        ]}
      />,
    );

    const reessayer = screen.getByRole('button', { name: 'Réessayer' });
    const accueil = screen.getByRole('link', { name: 'Retour à l’accueil' });
    expect(reessayer.compareDocumentPosition(accueil) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

// D62 : les textes d'étiquette doivent rester lisibles, en clair comme en sombre.
describe('ErrorState : tons', () => {
  const actions = [{ label: 'Accueil', href: '/', icon: <svg /> }];

  it.each([
    ['destructive', 'text-destructive-text'],
    ['warning', 'text-amber-800'],
    ['primary', 'text-primary'],
  ] as const)('le ton %s colore l’étiquette en %s', (tone, classe) => {
    render(<ErrorState {...base} tone={tone} actions={actions} />);

    expect(screen.getByText('Erreur 404').classList.contains(classe)).toBe(true);
  });

  it('n’utilise jamais text-destructive ni amber-600 pour du texte', () => {
    const { container } = render(<ErrorState {...base} tone="destructive" actions={actions} />);

    expect(container.innerHTML).not.toMatch(/text-destructive(?!-text)/);
    expect(container.innerHTML).not.toMatch(/amber-600/);
  });
});
