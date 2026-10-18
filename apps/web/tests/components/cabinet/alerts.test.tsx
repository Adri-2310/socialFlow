import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CabinetAlerts } from '@/components/cabinet/alerts';
import type { CabinetAlert } from '@/lib/cabinet-alerts';

const alerts: CabinetAlert[] = [
  {
    id: 'a',
    level: 'danger',
    title: "Quota de gestionnaires atteint",
    description: 'Vous utilisez 3 sur 3.',
    href: '/dashboard/cabinet/gestionnaires',
  },
  {
    id: 'b',
    level: 'info',
    title: 'Invitez votre premier gestionnaire',
    description: 'Seul un gestionnaire peut préparer les fiches.',
  },
];

describe('CabinetAlerts', () => {
  it('affiche chaque alerte avec son titre, sa description et le compteur', () => {
    render(<CabinetAlerts alerts={alerts} />);

    expect(screen.getByText("Quota de gestionnaires atteint")).toBeInTheDocument();
    expect(screen.getByText('Vous utilisez 3 sur 3.')).toBeInTheDocument();
    expect(screen.getByText('(2)')).toBeInTheDocument();
  });

  it('propose le lien Voir uniquement quand l alerte en a un', () => {
    render(<CabinetAlerts alerts={alerts} />);

    const links = screen.getAllByRole('link', { name: 'Voir' });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/dashboard/cabinet/gestionnaires');
  });

  it('confirme l absence d alerte', () => {
    render(<CabinetAlerts alerts={[]} />);
    expect(screen.getByText('Aucune alerte : tout est en ordre.')).toBeInTheDocument();
  });
});
