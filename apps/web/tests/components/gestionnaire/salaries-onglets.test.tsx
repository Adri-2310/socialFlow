import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SalariesOnglets } from '@/components/gestionnaire/salaries-onglets';

// Navigation entre les dossiers actifs et archivés : deux pages, annoncées par aria-current.
const base = '/dashboard/gestionnaire/entreprises/e1/salaries';

describe('SalariesOnglets', () => {
  it('annonce « Actifs » comme page courante et mène aux archivés', () => {
    render(<SalariesOnglets base={base} archives={false} nbArchives={3} />);

    expect(screen.getByRole('navigation', { name: 'Dossiers' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Actifs' })).toHaveAttribute('aria-current', 'page');
    const archives = screen.getByRole('link', { name: 'Archivés (3)' });
    expect(archives).not.toHaveAttribute('aria-current');
    expect(archives).toHaveAttribute('href', `${base}?archives=1`);
  });

  it('annonce « Archivés » comme page courante et ramène aux actifs', () => {
    render(<SalariesOnglets base={base} archives nbArchives={1} />);

    expect(screen.getByRole('link', { name: 'Archivés (1)' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const actifs = screen.getByRole('link', { name: 'Actifs' });
    expect(actifs).not.toHaveAttribute('aria-current');
    expect(actifs).toHaveAttribute('href', base);
  });

  it('l’onglet actif porte le soulignement et la couleur du cabinet, sans teinte de fond', () => {
    render(<SalariesOnglets base={base} archives={false} nbArchives={0} />);

    const actif = screen.getByRole('link', { name: 'Actifs' });
    expect(actif.className).toContain('border-primary');
    expect(actif.className).toContain('text-primary');
    expect(actif.className).not.toMatch(/bg-primary/);
  });
});
