import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SalarieImport } from '@/components/gestionnaire/salarie-import';
import type { RapportImport } from '@/lib/salarie/salarie-import';

// Import CSV des dossiers (roles/03 § 4.1) : vérifier d'abord (rien n'est écrit), puis importer.
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

// Deux lignes à créer, une ignorée, une en erreur.
const rapport: RapportImport = {
  total: 4,
  creees: 2,
  ignorees: 1,
  erreurs: 1,
  lignes: [
    { ligne: 3, resultat: 'IGNOREE', raison: 'NISS_DEJA_PRESENT' },
    { ligne: 4, resultat: 'ERREUR', details: [{ colonne: 'iban', code: 'INVALID_IBAN' }] },
  ],
};
const sansErreur: RapportImport = { total: 1, creees: 1, ignorees: 0, erreurs: 0, lignes: [] };

const csv = (contenu = 'prenom;nom\nJean;Martin\n') =>
  new File([contenu], 'salaries.csv', { type: 'text/csv' });

const rendre = (readOnly = false) =>
  render(<SalarieImport entrepriseId="e1" readOnly={readOnly} />);
const ouvrir = () => userEvent.click(screen.getByRole('button', { name: 'Importer un CSV' }));
const choisir = (fichier = csv()) =>
  userEvent.upload(screen.getByLabelText('Fichier CSV'), fichier);

describe('SalarieImport : ouverture', () => {
  it('est désactivé en lecture seule, avec la raison en infobulle', () => {
    rendre(true);

    const bouton = screen.getByRole('button', { name: 'Importer un CSV' });
    expect(bouton).toBeDisabled();
    expect(bouton).toHaveAttribute('title', 'Votre cabinet est en lecture seule.');
  });

  it('ouvre une boîte de dialogue avec le modèle à télécharger et le choix du fichier', async () => {
    rendre();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await ouvrir();

    expect(screen.getByRole('dialog', { name: 'Importer des salariés' })).toBeInTheDocument();
    expect(screen.getByText(/1 Mo et 200 lignes au maximum/)).toBeInTheDocument();
    const modele = screen.getByRole('link', { name: /Télécharger le modèle \(CSV\)/ });
    expect(modele).toHaveAttribute('href', '/api/entreprises/e1/salaries/import/modele');
    expect(modele).toHaveAttribute('download');
    expect(screen.getByLabelText('Fichier CSV')).toHaveAttribute('accept', '.csv,text/csv');
  });

  it('« Vérifier le fichier » n’est possible qu’une fois un fichier choisi', async () => {
    rendre();
    await ouvrir();

    expect(screen.getByRole('button', { name: 'Vérifier le fichier' })).toBeDisabled();
    await choisir();
    expect(screen.getByRole('button', { name: 'Vérifier le fichier' })).toBeEnabled();
  });

  it('Annuler referme sans rien envoyer ni rafraîchir', async () => {
    rendre();
    await ouvrir();

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('SalarieImport : vérification', () => {
  it('envoie le contenu du fichier sans rien confirmer', async () => {
    fetchMock.mockResolvedValue(reponse(200, { rapport }));
    rendre();
    await ouvrir();
    await choisir(csv('prenom;nom\nJean;Martin\n'));

    await userEvent.click(screen.getByRole('button', { name: 'Vérifier le fichier' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/entreprises/e1/salaries/import');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(corps()).toEqual({ csv: 'prenom;nom\nJean;Martin\n', confirmer: false });
  });

  it('lit un fichier Excel en Windows-1252 sans abîmer les accents', async () => {
    fetchMock.mockResolvedValue(reponse(200, { rapport }));
    rendre();
    await ouvrir();
    // « Hélène » en Windows-1252 : é = 0xE9, une séquence invalide en UTF-8.
    await choisir(new File([new Uint8Array([0x48, 0xe9, 0x6c, 0xe8, 0x6e, 0x65])], 'x.csv'));

    await userEvent.click(screen.getByRole('button', { name: 'Vérifier le fichier' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(corps().csv).toBe('Hélène');
  });

  it('affiche les compteurs et le détail des lignes ignorées ou en erreur', async () => {
    fetchMock.mockResolvedValue(reponse(200, { rapport }));
    rendre();
    await ouvrir();
    await choisir();
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier le fichier' }));

    expect(await screen.findByText('À créer')).toBeInTheDocument();
    for (const [label, valeur] of [
      ['À créer', '2'],
      ['Ignorés', '1'],
      ['En erreur', '1'],
    ]) {
      expect(screen.getByText(label).previousElementSibling).toHaveTextContent(valeur);
    }
    expect(screen.getByText(/4 lignes lues\./)).toBeInTheDocument();
    expect(screen.getByText(/Les lignes en erreur ne seront pas importées/)).toBeInTheDocument();

    const lignes = screen.getAllByRole('row');
    // En-tête + une ligne ignorée + une ligne en erreur.
    expect(lignes).toHaveLength(3);
    expect(within(lignes[1]).getByText('3')).toBeInTheDocument();
    expect(within(lignes[1]).getByText('niss')).toBeInTheDocument();
    expect(within(lignes[1]).getByText(/porte déjà ce NISS : ligne ignorée/)).toBeInTheDocument();
    expect(within(lignes[2]).getByText('4')).toBeInTheDocument();
    expect(within(lignes[2]).getByText('iban')).toBeInTheDocument();
    expect(within(lignes[2]).getByText(/IBAN belge invalide/)).toBeInTheDocument();
  });

  it('nomme les colonnes du tableau et propose d’importer les lignes valides', async () => {
    fetchMock.mockResolvedValue(reponse(200, { rapport }));
    rendre();
    await ouvrir();
    await choisir();
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier le fichier' }));

    await screen.findByText('À créer');
    for (const colonne of ['Ligne', 'Colonne', 'Problème']) {
      expect(screen.getByRole('columnheader', { name: colonne })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Importer 2 salariés' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vérifier le fichier' })).not.toBeInTheDocument();
  });

  it('un fichier sans anomalie n’affiche pas de tableau et accorde le singulier', async () => {
    fetchMock.mockResolvedValue(reponse(200, { rapport: sansErreur }));
    rendre();
    await ouvrir();
    await choisir();
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier le fichier' }));

    expect(await screen.findByRole('button', { name: 'Importer 1 salarié' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText(/1 ligne lue\./)).toBeInTheDocument();
    expect(screen.queryByText(/Les lignes en erreur/)).not.toBeInTheDocument();
  });

  it('sans ligne à créer, rien à importer', async () => {
    fetchMock.mockResolvedValue(
      reponse(200, {
        rapport: { ...rapport, creees: 0, ignorees: 0, lignes: [rapport.lignes[1]] },
      }),
    );
    rendre();
    await ouvrir();
    await choisir();
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier le fichier' }));

    await screen.findByText('En erreur');
    expect(screen.queryByRole('button', { name: /^Importer \d/ })).not.toBeInTheDocument();
  });

  it('explique un fichier refusé, avec les colonnes concernées', async () => {
    fetchMock.mockResolvedValue(
      reponse(422, { error: 'MISSING_COLUMNS', colonnes: ['prenom', 'nom'] }),
    );
    rendre();
    await ouvrir();
    await choisir();
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier le fichier' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Colonnes obligatoires manquantes : prenom, nom. Partez du modèle téléchargeable.',
    );
    expect(screen.getByRole('button', { name: 'Vérifier le fichier' })).toBeInTheDocument();
  });

  it('retombe sur un message générique en cas de panne réseau', async () => {
    fetchMock.mockRejectedValue(new Error('réseau'));
    rendre();
    await ouvrir();
    await choisir();
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier le fichier' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Une erreur est survenue. Veuillez réessayer.',
    );
  });

  it('choisir un autre fichier efface l’erreur précédente', async () => {
    fetchMock.mockResolvedValue(reponse(422, { error: 'IMPORT_EMPTY' }));
    rendre();
    await ouvrir();
    await choisir();
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier le fichier' }));
    await screen.findByRole('alert');

    await choisir(csv('autre'));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('désactive le choix du fichier et les boutons pendant la vérification', async () => {
    let finish: (value: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    rendre();
    await ouvrir();
    await choisir();

    await userEvent.click(screen.getByRole('button', { name: 'Vérifier le fichier' }));

    await waitFor(() => expect(screen.getByLabelText('Fichier CSV')).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Vérifier le fichier' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
    finish(reponse(200, { rapport }));
  });
});

describe('SalarieImport : import', () => {
  async function jusquALaVerification(rapportVerifie: RapportImport = rapport) {
    fetchMock.mockResolvedValueOnce(reponse(200, { rapport: rapportVerifie }));
    rendre();
    await ouvrir();
    await choisir(csv('prenom;nom\nJean;Martin\n'));
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier le fichier' }));
    await screen.findByText('Ignorés');
  }

  it('renvoie le même contenu avec la confirmation, puis affiche ce qui est créé', async () => {
    await jusquALaVerification();
    fetchMock.mockResolvedValueOnce(reponse(200, { rapport: { ...rapport, creees: 2 } }));

    await userEvent.click(screen.getByRole('button', { name: 'Importer 2 salariés' }));

    expect(await screen.findByText('Créés')).toBeInTheDocument();
    expect(corps(1)).toEqual({ csv: 'prenom;nom\nJean;Martin\n', confirmer: true });
    expect(screen.queryByText('À créer')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Les lignes en erreur ne seront pas importées/),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Importer \d/ })).not.toBeInTheDocument();
    // Rien n'est rafraîchi avant la fermeture.
    expect(refresh).not.toHaveBeenCalled();
  });

  it('« Terminer » referme et rafraîchit la liste quand des dossiers sont créés', async () => {
    await jusquALaVerification();
    fetchMock.mockResolvedValueOnce(reponse(200, { rapport: { ...rapport, creees: 2 } }));
    await userEvent.click(screen.getByRole('button', { name: 'Importer 2 salariés' }));
    await screen.findByText('Créés');

    await userEvent.click(screen.getByRole('button', { name: 'Terminer' }));

    expect(refresh).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('« Terminer » ne rafraîchit pas quand rien n’a été créé', async () => {
    await jusquALaVerification();
    fetchMock.mockResolvedValueOnce(reponse(200, { rapport: { ...rapport, creees: 0 } }));
    await userEvent.click(screen.getByRole('button', { name: 'Importer 2 salariés' }));
    await screen.findByText('Créés');

    await userEvent.click(screen.getByRole('button', { name: 'Terminer' }));

    expect(refresh).not.toHaveBeenCalled();
  });

  it('rouvrir après une fermeture repart du choix du fichier', async () => {
    await jusquALaVerification();
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await ouvrir();

    expect(screen.getByLabelText('Fichier CSV')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vérifier le fichier' })).toBeDisabled();
  });

  it('une erreur à l’import reste affichée sans perdre le rapport', async () => {
    await jusquALaVerification();
    fetchMock.mockResolvedValueOnce(reponse(423, { error: 'CABINET_READ_ONLY' }));

    await userEvent.click(screen.getByRole('button', { name: 'Importer 2 salariés' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Votre cabinet est en lecture seule/,
    );
    expect(screen.getByText('À créer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importer 2 salariés' })).toBeEnabled();
  });
});
