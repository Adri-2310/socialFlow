'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import type { CountryOption } from '@/lib/countries';
import type { CabinetIdentity } from '@/lib/cabinet/cabinet-identity';

const FIELD_ERRORS: Record<string, string> = {
  NAME_REQUIRED: 'La raison sociale est obligatoire (2 caractères minimum).',
  NAME_TOO_LONG: 'La raison sociale est trop longue (120 caractères maximum).',
  INVALID_VAT: 'N° de TVA belge invalide (format BE0123.456.749, avec son contrôle).',
  INVALID_EMAIL: 'Adresse email invalide.',
  INVALID_PHONE: 'Numéro de téléphone invalide.',
  INVALID_COUNTRY: 'Pays invalide : choisissez un pays dans la liste.',
};

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Session expirée. Reconnectez-vous.',
  FORBIDDEN: 'Seul le titulaire du cabinet peut modifier ces informations.',
  CABINET_NOT_FOUND: 'Cabinet introuvable.',
  CABINET_READ_ONLY:
    'Votre cabinet est en lecture seule : régularisez votre abonnement pour reprendre les modifications.',
};

const FALLBACK = 'Une erreur est survenue. Veuillez réessayer.';

type FormState = Record<keyof CabinetIdentity, string>;

const toForm = (identity: CabinetIdentity): FormState => ({
  name: identity.name,
  vatNumber: identity.vatNumber ?? '',
  addressLine: identity.addressLine ?? '',
  postalCode: identity.postalCode ?? '',
  city: identity.city ?? '',
  country: identity.country,
  contactEmail: identity.contactEmail ?? '',
  contactPhone: identity.contactPhone ?? '',
});

// Identite du cabinet (D30) : ce que ses clients voient d'elle. Le serveur
// revalide tout ; les erreurs reviennent champ par champ.
// `countries` est calcule cote serveur : les noms de pays et leur tri viennent
// d'Intl, dont les donnees different entre Node et le navigateur. Les calculer
// aux deux endroits provoquait une erreur d'hydratation.
export function IdentityForm({
  identity,
  countries,
  readOnly,
}: {
  identity: CabinetIdentity;
  countries: CountryOption[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(toForm(identity));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const set =
    (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setSaved(false);
      setForm((current) => ({ ...current, [field]: e.target.value }));
    };

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSaved(false);
    setLoading(true);

    try {
      const res = await fetch('/api/cabinet/settings/identity', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        if (body?.fields) setFieldErrors(body.fields);
        else setError(ERROR_MESSAGES[body?.error] ?? FALLBACK);
        return;
      }

      // Le serveur renvoie la forme canonique (TVA reformatee...).
      setForm(toForm(body.identity as CabinetIdentity));
      setSaved(true);
      router.refresh();
    } catch {
      setError(FALLBACK);
    } finally {
      setLoading(false);
    }
  }

  const err = (field: string) =>
    fieldErrors[field] ? (FIELD_ERRORS[fieldErrors[field]] ?? FALLBACK) : undefined;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-border bg-card p-5 sm:p-6"
    >
      <h2 className="text-sm font-bold text-foreground">Identité du cabinet</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Ces informations sont présentées à vos entreprises clientes et à leurs salariés.
      </p>

      <fieldset disabled={readOnly || loading} className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormField id="name" label="Raison sociale" error={err('name')}>
            {(c) => (
              <Input
                {...c}
                value={form.name}
                onChange={set('name')}
                required
                autoComplete="organization"
              />
            )}
          </FormField>
        </div>

        <FormField
          id="vatNumber"
          label="N° de TVA / d’entreprise"
          hint="Format belge : BE0123.456.749"
          error={err('vatNumber')}
        >
          {(c) => (
            <Input
              {...c}
              value={form.vatNumber}
              onChange={set('vatNumber')}
              placeholder="BE0123.456.749"
              autoComplete="off"
              autoCapitalize="characters"
            />
          )}
        </FormField>

        <FormField id="country" label="Pays" error={err('country')}>
          {(c) => (
            <NativeSelect
              {...c}
              value={form.country}
              onChange={set('country')}
              autoComplete="country"
            >
              {countries.map((country) => (
                <NativeSelectOption key={country.code} value={country.code}>
                  {country.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </FormField>

        <div className="sm:col-span-2">
          <FormField id="addressLine" label="Adresse" error={err('addressLine')}>
            {(c) => (
              <Input
                {...c}
                value={form.addressLine}
                onChange={set('addressLine')}
                autoComplete="street-address"
              />
            )}
          </FormField>
        </div>

        <FormField id="postalCode" label="Code postal" error={err('postalCode')}>
          {(c) => (
            <Input
              {...c}
              value={form.postalCode}
              onChange={set('postalCode')}
              autoComplete="postal-code"
            />
          )}
        </FormField>

        <FormField id="city" label="Ville" error={err('city')}>
          {(c) => (
            <Input {...c} value={form.city} onChange={set('city')} autoComplete="address-level2" />
          )}
        </FormField>

        <FormField
          id="contactEmail"
          label="Email de contact"
          hint="Utilisé comme adresse de réponse des emails envoyés à vos clients."
          error={err('contactEmail')}
        >
          {(c) => (
            <Input
              {...c}
              type="email"
              inputMode="email"
              autoComplete="email"
              value={form.contactEmail}
              onChange={set('contactEmail')}
            />
          )}
        </FormField>

        <FormField id="contactPhone" label="Téléphone" error={err('contactPhone')}>
          {(c) => (
            <Input
              {...c}
              type="tel"
              inputMode="tel"
              value={form.contactPhone}
              onChange={set('contactPhone')}
              autoComplete="tel"
            />
          )}
        </FormField>
      </fieldset>

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
          Informations enregistrées.
        </p>
      )}

      {!readOnly && (
        <Button type="submit" disabled={loading} className="mt-5">
          {loading && <Spinner />}
          Enregistrer
        </Button>
      )}
    </form>
  );
}
