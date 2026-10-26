import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CheckField, FormField } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';

describe('FormField', () => {
  it('associe le label au champ', () => {
    render(
      <FormField id="nom" label="Nom">
        {(c) => <Input {...c} />}
      </FormField>,
    );

    expect(screen.getByLabelText('Nom')).toHaveAttribute('id', 'nom');
  });

  it('génère un identifiant quand aucun n’est fourni', () => {
    render(<FormField label="Prénom">{(c) => <Input {...c} />}</FormField>);

    const input = screen.getByLabelText('Prénom');
    expect(input.id).not.toBe('');
  });

  it('relie l’aide au champ, sans marquer d’erreur', () => {
    render(
      <FormField id="iban" label="IBAN" hint="Sans espaces">
        {(c) => <Input {...c} />}
      </FormField>,
    );

    const input = screen.getByLabelText('IBAN');
    expect(input).toHaveAccessibleDescription('Sans espaces');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('relie l’erreur au champ, l’annonce et masque l’aide', () => {
    render(
      <FormField id="iban" label="IBAN" hint="Sans espaces" error="IBAN invalide">
        {(c) => <Input {...c} />}
      </FormField>,
    );

    const input = screen.getByLabelText('IBAN');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('IBAN invalide');
    expect(screen.getByRole('alert')).toHaveTextContent('IBAN invalide');
    expect(screen.queryByText('Sans espaces')).not.toBeInTheDocument();
  });

  it('garde la couleur d’erreur lisible en sombre (destructive-text)', () => {
    render(
      <FormField id="nom" label="Nom" error="Obligatoire">
        {(c) => <Input {...c} />}
      </FormField>,
    );

    expect(screen.getByRole('alert').className).toContain('text-destructive-text');
  });

  it('marque le champ obligatoire pour les lecteurs d’écran', () => {
    render(
      <FormField id="nom" label="Nom" required>
        {(c) => <Input {...c} />}
      </FormField>,
    );

    expect(screen.getByLabelText('Nom')).toHaveAttribute('aria-required', 'true');
  });
});

describe('CheckField', () => {
  it('associe le libellé à la case et renvoie le nouvel état', async () => {
    const onCheckedChange = vi.fn();
    render(
      <CheckField
        id="isole"
        label="Parent isolé"
        checked={false}
        onCheckedChange={onCheckedChange}
      />,
    );

    await userEvent.click(screen.getByRole('checkbox', { name: 'Parent isolé' }));

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('reflète l’état coché', () => {
    render(<CheckField id="isole" label="Parent isolé" checked onCheckedChange={() => {}} />);

    expect(screen.getByRole('checkbox', { name: 'Parent isolé' })).toBeChecked();
  });

  it('relie l’erreur à la case', () => {
    render(
      <CheckField
        id="isole"
        label="Parent isolé"
        checked={false}
        onCheckedChange={() => {}}
        error="Requis"
      />,
    );

    const box = screen.getByRole('checkbox', { name: 'Parent isolé' });
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(box).toHaveAccessibleDescription('Requis');
    expect(screen.getByRole('alert')).toHaveTextContent('Requis');
  });
});
