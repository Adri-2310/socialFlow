import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrestationEncoder } from '@/components/gestionnaire/prestation-encoder';
import type { PrestationInput } from '@/lib/schemas/prestation';

// Compléments à periodes.test.tsx (envoi des écarts, validation, effacement, erreurs serveur) :
// boîte de dialogue, champs, annulation, panne réseau, envoi en cours.
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
const corps = (appel = 0) => JSON.parse(fetchMock.mock.calls[appel][1].body);

const existante: PrestationInput = {
  heuresPresteesMinutes: null,
  congeDemiJours: 3,
  maladieDemiJours: 0,
  ferieDemiJours: 0,
  absenceNonRemDemiJours: 0,
  heuresSupMinutes: 90,
  primeCents: null,
  primeLibelle: null,
};

const rendre = (props: Partial<React.ComponentProps<typeof PrestationEncoder>> = {}) =>
  render(
    <PrestationEncoder
      periodeId="p1"
      annee={2026}
      mois={11}
      salarieId="s1"
      salarieNom="Marie Dupont"
      initial={null}
      bloque={null}
      {...props}
    />,
  );
const ouvrir = () =>
  userEvent.click(screen.getByRole('button', { name: 'Encoder les prestations de Marie Dupont' }));

describe('PrestationEncoder : dialogue', () => {
  it('ouvre une boîte de dialogue nommée d’après le salarié, avec son explication', async () => {
    rendre();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await ouvrir();

    expect(screen.getByRole('dialog', { name: 'Prestations de Marie Dupont' })).toBeInTheDocument();
    expect(screen.getByText(/Saisissez seulement les écarts/)).toBeInTheDocument();
  });

  it('propose les huit champs, avec leur aide', async () => {
    rendre();
    await ouvrir();

    for (const label of [
      'Congé (jours)',
      'Maladie (jours)',
      'Jours fériés (jours)',
      'Absence non rémunérée (jours)',
      'Heures prestées',
      'Heures supplémentaires',
      'Prime (€)',
      'Libellé de la prime',
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('Par pas de 0,5 (une demi-journée).')).toBeInTheDocument();
    expect(screen.getByText(/Ex\. 152:30 ou 152,5/)).toBeInTheDocument();
    expect(screen.getByLabelText('Libellé de la prime')).toHaveAttribute('maxlength', '60');
  });

  it('envoie tous les écarts convertis en entiers', async () => {
    fetchMock.mockResolvedValue(reponse(200, { success: true, changed: true }));
    rendre();
    await ouvrir();

    await userEvent.type(screen.getByLabelText('Congé (jours)'), '1');
    await userEvent.type(screen.getByLabelText('Maladie (jours)'), '2');
    await userEvent.type(screen.getByLabelText('Jours fériés (jours)'), '0,5');
    await userEvent.type(screen.getByLabelText('Absence non rémunérée (jours)'), '1,5');
    await userEvent.type(screen.getByLabelText('Heures prestées'), '152:30');
    await userEvent.type(screen.getByLabelText('Heures supplémentaires'), '1,5');
    await userEvent.type(screen.getByLabelText('Prime (€)'), '150,00');
    await userEvent.type(screen.getByLabelText('Libellé de la prime'), 'Prime');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(corps()).toEqual({
      heuresPresteesMinutes: 9150,
      congeDemiJours: 2,
      maladieDemiJours: 4,
      ferieDemiJours: 1,
      absenceNonRemDemiJours: 3,
      heuresSupMinutes: 90,
      primeCents: 15000,
      primeLibelle: 'Prime',
    });
  });

  it('se ferme après un envoi réussi', async () => {
    fetchMock.mockResolvedValue(reponse(200, { success: true, changed: true }));
    rendre();
    await ouvrir();

    await userEvent.type(screen.getByLabelText('Congé (jours)'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Annuler referme sans rien envoyer, et la réouverture repart des écarts enregistrés', async () => {
    rendre({ initial: existante });
    await ouvrir();

    const conge = screen.getByLabelText('Congé (jours)');
    await userEvent.clear(conge);
    await userEvent.type(conge, '10');
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();

    await ouvrir();
    expect(screen.getByLabelText('Congé (jours)')).toHaveValue('1,5');
  });

  it('rattache l’erreur de saisie au champ concerné et reste ouvert', async () => {
    rendre();
    await ouvrir();

    await userEvent.type(screen.getByLabelText('Heures supplémentaires'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText(/Heures invalides : « 1:30 » ou « 1,5 »/)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('explique une erreur à l’effacement des écarts', async () => {
    fetchMock.mockResolvedValue(reponse(409, { error: 'PERIODE_LOCKED' }));
    rendre({ initial: existante });
    await ouvrir();

    await userEvent.click(screen.getByRole('button', { name: 'Effacer les écarts' }));

    expect(await screen.findByText(/prestations de cette période sont verrouillées/)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('retombe sur un message générique en cas de panne réseau', async () => {
    fetchMock.mockRejectedValue(new Error('réseau'));
    rendre();
    await ouvrir();

    await userEvent.type(screen.getByLabelText('Congé (jours)'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Une erreur est survenue. Veuillez réessayer.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('désactive les champs et les boutons pendant l’envoi', async () => {
    let finish: (value: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    rendre({ initial: existante });
    await ouvrir();

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(screen.getByLabelText('Congé (jours)')).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Effacer les écarts' })).toBeDisabled();
    finish(reponse(200, { success: true, changed: true }));
  });
});
