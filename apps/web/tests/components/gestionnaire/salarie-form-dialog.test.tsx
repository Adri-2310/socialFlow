import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  SalarieFormDialog,
  type SalarieFormTarget,
} from '@/components/gestionnaire/salarie-form-dialog';
import { INITIAL, type FormValues } from '@/lib/salarie/salarie-form';

// Compléments à salarie-form-fiscal.test.tsx (qui couvre la situation fiscale) : boîte de
// dialogue, sections, mode création et mode modification, charge utile, erreurs, envoi en cours.
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn();
const onClose = vi.fn();

beforeEach(() => {
  refresh.mockClear();
  onClose.mockClear();
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

const PAYS = [
  { code: 'BE', name: 'Belgique' },
  { code: 'FR', name: 'France' },
];

const creation: SalarieFormTarget = { mode: 'create', entrepriseId: 'e1' };

const existant: FormValues = {
  ...INITIAL,
  prenom: 'Marie',
  nom: 'Dupont',
  dateNaissance: '1990-05-12',
  email: 'marie@example.test',
  pays: 'FR',
  typeContrat: 'CDI',
  dateEntree: '2024-01-15',
};
const modification: SalarieFormTarget = {
  mode: 'edit',
  salarieId: 's1',
  initial: existant,
  nissMasque: '••.••.••-•••.28',
  ibanMasque: 'BE•• •••• •••• 7034',
};

const rendre = (target: SalarieFormTarget = creation) =>
  render(<SalarieFormDialog target={target} countries={PAYS} onClose={onClose} />);

// Remplit les champs obligatoires d'une création (un employé à temps plein, isolé, sans charge).
async function remplirCreation() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Prénom'), 'Jean');
  await user.type(screen.getByLabelText('Nom'), 'Martin');
  await user.type(screen.getByLabelText('Date de naissance'), '1985-07-30');
  await user.type(screen.getByLabelText('NISS'), '85.07.30-033.28');
  await user.type(screen.getByLabelText('IBAN'), 'BE68 5390 0754 7034');
  await user.type(screen.getByLabelText('Date d’entrée'), '2026-01-15');
  await user.type(screen.getByLabelText('Fonction'), 'Comptable');
  await user.type(screen.getByLabelText('Salaire mensuel brut (€)'), '2850,00');
  return user;
}

describe('SalarieFormDialog : boîte de dialogue', () => {
  it('création : titre, explication et quatre sections', () => {
    rendre();

    expect(screen.getByRole('dialog', { name: 'Nouveau salarié' })).toBeInTheDocument();
    expect(
      screen.getByText(/Le NISS et l’IBAN sont chiffrés à l’enregistrement/),
    ).toBeInTheDocument();
    for (const section of [
      'Identité',
      'Contrat',
      'Temps de travail et rémunération',
      'Situation fiscale',
    ]) {
      expect(screen.getByRole('group', { name: section })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Créer le dossier' })).toBeInTheDocument();
  });

  it('modification : titre, explication, sans les conditions de travail', () => {
    rendre(modification);

    expect(screen.getByRole('dialog', { name: 'Modifier le dossier' })).toBeInTheDocument();
    expect(screen.getByText(/ils se changent par « Ajouter une condition »/)).toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'Temps de travail et rémunération' }),
    ).not.toBeInTheDocument();
    for (const absent of ['Statut', 'Fonction', 'Régime']) {
      expect(screen.queryByLabelText(absent)).not.toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument();
  });

  it('modification : préremplit le dossier et n’affiche que le NISS et l’IBAN masqués', () => {
    rendre(modification);

    expect(screen.getByLabelText('Prénom')).toHaveValue('Marie');
    expect(screen.getByLabelText('Nom')).toHaveValue('Dupont');
    expect(screen.getByLabelText('Date de naissance')).toHaveValue('1990-05-12');
    expect(screen.getByLabelText('Email (facultatif)')).toHaveValue('marie@example.test');
    expect(screen.getByLabelText('Pays')).toHaveValue('FR');
    expect(screen.getByLabelText('NISS')).toHaveValue('');
    expect(screen.getByLabelText('IBAN')).toHaveValue('');
    expect(
      screen.getByText('Actuel : ••.••.••-•••.28. Laissez vide pour ne pas le changer.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Actuel : BE•• •••• •••• 7034. Laissez vide pour ne pas le changer.'),
    ).toBeInTheDocument();
  });

  it('création : propose les exemples de NISS et d’IBAN et la liste des pays', () => {
    rendre();

    expect(screen.getByText('Par exemple 85.07.30-033.28')).toBeInTheDocument();
    expect(screen.getByText('IBAN belge, par exemple BE68 5390 0754 7034')).toBeInTheDocument();
    const pays = screen.getByLabelText('Pays');
    expect(pays).toHaveValue('BE');
    expect(
      within(pays)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Belgique', 'France']);
  });
});

describe('SalarieFormDialog : champs qui dépendent d’un choix', () => {
  it('le statut change la commission paritaire annoncée et le libellé du salaire', async () => {
    const user = userEvent.setup();
    rendre();

    expect(screen.getByText('Commission paritaire 200')).toBeInTheDocument();
    expect(screen.getByLabelText('Salaire mensuel brut (€)')).toBeInTheDocument();
    expect(screen.getByText('Par exemple 2850,00')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Statut'), 'OUVRIER');

    expect(screen.getByText('Commission paritaire 100')).toBeInTheDocument();
    expect(screen.getByLabelText('Salaire horaire brut (€)')).toBeInTheDocument();
    expect(screen.getByText('Par exemple 17,25')).toBeInTheDocument();
  });

  it('la date de fin n’existe que pour un CDD', async () => {
    const user = userEvent.setup();
    rendre();

    expect(screen.queryByLabelText('Date de fin du CDD')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Type de contrat'), 'CDD');
    expect(screen.getByLabelText('Date de fin du CDD')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Type de contrat'), 'CDI');
    expect(screen.queryByLabelText('Date de fin du CDD')).not.toBeInTheDocument();
  });

  it('les heures par semaine n’existent qu’à temps partiel', async () => {
    const user = userEvent.setup();
    rendre();

    expect(screen.queryByLabelText('Heures par semaine du salarié')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Régime'), 'TEMPS_PARTIEL');
    expect(screen.getByLabelText('Heures par semaine du salarié')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Heures par semaine de la personne de référence'),
    ).toBeInTheDocument();
    expect(screen.getByText('Par exemple 30,4 ou 30:24.')).toBeInTheDocument();
  });

  it('modification : la date de fin d’un CDD reste disponible', async () => {
    const user = userEvent.setup();
    rendre(modification);

    await user.selectOptions(screen.getByLabelText('Type de contrat'), 'CDD');
    expect(screen.getByLabelText('Date de fin du CDD')).toBeInTheDocument();
  });
});

describe('SalarieFormDialog : envoi', () => {
  it('création : envoie tout le dossier, avec la commission paritaire du statut', async () => {
    fetchMock.mockResolvedValue(reponse(201, { id: 's9' }));
    rendre();
    const user = await remplirCreation();
    await user.type(screen.getByLabelText('Adresse (facultatif)'), 'Rue du Parc 4');
    await user.type(screen.getByLabelText('Code postal (facultatif)'), '5000');
    await user.type(screen.getByLabelText('Ville (facultatif)'), 'Namur');
    await user.click(screen.getByRole('button', { name: 'Créer le dossier' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/entreprises/e1/salaries');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(corps()).toMatchObject({
      prenom: 'Jean',
      nom: 'Martin',
      dateNaissance: '1985-07-30',
      niss: '85.07.30-033.28',
      iban: 'BE68 5390 0754 7034',
      adresse: 'Rue du Parc 4',
      codePostal: '5000',
      ville: 'Namur',
      pays: 'BE',
      statut: 'EMPLOYE',
      typeContrat: 'CDI',
      dateEntree: '2026-01-15',
      commissionParitaire: '200',
      fonction: 'Comptable',
      regime: 'TEMPS_PLEIN',
      salaireMensuelBrutCents: 285000,
      situationFamiliale: 'ISOLE',
      enfantsCharge: 0,
    });
    expect(corps()).not.toHaveProperty('salaireHoraireBrutCents');
    expect(corps()).not.toHaveProperty('dateFinContrat');
  });

  it('création : un ouvrier à temps partiel envoie un salaire horaire et des heures en minutes', async () => {
    fetchMock.mockResolvedValue(reponse(201, { id: 's9' }));
    rendre();
    const user = await remplirCreation();
    await user.selectOptions(screen.getByLabelText('Statut'), 'OUVRIER');
    await user.clear(screen.getByLabelText('Salaire horaire brut (€)'));
    await user.type(screen.getByLabelText('Salaire horaire brut (€)'), '17,25');
    await user.selectOptions(screen.getByLabelText('Régime'), 'TEMPS_PARTIEL');
    await user.type(screen.getByLabelText('Heures par semaine du salarié'), '30:24');
    await user.type(screen.getByLabelText('Heures par semaine de la personne de référence'), '38');
    await user.click(screen.getByRole('button', { name: 'Créer le dossier' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(corps()).toMatchObject({
      statut: 'OUVRIER',
      commissionParitaire: '100',
      regime: 'TEMPS_PARTIEL',
      heuresSemaineMinutes: 1824,
      heuresReferenceMinutes: 2280,
      salaireHoraireBrutCents: 1725,
    });
    expect(corps()).not.toHaveProperty('salaireMensuelBrutCents');
  });

  it('création : un CDD envoie sa date de fin', async () => {
    fetchMock.mockResolvedValue(reponse(201, { id: 's9' }));
    rendre();
    const user = await remplirCreation();
    await user.selectOptions(screen.getByLabelText('Type de contrat'), 'CDD');
    await user.type(screen.getByLabelText('Date de fin du CDD'), '2026-12-31');
    await user.click(screen.getByRole('button', { name: 'Créer le dossier' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(corps()).toMatchObject({ typeContrat: 'CDD', dateFinContrat: '2026-12-31' });
  });

  it('modification : envoie en PATCH sans les conditions de travail, NISS et IBAN vides absents', async () => {
    fetchMock.mockResolvedValue(reponse(200, { success: true }));
    const user = userEvent.setup();
    rendre(modification);

    await user.clear(screen.getByLabelText('Ville (facultatif)'));
    await user.type(screen.getByLabelText('Ville (facultatif)'), 'Liège');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/salaries/s1');
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
    const envoye = corps();
    expect(envoye).toMatchObject({
      prenom: 'Marie',
      ville: 'Liège',
      pays: 'FR',
      dateEntree: '2024-01-15',
    });
    for (const absent of [
      'niss',
      'iban',
      'statut',
      'commissionParitaire',
      'fonction',
      'regime',
      'heuresSemaineMinutes',
      'heuresReferenceMinutes',
      'salaireMensuelBrutCents',
      'salaireHoraireBrutCents',
    ]) {
      expect(envoye).not.toHaveProperty(absent);
    }
  });

  it('modification : un nouveau NISS saisi est envoyé', async () => {
    fetchMock.mockResolvedValue(reponse(200, { success: true }));
    const user = userEvent.setup();
    rendre(modification);

    await user.type(screen.getByLabelText('NISS'), '85.07.30-033.28');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(corps()).toMatchObject({ niss: '85.07.30-033.28' });
  });

  it('rafraîchit la page et se ferme après un enregistrement réussi', async () => {
    fetchMock.mockResolvedValue(reponse(200, { success: true }));
    const user = userEvent.setup();
    rendre(modification);

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('Annuler ferme sans rien envoyer', async () => {
    const user = userEvent.setup();
    rendre();

    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('SalarieFormDialog : erreurs', () => {
  it('un dossier vide est refusé champ par champ, sans appel serveur', async () => {
    const user = userEvent.setup();
    rendre();

    await user.click(screen.getByRole('button', { name: 'Créer le dossier' }));

    expect(await screen.findByText('Le prénom est obligatoire.')).toBeInTheDocument();
    expect(screen.getByText('Le nom est obligatoire.')).toBeInTheDocument();
    expect(screen.getByText(/NISS invalide/)).toBeInTheDocument();
    expect(screen.getByText(/IBAN belge invalide/)).toBeInTheDocument();
    expect(screen.getByText('La fonction est obligatoire.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('remplace l’aide d’un champ par son erreur', async () => {
    const user = userEvent.setup();
    rendre();
    expect(screen.getByText('Par exemple 85.07.30-033.28')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Créer le dossier' }));

    await screen.findByText(/NISS invalide/);
    expect(screen.queryByText('Par exemple 85.07.30-033.28')).not.toBeInTheDocument();
  });

  it('affiche les erreurs de champ renvoyées par le serveur et reste ouvert', async () => {
    fetchMock.mockResolvedValue(
      reponse(409, { error: 'CONFLICT', fields: { niss: 'NISS_ALREADY_USED' } }),
    );
    rendre();
    const user = await remplirCreation();

    await user.click(screen.getByRole('button', { name: 'Créer le dossier' }));

    expect(
      await screen.findByText(/Un salarié de cette entreprise porte déjà ce NISS/),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('explique une erreur générale du serveur', async () => {
    fetchMock.mockResolvedValue(reponse(423, { error: 'CABINET_READ_ONLY' }));
    rendre(modification);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Votre cabinet est en lecture seule/,
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('retombe sur un message générique en cas de panne réseau', async () => {
    fetchMock.mockRejectedValue(new Error('réseau'));
    rendre(modification);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(
      await screen.findByText('Une erreur est survenue. Veuillez réessayer.'),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('désactive les champs et les boutons pendant l’envoi', async () => {
    let finish: (value: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    rendre(modification);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(screen.getByLabelText('Prénom')).toBeDisabled());
    expect(screen.getByLabelText('Pays')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
    finish(reponse(200, { success: true }));
  });
});
