'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { FormDialog } from '@/components/shared/form-dialog';
import { FormField } from '@/components/shared/form-field';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { quotaAwareMessage } from '@/lib/billing/quota-messages';
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
  // Saisi comme du texte, envoye comme un nombre (D91).
  jourLimitePrestations: string;
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
  jourLimitePrestations: '20',
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
  INVALID_JOUR_LIMITE: 'Le jour limite doit être un entier de 1 à 28.',
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
          // Le jour limite part en nombre ; un champ vide ou illisible devient NaN (null en JSON)
          // et le serveur le refuse avec son code.
          body: JSON.stringify({
            ...form,
            jourLimitePrestations: Number(form.jourLimitePrestations),
          }),
        },
      );
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        if (body?.fields) setFieldErrors(body.fields);
        else setError(quotaAwareMessage(body, ERROR_MESSAGES, 'entreprises', FALLBACK));
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
    <FormDialog
      size="xl"
      icon={<Building2 />}
      title={entrepriseId ? 'Modifier l’entreprise' : 'Nouvelle entreprise cliente'}
      description="Assignez au moins un gestionnaire : seuls les gestionnaires assignés travaillent sur cette entreprise."
    >
      <form onSubmit={handleSubmit} noValidate>
        <fieldset disabled={loading} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormField id="ent-name" label="Raison sociale" error={err('name')}>
              {(c) => (
                <Input
                  {...c}
                  value={form.name}
                  onChange={set('name')}
                  required
                  autoComplete="off"
                />
              )}
            </FormField>
          </div>

          <FormField id="ent-vat" label="N° d’entreprise / TVA" error={err('vatNumber')}>
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

          <FormField id="ent-country" label="Pays" error={err('country')}>
            {(c) => (
              <NativeSelect {...c} value={form.country} onChange={set('country')}>
                {countries.map((country) => (
                  <NativeSelectOption key={country.code} value={country.code}>
                    {country.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </FormField>

          <div className="sm:col-span-2">
            <FormField id="ent-address" label="Adresse" error={err('addressLine')}>
              {(c) => (
                <Input
                  {...c}
                  value={form.addressLine}
                  onChange={set('addressLine')}
                  autoComplete="off"
                />
              )}
            </FormField>
          </div>

          <FormField id="ent-postal" label="Code postal" error={err('postalCode')}>
            {(c) => (
              <Input
                {...c}
                value={form.postalCode}
                onChange={set('postalCode')}
                autoComplete="off"
              />
            )}
          </FormField>

          <FormField id="ent-city" label="Ville" error={err('city')}>
            {(c) => <Input {...c} value={form.city} onChange={set('city')} autoComplete="off" />}
          </FormField>

          <FormField id="ent-email" label="Email de contact" error={err('contactEmail')}>
            {(c) => (
              <Input
                {...c}
                type="email"
                inputMode="email"
                autoComplete="off"
                value={form.contactEmail}
                onChange={set('contactEmail')}
              />
            )}
          </FormField>

          <FormField
            id="ent-jour-limite"
            label="Jour limite des prestations"
            error={err('jourLimitePrestations')}
            hint="Chaque mois, l’entreprise donne ses prestations avant ce jour (1 à 28). Le gestionnaire peut le décaler pour un mois précis."
          >
            {(c) => (
              <Input
                {...c}
                type="number"
                inputMode="numeric"
                min={1}
                max={28}
                value={form.jourLimitePrestations}
                onChange={set('jourLimitePrestations')}
              />
            )}
          </FormField>

          <FormField id="ent-phone" label="Téléphone" error={err('contactPhone')}>
            {(c) => (
              <Input
                {...c}
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={form.contactPhone}
                onChange={set('contactPhone')}
              />
            )}
          </FormField>
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
                  <Label
                    htmlFor={`ent-gestionnaire-${g.id}`}
                    className="min-h-11 cursor-pointer gap-3 px-3 py-2 font-normal text-foreground"
                  >
                    {/* Une case Base UI n'est pas un contrôle natif : le fieldset ne la désactive pas. */}
                    <Checkbox
                      id={`ent-gestionnaire-${g.id}`}
                      checked={form.gestionnaireIds.includes(g.id)}
                      onCheckedChange={() => toggle(g.id)}
                      disabled={loading}
                    />
                    <span className="min-w-0 flex-1 truncate">{g.name}</span>
                    {g.status === 'suspendu' && <StatusBadge domain="compte" status="suspendu" />}
                  </Label>
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
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button type="submit" disabled={loading}>
            {loading && <Spinner />}
            {entrepriseId ? 'Enregistrer' : 'Créer l’entreprise'}
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}
