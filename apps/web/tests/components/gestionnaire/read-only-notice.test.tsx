import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReadOnlyNotice } from '@/components/gestionnaire/read-only-notice';

// Message du gestionnaire quand son cabinet est en lecture seule (D29, D71) : aucune raison
// commerciale n'est donnée, le gestionnaire est renvoyé vers son cabinet.
describe('ReadOnlyNotice', () => {
  it('n’affiche rien quand le cabinet n’est pas en lecture seule', () => {
    render(<ReadOnlyNotice readOnly={false} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('annonce la lecture seule et renvoie vers le cabinet, sans raison commerciale', () => {
    render(<ReadOnlyNotice readOnly />);

    const message = screen.getByRole('status');
    expect(message).toHaveTextContent('Espace en lecture seule');
    expect(message).toHaveTextContent('Contactez votre cabinet');
    expect(message).not.toHaveTextContent(/impay|abonnement|suspen/i);
    expect(message).toHaveAttribute('data-tone', 'danger');
  });
});
