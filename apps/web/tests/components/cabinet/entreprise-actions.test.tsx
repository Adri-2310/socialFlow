import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntrepriseActions } from '@/components/cabinet/entreprise-actions';
import { EntrepriseAdminRemove } from '@/components/cabinet/entreprise-admin-remove';
import { EntrepriseRestore } from '@/components/cabinet/entreprise-restore';
import { EMPTY_ENTREPRISE } from '@/components/cabinet/entreprise-form-dialog';

// Actions sur une entreprise cliente : modifier, archiver, restaurer, retirer son administrateur.
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

describe('EntrepriseActions', () => {
  const rendre = (readOnly = false) =>
    render(
      <EntrepriseActions
        entrepriseId="e1"
        name="Zénith"
        initial={EMPTY_ENTREPRISE}
        countries={[{ code: 'BE', name: 'Belgique' }]}
        gestionnaires={[]}
        readOnly={readOnly}
      />,
    );

  it('propose Modifier et Archiver, nommés d’après l’entreprise', () => {
    rendre();

    expect(screen.getByRole('button', { name: 'Modifier Zénith' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Archiver Zénith' })).toBeEnabled();
  });

  it('Modifier ouvre le formulaire de modification', async () => {
    rendre();

    await userEvent.click(screen.getByRole('button', { name: 'Modifier Zénith' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('désactive les deux actions en lecture seule', () => {
    rendre(true);

    expect(screen.getByRole('button', { name: 'Modifier Zénith' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Archiver Zénith' })).toBeDisabled();
  });

  it('Archiver demande une confirmation, puis archive et rafraîchit', async () => {
    fetchMock.mockResolvedValue(reponse(200, { success: true }));
    rendre();

    await userEvent.click(screen.getByRole('button', { name: 'Archiver Zénith' }));
    const confirmation = await screen.findByRole('alertdialog');
    expect(confirmation).toHaveAccessibleName('Archiver Zénith ?');
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Archiver', hidden: false }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/cabinet/entreprises/e1', { method: 'DELETE' });
  });

  it('annuler la confirmation n’archive rien', async () => {
    rendre();
    await userEvent.click(screen.getByRole('button', { name: 'Archiver Zénith' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Annuler' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('explique un refus du serveur sous les boutons', async () => {
    fetchMock.mockResolvedValue(reponse(423, { error: 'CABINET_READ_ONLY' }));
    rendre();
    await userEvent.click(screen.getByRole('button', { name: 'Archiver Zénith' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Archiver' }));

    expect(await screen.findByText(/Votre cabinet est en lecture seule/)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('EntrepriseAdminRemove', () => {
  const rendre = (readOnly = false) =>
    render(
      <EntrepriseAdminRemove
        entrepriseId="e1"
        entrepriseName="Zénith"
        adminName="Alice Martin"
        readOnly={readOnly}
      />,
    );

  it('demande confirmation en nommant l’administrateur, puis le retire', async () => {
    fetchMock.mockResolvedValue(reponse(200, { success: true }));
    rendre();

    await userEvent.click(
      screen.getByRole('button', { name: "Retirer l'administrateur de Zénith" }),
    );
    const confirmation = await screen.findByRole('alertdialog');
    expect(confirmation).toHaveTextContent('Alice Martin perdra immédiatement l’accès');
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Retirer' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/cabinet/entreprises/e1/admin', {
      method: 'DELETE',
    });
  });

  it('est désactivé en lecture seule', () => {
    rendre(true);

    expect(
      screen.getByRole('button', { name: "Retirer l'administrateur de Zénith" }),
    ).toBeDisabled();
  });

  it('explique un refus du serveur', async () => {
    fetchMock.mockResolvedValue(reponse(404, { error: 'ENTREPRISE_HAS_NO_ADMIN' }));
    rendre();
    await userEvent.click(
      screen.getByRole('button', { name: "Retirer l'administrateur de Zénith" }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Retirer' }));

    expect(
      await screen.findByText('Cette entreprise n’a plus d’administrateur.'),
    ).toBeInTheDocument();
  });
});

describe('EntrepriseRestore', () => {
  const rendre = (readOnly = false) =>
    render(<EntrepriseRestore entrepriseId="e1" name="Zénith" readOnly={readOnly} />);

  it('restaure sans confirmation puis rafraîchit', async () => {
    fetchMock.mockResolvedValue(reponse(200, { success: true }));
    rendre();

    await userEvent.click(screen.getByRole('button', { name: 'Restaurer Zénith' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/cabinet/entreprises/e1', { method: 'PUT' });
  });

  it('est désactivé en lecture seule', () => {
    rendre(true);

    expect(screen.getByRole('button', { name: 'Restaurer Zénith' })).toBeDisabled();
  });

  it('explique le quota atteint', async () => {
    fetchMock.mockResolvedValue(reponse(409, { error: 'QUOTA_EXCEEDED' }));
    rendre();

    await userEvent.click(screen.getByRole('button', { name: 'Restaurer Zénith' }));

    expect(
      await screen.findByText(/quota d'entreprises de votre plan est atteint/),
    ).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('désactive le bouton pendant la restauration', async () => {
    let finish: (value: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    rendre();

    await userEvent.click(screen.getByRole('button', { name: 'Restaurer Zénith' }));

    expect(screen.getByRole('button', { name: 'Restaurer Zénith' })).toBeDisabled();
    finish(reponse(200, { success: true }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
