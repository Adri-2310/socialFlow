import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SuspendCabinetDialog } from '@/components/admin/suspend-cabinet-dialog';
import { SUSPENSION_REASON_MAX } from '@/lib/cabinet/cabinet-suspension';

// Compléments au test de la modale de suspension (D71) : accessibilité, motif, envoi en cours.
function renderDialog(props: Partial<React.ComponentProps<typeof SuspendCabinetDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(<SuspendCabinetDialog cabinetName="Alpha" onConfirm={onConfirm} onCancel={onCancel} {...props} />);
  return { onConfirm, onCancel };
}

describe('SuspendCabinetDialog : détails', () => {
  it('est une boîte de dialogue modale nommée par son titre', () => {
    renderDialog();

    expect(screen.getByRole('dialog')).toHaveAccessibleName('Suspendre ce cabinet ?');
  });

  it('nomme le cabinet dans l’explication', () => {
    renderDialog({ cabinetName: 'Cabinet Alicia' });

    expect(screen.getByText(/« Cabinet Alicia » passe en lecture seule/)).toBeInTheDocument();
  });

  it('limite la longueur du motif et précise qu’il reste dans le journal d’audit', () => {
    renderDialog();

    expect(screen.getByLabelText(/Motif/)).toHaveAttribute('maxlength', String(SUSPENSION_REASON_MAX));
    expect(screen.getByText(/jamais montré aux clients du cabinet/)).toBeInTheDocument();
  });

  it('le libellé du motif ne dit plus « facultatif » quand il devient obligatoire', () => {
    renderDialog();
    expect(screen.getByLabelText(/Motif \(facultatif\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox'));

    expect(screen.queryByText(/facultatif/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Motif')).toBeInTheDocument();
  });

  it('un motif fait uniquement d’espaces ne suffit pas pour bloquer', () => {
    const { onConfirm } = renderDialog();
    fireEvent.click(screen.getByRole('checkbox'));

    fireEvent.change(screen.getByLabelText('Motif'), { target: { value: '   ' } });

    const confirmer = screen.getByRole('button', { name: 'Bloquer les connexions' });
    expect(confirmer).toBeDisabled();
    fireEvent.click(confirmer);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('décocher le blocage revient à la lecture seule, avec le motif déjà saisi', () => {
    const { onConfirm } = renderDialog();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText('Motif'), { target: { value: 'Contrôle' } });

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Suspendre' }));

    expect(onConfirm).toHaveBeenCalledWith({ mode: 'READ_ONLY', reason: 'Contrôle' });
  });

  it('cliquer sur le libellé coche la case', () => {
    renderDialog();

    fireEvent.click(screen.getByText('Bloquer aussi toutes les connexions'));

    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('pendant l’envoi, tout est désactivé et le bouton de confirmation reste nommé', () => {
    renderDialog({ loading: true });

    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Suspendre' })).toBeDisabled();
    expect(screen.getByLabelText(/Motif/)).toBeDisabled();
    // Case Base UI : un <span role="checkbox">, désactivé par aria-disabled.
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true');
  });

  it('escalade : le motif est exigé d’emblée', () => {
    renderDialog({ initialMode: 'BLOCKED' });

    expect(screen.getByLabelText('Motif')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bloquer les connexions' })).toBeDisabled();
  });
});
