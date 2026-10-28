'use client';

import { useId, type ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';

// Attributs à poser sur le champ pour le relier à son label, à son aide et à son erreur.
export type FormControlProps = {
  id: string;
  'aria-invalid': true | undefined;
  'aria-required': true | undefined;
  'aria-describedby': string | undefined;
};

// Label + champ + aide + erreur. Le champ est reçu en fonction pour recevoir `id`, `aria-invalid`
// et `aria-describedby` : sans eux, l'erreur est affichée mais un lecteur d'écran ne la rattache
// pas au champ (CONVENTIONS § 5, accessibilité). L'aide disparaît quand il y a une erreur.
export function FormField({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  id?: string;
  label: string;
  // Du texte, ou du contenu riche (gras, bouton « Utiliser cette teinte »…).
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: (control: FormControlProps) => ReactNode;
}) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <Field className={className}>
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      {children({
        id: fieldId,
        'aria-invalid': error ? true : undefined,
        'aria-required': required ? true : undefined,
        'aria-describedby': describedBy,
      })}
      {hint && !error && <FieldDescription id={hintId}>{hint}</FieldDescription>}
      {/* `text-destructive` de shadcn est illisible en sombre (#7f1d1d) : on garde le ton lisible. */}
      {error && (
        <FieldError id={errorId} className="text-xs text-destructive-text">
          {error}
        </FieldError>
      )}
    </Field>
  );
}

// Case à cocher avec son libellé (« oui » / « non » sans liste déroulante).
export function CheckField({
  id,
  label,
  checked,
  onCheckedChange,
  hint,
  error,
  disabled,
}: {
  id?: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  hint?: string;
  error?: string;
  disabled?: boolean;
}) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;

  return (
    <div className="space-y-1">
      <Field orientation="horizontal">
        <Checkbox
          id={fieldId}
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
        />
        <FieldLabel htmlFor={fieldId} className="font-medium">
          {label}
        </FieldLabel>
      </Field>
      {hint && !error && <FieldDescription id={hintId}>{hint}</FieldDescription>}
      {error && (
        <FieldError id={errorId} className="text-xs text-destructive-text">
          {error}
        </FieldError>
      )}
    </div>
  );
}
