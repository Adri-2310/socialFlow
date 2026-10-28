import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SalarieSortie } from '@/components/gestionnaire/salarie-sortie';

// Date de sortie d'un salarié (roles/03 § 4.2) : enregistrer, corriger ou effacer.
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn();

beforeEach(() => {
  refresh.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const reponse = (status: number, body: unknown) => ({
  ok: status < 400,
  status,
  json: async () => body,
});

function rendre(props: Partial<React.ComponentProps<typeof SalarieSortie>> = {}) {
  return render(<SalarieSortie salarieId="s1" dateSortie="" readOnly={false} {...props} />);
}

const champ = () => screen.getByLabelText('Dernier jour de travail');

describe('SalarieSortie', () => {
  it('propose d’enregistrer la sortie, ou de la modifier si elle existe', () => {
    const { unmount } = rendre();
    expect(screen.getByRole('button', { name: 'Enregistrer la sortie' })).toBeInTheDocument();
    unmount();

    rendre({ dateSortie: '2026-10-31' });
    expect(screen.getByRole('button', { name: 'Modifier la sortie' })).toBeInTheDocument();
  });

  it('est désactivé en lecture seule, avec la raison', () => {
    rendre({ readOnly: true });

    const bouton = screen.getByRole('button', { name: 'Enregistrer la sortie' });
    expect(bouton).toBeDisabled();
    expect(bouton).toHaveAttribute('title', 'Votre cabinet est en lecture seule.');
  });

  it('ouvre une boîte de dialogue avec la date actuelle et son explication', async () => {
    rendre({ dateSortie: '2026-10-31' });

    await userEvent.click(screen.getByRole('button', { name: 'Modifier la sortie' }));

    expect(screen.getByRole('dialog', { name: 'Modifier la sortie' })).toBeInTheDocument();
    expect(champ()).toHaveValue('2026-10-31');
    expect(champ()).toHaveAttribute('type', 'date');
    expect(screen.getByText(/pas avant l’entrée du salarié/)).toBeInTheDocument();
    expect(screen.getByText(/La déclaration DIMONA de sortie/)).toBeInTheDocument();
  });

  it('enregistre la date de sortie, rafraîchit et se ferme', async () => {
    fetchMock.mockResolvedValue(reponse(200, { success: true }));
    rendre();

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la sortie' }));
    fireEvent.change(champ(), { target: { value: '2026-10-31' } });
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/salaries/s1/sortie', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dateSortie: '2026-10-31' }),
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('refuse sans envoi une date manquante', async () => {
    rendre();

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la sortie' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await screen.findByText('Date de sortie invalide.')).toBeInTheDocument();
  });

  it('efface la sortie existante en envoyant null', async () => {
    fetchMock.mockResolvedValue(reponse(200, { success: true }));
    rendre({ dateSortie: '2026-10-31' });

    await userEvent.click(screen.getByRole('button', { name: 'Modifier la sortie' }));
    await userEvent.click(screen.getByRole('button', { name: 'Effacer la sortie' }));

    expect(fetchMock.mock.calls[0][0]).toBe('/api/salaries/s1/sortie');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ dateSortie: null });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('n’offre pas d’effacement quand aucune sortie n’est enregistrée', async () => {
    rendre();

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la sortie' }));

    expect(screen.queryByRole('button', { name: 'Effacer la sortie' })).not.toBeInTheDocument();
  });

  it('explique une date refusée par le serveur, et reste ouvert', async () => {
    fetchMock.mockResolvedValue(
      reponse(400, { error: 'INVALID_REQUEST', fields: { dateSortie: 'DATE_SORTIE_OUT_OF_RANGE' } }),
    );
    rendre();

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la sortie' }));
    fireEvent.change(champ(), { target: { value: '2020-01-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('La date de sortie ne peut pas précéder la date d’entrée.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('explique une erreur générale du serveur, puis une panne réseau', async () => {
    fetchMock.mockResolvedValueOnce(reponse(423, { error: 'CABINET_READ_ONLY' }));
    rendre();

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la sortie' }));
    fireEvent.change(champ(), { target: { value: '2026-10-31' } });
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText(/lecture seule/)).toBeInTheDocument();

    fetchMock.mockRejectedValueOnce(new Error('réseau'));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Une erreur est survenue. Veuillez réessayer.')).toBeInTheDocument();
  });

  it('Annuler referme et rétablit la date enregistrée à la réouverture', async () => {
    rendre({ dateSortie: '2026-10-31' });

    await userEvent.click(screen.getByRole('button', { name: 'Modifier la sortie' }));
    fireEvent.change(champ(), { target: { value: '2026-12-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Modifier la sortie' }));
    expect(champ()).toHaveValue('2026-10-31');
  });

  it('désactive le champ et les boutons pendant l’envoi', async () => {
    let finish: (value: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    rendre({ dateSortie: '2026-10-31' });

    await userEvent.click(screen.getByRole('button', { name: 'Modifier la sortie' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(champ()).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Effacer la sortie' })).toBeDisabled();
    finish(reponse(200, { success: true }));
  });
});
