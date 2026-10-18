'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Loader2 } from 'lucide-react';
import type { CountryOption } from '@/lib/countries';

export type EntrepriseFormValues = {
  name: string;
  vatNumber: string;
  addressLine: string;
  postalCode: string;
  city: string;
  country: string;
  contactEmail: string;
  contactPhone: string;
  gestionnaireIds: string[];
};

export type GestionnaireOption = { id: string; name: string; status: 'actif' | 'suspendu' };

export const EMPTY_ENTREPRISE: EntrepriseFormValues = {
  name: '',
  vatNumber: '',
  addressLine: '',
  postalCode: '',
  city: '',
  country: 'BE',
  contactEmail: '',
  contactPhone: '',
  gestionnaireIds: [],
};

const FIELD_ERRORS: Record<string, string> = {
  NAME_REQUIRED: 'La raison sociale est obligatoire (2 caractères minimum).',
  NAME_TOO_LONG: 'La raison sociale est trop longue (120 caractères maximum).',
  VAT_REQUIRED: 'Le n° d’entreprise est obligatoire.',
  INVALID_VAT: 'N° d’entreprise belge invalide (format BE0123.456.749, avec son contrôle).',
  VAT_ALREADY_USED:
    'Une entreprise de votre cabinet porte déjà ce n° (peut-être archivée : restaurez-la plutôt).',
  INVALID_EMAIL: 'Adresse email invalide.',
  INVALID_PHONE: 'Numéro de téléphone invalide.',
  INVALID_COUNTRY: 'Pays invalide : choisissez un pays dans la liste.',
  GESTIONNAIRE_REQUIRED: 'Assignez au moins un gestionnaire.',
  GESTIONNAIRE_INVALID: 'Un des gestionnaires choisis est introuvable.',
  NO_ACTIVE_GESTIONNAIRE: 'Au moins un gestionnaire assigné doit être actif (non suspendu).',
};

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Session expirée. Reconnectez-vous.',
  FORBIDDEN: "Vous n'êtes pas autorisé à effectuer cette action.",
  ENTREPRISE_NOT_FOUND: 'Cette entreprise est introuvable.',
  CABINET_READ_ONLY:
    'Votre cabinet est en lecture seule : régularisez votre abonnement pour reprendre les modifications.',
  QUOTA_EXCEEDED:
    "Le quota d'entreprises de votre plan est atteint : archivez-en une ou passez à un plan supérieur.",
};

const FALLBACK = 'Une erreur est survenue. Veuillez réessayer.';

const inputClass =
  'mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-foreground sm:text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60';

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-destructive-text">
          {error}
        </p>
      )}
    </div>
  );
}

// Creation ou modification d'une entreprise cliente (D4, § 4.3). Le serveur
// revalide tout ; les erreurs reviennent champ par champ. `entrepriseId`
// absent = creation.
export function EntrepriseFormDialog({
  entrepriseId,
  initial,
  countries,
  gestionnaires,
  onClose,
}: {
  entrepriseId?: string;
  initial: EntrepriseFormValues;
  countries: CountryOption[];
  gestionnaires: GestionnaireOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<EntrepriseFormValues>(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set =
    (field: Exclude<keyof EntrepriseFormValues, 'gestionnaireIds'>) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((current) => ({ ...current, [field]: e.target.value }));

  function toggle(id: string) {
    setForm((current) => ({
      ...current,
      gestionnaireIds: current.gestionnaireIds.includes(id)
        ? current.gestionnaireIds.filter((value) => value !== id)
        : [...current.gestionnaireIds, id],
    }));
  }

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setLoading(true);

    try {
      const res = await fetch(
        entrepriseId ? `/api/cabinet/entreprises/${entrepriseId}` : '/api/cabinet/entreprises',
        {
          method: entrepriseId ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(form),
        },
      );
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        if (body?.fields) setFieldErrors(body.fields);
        else setError(ERROR_MESSAGES[body?.error] ?? FALLBACK);
        return;
      }

      router.refresh();
      onClose();
    } catch {
      setError(FALLBACK);
    } finally {
      setLoading(false);
    }
  }

  const err = (field: string) =>
    fieldErrors[field] ? (FIELD_ERRORS[fieldErrors[field]] ?? FALLBACK) : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        onSubmit={handleSubmit}
        noValidate
        role="dialog"
        aria-modal="true"
        aria-labelledby="entreprise-form-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-6"
      >
        <div className="flex items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </span>
          <div>
            <h3 id="entreprise-form-title" className="text-lg font-semibold text-foreground">
              {entrepriseId ? 'Modifier l’entreprise' : 'Nouvelle entreprise cliente'}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Assignez au moins un gestionnaire : seuls les gestionnaires assignés travaillent sur
              cette entreprise.
            </p>
          </div>
        </div>

        <fieldset disabled={loading} className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field id="ent-name" label="Raison sociale" error={err('name')}>
              <input id="ent-name" value={form.name} onChange={set('name')} required autoComplete="off" className={inputClass} />
            </Field>
          </div>

          <Field id="ent-vat" label="N° d’entreprise / TVA" error={err('vatNumber')}>
            <input
              id="ent-vat"
              value={form.vatNumber}
              onChange={set('vatNumber')}
              placeholder="BE0123.456.749"
              autoComplete="off"
              autoCapitalize="characters"
              className={inputClass}
            />
          </Field>

          <Field id="ent-country" label="Pays" error={err('country')}>
            <select id="ent-country" value={form.country} onChange={set('country')} className={inputClass}>
              {countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="sm:col-span-2">
            <Field id="ent-address" label="Adresse" error={err('addressLine')}>
              <input id="ent-address" value={form.addressLine} onChange={set('addressLine')} autoComplete="off" className={inputClass} />
            </Field>
          </div>

          <Field id="ent-postal" label="Code postal" error={err('postalCode')}>
            <input id="ent-postal" value={form.postalCode} onChange={set('postalCode')} autoComplete="off" className={inputClass} />
          </Field>

          <Field id="ent-city" label="Ville" error={err('city')}>
            <input id="ent-city" value={form.city} onChange={set('city')} autoComplete="off" className={inputClass} />
          </Field>

          <Field id="ent-email" label="Email de contact" error={err('contactEmail')}>
            <input
              id="ent-email"
              type="email"
              inputMode="email"
              autoComplete="off"
              value={form.contactEmail}
              onChange={set('contactEmail')}
              className={inputClass}
            />
          </Field>

          <Field id="ent-phone" label="Téléphone" error={err('contactPhone')}>
            <input id="ent-phone" type="tel" inputMode="tel" autoComplete="off" value={form.contactPhone} onChange={set('contactPhone')} className={inputClass} />
          </Field>
        </fieldset>

        <fieldset disabled={loading} className="mt-5">
          <legend className="text-sm font-medium text-foreground">Gestionnaires assignés</legend>
          {gestionnaires.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Aucun gestionnaire dans votre cabinet : invitez-en un depuis la page Gestionnaires.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
              {gestionnaires.map((g) => (
                <li key={g.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={form.gestionnaireIds.includes(g.id)}
                      onChange={() => toggle(g.id)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="min-w-0 flex-1 truncate">{g.name}</span>
                    {g.status === 'suspendu' && (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive-text">
                        Suspendu
                      </span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {err('gestionnaireIds') && (
            <p role="alert" className="mt-1 text-xs text-destructive-text">
              {err('gestionnaireIds')}
            </p>
          )}
        </fieldset>

        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive-text">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-input px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {entrepriseId ? 'Enregistrer' : 'Créer l’entreprise'}
          </button>
        </div>
      </form>
    </div>
  );
}
