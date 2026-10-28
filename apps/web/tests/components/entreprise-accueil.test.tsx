import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EntrepriseAccueil } from '@/components/entreprise/entreprise-accueil';

// Accueil du portail Entreprise : son nom, son cabinet, et l'état de l'espace (D29, D71).
const rendre = (props: Partial<React.ComponentProps<typeof EntrepriseAccueil>> = {}) =>
  render(
    <EntrepriseAccueil
      userName="Marie Client"
      entrepriseName="Zénith SPRL"
      cabinetName="Cabinet Alicia"
      readOnly={false}
      archivee={false}
      {...props}
    />,
  );

const LECTURE_SEULE = /Votre espace est en lecture seule/;
const ARCHIVEE = /Cette entreprise a été archivée par votre cabinet/;

describe('EntrepriseAccueil', () => {
  it('affiche le nom de l’entreprise et le cabinet qui gère la paie', () => {
    rendre();

    expect(screen.getByRole('heading', { name: 'Zénith SPRL' })).toBeInTheDocument();
    expect(screen.getByText('Votre paie est gérée par Cabinet Alicia.')).toBeInTheDocument();
    expect(screen.getByText(/Votre espace est en cours de construction/)).toBeInTheDocument();
  });

  it('espace normal : aucun message d’état', () => {
    rendre();

    expect(screen.queryByText(LECTURE_SEULE)).not.toBeInTheDocument();
    expect(screen.queryByText(ARCHIVEE)).not.toBeInTheDocument();
  });

  it('cabinet en lecture seule : le dit, sans donner de raison commerciale', () => {
    rendre({ readOnly: true });

    expect(screen.getByText(LECTURE_SEULE)).toBeInTheDocument();
    expect(screen.queryByText(ARCHIVEE)).not.toBeInTheDocument();
    expect(screen.queryByText(/impay|résili|suspen/i)).not.toBeInTheDocument();
  });

  it('entreprise archivée : le dit', () => {
    rendre({ archivee: true });

    expect(screen.getByText(ARCHIVEE)).toBeInTheDocument();
    expect(screen.queryByText(LECTURE_SEULE)).not.toBeInTheDocument();
  });

  it('archivée dans un cabinet en lecture seule : seul le message d’archivage apparaît', () => {
    rendre({ archivee: true, readOnly: true });

    expect(screen.getByText(ARCHIVEE)).toBeInTheDocument();
    expect(screen.queryByText(LECTURE_SEULE)).not.toBeInTheDocument();
  });

  it('sans entreprise rattachée : accueille la personne et renvoie vers le cabinet', () => {
    rendre({ entrepriseName: null, cabinetName: undefined });

    expect(screen.getByRole('heading', { name: 'Bienvenue, Marie Client' })).toBeInTheDocument();
    expect(screen.getByText(/n’est rattaché à aucune entreprise/)).toBeInTheDocument();
    expect(screen.queryByText(/Votre paie est gérée/)).not.toBeInTheDocument();
  });

  it('annonce l’état de l’espace aux lecteurs d’écran', () => {
    const { unmount } = rendre({ readOnly: true });
    expect(screen.getByRole('status')).toHaveTextContent(LECTURE_SEULE);
    unmount();

    rendre({ archivee: true });
    expect(screen.getByRole('status')).toHaveTextContent(ARCHIVEE);
  });
});
