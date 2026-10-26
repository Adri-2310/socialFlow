import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntrepriseCreate } from '@/components/cabinet/entreprise-create';
import { EntrepriseFormDialog, EMPTY_ENTREPRISE } from '@/components/cabinet/entreprise-form-dialog';

// Compléments à entreprises.test.tsx (création, modification, erreurs, quota, suspendus) :
// fermeture, pays, décochage, liste vide, envoi en cours, panne réseau et ouverture depuis le bandeau.
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn();

beforeEach(() => {
  refresh.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const countries = [
  { code: 'BE', name: 'Belgique' },
  { code: 'FR', name: 'France' },
];
const gestionnaires = [
  { id: 'g1', name: 'Alice Martin', status: 'actif' as const },
  { id: 'g2', name: 'Bruno Leroy', status: 'suspendu' as const },
];

function renderForm(props: Partial<React.ComponentProps<typeof EntrepriseFormDialog>> = {}) {
  const onClose = vi.fn();
  render(
    <EntrepriseFormDialog
      initial={EMPTY_ENTREPRISE}
      countries={countries}
      gestionnaires={gestionnaires}
      onClose={onClose}
      {...props}
    />,
  );
  return { onClose };
}

describe('EntrepriseFormDialog : compléments', () => {
  it('est une boîte de dialogue nommée selon création ou modification', () => {
    const { unmount } = render(
      <EntrepriseFormDialog initial={EMPTY_ENTREPRISE} countries={countries} gestionnaires={gestionnaires} onClose={() => {}} />,
    );
    expect(screen.getByRole('dialog', { name: 'Nouvelle entreprise cliente' })).toBeInTheDocument();
    unmount();

    render(
      <EntrepriseFormDialog
        entrepriseId="e1"
        initial={EMPTY_ENTREPRISE}
        countries={countries}
        gestionnaires={gestionnaires}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Modifier l’entreprise' })).toBeInTheDocument();
  });

  it('se ferme avec Annuler sans rien envoyer', async () => {
    const { onClose } = renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propose les pays reçus et envoie le pays choisi', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ success: true }) });
    renderForm();

    const select = screen.getByLabelText('Pays') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(Array.from(select.options).map((option) => option.value)).toEqual(['BE', 'FR']);
    expect(select).toHaveValue('BE');

    await userEvent.selectOptions(select, 'FR');
    await userEvent.click(screen.getByRole('button', { name: 'Créer l’entreprise' }));

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ country: 'FR' });
  });

  it('envoie tous les champs saisis', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ success: true }) });
    renderForm();

    await userEvent.type(screen.getByLabelText('Raison sociale'), 'Boucherie Martin');
    await userEvent.type(screen.getByLabelText('N° d’entreprise / TVA'), 'BE0123.456.749');
    await userEvent.type(screen.getByLabelText('Adresse'), 'Rue du Pont 1');
    await userEvent.type(screen.getByLabelText('Code postal'), '5000');
    await userEvent.type(screen.getByLabelText('Ville'), 'Namur');
    await userEvent.type(screen.getByLabelText('Email de contact'), 'contact@martin.be');
    await userEvent.type(screen.getByLabelText('Téléphone'), '+3281123456');
    await userEvent.click(screen.getByRole('checkbox', { name: /Alice Martin/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Créer l’entreprise' }));

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      name: 'Boucherie Martin',
      vatNumber: 'BE0123.456.749',
      addressLine: 'Rue du Pont 1',
      postalCode: '5000',
      city: 'Namur',
      country: 'BE',
      contactEmail: 'contact@martin.be',
      contactPhone: '+3281123456',
      jourLimitePrestations: 20,
      gestionnaireIds: ['g1'],
    });
  });

  it('coche puis décoche un gestionnaire', async () => {
    renderForm({ initial: { ...EMPTY_ENTREPRISE, gestionnaireIds: ['g1'] } });

    const alice = screen.getByRole('checkbox', { name: /Alice Martin/ });
    expect(alice).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Bruno Leroy/ })).not.toBeChecked();

    await userEvent.click(alice);

    expect(alice).not.toBeChecked();
  });

  it('explique qu aucun gestionnaire n existe encore', () => {
    renderForm({ gestionnaires: [] });

    expect(screen.getByText(/Aucun gestionnaire dans votre cabinet/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('affiche l erreur de gestionnaires sous la liste', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'INVALID_REQUEST', fields: { gestionnaireIds: 'GESTIONNAIRE_REQUIRED' } }),
    });
    const { onClose } = renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Créer l’entreprise' }));

    expect(await screen.findByText('Assignez au moins un gestionnaire.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('affiche une erreur générale du serveur et reste ouvert', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'CABINET_READ_ONLY' }) });
    const { onClose } = renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Créer l’entreprise' }));

    expect(await screen.findByText(/lecture seule/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('retombe sur un message générique en cas de panne réseau', async () => {
    fetchMock.mockRejectedValue(new Error('réseau'));
    const { onClose } = renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Créer l’entreprise' }));

    expect(await screen.findByText('Une erreur est survenue. Veuillez réessayer.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('désactive les champs et les boutons pendant l’envoi', async () => {
    let finish: (value: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Créer l’entreprise' }));

    await waitFor(() => expect(screen.getByLabelText('Raison sociale')).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Créer l’entreprise' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
    // Une case native se désactive par l'attribut `disabled`, une case Base UI (<span
    // role="checkbox">) par `aria-disabled` : dans les deux cas elle ne change plus au clic.
    const alice = screen.getByRole('checkbox', { name: /Alice Martin/ });
    expect(alice.hasAttribute('disabled') || alice.getAttribute('aria-disabled') === 'true').toBe(true);
    await userEvent.click(alice);
    expect(alice).not.toBeChecked();
    finish({ ok: true, status: 201, json: async () => ({ success: true }) });
  });

  it('relie le jour limite à son aide', () => {
    renderForm();

    const field = screen.getByLabelText('Jour limite des prestations');
    expect(field).toHaveAttribute('type', 'number');
    expect(field).toHaveAttribute('min', '1');
    expect(field).toHaveAttribute('max', '28');
    expect(screen.getByText(/avant ce jour \(1 à 28\)/)).toBeInTheDocument();
  });

  it('signale les gestionnaires suspendus par une pastille dans leur ligne', () => {
    renderForm();

    const row = screen.getByRole('checkbox', { name: /Bruno Leroy/ }).closest('li')!;
    expect(within(row).getByText('Suspendu')).toBeInTheDocument();
    expect(within(screen.getByRole('checkbox', { name: /Alice Martin/ }).closest('li')!).queryByText('Suspendu')).toBeNull();
  });
});

describe('EntrepriseCreate : ouverture du formulaire', () => {
  it('ouvre le formulaire de création depuis le bandeau, et Annuler le referme', async () => {
    render(<EntrepriseCreate countries={countries} gestionnaires={gestionnaires} readOnly={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Nouvelle entreprise' }));
    expect(screen.getByRole('dialog', { name: 'Nouvelle entreprise cliente' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('affiche le quota et bloque le bouton quand il est atteint', () => {
    render(
      <EntrepriseCreate
        countries={countries}
        gestionnaires={gestionnaires}
        quota={{ used: 25, limit: 25 }}
        readOnly={false}
      />,
    );

    expect(screen.getByText('25 / 25 entreprises')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nouvelle entreprise' })).toBeDisabled();
    expect(screen.getByText(/quota d'entreprises de votre plan est atteint/)).toBeInTheDocument();
  });
});
