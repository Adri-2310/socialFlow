import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PeriodeActions } from '@/components/gestionnaire/periode-actions';

// Emplacement d'erreur de la confirmation : le message doit vivre dans la boîte, sinon la modale
// le rend inerte pour les lecteurs d'écran.
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn();
beforeEach(() => {
  refresh.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('ConfirmDialog : erreur', () => {
  const props = {
    title: 'Archiver l’entreprise ?',
    description: 'Elle ne sera plus visible.',
    confirmLabel: 'Archiver',
    onCancel: () => {},
    onConfirm: () => {},
  };

  it('n’affiche aucune alerte sans erreur', async () => {
    render(<ConfirmDialog {...props} />);
    await screen.findByRole('alertdialog');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('affiche l’erreur dans la boîte, sous forme d’alerte', async () => {
    render(<ConfirmDialog {...props} error="Ces prestations sont déjà verrouillées." />);

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Ces prestations sont déjà verrouillées.',
    );
  });

  it('garde les boutons actifs pour réessayer ou annuler', async () => {
    render(<ConfirmDialog {...props} error="Échec." />);

    expect(await screen.findByRole('button', { name: 'Archiver' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeEnabled();
  });
});

describe('PeriodeActions : échec du verrouillage', () => {
  it('affiche l’erreur dans la confirmation et non à l’extérieur', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'PERIODE_ALREADY_LOCKED' }),
    });
    render(
      <PeriodeActions
        periodeId="p1"
        verrouillee={false}
        dateLimite="2026-10-10"
        readOnly={false}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Verrouiller/ }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Verrouiller' }));

    const alerte = await within(dialog).findByRole('alert');
    expect(alerte).toHaveTextContent('Ces prestations sont déjà verrouillées.');
    expect(refresh).not.toHaveBeenCalled();
  });
});
