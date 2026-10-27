import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EtatPeriodeBadge } from '@/components/gestionnaire/etat-periode-badge';
import { SortieBadge } from '@/components/gestionnaire/sortie-badge';

// Pastilles du gestionnaire : situation d'un salarié (roles/03 § 4.2) et état de la période du
// mois dans le tableau de bord (D93).
const at = new Date('2026-10-15T10:00:00Z');
const jour = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('SortieBadge', () => {
  it('« En poste » sans date de sortie, en texte simple', () => {
    render(<SortieBadge dateEntree={jour('2024-01-01')} dateSortie={null} at={at} />);

    expect(screen.getByText('En poste')).toBeInTheDocument();
  });

  it('« Entre le … » quand l’entrée est dans le futur', () => {
    render(<SortieBadge dateEntree={jour('2026-12-01')} dateSortie={null} at={at} />);

    expect(screen.getByText('Entre le 01/12/2026')).toBeInTheDocument();
  });

  it('« Sort le … » quand la sortie est aujourd’hui ou à venir', () => {
    render(<SortieBadge dateEntree={jour('2024-01-01')} dateSortie={jour('2026-10-31')} at={at} />);

    expect(screen.getByText('Sort le 31/10/2026')).toBeInTheDocument();
  });

  it('« Sorti le … » quand la sortie est passée', () => {
    render(<SortieBadge dateEntree={jour('2024-01-01')} dateSortie={jour('2026-09-30')} at={at} />);

    expect(screen.getByText('Sorti le 30/09/2026')).toBeInTheDocument();
  });

  it('sans date d’entrée, seule la sortie compte', () => {
    render(<SortieBadge dateSortie={null} at={at} />);

    expect(screen.getByText('En poste')).toBeInTheDocument();
  });
});

describe('EtatPeriodeBadge', () => {
  it('période non ouverte', () => {
    render(<EtatPeriodeBadge etat={{ kind: 'NON_OUVERTE' }} />);

    expect(screen.getByText('Période non ouverte')).toBeInTheDocument();
  });

  it('prestations attendues avant la date limite', () => {
    render(
      <EtatPeriodeBadge etat={{ kind: 'EN_ATTENTE', periodeId: 'p1', dateLimite: '2026-10-10' }} />,
    );

    expect(screen.getByText(/Prestations avant le 10\/10\/2026/)).toBeInTheDocument();
  });

  it('date limite dépassée', () => {
    render(
      <EtatPeriodeBadge etat={{ kind: 'EN_RETARD', periodeId: 'p1', dateLimite: '2026-10-10' }} />,
    );

    expect(screen.getByText(/Date limite dépassée \(10\/10\/2026\)/)).toBeInTheDocument();
  });

  it('prestations verrouillées', () => {
    render(
      <EtatPeriodeBadge
        etat={{ kind: 'VERROUILLEE', periodeId: 'p1', dateLimite: '2026-10-10' }}
      />,
    );

    expect(screen.getByText('Prestations verrouillées')).toBeInTheDocument();
  });
});
