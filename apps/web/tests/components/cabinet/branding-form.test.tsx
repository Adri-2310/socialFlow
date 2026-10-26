import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrandingForm } from '@/components/cabinet/branding-form';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const empty = { displayName: null, primaryColor: null, secondaryColor: null };

beforeEach(() => refresh.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe('BrandingForm', () => {
  it('propose la raison sociale comme nom par defaut', () => {
    render(<BrandingForm branding={empty} cabinetName="Cabinet Dupont" readOnly={false} />);

    expect(screen.getByLabelText('Nom affiché')).toHaveAttribute('placeholder', 'Cabinet Dupont');
    expect(screen.getByLabelText('Couleur principale')).toHaveAttribute('placeholder', '#4f46e5');
  });

  it('refuse en direct une couleur illisible et propose une teinte plus foncee', () => {
    render(<BrandingForm branding={empty} cabinetName="Cabinet" readOnly={false} />);

    fireEvent.change(screen.getByLabelText('Couleur principale'), { target: { value: '#00c49f' } });

    expect(screen.getByRole('alert')).toHaveTextContent(/Contraste insuffisant/);
    expect(screen.getByRole('button', { name: 'Utiliser cette teinte' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Utiliser cette teinte' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  });

  it('relie l erreur de contraste au champ de couleur, avec la suggestion dans le message', () => {
    render(<BrandingForm branding={empty} cabinetName="Cabinet" readOnly={false} />);

    const field = screen.getByLabelText('Couleur principale');
    fireEvent.change(field, { target: { value: '#00c49f' } });

    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(/Contraste insuffisant/);
    // La couleur secondaire, valide, n est pas marquée en erreur.
    expect(screen.getByLabelText('Couleur secondaire')).not.toHaveAttribute('aria-invalid');
  });

  it('garde un sélecteur de couleur natif nommé pour chaque couleur', () => {
    render(<BrandingForm branding={empty} cabinetName="Cabinet" readOnly={false} />);

    expect(screen.getByLabelText('Couleur principale (sélecteur)')).toHaveAttribute('type', 'color');
    expect(screen.getByLabelText('Couleur secondaire (sélecteur)')).toHaveAttribute('type', 'color');
  });

  it('envoie le branding et confirme', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<BrandingForm branding={empty} cabinetName="Cabinet" readOnly={false} />);

    fireEvent.change(screen.getByLabelText('Nom affiché'), { target: { value: 'Mon Cabinet' } });
    fireEvent.change(screen.getByLabelText('Couleur principale'), { target: { value: '#1e3a8a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Identité visuelle enregistrée');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cabinet/settings/branding',
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      displayName: 'Mon Cabinet',
      primaryColor: '#1e3a8a',
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('retablit les valeurs par defaut dans le formulaire', () => {
    render(
      <BrandingForm
        branding={{ displayName: 'Mon Cabinet', primaryColor: '#1e3a8a', secondaryColor: '#f59e0b' }}
        cabinetName="Cabinet"
        readOnly={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Rétablir les valeurs par défaut/ }));

    expect(screen.getByLabelText('Nom affiché')).toHaveValue('');
    expect(screen.getByLabelText('Couleur principale')).toHaveValue('');
  });

  it('en lecture seule : champs desactives et pas de bouton', () => {
    render(<BrandingForm branding={empty} cabinetName="Cabinet" readOnly />);

    expect(screen.getByLabelText('Nom affiché')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument();
  });
});
