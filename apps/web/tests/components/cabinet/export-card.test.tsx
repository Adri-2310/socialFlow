import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExportCard } from '@/components/cabinet/export-card';

describe('ExportCard (D28, D74)', () => {
  it('propose le telechargement de l export et rappelle ce qu il contient', () => {
    render(<ExportCard readOnly={false} />);

    const link = screen.getByRole('link', { name: 'Télécharger l’export' });
    expect(link).toHaveAttribute('href', '/api/cabinet/export');
    expect(link).toHaveAttribute('download');
    expect(screen.getByText(/ni salaire ni fiche de paie/)).toBeInTheDocument();
    expect(screen.queryByText(/reste disponible/)).not.toBeInTheDocument();
  });

  it('precise que l export reste disponible en lecture seule', () => {
    render(<ExportCard readOnly />);

    expect(screen.getByText(/l’export reste disponible/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Télécharger l’export' })).toBeInTheDocument();
  });
});
