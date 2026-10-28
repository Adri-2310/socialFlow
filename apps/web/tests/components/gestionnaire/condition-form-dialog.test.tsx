import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConditionAdd } from '@/components/gestionnaire/condition-add';
import { ConditionFormDialog } from '@/components/gestionnaire/condition-form-dialog';
import { ConditionRowActions } from '@/components/gestionnaire/condition-row-actions';
import type { ConditionFormValues } from '@/lib/salarie/condition-form';

// Historique daté des conditions de travail (roles/03 § 4.2) : ajout, correction, annulation
// d'un changement à venir. La conversion des valeurs est testée dans lib/salarie/condition-form.
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

const INITIAL: ConditionFormValues = {
  dateEffet: '',
  statut: 'EMPLOYE',
  fonction: 'Comptable',
  regime: 'TEMPS_PLEIN',
  heuresSemaine: '',
  heuresReference: '',
  salaire: '2850,00',
};

function renderDialog(
  props: Partial<React.ComponentProps<typeof ConditionFormDialog>> = {},
) {
  const onClose = vi.fn();
  render(
    <ConditionFormDialog
      target={{ mode: 'add', salarieId: 's1' }}
      initial={INITIAL}
      onClose={onClose}
      {...props}
    />,
  );
  return { onClose };
}

const date = () => screen.getByLabelText('Valable à partir du');

describe('ConditionFormDialog', () => {
  it('est une boîte de dialogue nommée selon l’ajout ou la correction', () => {
    const { unmount } = render(
      <ConditionFormDialog target={{ mode: 'add', salarieId: 's1' }} initial={INITIAL} onClose={() => {}} />,
    );
    expect(screen.getByRole('dialog', { name: 'Ajouter une condition de travail' })).toBeInTheDocument();
    unmount();

    render(
      <ConditionFormDialog
        target={{ mode: 'edit', salarieId: 's1', conditionId: 'c1' }}
        initial={INITIAL}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Corriger la condition' })).toBeInTheDocument();
  });

  it('ajoute une ligne : POST avec le corps attendu par l’API', async () => {
    fetchMock.mockResolvedValue(reponse(201, { success: true }));
    const { onClose } = renderDialog();

    fireEvent.change(date(), { target: { value: '2026-11-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter la condition' }));

    expect(fetchMock.mock.calls[0][0]).toBe('/api/salaries/s1/conditions');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(corps()).toEqual({
      dateEffet: '2026-11-01',
      statut: 'EMPLOYE',
      commissionParitaire: '200',
      fonction: 'Comptable',
      regime: 'TEMPS_PLEIN',
      salaireMensuelBrutCents: 285000,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(refresh).toHaveBeenCalled();
  });

  it('corrige une ligne : PUT, et la date ne se change pas', async () => {
    fetchMock.mockResolvedValue(reponse(200, { success: true }));
    renderDialog({
      target: { mode: 'edit', salarieId: 's1', conditionId: 'c1' },
      initial: { ...INITIAL, dateEffet: '2026-09-01' },
    });

    expect(date()).toHaveValue('2026-09-01');
    expect(date()).toHaveAttribute('readonly');
    expect(screen.getByText('La date d’une ligne existante ne se change pas.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(fetchMock.mock.calls[0][0]).toBe('/api/salaries/s1/conditions/c1');
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT');
    expect(corps().dateEffet).toBe('2026-09-01');
  });

  it('un ouvrier : salaire horaire, commission paritaire 100', async () => {
    fetchMock.mockResolvedValue(reponse(201, { success: true }));
    renderDialog();

    expect(screen.getByLabelText('Salaire mensuel brut (€)')).toBeInTheDocument();
    expect(screen.getByText('Commission paritaire 200')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Statut'), 'OUVRIER');

    expect(screen.getByText('Commission paritaire 100')).toBeInTheDocument();
    const salaire = screen.getByLabelText('Salaire horaire brut (€)');
    await userEvent.clear(salaire);
    await userEvent.type(salaire, '17,25');
    fireEvent.change(date(), { target: { value: '2026-11-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter la condition' }));

    expect(corps()).toMatchObject({
      statut: 'OUVRIER',
      commissionParitaire: '100',
      salaireHoraireBrutCents: 1725,
    });
    expect(corps()).not.toHaveProperty('salaireMensuelBrutCents');
  });

  it('un temps partiel demande les heures et les envoie en minutes (D96)', async () => {
    fetchMock.mockResolvedValue(reponse(201, { success: true }));
    renderDialog();

    expect(screen.queryByLabelText('Heures par semaine du salarié')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Régime'), 'TEMPS_PARTIEL');
    await userEvent.type(screen.getByLabelText('Heures par semaine du salarié'), '30,4');
    await userEvent.type(
      screen.getByLabelText('Heures par semaine de la personne de référence'),
      '38',
    );
    fireEvent.change(date(), { target: { value: '2026-11-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter la condition' }));

    expect(corps()).toMatchObject({
      regime: 'TEMPS_PARTIEL',
      heuresSemaineMinutes: 1824,
      heuresReferenceMinutes: 2280,
    });
  });

  it('refuse sans envoi une date manquante et un montant illisible', async () => {
    renderDialog({ initial: { ...INITIAL, salaire: 'abc' } });

    await userEvent.click(screen.getByRole('button', { name: 'Ajouter la condition' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await screen.findByText(/La date d’effet est obligatoire/)).toBeInTheDocument();
    expect(screen.getByText('Montant invalide (par exemple 2850,00).')).toBeInTheDocument();
  });

  it('rattache l’erreur de champ au champ concerné', async () => {
    renderDialog({ initial: { ...INITIAL, fonction: '' } });

    await userEvent.click(screen.getByRole('button', { name: 'Ajouter la condition' }));

    expect(await screen.findByText('La fonction est obligatoire.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('affiche les erreurs champ par champ renvoyées par le serveur', async () => {
    fetchMock.mockResolvedValue(
      reponse(409, { error: 'INVALID_REQUEST', fields: { dateEffet: 'CONDITION_DATE_ALREADY_USED', fonction: 'INCONNU' } }),
    );
    const { onClose } = renderDialog();

    fireEvent.change(date(), { target: { value: '2026-11-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter la condition' }));

    expect(await screen.findByText(/Une condition existe déjà à cette date/)).toBeInTheDocument();
    expect(screen.getByText('Valeur invalide.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('explique une erreur générale du serveur, puis une panne réseau', async () => {
    fetchMock.mockResolvedValueOnce(reponse(423, { error: 'CABINET_READ_ONLY' }));
    renderDialog();

    fireEvent.change(date(), { target: { value: '2026-11-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter la condition' }));
    expect(await screen.findByText(/lecture seule/)).toBeInTheDocument();

    fetchMock.mockRejectedValueOnce(new Error('réseau'));
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter la condition' }));
    expect(await screen.findByText('Une erreur est survenue. Veuillez réessayer.')).toBeInTheDocument();
  });

  it('se ferme avec Annuler sans rien envoyer', async () => {
    const { onClose } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('désactive les champs et les boutons pendant l’envoi', async () => {
    let finish: (value: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderDialog();

    fireEvent.change(date(), { target: { value: '2026-11-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter la condition' }));

    await waitFor(() => expect(screen.getByLabelText('Fonction')).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Ajouter la condition' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
    finish(reponse(201, { success: true }));
  });
});

describe('ConditionAdd', () => {
  it('ouvre le formulaire d’ajout, et Annuler le referme', async () => {
    render(<ConditionAdd salarieId="s1" initial={INITIAL} readOnly={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une condition' }));
    expect(screen.getByRole('dialog', { name: 'Ajouter une condition de travail' })).toBeInTheDocument();
    expect(screen.getByLabelText('Fonction')).toHaveValue('Comptable');

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('est désactivé en lecture seule, avec la raison', () => {
    render(<ConditionAdd salarieId="s1" initial={INITIAL} readOnly />);

    const bouton = screen.getByRole('button', { name: 'Ajouter une condition' });
    expect(bouton).toBeDisabled();
    expect(bouton).toHaveAttribute('title', 'Votre cabinet est en lecture seule.');
  });
});

describe('ConditionRowActions', () => {
  const rendre = (props: Partial<React.ComponentProps<typeof ConditionRowActions>> = {}) =>
    render(
      <ConditionRowActions
        salarieId="s1"
        conditionId="c1"
        initial={{ ...INITIAL, dateEffet: '2026-12-01' }}
        removable
        readOnly={false}
        {...props}
      />,
    );

  it('ouvre la correction de la ligne avec ses valeurs', async () => {
    rendre();

    await userEvent.click(screen.getByRole('button', { name: 'Corriger cette condition' }));

    expect(screen.getByRole('dialog', { name: 'Corriger la condition' })).toBeInTheDocument();
    expect(screen.getByLabelText('Valable à partir du')).toHaveValue('2026-12-01');
  });

  it('annule un changement à venir après confirmation', async () => {
    fetchMock.mockResolvedValue(reponse(200, { success: true }));
    rendre();

    await userEvent.click(screen.getByRole('button', { name: 'Annuler ce changement à venir' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await screen.findByText('Annuler ce changement ?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Annuler le changement' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/salaries/s1/conditions/c1', { method: 'DELETE' });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('explique pourquoi une ligne ne peut pas être annulée', async () => {
    fetchMock.mockResolvedValue(reponse(409, { error: 'CONDITION_NOT_REMOVABLE' }));
    rendre();

    await userEvent.click(screen.getByRole('button', { name: 'Annuler ce changement à venir' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Annuler le changement' }));

    expect(await screen.findByText(/Seul un changement à venir peut être annulé/)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('n’offre pas l’annulation d’une ligne qui n’est pas à venir', () => {
    rendre({ removable: false });

    expect(screen.getByRole('button', { name: 'Corriger cette condition' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Annuler ce changement à venir' })).not.toBeInTheDocument();
  });

  it('désactive les actions en lecture seule', () => {
    rendre({ readOnly: true });

    expect(screen.getByRole('button', { name: 'Corriger cette condition' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annuler ce changement à venir' })).toBeDisabled();
  });
});
