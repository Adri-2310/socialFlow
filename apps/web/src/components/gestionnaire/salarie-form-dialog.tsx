'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil, UserPlus } from 'lucide-react';
import { Field, inputClass } from '@/components/gestionnaire/form-field';
import type { CountryOption } from '@/lib/countries';
import { parseEurosToCents } from '@/lib/salarie/montant';
import { ERROR_MESSAGES, FALLBACK, FIELD_ERRORS, blank, number } from '@/lib/salarie/form-messages';
import { INITIAL, type FormValues } from '@/lib/salarie/salarie-form';
import { invalidFields, salarieModificationSchema, salarieSchema } from '@/lib/schemas/salarie';

// Le formulaire envoie le même corps que l'API attend (même schéma Zod, CONVENTIONS § 5).
// Un montant illisible devient NaN : le schéma le refuse avec le code du champ.
function toPayload(f: FormValues) {
  const cents = f.salaire.trim() ? (parseEurosToCents(f.salaire) ?? Number.NaN) : undefined;
  return {
    prenom: f.prenom,
    nom: f.nom,
    dateNaissance: f.dateNaissance,
    // Vide = absent : à la création le schéma le refuse, à la modification il reste inchangé.
    niss: blank(f.niss),
    iban: blank(f.iban),
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

// La modification ne touche ni aux conditions de travail (datées, voir « Ajouter une
// condition ») ni à la date de sortie : on retire ces champs de la charge utile.
function toModificationPayload(f: FormValues) {
  const {
    statut: _statut,
    commissionParitaire: _cp,
    fonction: _fonction,
    regime: _regime,
    heuresSemaine: _heuresSemaine,
    heuresReference: _heuresReference,
    salaireMensuelBrutCents: _mensuel,
    salaireHoraireBrutCents: _horaire,
    ...dossier
  } = toPayload(f);
  return dossier;
}

// Création (D6, roles/03 § 4.1) ou modification (§ 4.2) du dossier d'un salarié. Le serveur
// revalide tout ; les erreurs reviennent champ par champ. NISS et IBAN ne sont jamais
// conservés ailleurs que dans ce formulaire, le temps de la saisie, et jamais préremplis.
export type SalarieFormTarget =
  | { mode: 'create'; entrepriseId: string }
  | {
      mode: 'edit';
      salarieId: string;
      initial: FormValues;
      // Valeurs masquées, affichées en indication : le clair ne sort que par le dévoilement.
      nissMasque: string;
      ibanMasque: string;
    };

export function SalarieFormDialog({
  target,
  countries,
  onClose,
}: {
  target: SalarieFormTarget;
  countries: CountryOption[];
  onClose: () => void;
}) {
  const edit = target.mode === 'edit';
  const router = useRouter();
  const [form, setForm] = useState<FormValues>(target.mode === 'edit' ? target.initial : INITIAL);
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

    const payload = edit ? toModificationPayload(form) : toPayload(form);
    const check = (edit ? salarieModificationSchema : salarieSchema).safeParse(payload);
    if (!check.success) {
      setFieldErrors(invalidFields(check.error));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        target.mode === 'edit'
          ? `/api/salaries/${target.salarieId}`
          : `/api/entreprises/${target.entrepriseId}/salaries`,
        {
          method: target.mode === 'edit' ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
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
            {edit ? <Pencil className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
          </span>
          <div>
            <h3 id="salarie-form-title" className="text-lg font-semibold text-foreground">
              {edit ? 'Modifier le dossier' : 'Nouveau salarié'}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {edit
                ? 'Le statut, la fonction, le régime et la rémunération sont datés : ils se changent par « Ajouter une condition ».'
                : 'Le NISS et l’IBAN sont chiffrés à l’enregistrement et masqués à l’affichage.'}
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
          <Field
            id="sal-niss"
            label="NISS"
            error={err('niss')}
            hint={
              target.mode === 'edit'
                ? `Actuel : ${target.nissMasque}. Laissez vide pour ne pas le changer.`
                : 'Par exemple 85.07.30-033.28'
            }
          >
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
              hint={
                target.mode === 'edit'
                  ? `Actuel : ${target.ibanMasque}. Laissez vide pour ne pas le changer.`
                  : 'IBAN belge, par exemple BE68 5390 0754 7034'
              }
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
          {!edit && (
            <>
              <Field
                id="sal-statut"
                label="Statut"
                error={err('statut')}
                hint={
                  form.statut === 'EMPLOYE'
                    ? 'Commission paritaire 200'
                    : 'Commission paritaire 100'
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
            </>
          )}
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

        {!edit && (
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
        )}

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
            {edit ? 'Enregistrer' : 'Créer le dossier'}
          </button>
        </div>
      </form>
    </div>
  );
}
