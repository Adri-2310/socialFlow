import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

function renderDialog(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(
    <ConfirmDialog
      title="Archiver l’entreprise ?"
      description="Elle ne sera plus visible."
      confirmLabel="Archiver"
      onCancel={onCancel}
      onConfirm={onConfirm}
      {...props}
    />,
  );
  return { onCancel, onConfirm };
}

describe('ConfirmDialog', () => {
  it('s’expose comme une boîte de dialogue d’alerte nommée et décrite', async () => {
    renderDialog();

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveAccessibleName('Archiver l’entreprise ?');
    expect(dialog).toHaveAccessibleDescription('Elle ne sera plus visible.');
  });

  it('appelle onConfirm au clic sur le bouton de confirmation', async () => {
    const { onConfirm, onCancel } = renderDialog();

    await userEvent.click(await screen.findByRole('button', { name: 'Archiver' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('appelle onCancel au clic sur Annuler', async () => {
    const { onConfirm, onCancel } = renderDialog();

    await userEvent.click(await screen.findByRole('button', { name: 'Annuler' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('se ferme avec Échap (appelle onCancel)', async () => {
    const { onCancel, onConfirm } = renderDialog();
    await screen.findByRole('alertdialog');

    await userEvent.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('place le focus dans la boîte à l’ouverture', async () => {
    renderDialog();

    // Base UI place le focus après l'ouverture, pas dans le même rendu.
    const dialog = await screen.findByRole('alertdialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  });

  describe('pendant le chargement', () => {
    it('désactive les deux boutons', async () => {
      renderDialog({ loading: true });

      expect(await screen.findByRole('button', { name: 'Archiver' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
    });

    it('ignore Échap : l’action en cours ne s’abandonne pas', async () => {
      const { onCancel } = renderDialog({ loading: true });
      await screen.findByRole('alertdialog');

      await userEvent.keyboard('{Escape}');

      expect(onCancel).not.toHaveBeenCalled();
    });

    it('n’ajoute pas d’annonce parasite : le texte du bouton reste « Archiver »', async () => {
      renderDialog({ loading: true });

      const button = await screen.findByRole('button', { name: 'Archiver' });
      expect(button).toHaveTextContent('Archiver');
    });
  });
});
