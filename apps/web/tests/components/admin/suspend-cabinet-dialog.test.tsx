import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SuspendCabinetDialog } from '@/components/admin/suspend-cabinet-dialog';

function renderDialog(props: Partial<React.ComponentProps<typeof SuspendCabinetDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(<SuspendCabinetDialog cabinetName="Alpha" onConfirm={onConfirm} onCancel={onCancel} {...props} />);
  return { onConfirm, onCancel };
}

describe('SuspendCabinetDialog (D71)', () => {
  it('suspend en lecture seule par defaut, sans motif obligatoire', () => {
    const { onConfirm } = renderDialog();

    expect(screen.getByText(/passe en lecture seule/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByText(/Motif \(facultatif\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Suspendre' }));
    expect(onConfirm).toHaveBeenCalledWith({ mode: 'READ_ONLY', reason: '' });
  });

  it('transmet le motif saisi, sans espaces superflus', () => {
    const { onConfirm } = renderDialog();

    fireEvent.change(screen.getByLabelText(/Motif/), { target: { value: '  Vérification  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suspendre' }));

    expect(onConfirm).toHaveBeenCalledWith({ mode: 'READ_ONLY', reason: 'Vérification' });
  });

  it('exige un motif pour bloquer les connexions et prévient que les sessions sont coupées', () => {
    const { onConfirm } = renderDialog();

    fireEvent.click(screen.getByRole('checkbox'));

    expect(screen.getByText(/sessions en cours sont coupées/)).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Bloquer les connexions' });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Motif/), { target: { value: 'Compte compromis' } });
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledWith({ mode: 'BLOCKED', reason: 'Compte compromis' });
  });

  it('impose le blocage quand on escalade une lecture seule', () => {
    renderDialog({ initialMode: 'BLOCKED' });

    expect(screen.getByText('Bloquer les connexions ?')).toBeInTheDocument();
    const box = screen.getByRole('checkbox');
    expect(box).toBeChecked();
    expect(box).toBeDisabled();
  });

  it('affiche l erreur renvoyee par le serveur et annule', () => {
    const { onCancel } = renderDialog({ error: 'Un motif est obligatoire pour bloquer les connexions.' });

    expect(screen.getByRole('alert')).toHaveTextContent('Un motif est obligatoire');
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
