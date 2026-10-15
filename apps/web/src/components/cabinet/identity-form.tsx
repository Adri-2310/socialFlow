'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type { CountryOption } from '@/lib/countries';
import type { CabinetIdentity } from '@/lib/cabinet-identity';

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

const inputClass =
  'mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60';

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
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

  const err = (field: string) => (fieldErrors[field] ? FIELD_ERRORS[fieldErrors[field]] ?? FALLBACK : undefined);

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
          <Field id="name" label="Raison sociale" error={err('name')}>
            <input id="name" value={form.name} onChange={set('name')} required className={inputClass} />
          </Field>
        </div>

        <Field
          id="vatNumber"
          label="N° de TVA / d’entreprise"
          hint="Format belge : BE0123.456.749"
          error={err('vatNumber')}
        >
          <input
            id="vatNumber"
            value={form.vatNumber}
            onChange={set('vatNumber')}
            placeholder="BE0123.456.749"
            className={inputClass}
          />
        </Field>

        <Field id="country" label="Pays" error={err('country')}>
          <select id="country" value={form.country} onChange={set('country')} className={inputClass}>
            {countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="sm:col-span-2">
          <Field id="addressLine" label="Adresse" error={err('addressLine')}>
            <input id="addressLine" value={form.addressLine} onChange={set('addressLine')} className={inputClass} />
          </Field>
        </div>

        <Field id="postalCode" label="Code postal" error={err('postalCode')}>
          <input id="postalCode" value={form.postalCode} onChange={set('postalCode')} className={inputClass} />
        </Field>

        <Field id="city" label="Ville" error={err('city')}>
          <input id="city" value={form.city} onChange={set('city')} className={inputClass} />
        </Field>

        <Field
          id="contactEmail"
          label="Email de contact"
          hint="Utilisé comme adresse de réponse des emails envoyés à vos clients."
          error={err('contactEmail')}
        >
          <input
            id="contactEmail"
            type="email"
            value={form.contactEmail}
            onChange={set('contactEmail')}
            className={inputClass}
          />
        </Field>

        <Field id="contactPhone" label="Téléphone" error={err('contactPhone')}>
          <input id="contactPhone" type="tel" value={form.contactPhone} onChange={set('contactPhone')} className={inputClass} />
        </Field>
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
        <button
          type="submit"
          disabled={loading}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Enregistrer
        </button>
      )}
    </form>
  );
}
