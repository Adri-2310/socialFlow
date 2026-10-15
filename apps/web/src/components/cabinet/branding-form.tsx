'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import {
  DEFAULT_PRIMARY,
  DEFAULT_SECONDARY,
  DISPLAY_NAME_MAX,
  validateBranding,
  type BrandingFieldError,
  type CabinetBranding,
} from '@/lib/branding-rules';
import { readableForeground } from '@/lib/color';

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Session expirée. Reconnectez-vous.',
  FORBIDDEN: 'Seul le titulaire du cabinet peut modifier ces informations.',
  CABINET_NOT_FOUND: 'Cabinet introuvable.',
  CABINET_READ_ONLY:
    'Votre cabinet est en lecture seule : régularisez votre abonnement pour reprendre les modifications.',
};

const FALLBACK = 'Une erreur est survenue. Veuillez réessayer.';

const inputClass =
  'w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60';

function describe(error: BrandingFieldError | undefined): string | null {
  if (!error) return null;
  switch (error.code) {
    case 'INVALID_COLOR':
      return 'Couleur invalide : utilisez le format #RRGGBB.';
    case 'LOW_CONTRAST':
      return error.suggestion
        ? `Contraste insuffisant avec le texte blanc (minimum 4,5:1). Teinte plus foncée proposée : ${error.suggestion}.`
        : 'Contraste insuffisant avec le texte blanc (minimum 4,5:1). Choisissez une teinte plus foncée.';
    case 'NAME_TOO_LONG':
      return `Le nom affiché est trop long (${DISPLAY_NAME_MAX} caractères maximum).`;
  }
}

function ColorField({
  id,
  label,
  value,
  fallback,
  error,
  suggestion,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  fallback: string;
  error: string | null;
  suggestion?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const shown = /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;

  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} (sélecteur)`}
          value={shown}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-background p-1 disabled:opacity-60"
        />
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={fallback}
          disabled={disabled}
          maxLength={7}
          aria-describedby={error ? `${id}-error` : undefined}
          className={inputClass}
        />
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-destructive-text">
          {error}
          {suggestion && !disabled && (
            <>
              {' '}
              <button
                type="button"
                onClick={() => onChange(suggestion)}
                className="font-semibold underline"
              >
                Utiliser cette teinte
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}

// Branding du cabinet (D33, D62) : nom affiche et couleurs, avec apercu en
// direct. Les couleurs sont verifiees ici pour guider la saisie ; le serveur
// revalide tout.
export function BrandingForm({
  branding,
  cabinetName,
  readOnly,
}: {
  branding: CabinetBranding;
  cabinetName: string;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(branding.displayName ?? '');
  const [primary, setPrimary] = useState(branding.primaryColor ?? '');
  const [secondary, setSecondary] = useState(branding.secondaryColor ?? '');
  const [serverErrors, setServerErrors] = useState<Record<string, BrandingFieldError>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const draft = validateBranding({ displayName, primaryColor: primary, secondaryColor: secondary });
  const errors = draft.ok ? serverErrors : { ...draft.errors };

  const touch = <T,>(setter: (value: T) => void) => (value: T) => {
    setSaved(false);
    setServerErrors({});
    setter(value);
  };

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (!draft.ok) return;
    setLoading(true);

    try {
      const res = await fetch('/api/cabinet/settings/branding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName, primaryColor: primary, secondaryColor: secondary }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        if (body?.fields) setServerErrors(body.fields);
        else setError(ERROR_MESSAGES[body?.error] ?? FALLBACK);
        return;
      }

      setSaved(true);
      router.refresh();
    } catch {
      setError(FALLBACK);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setSaved(false);
    setServerErrors({});
    setDisplayName('');
    setPrimary('');
    setSecondary('');
  }

  const previewPrimary = draft.ok && draft.value.primaryColor ? draft.value.primaryColor : DEFAULT_PRIMARY;
  const previewSecondary =
    draft.ok && draft.value.secondaryColor ? draft.value.secondaryColor : DEFAULT_SECONDARY;
  const previewName = (draft.ok && draft.value.displayName) || cabinetName;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-border bg-card p-5 sm:p-6"
    >
      <h2 className="text-sm font-bold text-foreground">Identité visuelle</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Le nom et les couleurs de votre cabinet remplacent ceux de SocialFlow dans votre espace et,
        à terme, dans les portails de vos clients.
      </p>

      <fieldset disabled={readOnly || loading} className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="displayName" className="text-sm font-medium text-foreground">
            Nom affiché
          </label>
          <input
            id="displayName"
            value={displayName}
            onChange={(e) => touch(setDisplayName)(e.target.value)}
            placeholder={cabinetName}
            className={`${inputClass} mt-1`}
          />
          {errors.displayName ? (
            <p role="alert" className="mt-1 text-xs text-destructive-text">
              {describe(errors.displayName)}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Laissez vide pour afficher votre raison sociale.
            </p>
          )}
        </div>

        <ColorField
          id="primaryColor"
          label="Couleur principale"
          value={primary}
          fallback={DEFAULT_PRIMARY}
          error={describe(errors.primaryColor)}
          suggestion={errors.primaryColor?.suggestion}
          disabled={readOnly || loading}
          onChange={touch(setPrimary)}
        />
        <ColorField
          id="secondaryColor"
          label="Couleur secondaire"
          value={secondary}
          fallback={DEFAULT_SECONDARY}
          error={describe(errors.secondaryColor)}
          disabled={readOnly || loading}
          onChange={touch(setSecondary)}
        />
      </fieldset>

      <div className="mt-5 rounded-xl border border-border bg-background p-4" aria-label="Aperçu">
        <p className="text-xs font-medium text-muted-foreground">Aperçu</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-sm font-bold text-foreground">{previewName}</span>
          <span
            className="rounded-lg px-3 py-1.5 text-xs font-semibold"
            style={{ backgroundColor: previewPrimary, color: readableForeground(previewPrimary) }}
          >
            Bouton principal
          </span>
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{ backgroundColor: previewSecondary, color: readableForeground(previewSecondary) }}
          >
            Accent
          </span>
        </div>
      </div>

      {readOnly && (
        <p className="mt-4 text-xs text-muted-foreground">
          Votre cabinet est en lecture seule : régularisez votre abonnement pour modifier ces
          informations.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive-text">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="mt-4 text-sm text-secondary">
          Identité visuelle enregistrée.
        </p>
      )}

      {!readOnly && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={loading || !draft.ok}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={loading}
            className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-60"
          >
            Rétablir les valeurs par défaut
          </button>
        </div>
      )}
    </form>
  );
}
