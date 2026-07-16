import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pricing } from '@/components/landing/pricing';

vi.mock('framer-motion');

describe('Pricing', () => {
  it('affiche les prix mensuels par défaut', () => {
    render(<Pricing />);

    expect(screen.getByText('49')).toBeInTheDocument();
    expect(screen.getByText('129')).toBeInTheDocument();
  });

  it('affiche les prix annuels après avoir cliqué sur "Annuel"', () => {
    render(<Pricing />);

    fireEvent.click(screen.getByText(/Annuel/));

    expect(screen.getByText('39')).toBeInTheDocument();
    expect(screen.getByText('103')).toBeInTheDocument();
    expect(screen.queryByText('49')).not.toBeInTheDocument();
  });

  it('revient aux prix mensuels après un second clic sur "Mensuel"', () => {
    render(<Pricing />);

    fireEvent.click(screen.getByText(/Annuel/));
    fireEvent.click(screen.getByText('Mensuel'));

    expect(screen.getByText('49')).toBeInTheDocument();
  });

  it('affiche "Sur devis" pour le plan Enterprise, sans bouton de facturation', () => {
    render(<Pricing />);

    expect(screen.getByText('Sur devis')).toBeInTheDocument();
  });
});
