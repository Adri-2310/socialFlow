import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FAQ } from '@/components/landing/faq';

// Compléments au test de la FAQ : catégories, une question par bouton, parcours au clavier.
vi.mock('framer-motion');

describe('FAQ : structure', () => {
  it('regroupe les questions en trois catégories', () => {
    render(<FAQ />);

    for (const titre of ['Conformité & sécurité', 'Tarifs & facturation', 'Support & migration']) {
      expect(screen.getByRole('heading', { level: 2, name: titre })).toBeInTheDocument();
    }
  });

  it('chaque question est un bouton, 8 au total, toutes repliées au départ', () => {
    render(<FAQ />);

    const questions = screen.getAllByRole('button');
    expect(questions).toHaveLength(8);
    expect(screen.queryByText(/Les calculs de cotisations ONSS/)).not.toBeInTheDocument();
  });
});

describe('FAQ : parcours', () => {
  it('s’ouvre et se referme au clavier (Entrée)', async () => {
    render(<FAQ />);
    const question = screen.getByRole('button', { name: /conforme à la législation/ });

    question.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByText(/Les calculs de cotisations ONSS/)).toBeInTheDocument();

    await userEvent.keyboard('{Enter}');
    expect(screen.queryByText(/Les calculs de cotisations ONSS/)).not.toBeInTheDocument();
  });

  it('ouvre une question d’une autre catégorie en refermant celle de la première', async () => {
    render(<FAQ />);

    await userEvent.click(screen.getByRole('button', { name: /conforme à la législation/ }));
    await userEvent.click(screen.getByRole('button', { name: /Puis-je migrer mes clients/ }));

    expect(screen.queryByText(/Les calculs de cotisations ONSS/)).not.toBeInTheDocument();
    expect(screen.getByText(/L'import CSV\/Excel/)).toBeInTheDocument();
  });
});

describe('FAQ : accessibilité', () => {
  it('annonce l’état avec aria-expanded et relie la question à sa réponse', async () => {
    render(<FAQ />);
    const question = screen.getByRole('button', { name: /conforme à la législation/ });
    expect(question).toHaveAttribute('aria-expanded', 'false');
    expect(question).not.toHaveAttribute('aria-controls');

    await userEvent.click(question);

    expect(question).toHaveAttribute('aria-expanded', 'true');
    const reponse = screen.getByRole('region', { name: /conforme à la législation/ });
    expect(question).toHaveAttribute('aria-controls', reponse.id);
    expect(reponse).toHaveTextContent(/Les calculs de cotisations ONSS/);
  });
});
