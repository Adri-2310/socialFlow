import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IdentityForm } from '@/components/cabinet/identity-form';
import type { CabinetIdentity } from '@/lib/cabinet/cabinet-identity';
import type { CountryOption } from '@/lib/countries';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const countries: CountryOption[] = [
  { code: 'BE', name: 'Belgique' },
  { code: 'FR', name: 'France' },
  { code: 'CH', name: 'Suisse' },
];

const identity: CabinetIdentity = {
  name: 'Cabinet Dupont',
  vatNumber: null,
  addressLine: null,
  postalCode: null,
  city: null,
  country: 'BE',
  contactEmail: null,
  contactPhone: null,
};

beforeEach(() => refresh.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe('IdentityForm', () => {
  it('pre-remplit les champs avec l identite actuelle', () => {
    render(<IdentityForm identity={{ ...identity, city: 'Namur' }} countries={countries} readOnly={false} />);

    expect(screen.getByLabelText('Raison sociale')).toHaveValue('Cabinet Dupont');
    expect(screen.getByLabelText('Ville')).toHaveValue('Namur');
    expect(screen.getByLabelText('Pays')).toHaveValue('BE');
  });

  it('propose les pays recus du serveur dans une liste deroulante', () => {
    render(<IdentityForm identity={identity} countries={countries} readOnly={false} />);

    const select = screen.getByLabelText('Pays') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(select.options[0].textContent).toBe('Belgique');
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['BE', 'FR', 'CH']);
  });

  it('envoie le formulaire, affiche la confirmation et reprend la forme canonique', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ identity: { ...identity, vatNumber: 'BE0123.456.749' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<IdentityForm identity={identity} countries={countries} readOnly={false} />);

    fireEvent.change(screen.getByLabelText(/N° de TVA/), { target: { value: 'be 0123 456 749' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Informations enregistrées');
    expect(screen.getByLabelText(/N° de TVA/)).toHaveValue('BE0123.456.749');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cabinet/settings/identity',
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it('affiche l erreur du serveur sous le bon champ', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'INVALID_REQUEST', fields: { vatNumber: 'INVALID_VAT' } }),
      }),
    );
    render(<IdentityForm identity={identity} countries={countries} readOnly={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(screen.getByText(/N° de TVA belge invalide/)).toBeInTheDocument(),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it('relie l erreur du serveur à son champ pour les lecteurs d ecran', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'INVALID_REQUEST', fields: { vatNumber: 'INVALID_VAT' } }),
      }),
    );
    render(<IdentityForm identity={identity} countries={countries} readOnly={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    const field = await screen.findByLabelText(/N° de TVA/);
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
    expect(field).toHaveAccessibleDescription(/N° de TVA belge invalide/);
    // Les champs sans erreur ne sont pas marqués invalides.
    expect(screen.getByLabelText('Ville')).not.toHaveAttribute('aria-invalid');
  });

  it('décrit le champ par son aide tant qu il n y a pas d erreur', () => {
    render(<IdentityForm identity={identity} countries={countries} readOnly={false} />);

    expect(screen.getByLabelText(/N° de TVA/)).toHaveAccessibleDescription(
      'Format belge : BE0123.456.749',
    );
  });

  it('en lecture seule : champs desactives, pas de bouton, explication', () => {
    render(<IdentityForm identity={identity} countries={countries} readOnly />);

    expect(screen.getByLabelText('Raison sociale')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument();
    expect(screen.getByText(/lecture seule/)).toBeInTheDocument();
  });
});
