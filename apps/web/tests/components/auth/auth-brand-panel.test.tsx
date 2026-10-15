import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthBrandPanel } from '@/components/auth/auth-brand-panel';

describe('AuthBrandPanel', () => {
  it('garde l identite SocialFlow par defaut', () => {
    render(<AuthBrandPanel title="Bienvenue" description="Description" quote="Une citation" />);

    expect(screen.getByAltText('SocialFlow')).toBeInTheDocument();
    expect(screen.getByText('Conforme ONSS, DIMONA & RGPD')).toBeInTheDocument();
    expect(screen.getByText('Une citation')).toBeInTheDocument();
  });

  it('prend le nom, le logo et la couleur du cabinet', () => {
    const { container } = render(
      <AuthBrandPanel
        title="Rejoignez"
        description="Description"
        quote="Une citation"
        brand={{ name: 'Alicia Cabinet', primaryColor: '#008734', logoUrl: 'https://blob.test/logo.png' }}
      />,
    );

    expect(screen.getByText('Alicia Cabinet')).toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://blob.test/logo.png');
    expect(screen.getByText('Propulsé par SocialFlow')).toBeInTheDocument();
    // Plus de logo SocialFlow, de promesses de la plateforme ni de citation.
    expect(screen.queryByAltText('SocialFlow')).not.toBeInTheDocument();
    expect(screen.queryByText('Conforme ONSS, DIMONA & RGPD')).not.toBeInTheDocument();
    expect(screen.queryByText('Une citation')).not.toBeInTheDocument();
    expect(container.querySelector('aside')?.getAttribute('style')).toContain('rgb(0, 135, 52)');
  });

  it('affiche seulement le nom quand le cabinet n a ni logo ni couleur', () => {
    const { container } = render(
      <AuthBrandPanel
        title="Rejoignez"
        description="Description"
        brand={{ name: 'Cabinet Dupont', primaryColor: null, logoUrl: null }}
      />,
    );

    expect(screen.getByText('Cabinet Dupont')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('aside')?.getAttribute('style')).toBeNull();
  });
});
