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
    createdAt: new Date('2026-09-01T10:00:00Z'),
  },
  {
    id: 'g2',
    name: 'Bob Durand',
    email: 'bob@cabinet.be',
    status: 'suspendu',
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
    render(<GestionnairesManager gestionnaires={gestionnaires} invitations={[]} />);
    expect(screen.getByText('Alice Martin')).toBeInTheDocument();
    expect(screen.getByText('alice@cabinet.be')).toBeInTheDocument();
    expect(screen.getByText('Actif')).toBeInTheDocument();
    expect(screen.getByText('Suspendu')).toBeInTheDocument();
  });

  it('liste les invitations avec statut et date d echeance', () => {
    render(<GestionnairesManager gestionnaires={[]} invitations={invitations} />);
    expect(screen.getByText('carl@cabinet.be')).toBeInTheDocument();
    expect(screen.getByText('En attente')).toBeInTheDocument();
    expect(screen.getByText('Expire le 20/10/2026')).toBeInTheDocument();
    expect(screen.getByText('Expirée')).toBeInTheDocument();
  });

  it('affiche les etats vides', () => {
    render(<GestionnairesManager gestionnaires={[]} invitations={[]} />);
    expect(screen.getByText(/Aucun gestionnaire pour le moment/)).toBeInTheDocument();
    expect(screen.getByText('Aucune invitation envoyée.')).toBeInTheDocument();
  });

  it('propose le formulaire d invitation', () => {
    render(<GestionnairesManager gestionnaires={[]} invitations={[]} />);
    expect(screen.getByText('Inviter un gestionnaire RH')).toBeInTheDocument();
  });
});
