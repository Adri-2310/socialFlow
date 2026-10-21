'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, UserPlus } from 'lucide-react';
import { Field, inputClass } from '@/components/gestionnaire/form-field';
import type { CountryOption } from '@/lib/countries';
import { parseEurosToCents } from '@/lib/salarie/montant';
import { invalidFields, salarieSchema } from '@/lib/schemas/salarie';

type FormValues = {
  prenom: string;
  nom: string;
  dateNaissance: string;
  niss: string;
  iban: string;
  email: string;
  adresse: string;
  codePostal: string;
  ville: string;
  pays: string;
  statut: 'EMPLOYE' | 'OUVRIER';
  typeContrat: 'CDI' | 'CDD';
  dateEntree: string;
  dateFinContrat: string;
  fonction: string;
  regime: 'TEMPS_PLEIN' | 'TEMPS_PARTIEL';
  heuresSemaine: string;
  heuresReference: string;
  salaire: string; // en euros : mensuel pour un employé, horaire pour un ouvrier
  situationFamiliale: 'ISOLE' | 'MARIE_OU_COHABITANT_LEGAL';
  conjointAvecRevenus: '' | 'oui' | 'non';
  personnesCharge: string;
};

const INITIAL: FormValues = {
  prenom: '',
  nom: '',
  dateNaissance: '',
  niss: '',
  iban: '',
  email: '',
  adresse: '',
  codePostal: '',
  ville: '',
  pays: 'BE',
  statut: 'EMPLOYE',
  typeContrat: 'CDI',
  dateEntree: '',
  dateFinContrat: '',
  fonction: '',
  regime: 'TEMPS_PLEIN',
  heuresSemaine: '',
  heuresReference: '',
  salaire: '',
  situationFamiliale: 'ISOLE',
  conjointAvecRevenus: '',
  personnesCharge: '0',
};

// Message affiché sous un champ, d'après le code renvoyé par le schéma ou par l'API.
const FIELD_ERRORS: Record<string, string> = {
  INVALID_NOM: 'Le nom est obligatoire.',
  INVALID_PRENOM: 'Le prénom est obligatoire.',
  INVALID_DATE_NAISSANCE: 'Date de naissance invalide, ou postérieure à la date d’entrée.',
  INVALID_NISS: 'NISS invalide : 11 chiffres avec une clé de contrôle correcte.',
  NISS_ALREADY_USED:
    'Un salarié de cette entreprise porte déjà ce NISS (peut-être archivé : restaurez-le plutôt).',
  INVALID_IBAN: 'IBAN belge invalide (BE suivi de 14 chiffres, clé de contrôle comprise).',
  INVALID_EMAIL: 'Adresse email invalide.',
  INVALID_PAYS: 'Pays invalide.',
  INVALID_DATE_ENTREE: 'Date d’entrée obligatoire.',
  INVALID_DATE_FIN_CONTRAT:
    'Un CDD exige une date de fin postérieure à l’entrée ; un CDI n’en a pas.',
  INVALID_DATE_SORTIE: 'La date de sortie se saisit à la sortie du salarié.',
  INVALID_FONCTION: 'La fonction est obligatoire.',
  INVALID_COMMISSION_PARITAIRE: 'Commission paritaire incohérente avec le statut.',
  INVALID_HEURES_SEMAINE:
    'Heures par semaine obligatoires à temps partiel, sans dépasser celles de la référence.',
  INVALID_HEURES_REFERENCE: 'Heures de la personne de référence obligatoires à temps partiel.',
  INVALID_SALAIRE_MENSUEL_BRUT_CENTS: 'Montant invalide (par exemple 2850,00).',
  INVALID_SALAIRE_HORAIRE_BRUT_CENTS: 'Montant invalide (par exemple 17,25).',
  INVALID_SITUATION_FAMILIALE: 'Situation familiale invalide.',
  INVALID_CONJOINT_AVEC_REVENUS: 'Précisez si le conjoint ou cohabitant a des revenus.',
  INVALID_PERSONNES_CHARGE: 'Nombre de personnes à charge invalide (0 à 20).',
};

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Session expirée. Reconnectez-vous.',
  FORBIDDEN: "Vous n'êtes pas autorisé à effectuer cette action.",
  ENTREPRISE_NOT_FOUND: 'Cette entreprise est introuvable.',
  CABINET_READ_ONLY:
    'Votre cabinet est en lecture seule : plus rien ne peut être modifié pour le moment.',
};

const FALLBACK = 'Une erreur est survenue. Veuillez réessayer.';

const blank = (value: string) => value.trim() || undefined;
const number = (value: string) => (value.trim() ? Number(value.replace(',', '.')) : undefined);

// Le formulaire envoie le même corps que l'API attend (même schéma Zod, CONVENTIONS § 5).
// Un montant illisible devient NaN : le schéma le refuse avec le code du champ.
function toPayload(f: FormValues) {
  const cents = f.salaire.trim() ? (parseEurosToCents(f.salaire) ?? Number.NaN) : undefined;
  return {
    prenom: f.prenom,
    nom: f.nom,
    dateNaissance: f.dateNaissance,
    niss: f.niss,
    iban: f.iban,
    email: blank(f.email),
    adresse: blank(f.adresse),
    codePostal: blank(f.codePostal),
    ville: blank(f.ville),
    pays: f.pays,
    statut: f.statut,
    typeContrat: f.typeContrat,
    dateEntree: f.dateEntree,
    dateFinContrat: f.typeContrat === 'CDD' ? blank(f.dateFinContrat) : undefined,
    // D44 : CP 200 pour les employés, CP 100 pour les ouvriers.
    commissionParitaire: f.statut === 'EMPLOYE' ? '200' : '100',
    fonction: f.fonction,
    regime: f.regime,
    heuresSemaine: f.regime === 'TEMPS_PARTIEL' ? number(f.heuresSemaine) : undefined,
    heuresReference: f.regime === 'TEMPS_PARTIEL' ? number(f.heuresReference) : undefined,
    salaireMensuelBrutCents: f.statut === 'EMPLOYE' ? cents : undefined,
    salaireHoraireBrutCents: f.statut === 'OUVRIER' ? cents : undefined,
    situationFamiliale: f.situationFamiliale,
    conjointAvecRevenus:
      f.situationFamiliale === 'MARIE_OU_COHABITANT_LEGAL' && f.conjointAvecRevenus
        ? f.conjointAvecRevenus === 'oui'
        : undefined,
    personnesCharge: f.personnesCharge.trim() ? Number(f.personnesCharge) : Number.NaN,
  };
}

// Création du dossier d'un salarié (D6, roles/03 § 4.1). Le serveur revalide tout ; les
// erreurs reviennent champ par champ. NISS et IBAN ne sont jamais conservés ailleurs
// que dans ce formulaire, le temps de la saisie.
export function SalarieFormDialog({
  entrepriseId,
  countries,
  onClose,
}: {
  entrepriseId: string;
  countries: CountryOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormValues>(INITIAL);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set =
    <K extends keyof FormValues>(field: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((current) => ({ ...current, [field]: e.target.value as FormValues[K] }));

  const err = (field: string) =>
    fieldErrors[field] ? (FIELD_ERRORS[fieldErrors[field]] ?? 'Valeur invalide.') : undefined;
  // Le montant est un seul champ à l'écran mais deux à l'API selon le statut.
  const salaireErr =
    form.statut === 'EMPLOYE' ? err('salaireMensuelBrutCents') : err('salaireHoraireBrutCents');

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const payload = toPayload(form);
    const check = salarieSchema.safeParse(payload);
    if (!check.success) {
      setFieldErrors(invalidFields(check.error));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/entreprises/${entrepriseId}/salaries`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
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

  const partiel = form.regime === 'TEMPS_PARTIEL';
  const marie = form.situationFamiliale === 'MARIE_OU_COHABITANT_LEGAL';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        onSubmit={handleSubmit}
        noValidate
        role="dialog"
        aria-modal="true"
        aria-labelledby="salarie-form-title"
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-6"
      >
        <div className="flex items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <UserPlus className="h-5 w-5" />
          </span>
          <div>
            <h3 id="salarie-form-title" className="text-lg font-semibold text-foreground">
              Nouveau salarié
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Le NISS et l’IBAN sont chiffrés à l’enregistrement et masqués à l’affichage.
            </p>
          </div>
        </div>

        <fieldset disabled={loading} className="mt-5 grid gap-4 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-semibold text-foreground">Identité</legend>
          <Field id="sal-prenom" label="Prénom" error={err('prenom')}>
            <input
              id="sal-prenom"
              value={form.prenom}
              onChange={set('prenom')}
              autoComplete="off"
              className={inputClass}
            />
          </Field>
          <Field id="sal-nom" label="Nom" error={err('nom')}>
            <input
              id="sal-nom"
              value={form.nom}
              onChange={set('nom')}
              autoComplete="off"
              className={inputClass}
            />
          </Field>
          <Field id="sal-naissance" label="Date de naissance" error={err('dateNaissance')}>
            <input
              id="sal-naissance"
              type="date"
              value={form.dateNaissance}
              onChange={set('dateNaissance')}
              className={inputClass}
            />
          </Field>
          <Field id="sal-niss" label="NISS" error={err('niss')} hint="Par exemple 85.07.30-033.28">
            <input
              id="sal-niss"
              value={form.niss}
              onChange={set('niss')}
              inputMode="numeric"
              autoComplete="off"
              className={inputClass}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field
              id="sal-iban"
              label="IBAN"
              error={err('iban')}
              hint="IBAN belge, par exemple BE68 5390 0754 7034"
            >
              <input
                id="sal-iban"
                value={form.iban}
                onChange={set('iban')}
                autoComplete="off"
                autoCapitalize="characters"
                className={inputClass}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field
              id="sal-email"
              label="Email (facultatif)"
              error={err('email')}
              hint="Sert à l’invitation au portail du salarié."
            >
              <input
                id="sal-email"
                type="email"
                inputMode="email"
                value={form.email}
                onChange={set('email')}
                autoComplete="off"
                className={inputClass}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field id="sal-adresse" label="Adresse (facultatif)" error={err('adresse')}>
              <input
                id="sal-adresse"
                value={form.adresse}
                onChange={set('adresse')}
                autoComplete="off"
                className={inputClass}
              />
            </Field>
          </div>
          <Field id="sal-postal" label="Code postal (facultatif)" error={err('codePostal')}>
            <input
              id="sal-postal"
              value={form.codePostal}
              onChange={set('codePostal')}
              autoComplete="off"
              className={inputClass}
            />
          </Field>
          <Field id="sal-ville" label="Ville (facultatif)" error={err('ville')}>
            <input
              id="sal-ville"
              value={form.ville}
              onChange={set('ville')}
              autoComplete="off"
              className={inputClass}
            />
          </Field>
          <Field id="sal-pays" label="Pays" error={err('pays')}>
            <select id="sal-pays" value={form.pays} onChange={set('pays')} className={inputClass}>
              {countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </select>
          </Field>
        </fieldset>

        <fieldset disabled={loading} className="mt-6 grid gap-4 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-semibold text-foreground">Contrat</legend>
          <Field
            id="sal-statut"
            label="Statut"
            error={err('statut')}
            hint={
              form.statut === 'EMPLOYE' ? 'Commission paritaire 200' : 'Commission paritaire 100'
            }
          >
            <select
              id="sal-statut"
              value={form.statut}
              onChange={set('statut')}
              className={inputClass}
            >
              <option value="EMPLOYE">Employé</option>
              <option value="OUVRIER">Ouvrier</option>
            </select>
          </Field>
          <Field id="sal-fonction" label="Fonction" error={err('fonction')}>
            <input
              id="sal-fonction"
              value={form.fonction}
              onChange={set('fonction')}
              autoComplete="off"
              className={inputClass}
            />
          </Field>
          <Field id="sal-type" label="Type de contrat" error={err('typeContrat')}>
            <select
              id="sal-type"
              value={form.typeContrat}
              onChange={set('typeContrat')}
              className={inputClass}
            >
              <option value="CDI">CDI</option>
              <option value="CDD">CDD</option>
            </select>
          </Field>
          <Field
            id="sal-entree"
            label="Date d’entrée"
            error={err('dateEntree')}
            hint="Peut être dans le futur : la DIMONA part avant le premier jour."
          >
            <input
              id="sal-entree"
              type="date"
              value={form.dateEntree}
              onChange={set('dateEntree')}
              className={inputClass}
            />
          </Field>
          {form.typeContrat === 'CDD' && (
            <Field id="sal-fin" label="Date de fin du CDD" error={err('dateFinContrat')}>
              <input
                id="sal-fin"
                type="date"
                value={form.dateFinContrat}
                onChange={set('dateFinContrat')}
                className={inputClass}
              />
            </Field>
          )}
        </fieldset>

        <fieldset disabled={loading} className="mt-6 grid gap-4 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-semibold text-foreground">
            Temps de travail et rémunération
          </legend>
          <Field id="sal-regime" label="Régime" error={err('regime')}>
            <select
              id="sal-regime"
              value={form.regime}
              onChange={set('regime')}
              className={inputClass}
            >
              <option value="TEMPS_PLEIN">Temps plein</option>
              <option value="TEMPS_PARTIEL">Temps partiel</option>
            </select>
          </Field>
          <Field
            id="sal-salaire"
            label={
              form.statut === 'EMPLOYE' ? 'Salaire mensuel brut (€)' : 'Salaire horaire brut (€)'
            }
            error={salaireErr}
            hint={form.statut === 'EMPLOYE' ? 'Par exemple 2850,00' : 'Par exemple 17,25'}
          >
            <input
              id="sal-salaire"
              value={form.salaire}
              onChange={set('salaire')}
              inputMode="decimal"
              autoComplete="off"
              className={inputClass}
            />
          </Field>
          {partiel && (
            <>
              <Field
                id="sal-heures"
                label="Heures par semaine du salarié"
                error={err('heuresSemaine')}
              >
                <input
                  id="sal-heures"
                  value={form.heuresSemaine}
                  onChange={set('heuresSemaine')}
                  inputMode="decimal"
                  autoComplete="off"
                  className={inputClass}
                />
              </Field>
              <Field
                id="sal-heures-ref"
                label="Heures par semaine de la personne de référence"
                error={err('heuresReference')}
              >
                <input
                  id="sal-heures-ref"
                  value={form.heuresReference}
                  onChange={set('heuresReference')}
                  inputMode="decimal"
                  autoComplete="off"
                  className={inputClass}
                />
              </Field>
            </>
          )}
        </fieldset>

        <fieldset disabled={loading} className="mt-6 grid gap-4 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-semibold text-foreground">Situation fiscale</legend>
          <Field
            id="sal-situation"
            label="Situation familiale"
            error={err('situationFamiliale')}
            hint="Un cohabitant de fait (sans déclaration légale) se saisit comme isolé."
          >
            <select
              id="sal-situation"
              value={form.situationFamiliale}
              onChange={set('situationFamiliale')}
              className={inputClass}
            >
              <option value="ISOLE">Isolé</option>
              <option value="MARIE_OU_COHABITANT_LEGAL">Marié ou cohabitant légal</option>
            </select>
          </Field>
          {marie && (
            <Field
              id="sal-conjoint"
              label="Revenus du conjoint ou cohabitant"
              error={err('conjointAvecRevenus')}
            >
              <select
                id="sal-conjoint"
                value={form.conjointAvecRevenus}
                onChange={set('conjointAvecRevenus')}
                className={inputClass}
              >
                <option value="">Choisir…</option>
                <option value="non">Sans revenus professionnels</option>
                <option value="oui">Avec revenus professionnels</option>
              </select>
            </Field>
          )}
          <Field id="sal-charge" label="Personnes à charge" error={err('personnesCharge')}>
            <input
              id="sal-charge"
              type="number"
              min={0}
              max={20}
              value={form.personnesCharge}
              onChange={set('personnesCharge')}
              className={inputClass}
            />
          </Field>
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
            Créer le dossier
          </button>
        </div>
      </form>
    </div>
  );
}
