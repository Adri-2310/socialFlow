import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuditLogList, type AuditLogEntry } from '@/components/admin/audit-log-list';

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

describe('AuditLogList - mode apercu', () => {
  it('limite le nombre de lignes affichees et propose un lien "Voir tout"', () => {
    render(<AuditLogList logs={logsOfLength(15)} limit={10} manageHref="/dashboard/admin/audit" />);

    expect(screen.getAllByText(/a créé son compte/)).toHaveLength(10);
    expect(screen.getByRole('link', { name: 'Voir tout →' })).toHaveAttribute('href', '/dashboard/admin/audit');
    expect(screen.getByText("Journal d'audit global")).toBeInTheDocument();
  });

  it("n'affiche jamais de pagination en mode apercu, meme avec beaucoup d'entrees", () => {
    render(<AuditLogList logs={logsOfLength(40)} limit={10} manageHref="/dashboard/admin/audit" />);
    expect(screen.queryByText(/page \d+ sur \d+/)).not.toBeInTheDocument();
  });

  it("affiche un message d'etat vide si aucun evenement", () => {
    render(<AuditLogList logs={[]} limit={10} manageHref="/dashboard/admin/audit" />);
    expect(screen.getByText('Aucun événement pour le moment.')).toBeInTheDocument();
  });
});

describe('AuditLogList - mode complet', () => {
  it("pagine par 25 et n'affiche pas le suffixe \"global\" dans le titre", () => {
    render(<AuditLogList logs={logsOfLength(30)} />);

    expect(screen.getByText("Journal d'audit")).toBeInTheDocument();
    expect(screen.getAllByText(/a créé son compte/)).toHaveLength(25);
    expect(screen.getByText('Page 1 sur 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));

    expect(screen.getAllByText(/a créé son compte/)).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Suivant' })).toBeDisabled();
  });

  it('ne montre pas de controles de pagination avec 25 entrees ou moins', () => {
    render(<AuditLogList logs={logsOfLength(25)} />);
    expect(screen.queryByText(/Page \d+ sur \d+/)).not.toBeInTheDocument();
  });
});

describe('AuditLogList - formatage des messages', () => {
  it.each([
    ['CABINET_CREATED', 'Alpha', null, '« Alpha » a créé son compte.'],
    ['CABINET_SUSPENDED', 'Alpha', 'Adrien', '« Alpha » a été suspendu par Adrien.'],
    ['CABINET_SUSPENDED', 'Alpha', null, '« Alpha » a été suspendu par un administrateur.'],
    ['CABINET_REACTIVATED', 'Alpha', 'Adrien', '« Alpha » a été réactivé par Adrien.'],
    ['CABINET_REACTIVATED', null, 'Adrien', '« un cabinet supprimé » a été réactivé par Adrien.'],
  ])('formate %s (cabinet=%s, acteur=%s)', (action, cabinetName, actorName, expected) => {
    const log: AuditLogEntry = {
      id: '1',
      action,
      createdAt: new Date().toISOString(),
      actorName,
      cabinetName,
      targetUserName: null,
    };
    render(<AuditLogList logs={[log]} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it.each([
    ['USER_ARCHIVED', 'Julien Lemaire', 'Adrien', /« Julien Lemaire » a été archivé par Adrien \(purge dans \d+ jours\)\./],
    ['USER_RESTORED', 'Julien Lemaire', 'Adrien', '« Julien Lemaire » a été restauré par Adrien.'],
    ['USER_RESTORED', null, 'Adrien', '« un utilisateur supprimé » a été restauré par Adrien.'],
  ])('formate %s (utilisateur=%s, acteur=%s)', (action, targetUserName, actorName, expected) => {
    const log: AuditLogEntry = {
      id: '1',
      action,
      createdAt: new Date().toISOString(),
      actorName,
      cabinetName: null,
      targetUserName,
    };
    render(<AuditLogList logs={[log]} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('retombe sur le code brut pour une action inconnue', () => {
    const log: AuditLogEntry = {
      id: '1',
      action: 'ACTION_INCONNUE',
      createdAt: new Date().toISOString(),
      actorName: null,
      cabinetName: null,
      targetUserName: null,
    };
    render(<AuditLogList logs={[log]} />);
    expect(screen.getByText('ACTION_INCONNUE')).toBeInTheDocument();
  });
});

describe('AuditLogList - horodatage relatif', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('affiche un horodatage relatif coherent avec Intl.RelativeTimeFormat', () => {
    const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
    const log: AuditLogEntry = {
      id: '1',
      action: 'CABINET_CREATED',
      createdAt: new Date('2026-01-01T11:45:00.000Z').toISOString(),
      actorName: null,
      cabinetName: 'Alpha',
      targetUserName: null,
    };
    render(<AuditLogList logs={[log]} />);
    expect(screen.getByText(rtf.format(-15, 'minute'))).toBeInTheDocument();
  });
});
