import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MonitoringSummary } from '@/components/admin/monitoring-summary';

describe('MonitoringSummary', () => {
  it('affiche la latence, le statut "Opérationnelle" et distingue sessions/utilisateurs actifs', () => {
    render(
      <MonitoringSummary data={{ db: { healthy: true, latencyMs: 42 }, activeSessions: 7, activeUsers: 3 }} />,
    );

    expect(screen.getByText('42 ms')).toBeInTheDocument();
    expect(screen.getByText('Opérationnelle')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Sessions actives')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Utilisateurs actifs')).toBeInTheDocument();
  });

  it('affiche "Indisponible" et un tiret quand la base est en echec', () => {
    render(
      <MonitoringSummary data={{ db: { healthy: false, latencyMs: null }, activeSessions: 0, activeUsers: 0 }} />,
    );

    expect(screen.getByText('Indisponible')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('affiche le lien "Voir le monitoring complet" seulement si manageHref est fourni', () => {
    const { rerender } = render(
      <MonitoringSummary data={{ db: { healthy: true, latencyMs: 10 }, activeSessions: 1, activeUsers: 1 }} />,
    );
    expect(screen.queryByRole('link', { name: /Voir le monitoring complet/ })).not.toBeInTheDocument();

    rerender(
      <MonitoringSummary
        data={{ db: { healthy: true, latencyMs: 10 }, activeSessions: 1, activeUsers: 1 }}
        manageHref="/dashboard/admin/monitoring"
      />,
    );
    expect(screen.getByRole('link', { name: /Voir le monitoring complet/ })).toHaveAttribute(
      'href',
      '/dashboard/admin/monitoring',
    );
  });
});
