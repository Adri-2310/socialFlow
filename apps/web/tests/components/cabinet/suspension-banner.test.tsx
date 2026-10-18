import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SuspensionBanner } from '@/components/cabinet/suspension-banner';

describe('SuspensionBanner (D71)', () => {
  it('ne montre rien quand le cabinet n est pas suspendu', () => {
    const { container } = render(<SuspensionBanner suspended={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('explique la lecture seule et renvoie vers le support, sans donner de motif', () => {
    render(<SuspensionBanner suspended />);

    expect(screen.getByText('Compte suspendu par SocialFlow')).toBeInTheDocument();
    expect(screen.getByText(/plus rien ne peut être modifié/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Contacter le support' })).toHaveAttribute('href', '/contact');
  });
});
