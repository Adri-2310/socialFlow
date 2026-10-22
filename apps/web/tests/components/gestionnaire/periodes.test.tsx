import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PeriodeActions } from '@/components/gestionnaire/periode-actions';
import { PeriodeOuvrir } from '@/components/gestionnaire/periode-ouvrir';
import { PrestationEncoder } from '@/components/gestionnaire/prestation-encoder';
import type { PrestationInput } from '@/lib/schemas/prestation';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn();

beforeEach(() => {
  refresh.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

const reponse = (status: number, body: unknown) => ({
  ok: status < 400,
  status,
  json: async () => body,
});
const corps = (appel = 0) => JSON.parse(fetchMock.mock.calls[appel][1].body);

describe('PeriodeOuvrir', () => {
  const mois = [
    { annee: 2026, mois: 11 },
    { annee: 2026, mois: 10 },
    { annee: 2026, mois: 9 },
  ];
  const rendre = (props: Partial<React.ComponentProps<typeof PeriodeOuvrir>> = {}) =>
    render(
      <PeriodeOuvrir
        entrepriseId="e1"
        mois={mois}
        moisCourant={{ annee: 2026, mois: 10 }}
        jourLimite={20}
        readOnly={false}
        {...props}
      />,
    );

  it('propose le mois courant par défaut et ouvre la période choisie', async () => {
    fetchMock.mockResolvedValue(reponse(201, { success: true, id: 'p1' }));
    rendre();

    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir une période' }));
    expect(screen.getByLabelText('Mois')).toHaveValue('2026-10');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'novembre 2026',
      'octobre 2026',
      'septembre 2026',
    ]);

    await userEvent.selectOptions(screen.getByLabelText('Mois'), '2026-9');
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));

    expect(fetchMock.mock.calls[0][0]).toBe('/api/entreprises/e1/periodes');
    expect(corps()).toEqual({ annee: 2026, mois: 9 });
    expect(refresh).toHaveBeenCalled();
  });

  it('propose le premier mois restant quand le mois courant est déjà ouvert', async () => {
    rendre({ mois: [mois[0], mois[2]] });
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir une période' }));
    expect(screen.getByLabelText('Mois')).toHaveValue('2026-11');
  });

  it('explique un mois refusé par le serveur', async () => {
    fetchMock.mockResolvedValue(
      reponse(409, { error: 'PERIODE_OUT_OF_RANGE', fields: { mois: 'PERIODE_OUT_OF_RANGE' } }),
    );
    rendre();
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir une période' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));

    expect(await screen.findByText(/pas plus loin/)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('affiche l’erreur générale d’un doublon', async () => {
    fetchMock.mockResolvedValue(reponse(409, { error: 'PERIODE_ALREADY_EXISTS' }));
    rendre();
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir une période' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));

    expect(await screen.findByText('Une période existe déjà pour ce mois.')).toBeInTheDocument();
  });

  it('est désactivé en lecture seule, ou quand il ne reste aucun mois', () => {
    const { unmount } = rendre({ readOnly: true });
    expect(screen.getByRole('button', { name: 'Ouvrir une période' })).toBeDisabled();
    unmount();
    rendre({ mois: [] });
    expect(screen.getByRole('button', { name: 'Ouvrir une période' })).toBeDisabled();
  });
});

describe('PeriodeActions', () => {
  const rendre = (props: Partial<React.ComponentProps<typeof PeriodeActions>> = {}) =>
    render(
      <PeriodeActions
        periodeId="p1"
        verrouillee={false}
        dateLimite="2026-10-20"
        readOnly={false}
        {...props}
      />,
    );

  it('décale la date limite de la période', async () => {
    fetchMock.mockResolvedValue(reponse(200, { success: true, changed: true }));
    rendre();

    await userEvent.click(screen.getByRole('button', { name: /Décaler la date/ }));
    const champ = screen.getByLabelText('Date limite des prestations');
    expect(champ).toHaveValue('2026-10-20');
    await userEvent.clear(champ);
    await userEvent.type(champ, '2026-10-27');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(fetchMock.mock.calls[0][0]).toBe('/api/periodes/p1');
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
    expect(corps()).toEqual({ dateLimite: '2026-10-27' });
    expect(refresh).toHaveBeenCalled();
  });

  it('demande confirmation avant de verrouiller, puis verrouille', async () => {
    fetchMock.mockResolvedValue(reponse(200, { success: true }));
    rendre();

    await userEvent.click(screen.getByRole('button', { name: /Verrouiller/ }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('Verrouiller les prestations ?')).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: 'Verrouiller' }).at(-1)!);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/periodes/p1/verrouillage');
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT');
    expect(refresh).toHaveBeenCalled();
  });

  it('déverrouille une période verrouillée, sans proposer de décaler la date', async () => {
    fetchMock.mockResolvedValue(reponse(200, { success: true }));
    rendre({ verrouillee: true });

    expect(screen.queryByRole('button', { name: /Décaler la date/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Déverrouiller/ }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Déverrouiller' }).at(-1)!);

    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
  });

  it('désactive les actions en lecture seule', () => {
    rendre({ readOnly: true });
    expect(screen.getByRole('button', { name: /Décaler la date/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Verrouiller/ })).toBeDisabled();
  });
});

describe('PrestationEncoder', () => {
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
    userEvent.click(
      screen.getByRole('button', { name: 'Encoder les prestations de Marie Dupont' }),
    );

  it('envoie les écarts en entiers (demi-journées, minutes, centimes)', async () => {
    fetchMock.mockResolvedValue(reponse(200, { success: true, changed: true }));
    rendre();
    await ouvrir();

    await userEvent.type(screen.getByLabelText('Congé (jours)'), '1,5');
    await userEvent.type(screen.getByLabelText('Heures supplémentaires'), '1:30');
    await userEvent.type(screen.getByLabelText('Prime (€)'), '150,5');
    await userEvent.type(screen.getByLabelText('Libellé de la prime'), 'Fin d’année');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(fetchMock.mock.calls[0][0]).toBe('/api/periodes/p1/prestations/s1');
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT');
    expect(corps()).toEqual({
      heuresPresteesMinutes: null,
      congeDemiJours: 3,
      maladieDemiJours: 0,
      ferieDemiJours: 0,
      absenceNonRemDemiJours: 0,
      heuresSupMinutes: 90,
      primeCents: 15050,
      primeLibelle: 'Fin d’année',
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('refuse une valeur invalide avant tout envoi, puis une prime sans libellé', async () => {
    rendre();
    await ouvrir();

    await userEvent.type(screen.getByLabelText('Congé (jours)'), '1,3');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText(/Nombre de jours invalide/)).toBeInTheDocument();

    // Les jours corrigés, la prime sans libellé est refusée à son tour.
    await userEvent.clear(screen.getByLabelText('Congé (jours)'));
    await userEvent.type(screen.getByLabelText('Prime (€)'), '50');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText(/libellé de la prime est obligatoire/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuse plus de jours que le mois n’en compte (novembre : 30 jours)', async () => {
    rendre();
    await ouvrir();

    await userEvent.type(screen.getByLabelText('Congé (jours)'), '31');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText(/Nombre de jours invalide/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('préremplit les écarts existants et permet de les effacer', async () => {
    fetchMock.mockResolvedValue(reponse(200, { success: true, changed: true }));
    rendre({ initial: existante });
    await ouvrir();

    expect(screen.getByLabelText('Congé (jours)')).toHaveValue('1,5');
    expect(screen.getByLabelText('Heures supplémentaires')).toHaveValue('1:30');
    await userEvent.click(screen.getByRole('button', { name: 'Effacer les écarts' }));

    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    expect(refresh).toHaveBeenCalled();
  });

  it('n’offre pas d’effacement quand il n’y a rien à effacer', async () => {
    rendre();
    await ouvrir();
    expect(screen.queryByRole('button', { name: 'Effacer les écarts' })).not.toBeInTheDocument();
  });

  it('affiche l’erreur du serveur (période verrouillée entre-temps)', async () => {
    fetchMock.mockResolvedValue(reponse(409, { error: 'PERIODE_LOCKED' }));
    rendre();
    await ouvrir();
    await userEvent.type(screen.getByLabelText('Congé (jours)'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(
      await screen.findByText(/prestations de cette période sont verrouillées/),
    ).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('affiche les erreurs champ par champ du serveur', async () => {
    fetchMock.mockResolvedValue(
      reponse(400, {
        error: 'INVALID_CONGE_DEMI_JOURS',
        fields: { congeDemiJours: 'INVALID_CONGE_DEMI_JOURS' },
      }),
    );
    rendre();
    await ouvrir();
    await userEvent.type(screen.getByLabelText('Congé (jours)'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText(/Nombre de jours invalide/)).toBeInTheDocument();
  });

  it('est désactivé avec la raison quand la période est verrouillée', () => {
    rendre({ bloque: 'Les prestations sont verrouillées.' });
    const bouton = screen.getByRole('button', { name: 'Encoder les prestations de Marie Dupont' });
    expect(bouton).toBeDisabled();
    expect(bouton).toHaveAttribute('title', 'Les prestations sont verrouillées.');
  });
});
