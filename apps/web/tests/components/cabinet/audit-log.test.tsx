import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CabinetAuditLog } from '@/components/cabinet/audit-log';
import type { CabinetAuditPage } from '@/lib/cabinet-audit';

const base: CabinetAuditPage = {
  total: 2,
  page: 1,
  pageCount: 1,
  entries: [
    {
      id: 'e1',
      action: 'USER_SUSPENDED',
      createdAt: new Date('2026-10-13T10:30:00Z'),
      actorLabel: 'Titulaire',
      message: 'Alice Martin a été suspendu',
    },
    {
      id: 'e2',
      action: 'USER_REACTIVATED',
      createdAt: new Date('2026-10-12T08:00:00Z'),
      actorLabel: 'Administration SocialFlow',
      message: 'Alice Martin a été réactivé',
    },
  ],
};

const users = [
  { id: 'u1', name: 'Alice Martin' },
  { id: 'u2', name: 'Titulaire' },
];

function renderLog(overrides: Partial<Parameters<typeof CabinetAuditLog>[0]> = {}) {
  return render(
    <CabinetAuditLog
      data={base}
      filters={{}}
      users={users}
      basePath="/dashboard/cabinet/audit"
      {...overrides}
    />,
  );
}

describe('CabinetAuditLog', () => {
  it('liste les evenements avec leur auteur et l heure de Bruxelles', () => {
    renderLog();

    expect(screen.getByText('Alice Martin a été suspendu')).toBeInTheDocument();
    expect(screen.getByText('par Titulaire')).toBeInTheDocument();
    expect(screen.getByText('par Administration SocialFlow')).toBeInTheDocument();
    // 10:30 UTC = 12:30 a Bruxelles en octobre (heure d'ete).
    expect(screen.getByText('13/10/2026 à 12:30')).toBeInTheDocument();
    expect(screen.getByText('2 événements')).toBeInTheDocument();
  });

  it('propose les filtres et conserve les valeurs choisies', () => {
    renderLog({ filters: { action: 'USER_SUSPENDED', userId: 'u1', from: '2026-10-01', to: '2026-10-31' } });

    expect(screen.getByLabelText('Action')).toHaveValue('USER_SUSPENDED');
    expect(screen.getByLabelText('Personne')).toHaveValue('u1');
    expect(screen.getByLabelText('Du')).toHaveValue('2026-10-01');
    expect(screen.getByLabelText('Au')).toHaveValue('2026-10-31');
    expect(screen.getByRole('link', { name: 'Réinitialiser' })).toHaveAttribute(
      'href',
      '/dashboard/cabinet/audit',
    );
  });

  it('n affiche pas Reinitialiser sans filtre', () => {
    renderLog();
    expect(screen.queryByRole('link', { name: 'Réinitialiser' })).not.toBeInTheDocument();
  });

  it('distingue l absence totale d evenement de l absence de resultat', () => {
    const empty = { ...base, total: 0, entries: [] };
    const { rerender } = renderLog({ data: empty });
    expect(screen.getByText('Aucun événement pour le moment.')).toBeInTheDocument();

    rerender(
      <CabinetAuditLog
        data={empty}
        filters={{ action: 'USER_SUSPENDED' }}
        users={users}
        basePath="/dashboard/cabinet/audit"
      />,
    );
    expect(screen.getByText('Aucun événement ne correspond à ces filtres.')).toBeInTheDocument();
  });

  it('pagine en conservant les filtres dans les liens', () => {
    renderLog({
      data: { ...base, total: 60, page: 2, pageCount: 3 },
      filters: { action: 'USER_SUSPENDED', userId: 'u1' },
    });

    expect(screen.getByText('Page 2 sur 3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Précédent' })).toHaveAttribute(
      'href',
      '/dashboard/cabinet/audit?action=USER_SUSPENDED&user=u1',
    );
    expect(screen.getByRole('link', { name: 'Suivant' })).toHaveAttribute(
      'href',
      '/dashboard/cabinet/audit?action=USER_SUSPENDED&user=u1&page=3',
    );
  });
});
