import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GestionnairesManager } from '@/components/cabinet/gestionnaires-manager';
import type { GestionnaireRow, InvitationRow } from '@/lib/cabinet-data';

// InviteGestionnaire (enfant) appelle useRouter pour rafraichir la page.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const gestionnaires: GestionnaireRow[] = [
  {
    id: 'g1',
    name: 'Alice Martin',
    email: 'alice@cabinet.be',
    status: 'actif',
    reactivatableByCabinet: false,
    createdAt: new Date('2026-09-01T10:00:00Z'),
  },
  {
    id: 'g2',
    name: 'Bob Durand',
    email: 'bob@cabinet.be',
    status: 'suspendu',
    reactivatableByCabinet: true,
    createdAt: new Date('2026-09-02T10:00:00Z'),
  },
];

const invitations: InvitationRow[] = [
  {
    id: 'i1',
    email: 'carl@cabinet.be',
    status: 'pending',
    expiresAt: new Date('2026-10-20T12:00:00Z'),
    createdAt: new Date('2026-10-13T12:00:00Z'),
  },
  {
    id: 'i2',
    email: 'dora@cabinet.be',
    status: 'expired',
    expiresAt: new Date('2026-10-01T12:00:00Z'),
    createdAt: new Date('2026-09-24T12:00:00Z'),
  },
];

describe('GestionnairesManager', () => {
  it('liste les gestionnaires avec leur statut', () => {
    render(<GestionnairesManager gestionnaires={gestionnaires} invitations={[]} archived={[]} />);
    expect(screen.getByText('Alice Martin')).toBeInTheDocument();
    expect(screen.getByText('alice@cabinet.be')).toBeInTheDocument();
    expect(screen.getByText('Actif')).toBeInTheDocument();
    expect(screen.getByText('Suspendu')).toBeInTheDocument();
  });

  it('liste les invitations avec statut et date d echeance', () => {
    render(<GestionnairesManager gestionnaires={[]} invitations={invitations} archived={[]} />);
    expect(screen.getByText('carl@cabinet.be')).toBeInTheDocument();
    expect(screen.getByText('En attente')).toBeInTheDocument();
    expect(screen.getByText('Expire le 20/10/2026')).toBeInTheDocument();
    expect(screen.getByText('Expirée')).toBeInTheDocument();
  });

  it('affiche les etats vides', () => {
    render(<GestionnairesManager gestionnaires={[]} invitations={[]} archived={[]} />);
    expect(screen.getByText(/Aucun gestionnaire pour le moment/)).toBeInTheDocument();
    expect(screen.getByText('Aucune invitation envoyée.')).toBeInTheDocument();
  });

  it('liste les gestionnaires retires avec leur date limite de restauration', () => {
    render(
      <GestionnairesManager
        gestionnaires={[]}
        invitations={[]}
        archived={[
          {
            id: 'a1',
            name: 'Eva Roche',
            email: 'eva@cabinet.be',
            deletedAt: new Date('2026-10-01T10:00:00Z'),
            restorableUntil: new Date('2026-10-31T10:00:00Z'),
          },
        ]}
      />,
    );
    expect(screen.getByText('Gestionnaires retirés')).toBeInTheDocument();
    expect(screen.getByText('Eva Roche')).toBeInTheDocument();
    expect(screen.getByText(/restaurable jusqu'au 31\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restaurer Eva Roche' })).toBeInTheDocument();
  });

  it('masque la section des retires quand il n y en a aucun', () => {
    render(<GestionnairesManager gestionnaires={[]} invitations={[]} archived={[]} />);
    expect(screen.queryByText('Gestionnaires retirés')).not.toBeInTheDocument();
  });

  it('propose le formulaire d invitation', () => {
    render(<GestionnairesManager gestionnaires={[]} invitations={[]} archived={[]} />);
    expect(screen.getByText('Inviter un gestionnaire RH')).toBeInTheDocument();
  });
});
