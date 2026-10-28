import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormDialog } from '@/components/shared/form-dialog';

function renderDialog(onCancel = vi.fn()) {
  render(
    <FormDialog
      title="Ajouter une condition"
      description="Elle s’ajoute à l’historique."
      icon={<svg data-testid="icone" />}
    >
      <form>
        <label htmlFor="fonction">Fonction</label>
        <input id="fonction" />
        <button type="button" onClick={onCancel}>
          Annuler
        </button>
      </form>
    </FormDialog>,
  );
  return { onCancel };
}

describe('FormDialog', () => {
  it('s’expose comme une boîte de dialogue nommée et décrite', async () => {
    renderDialog();

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName('Ajouter une condition');
    expect(dialog).toHaveAccessibleDescription('Elle s’ajoute à l’historique.');
  });

  it('affiche le formulaire fourni et l’icône décorative', async () => {
    renderDialog();

    expect(await screen.findByLabelText('Fonction')).toBeInTheDocument();
    expect(screen.getByTestId('icone').closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('n’ajoute pas de bouton de fermeture : on ne ferme que par les boutons du formulaire', async () => {
    renderDialog();

    await screen.findByRole('dialog');
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Annuler']);
  });

  it('reste ouverte avec Échap : la saisie en cours ne se perd pas', async () => {
    renderDialog();
    const field = await screen.findByLabelText('Fonction');
    await userEvent.type(field, 'Comptable');

    await userEvent.keyboard('{Escape}');

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Fonction')).toHaveValue('Comptable');
  });

  it('reste ouverte au clic à l’extérieur', async () => {
    renderDialog();
    await screen.findByRole('dialog');

    await userEvent.click(document.body);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('place le focus dans la boîte à l’ouverture', async () => {
    renderDialog();

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  });

  it('laisse le formulaire déclencher sa propre annulation', async () => {
    const { onCancel } = renderDialog();

    await userEvent.click(await screen.findByRole('button', { name: 'Annuler' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
