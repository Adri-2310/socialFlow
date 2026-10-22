import type { ReactNode } from 'react';

// Classe commune des champs de formulaire du gestionnaire (même rendu que les
// formulaires du cabinet).
export const inputClass =
  'mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-foreground sm:text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60';

export function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-destructive-text">
          {error}
        </p>
      )}
    </div>
  );
}
