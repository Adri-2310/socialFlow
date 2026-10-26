import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormField } from '@/components/shared/form-field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

function renderSelect(
  props: Partial<React.ComponentProps<typeof NativeSelect>> = {},
  error?: string,
) {
  return render(
    <FormField id="statut" label="Statut" error={error}>
      {(control) => (
        <NativeSelect {...control} defaultValue="EMPLOYE" {...props}>
          <NativeSelectOption value="EMPLOYE">Employé</NativeSelectOption>
          <NativeSelectOption value="OUVRIER">Ouvrier</NativeSelectOption>
        </NativeSelect>
      )}
    </FormField>,
  );
}

describe('NativeSelect', () => {
  it('reste un vrai <select> associé à son label', () => {
    renderSelect();

    const select = screen.getByLabelText('Statut');
    expect(select.tagName).toBe('SELECT');
    expect(select).toHaveRole('combobox');
    expect(select).toHaveValue('EMPLOYE');
  });

  it('change de valeur avec selectOptions, comme avant', async () => {
    const onChange = vi.fn();
    renderSelect({ onChange });

    await userEvent.selectOptions(screen.getByLabelText('Statut'), 'OUVRIER');

    expect(screen.getByLabelText('Statut')).toHaveValue('OUVRIER');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].target.value).toBe('OUVRIER');
  });

  it('propose ses options par leur libellé', () => {
    renderSelect();

    expect(screen.getByRole('option', { name: 'Employé' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ouvrier' })).toBeInTheDocument();
  });

  it('se désactive', () => {
    renderSelect({ disabled: true });

    expect(screen.getByLabelText('Statut')).toBeDisabled();
  });

  it('relie son erreur au champ', () => {
    renderSelect({}, 'Choix obligatoire');

    const select = screen.getByLabelText('Statut');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAccessibleDescription('Choix obligatoire');
  });

  it('masque le chevron décoratif aux lecteurs d’écran', () => {
    const { container } = renderSelect();

    expect(container.querySelector('[data-slot="native-select-icon"]')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });
});
