import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GestionnaireRestore } from '@/components/cabinet/gestionnaire-restore';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn();

beforeEach(() => {
  refresh.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('GestionnaireRestore', () => {
  it('restaure via PUT puis rafraichit la page', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    render(<GestionnaireRestore gestionnaireId="g1" name="Alice Martin" />);

    await userEvent.click(screen.getByRole('button', { name: 'Restaurer Alice Martin' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/gestionnaires/g1', { method: 'PUT' });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('affiche un message quand le delai est depasse', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'RESTORE_WINDOW_EXPIRED' }),
    });
    render(<GestionnaireRestore gestionnaireId="g1" name="Alice Martin" />);

    await userEvent.click(screen.getByRole('button', { name: 'Restaurer Alice Martin' }));

    expect(await screen.findByText(/délai de restauration est dépassé/)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
