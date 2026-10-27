import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SalarieArchiveActions } from '@/components/gestionnaire/salarie-archive-actions';
import { SalariePortail } from '@/components/gestionnaire/salarie-portail';

// Archiver ou restaurer un dossier (roles/03 § 4.2) ; inviter, renvoyer ou révoquer l'accès du
// salarié à son espace (§ 4.3).
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

describe('SalarieArchiveActions', () => {
  const rendre = (props: Partial<React.ComponentProps<typeof SalarieArchiveActions>> = {}) =>
    render(
      <SalarieArchiveActions
        salarieId="s1"
        nom="Marie Dupont"
        archive={false}
        readOnly={false}
        {...props}
      />,
    );

  it('Archiver demande confirmation, puis archive et rafraîchit', async () => {
    fetchMock.mockResolvedValue(reponse(200, { success: true }));
    rendre();

    await userEvent.click(
      screen.getByRole('button', { name: 'Archiver le dossier de Marie Dupont' }),
    );
    const confirmation = await screen.findByRole('alertdialog');
    expect(confirmation).toHaveAccessibleName('Archiver le dossier de Marie Dupont ?');
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Archiver le dossier' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/salaries/s1', { method: 'DELETE' });
  });

  it('annuler la confirmation n’archive rien', async () => {
    rendre();
    await userEvent.click(
      screen.getByRole('button', { name: 'Archiver le dossier de Marie Dupont' }),
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Annuler' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Restaurer est immédiat, sans confirmation', async () => {
    fetchMock.mockResolvedValue(reponse(200, { success: true }));
    rendre({ archive: true });

    await userEvent.click(
      screen.getByRole('button', { name: 'Restaurer le dossier de Marie Dupont' }),
    );

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/salaries/s1', { method: 'PUT' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('est désactivé en lecture seule, avec la raison en infobulle', () => {
    rendre({ readOnly: true });

    const bouton = screen.getByRole('button', { name: 'Archiver le dossier de Marie Dupont' });
    expect(bouton).toBeDisabled();
    expect(bouton).toHaveAttribute('title', 'Votre cabinet est en lecture seule.');
  });

  it('explique un refus du serveur', async () => {
    fetchMock.mockResolvedValue(reponse(409, { error: 'SALARIE_NOT_ARCHIVED' }));
    rendre({ archive: true });

    await userEvent.click(
      screen.getByRole('button', { name: 'Restaurer le dossier de Marie Dupont' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Ce dossier n’est pas archivé.');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('accepte la variante compacte', () => {
    rendre({ archive: true, compact: true });

    expect(
      screen.getByRole('button', { name: 'Restaurer le dossier de Marie Dupont' }),
    ).toBeInTheDocument();
  });
});

describe('SalariePortail', () => {
  const rendre = (props: Partial<React.ComponentProps<typeof SalariePortail>> = {}) =>
    render(
      <SalariePortail
        salarieId="s1"
        etat={{ etat: 'AUCUNE' }}
        aUnEmail
        readOnly={false}
        {...props}
      />,
    );

  it('sans compte : propose d’inviter et rappelle que l’invitation est facultative', () => {
    rendre();

    expect(screen.getByText('Pas de compte')).toBeInTheDocument();
    expect(screen.getByText(/L’invitation est facultative/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inviter au portail' })).toBeEnabled();
  });

  it('sans email au dossier : invitation impossible, avec l’explication', () => {
    rendre({ aUnEmail: false });

    expect(screen.getByText(/Ajoutez l’email du salarié/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inviter au portail' })).toBeDisabled();
  });

  it('invite via POST, puis rafraîchit', async () => {
    fetchMock.mockResolvedValue(reponse(201, { emailSent: true }));
    rendre();

    await userEvent.click(screen.getByRole('button', { name: 'Inviter au portail' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/salaries/s1/invitation', { method: 'POST' });
  });

  it('prévient quand l’invitation est créée mais l’email n’est pas parti', async () => {
    fetchMock.mockResolvedValue(reponse(201, { emailSent: false }));
    rendre();

    await userEvent.click(screen.getByRole('button', { name: 'Inviter au portail' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/l’email n’a pas pu être envoyé/);
    expect(refresh).toHaveBeenCalled();
  });

  it('invitation en attente : date de validité, « Renvoyer » et « Révoquer »', () => {
    rendre({ etat: { etat: 'EN_ATTENTE', expiresAt: '2026-11-30T00:00:00.000Z' } });

    expect(screen.getByText('Invitation envoyée')).toBeInTheDocument();
    expect(screen.getByText(/valable jusqu’au 30\/11\/2026/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Renvoyer' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Révoquer' })).toBeEnabled();
  });

  it('invitation expirée : « Renvoyer » seulement', () => {
    rendre({ etat: { etat: 'EXPIREE', expiresAt: '2026-10-01T00:00:00.000Z' } });

    expect(screen.getByText('Invitation expirée')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Renvoyer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Révoquer' })).not.toBeInTheDocument();
  });

  it('compte actif : aucun bouton', () => {
    rendre({ etat: { etat: 'COMPTE_ACTIF' } });

    expect(screen.getByText('Compte actif')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('Révoquer demande confirmation, puis supprime via DELETE', async () => {
    fetchMock.mockResolvedValue(reponse(200, { success: true }));
    rendre({ etat: { etat: 'EN_ATTENTE', expiresAt: '2026-11-30T00:00:00.000Z' } });

    await userEvent.click(screen.getByRole('button', { name: 'Révoquer' }));
    expect(await screen.findByRole('alertdialog')).toHaveAccessibleName('Révoquer l’invitation ?');
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Révoquer l’invitation' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/salaries/s1/invitation', { method: 'DELETE' });
  });

  it('désactive les actions en lecture seule', () => {
    rendre({ readOnly: true });

    const bouton = screen.getByRole('button', { name: 'Inviter au portail' });
    expect(bouton).toBeDisabled();
    expect(bouton).toHaveAttribute('title', 'Votre cabinet est en lecture seule.');
  });

  it('explique un refus du serveur', async () => {
    fetchMock.mockResolvedValue(reponse(409, { error: 'SALARIE_ALREADY_HAS_ACCOUNT' }));
    rendre();

    await userEvent.click(screen.getByRole('button', { name: 'Inviter au portail' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ce salarié a déjà un compte.');
    expect(refresh).not.toHaveBeenCalled();
  });
});
