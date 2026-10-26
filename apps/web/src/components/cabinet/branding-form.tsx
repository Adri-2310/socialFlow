'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import {
  DEFAULT_PRIMARY,
  DEFAULT_SECONDARY,
  DISPLAY_NAME_MAX,
  validateBranding,
  type BrandingFieldError,
  type CabinetBranding,
} from '@/lib/branding/branding-rules';
import { readableForeground } from '@/lib/branding/color';

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Session expirée. Reconnectez-vous.',
  FORBIDDEN: 'Seul le titulaire du cabinet peut modifier ces informations.',
  CABINET_NOT_FOUND: 'Cabinet introuvable.',
  CABINET_READ_ONLY:
    'Votre cabinet est en lecture seule : régularisez votre abonnement pour reprendre les modifications.',
};

const FALLBACK = 'Une erreur est survenue. Veuillez réessayer.';

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
    <FormField
      id={id}
      label={label}
      error={
        error && (
          <>
            {error}
            {suggestion && !disabled && (
              <>
                {' '}
                <Button
                  type="button"
                  variant="link"
                  onClick={() => onChange(suggestion)}
                  className="h-auto p-0 text-xs font-semibold text-destructive-text underline"
                >
                  Utiliser cette teinte
                </Button>
              </>
            )}
          </>
        )
      }
    >
      {(c) => (
        <div className="flex items-center gap-2">
          <Input
            type="color"
            aria-label={`${label} (sélecteur)`}
            value={shown}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="h-10 w-12 shrink-0 cursor-pointer p-1"
          />
          <Input
            {...c}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={fallback}
            disabled={disabled}
            maxLength={7}
          />
        </div>
      )}
    </FormField>
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

  const touch =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
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

  const previewPrimary =
    draft.ok && draft.value.primaryColor ? draft.value.primaryColor : DEFAULT_PRIMARY;
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
          <FormField
            id="displayName"
            label="Nom affiché"
            hint="Laissez vide pour afficher votre raison sociale."
            error={describe(errors.displayName)}
          >
            {(c) => (
              <Input
                {...c}
                value={displayName}
                onChange={(e) => touch(setDisplayName)(e.target.value)}
                placeholder={cabinetName}
              />
            )}
          </FormField>
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
            style={{
              backgroundColor: previewSecondary,
              color: readableForeground(previewSecondary),
            }}
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
          <Button type="submit" disabled={loading || !draft.ok}>
            {loading && <Spinner />}
            Enregistrer
          </Button>
          <Button type="button" variant="outline" onClick={reset} disabled={loading}>
            Rétablir les valeurs par défaut
          </Button>
        </div>
      )}
    </form>
  );
}
