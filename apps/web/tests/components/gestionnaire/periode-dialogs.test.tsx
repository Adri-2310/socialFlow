import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PeriodeActions } from '@/components/gestionnaire/periode-actions';
import { PeriodeOuvrir } from '@/components/gestionnaire/periode-ouvrir';

// Compléments à periodes.test.tsx (ouverture, décalage, verrouillage) : boîtes de dialogue,
// annulation, validation avant envoi, envoi en cours.
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

describe('PeriodeOuvrir : dialogue', () => {
  const mois = [
    { annee: 2026, mois: 11 },
    { annee: 2026, mois: 10 },
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

  it('ouvre une boîte de dialogue qui rappelle le jour limite', async () => {
    rendre();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir une période' }));

    expect(screen.getByRole('dialog', { name: 'Ouvrir une période' })).toBeInTheDocument();
    expect(screen.getByText(/avant le 20 de ce mois/)).toBeInTheDocument();
  });

  it('propose les mois calculés par le serveur dans une liste déroulante', async () => {
    rendre();

    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir une période' }));

    const liste = screen.getByLabelText('Mois') as HTMLSelectElement;
    expect(liste.tagName).toBe('SELECT');
    expect(Array.from(liste.options).map((option) => option.value)).toEqual(['2026-11', '2026-10']);
    expect(liste).toHaveValue('2026-10');
    expect(screen.getByText('Un mois passé (rattrapage), le mois courant ou le mois suivant.')).toBeInTheDocument();
  });

  it('Annuler referme sans rien envoyer', async () => {
    rendre();

    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir une période' }));
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('envoie le mois choisi dans la liste', async () => {
    fetchMock.mockResolvedValue(reponse(201, { success: true }));
    rendre();

    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir une période' }));
    await userEvent.selectOptions(screen.getByLabelText('Mois'), '2026-11');
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ annee: 2026, mois: 11 });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('retombe sur un message générique en cas de panne réseau', async () => {
    fetchMock.mockRejectedValue(new Error('réseau'));
    rendre();

    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir une période' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));

    expect(await screen.findByText('Une erreur est survenue. Veuillez réessayer.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('désactive la liste et les boutons pendant l’envoi', async () => {
    let finish: (value: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    rendre();

    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir une période' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));

    await waitFor(() => expect(screen.getByLabelText('Mois')).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Ouvrir' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
    finish(reponse(201, { success: true }));
  });

  it('indique la lecture seule par une infobulle sur le bouton', () => {
    rendre({ readOnly: true });

    expect(screen.getByRole('button', { name: 'Ouvrir une période' })).toHaveAttribute(
      'title',
      'Votre cabinet est en lecture seule.',
    );
  });
});

describe('PeriodeActions : dialogues', () => {
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

  it('ouvre une boîte de dialogue pour décaler la date limite', async () => {
    rendre();

    await userEvent.click(screen.getByRole('button', { name: /Décaler la date/ }));

    expect(screen.getByRole('dialog', { name: 'Décaler la date limite' })).toBeInTheDocument();
    expect(screen.getByLabelText('Date limite des prestations')).toHaveAttribute('type', 'date');
    expect(screen.getByText(/Ne concerne que cette période/)).toBeInTheDocument();
  });

  it('Annuler referme et rétablit la date d’origine à la réouverture', async () => {
    rendre();

    await userEvent.click(screen.getByRole('button', { name: /Décaler la date/ }));
    const champ = screen.getByLabelText('Date limite des prestations');
    await userEvent.clear(champ);
    await userEvent.type(champ, '2026-10-28');
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /Décaler la date/ }));
    expect(screen.getByLabelText('Date limite des prestations')).toHaveValue('2026-10-20');
  });

  it('refuse sans envoi une date vidée', async () => {
    rendre();

    await userEvent.click(screen.getByRole('button', { name: /Décaler la date/ }));
    await userEvent.clear(screen.getByLabelText('Date limite des prestations'));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await screen.findByText('Date invalide.')).toBeInTheDocument();
  });

  it('affiche l’erreur de date renvoyée par le serveur', async () => {
    fetchMock.mockResolvedValue(
      reponse(400, { error: 'INVALID_REQUEST', fields: { dateLimite: 'INVALID_DATE_LIMITE' } }),
    );
    rendre();

    await userEvent.click(screen.getByRole('button', { name: /Décaler la date/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Date invalide.')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('signale une période déjà verrouillée dans une alerte, sans fermer la confirmation', async () => {
    fetchMock.mockResolvedValue(reponse(409, { error: 'PERIODE_ALREADY_LOCKED' }));
    rendre();

    await userEvent.click(screen.getByRole('button', { name: /Verrouiller/ }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Verrouiller' }).at(-1)!);

    expect(await screen.findByText('Ces prestations sont déjà verrouillées.')).toBeInTheDocument();
    expect(screen.getByText('Verrouiller les prestations ?')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('indique la lecture seule par une infobulle', () => {
    rendre({ readOnly: true });

    expect(screen.getByRole('button', { name: /Décaler la date/ })).toHaveAttribute(
      'title',
      'Votre cabinet est en lecture seule.',
    );
    expect(screen.getByRole('button', { name: /Verrouiller/ })).toHaveAttribute(
      'title',
      'Votre cabinet est en lecture seule.',
    );
  });
});
