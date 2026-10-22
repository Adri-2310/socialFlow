import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntreprisesManager } from '@/components/cabinet/entreprises-manager';
import { EntrepriseFormDialog, EMPTY_ENTREPRISE } from '@/components/cabinet/entreprise-form-dialog';
import { GestionnaireActions } from '@/components/cabinet/gestionnaire-actions';
import type { EntrepriseRow } from '@/lib/entreprise/cabinet-entreprises';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn();

beforeEach(() => {
  refresh.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

const countries = [
  { code: 'BE', name: 'Belgique' },
  { code: 'FR', name: 'France' },
];
const gestionnaires = [
  { id: 'g1', name: 'Alice Martin', status: 'actif' as const },
  { id: 'g2', name: 'Bruno Leroy', status: 'suspendu' as const },
];

const entreprise = (overrides: Partial<EntrepriseRow> = {}): EntrepriseRow => ({
  id: 'e1',
  name: 'Boulangerie Dupont',
  vatNumber: 'BE0123.456.749',
  addressLine: null,
  postalCode: null,
  city: 'Namur',
  country: 'BE',
  contactEmail: null,
  contactPhone: null,
  jourLimitePrestations: 20,
  createdAt: new Date('2026-10-01'),
  gestionnaires: [{ id: 'g1', name: 'Alice Martin', status: 'actif' }],
  covered: true,
  admin: null,
  adminInvitation: null,
  ...overrides,
});

function renderManager(props: Partial<React.ComponentProps<typeof EntreprisesManager>> = {}) {
  return render(
    <EntreprisesManager
      entreprises={[entreprise()]}
      archived={[]}
      gestionnaires={gestionnaires}
      countries={countries}
      readOnly={false}
      {...props}
    />,
  );
}

describe('EntreprisesManager', () => {
  it('liste les entreprises avec leur numero, leur ville et leurs gestionnaires', () => {
    renderManager();

    expect(screen.getByText('Boulangerie Dupont')).toBeInTheDocument();
    expect(screen.getByText('BE0123.456.749 · Namur')).toBeInTheDocument();
    expect(screen.getByText('Gestionnaires : Alice Martin')).toBeInTheDocument();
    expect(screen.queryByText(/Aucun gestionnaire actif/)).not.toBeInTheDocument();
  });

  it('signale une entreprise sans gestionnaire actif (D27)', () => {
    renderManager({
      entreprises: [
        entreprise({
          covered: false,
          gestionnaires: [{ id: 'g2', name: 'Bruno Leroy', status: 'suspendu' }],
        }),
      ],
    });

    expect(screen.getByText('Gestionnaires : Bruno Leroy (suspendu)')).toBeInTheDocument();
    expect(screen.getByText(/Aucun gestionnaire actif : assignez-en un/)).toBeInTheDocument();
  });

  it('affiche un etat vide et le quota', () => {
    renderManager({ entreprises: [], quota: { used: 0, limit: 25 } });

    expect(screen.getByText(/Aucune entreprise cliente pour le moment/)).toBeInTheDocument();
    expect(screen.getByText('0 / 25 entreprises')).toBeInTheDocument();
  });

  it('bloque la creation quand le quota est atteint', () => {
    renderManager({ quota: { used: 25, limit: 25 } });

    expect(screen.getByRole('button', { name: 'Nouvelle entreprise' })).toBeDisabled();
    expect(screen.getByText(/quota d'entreprises de votre plan est atteint/)).toBeInTheDocument();
  });

  it('desactive toutes les actions en lecture seule', () => {
    renderManager({
      readOnly: true,
      archived: [{ id: 'e2', name: 'Ancienne SPRL', vatNumber: 'BE0200.000.000', deletedAt: new Date('2026-09-01') }],
    });

    expect(screen.getByRole('button', { name: 'Nouvelle entreprise' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Modifier Boulangerie Dupont' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Archiver Boulangerie Dupont' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Restaurer Ancienne SPRL' })).toBeDisabled();
  });

  it('archive apres confirmation puis rafraichit', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    renderManager();

    await userEvent.click(screen.getByRole('button', { name: 'Archiver Boulangerie Dupont' }));
    expect(fetchMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getAllByRole('button', { name: 'Archiver' }).at(-1)!);

    expect(fetchMock).toHaveBeenCalledWith('/api/cabinet/entreprises/e1', { method: 'DELETE' });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('restaure une entreprise archivee', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    renderManager({
      archived: [{ id: 'e2', name: 'Ancienne SPRL', vatNumber: 'BE0200.000.000', deletedAt: new Date('2026-09-01') }],
    });

    await userEvent.click(screen.getByRole('button', { name: 'Restaurer Ancienne SPRL' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/cabinet/entreprises/e2', { method: 'PUT' });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});

describe('EntrepriseFormDialog', () => {
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

  it('envoie la creation avec les gestionnaires coches', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ success: true, id: 'e9' }) });
    const { onClose } = renderForm();

    await userEvent.type(screen.getByLabelText('Raison sociale'), 'Boucherie Martin');
    await userEvent.type(screen.getByLabelText('N° d’entreprise / TVA'), 'BE0123.456.749');
    await userEvent.click(screen.getByRole('checkbox', { name: /Alice Martin/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Créer l’entreprise' }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/cabinet/entreprises');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toMatchObject({
      name: 'Boucherie Martin',
      vatNumber: 'BE0123.456.749',
      country: 'BE',
      gestionnaireIds: ['g1'],
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(refresh).toHaveBeenCalled();
  });

  it('propose 20 comme jour limite et l envoie comme un nombre (D91)', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ success: true, id: 'e9' }) });
    renderForm();

    const champ = screen.getByLabelText('Jour limite des prestations');
    expect(champ).toHaveValue(20);
    await userEvent.clear(champ);
    await userEvent.type(champ, '15');
    await userEvent.type(screen.getByLabelText('Raison sociale'), 'Boucherie Martin');
    await userEvent.type(screen.getByLabelText('N° d’entreprise / TVA'), 'BE0123.456.749');
    await userEvent.click(screen.getByRole('checkbox', { name: /Alice Martin/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Créer l’entreprise' }));

    const corps = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(corps.jourLimitePrestations).toBe(15);
    expect(typeof corps.jourLimitePrestations).toBe('number');
  });

  it('affiche le jour limite actuel d une entreprise a modifier', () => {
    renderForm({
      entrepriseId: 'e1',
      initial: { ...EMPTY_ENTREPRISE, name: 'Boulangerie Dupont', jourLimitePrestations: '12' },
    });
    expect(screen.getByLabelText('Jour limite des prestations')).toHaveValue(12);
  });

  it('explique un jour limite refuse par le serveur', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'INVALID_REQUEST', fields: { jourLimitePrestations: 'INVALID_JOUR_LIMITE' } }),
    });
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Créer l’entreprise' }));

    expect(await screen.findByText(/entier de 1 à 28/)).toBeInTheDocument();
  });

  it('modifie une entreprise existante avec PATCH', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    renderForm({
      entrepriseId: 'e1',
      initial: { ...EMPTY_ENTREPRISE, name: 'Boulangerie Dupont', vatNumber: 'BE0123.456.749', gestionnaireIds: ['g1'] },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(fetchMock.mock.calls[0][0]).toBe('/api/cabinet/entreprises/e1');
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
  });

  it('affiche les erreurs champ par champ renvoyees par le serveur', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'INVALID_REQUEST', fields: { vatNumber: 'VAT_ALREADY_USED' } }),
    });
    const { onClose } = renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Créer l’entreprise' }));

    expect(await screen.findByText(/porte déjà ce n°/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('explique le quota atteint', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'QUOTA_EXCEEDED', quota: 'maxEntreprises', limit: 25, used: 25 }),
    });
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Créer l’entreprise' }));

    expect(await screen.findByText(/quota d'entreprises de votre plan est atteint/)).toBeInTheDocument();
  });

  it('signale les gestionnaires suspendus dans la liste', () => {
    renderForm();

    const suspended = screen.getByRole('checkbox', { name: /Bruno Leroy/ }).closest('li')!;
    expect(within(suspended).getByText('Suspendu')).toBeInTheDocument();
  });
});

describe('GestionnaireActions et couverture (D27)', () => {
  it('nomme les entreprises a reassigner quand la suspension est refusee', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: 'GESTIONNAIRE_HAS_UNCOVERED_ENTREPRISES',
        entreprises: [{ id: 'e1', name: 'Boulangerie Dupont' }, { id: 'e2', name: 'Garage Pirard' }],
      }),
    });
    render(
      <GestionnaireActions
        gestionnaireId="g1"
        name="Alice Martin"
        email="alice@cabinet.be"
        status="actif"
        reactivatableByCabinet={false}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Suspendre Alice Martin' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Suspendre' }).at(-1)!);

    expect(
      await screen.findByText(/Réassignez d’abord ces entreprises.*Boulangerie Dupont, Garage Pirard/),
    ).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('administrateur de l entreprise (D5, D70)', () => {
  it('propose d inviter l administrateur et pre-remplit l email de contact', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ success: true }) });
    renderManager({ entreprises: [entreprise({ contactEmail: 'contact@dupont.be' })] });

    expect(screen.getByText('Aucun administrateur pour le moment.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: "Inviter l'administrateur de Boulangerie Dupont" }));

    const field = screen.getByLabelText("Email de l'administrateur de Boulangerie Dupont");
    expect(field).toHaveValue('contact@dupont.be');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer l’invitation' }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/cabinet/entreprises/e1/admin-invitation');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ email: 'contact@dupont.be' });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('explique qu une entreprise a deja un administrateur', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'ENTREPRISE_ALREADY_HAS_ADMIN' }),
    });
    renderManager();

    await userEvent.click(screen.getByRole('button', { name: "Inviter l'administrateur de Boulangerie Dupont" }));
    await userEvent.type(screen.getByLabelText("Email de l'administrateur de Boulangerie Dupont"), 'a@b.be');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer l’invitation' }));

    expect(await screen.findByText('Cette entreprise a déjà un administrateur.')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('montre l invitation en attente avec renvoi et revocation', () => {
    renderManager({
      entreprises: [
        entreprise({
          adminInvitation: {
            id: 'inv1',
            email: 'admin@dupont.be',
            status: 'pending',
            expiresAt: new Date('2026-10-30'),
          },
        }),
      ],
    });

    expect(screen.getByText(/Invitation envoyée à admin@dupont.be/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Renvoyer l'invitation à admin@dupont.be" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Révoquer l'invitation de admin@dupont.be" })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Inviter l'administrateur/ })).not.toBeInTheDocument();
  });

  it('une invitation expiree ne propose que le renvoi', () => {
    renderManager({
      entreprises: [
        entreprise({
          adminInvitation: {
            id: 'inv1',
            email: 'admin@dupont.be',
            status: 'expired',
            expiresAt: new Date('2026-10-01'),
          },
        }),
      ],
    });

    expect(screen.getByText(/Invitation à admin@dupont.be expirée/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Renvoyer l'invitation à admin@dupont.be" })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Révoquer/ })).not.toBeInTheDocument();
  });

  it('retire l administrateur apres confirmation', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    renderManager({
      entreprises: [entreprise({ admin: { name: 'Jean Admin', email: 'jean@dupont.be' } })],
    });

    expect(screen.getByText('Jean Admin · jean@dupont.be')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: "Retirer l'administrateur de Boulangerie Dupont" }));
    expect(fetchMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getAllByRole('button', { name: 'Retirer' }).at(-1)!);

    expect(fetchMock).toHaveBeenCalledWith('/api/cabinet/entreprises/e1/admin', { method: 'DELETE' });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('desactive l invitation et le retrait en lecture seule', () => {
    renderManager({ readOnly: true });
    expect(screen.getByRole('button', { name: "Inviter l'administrateur de Boulangerie Dupont" })).toBeDisabled();

    renderManager({
      readOnly: true,
      entreprises: [entreprise({ id: 'e2', name: 'Garage Pirard', admin: { name: 'Zoe', email: 'z@p.be' } })],
    });
    expect(screen.getByRole('button', { name: "Retirer l'administrateur de Garage Pirard" })).toBeDisabled();
  });
});
