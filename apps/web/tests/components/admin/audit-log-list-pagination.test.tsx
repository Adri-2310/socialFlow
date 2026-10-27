import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuditLogList, type AuditLogEntry } from '@/components/admin/audit-log-list';

// Pagination du journal d'audit SuperAdmin (25 événements par page).
function logsOfLength(count: number): AuditLogEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `l${i}`,
    action: 'CABINET_CREATED',
    createdAt: new Date(2026, 0, 1, 0, i).toISOString(),
    actorName: null,
    cabinetName: `Cabinet ${i}`,
    targetUserName: null,
  }));
}

describe('AuditLogList : pagination', () => {
  it('sur la première page, « Précédent » est désactivé et « Suivant » actif', () => {
    render(<AuditLogList logs={logsOfLength(60)} />);

    expect(screen.getByText('Page 1 sur 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Précédent' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Suivant' })).toBeEnabled();
  });

  it('« Précédent » revient à la page d’avant', () => {
    render(<AuditLogList logs={logsOfLength(60)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(screen.getByText('Page 2 sur 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Précédent' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }));

    expect(screen.getByText('Page 1 sur 3')).toBeInTheDocument();
  });

  it('sur la dernière page, « Suivant » est désactivé et il reste le reste des événements', () => {
    render(<AuditLogList logs={logsOfLength(60)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));

    expect(screen.getByText('Page 3 sur 3')).toBeInTheDocument();
    expect(screen.getAllByText(/a créé son compte/)).toHaveLength(10);
    expect(screen.getByRole('button', { name: 'Suivant' })).toBeDisabled();
  });
});
