'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, UserPlus } from 'lucide-react';
import { FormDialog } from '@/components/shared/form-dialog';
import { CheckField, FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import type { CountryOption } from '@/lib/countries';
import { texteEnMinutes } from '@/lib/periode/periode-format';
import { parseEurosToCents } from '@/lib/salarie/montant';
import { ERROR_MESSAGES, FALLBACK, FIELD_ERRORS, blank } from '@/lib/salarie/form-messages';
import { INITIAL, fiscalPayload, vueFiscale, type FormValues } from '@/lib/salarie/salarie-form';
import {
  REVENUS_CONJOINT,
  REVENUS_CONJOINT_LIBELLES,
  attributionDesCharges,
  conjointSansRevenusPropres,
  parentIsolePossible,
} from '@/lib/salarie/situation-fiscale';
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
    // Saisie en heures (« 38 », « 30,4 » ou « 30:24 »), envoyée en minutes (D96).
    heuresSemaineMinutes:
      f.regime === 'TEMPS_PARTIEL' ? (texteEnMinutes(f.heuresSemaine) ?? undefined) : undefined,
    heuresReferenceMinutes:
      f.regime === 'TEMPS_PARTIEL' ? (texteEnMinutes(f.heuresReference) ?? undefined) : undefined,
    salaireMensuelBrutCents: f.statut === 'EMPLOYE' ? cents : undefined,
    salaireHoraireBrutCents: f.statut === 'OUVRIER' ? cents : undefined,
    ...fiscalPayload(f),
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
    heuresSemaineMinutes: _heuresSemaine,
    heuresReferenceMinutes: _heuresReference,
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
  const vue = vueFiscale(form);
  const toggle =
    (field: 'beneficiaireHandicape' | 'conjointHandicape' | 'autresPersonnes' | 'parentIsole') =>
    (checked: boolean) =>
      setForm((current) => ({ ...current, [field]: checked }));

  // Compteurs de la situation fiscale : mêmes bornes partout (0 à 20, voir le schéma).
  const compteur = (
    field:
      | 'enfantsCharge'
      | 'enfantsHandicapes'
      | 'autresChargeDependantes66'
      | 'autresChargeHandicapees'
      | 'autresCharge',
    id: string,
    label: string,
    hint?: string,
  ) => (
    <FormField id={id} label={label} error={err(field)} hint={hint}>
      {(c) => (
        <Input {...c} type="number" min={0} max={20} value={form[field]} onChange={set(field)} />
      )}
    </FormField>
  );

  return (
    <FormDialog
      size="2xl"
      icon={edit ? <Pencil /> : <UserPlus />}
      title={edit ? 'Modifier le dossier' : 'Nouveau salarié'}
      description={
        edit
          ? 'Le statut, la fonction, le régime et la rémunération sont datés : ils se changent par « Ajouter une condition ».'
          : 'Le NISS et l’IBAN sont chiffrés à l’enregistrement et masqués à l’affichage.'
      }
    >
      <form onSubmit={handleSubmit} noValidate className="grid gap-6">
        <fieldset disabled={loading} className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-semibold text-foreground">Identité</legend>
          <FormField id="sal-prenom" label="Prénom" error={err('prenom')}>
            {(c) => (
              <Input {...c} value={form.prenom} onChange={set('prenom')} autoComplete="off" />
            )}
          </FormField>
          <FormField id="sal-nom" label="Nom" error={err('nom')}>
            {(c) => <Input {...c} value={form.nom} onChange={set('nom')} autoComplete="off" />}
          </FormField>
          <FormField id="sal-naissance" label="Date de naissance" error={err('dateNaissance')}>
            {(c) => (
              <Input
                {...c}
                type="date"
                value={form.dateNaissance}
                onChange={set('dateNaissance')}
              />
            )}
          </FormField>
          <FormField
            id="sal-niss"
            label="NISS"
            error={err('niss')}
            hint={
              target.mode === 'edit'
                ? `Actuel : ${target.nissMasque}. Laissez vide pour ne pas le changer.`
                : 'Par exemple 85.07.30-033.28'
            }
          >
            {(c) => (
              <Input
                {...c}
                value={form.niss}
                onChange={set('niss')}
                inputMode="numeric"
                autoComplete="off"
              />
            )}
          </FormField>
          <FormField
            id="sal-iban"
            label="IBAN"
            error={err('iban')}
            className="sm:col-span-2"
            hint={
              target.mode === 'edit'
                ? `Actuel : ${target.ibanMasque}. Laissez vide pour ne pas le changer.`
                : 'IBAN belge, par exemple BE68 5390 0754 7034'
            }
          >
            {(c) => (
              <Input
                {...c}
                value={form.iban}
                onChange={set('iban')}
                autoComplete="off"
                autoCapitalize="characters"
              />
            )}
          </FormField>
          <FormField
            id="sal-email"
            label="Email (facultatif)"
            error={err('email')}
            hint="Sert à l’invitation au portail du salarié."
            className="sm:col-span-2"
          >
            {(c) => (
              <Input
                {...c}
                type="email"
                inputMode="email"
                value={form.email}
                onChange={set('email')}
                autoComplete="off"
              />
            )}
          </FormField>
          <FormField
            id="sal-adresse"
            label="Adresse (facultatif)"
            error={err('adresse')}
            className="sm:col-span-2"
          >
            {(c) => (
              <Input {...c} value={form.adresse} onChange={set('adresse')} autoComplete="off" />
            )}
          </FormField>
          <FormField id="sal-postal" label="Code postal (facultatif)" error={err('codePostal')}>
            {(c) => (
              <Input
                {...c}
                value={form.codePostal}
                onChange={set('codePostal')}
                autoComplete="off"
              />
            )}
          </FormField>
          <FormField id="sal-ville" label="Ville (facultatif)" error={err('ville')}>
            {(c) => <Input {...c} value={form.ville} onChange={set('ville')} autoComplete="off" />}
          </FormField>
          <FormField id="sal-pays" label="Pays" error={err('pays')}>
            {(c) => (
              <NativeSelect {...c} value={form.pays} onChange={set('pays')}>
                {countries.map((country) => (
                  <NativeSelectOption key={country.code} value={country.code}>
                    {country.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </FormField>
        </fieldset>

        <fieldset disabled={loading} className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-semibold text-foreground">Contrat</legend>
          {!edit && (
            <>
              <FormField
                id="sal-statut"
                label="Statut"
                error={err('statut')}
                hint={
                  form.statut === 'EMPLOYE'
                    ? 'Commission paritaire 200'
                    : 'Commission paritaire 100'
                }
              >
                {(c) => (
                  <NativeSelect {...c} value={form.statut} onChange={set('statut')}>
                    <NativeSelectOption value="EMPLOYE">Employé</NativeSelectOption>
                    <NativeSelectOption value="OUVRIER">Ouvrier</NativeSelectOption>
                  </NativeSelect>
                )}
              </FormField>
              <FormField id="sal-fonction" label="Fonction" error={err('fonction')}>
                {(c) => (
                  <Input
                    {...c}
                    value={form.fonction}
                    onChange={set('fonction')}
                    autoComplete="off"
                  />
                )}
              </FormField>
            </>
          )}
          <FormField id="sal-type" label="Type de contrat" error={err('typeContrat')}>
            {(c) => (
              <NativeSelect {...c} value={form.typeContrat} onChange={set('typeContrat')}>
                <NativeSelectOption value="CDI">CDI</NativeSelectOption>
                <NativeSelectOption value="CDD">CDD</NativeSelectOption>
              </NativeSelect>
            )}
          </FormField>
          <FormField
            id="sal-entree"
            label="Date d’entrée"
            error={err('dateEntree')}
            hint="Peut être dans le futur : la DIMONA part avant le premier jour."
          >
            {(c) => (
              <Input {...c} type="date" value={form.dateEntree} onChange={set('dateEntree')} />
            )}
          </FormField>
          {form.typeContrat === 'CDD' && (
            <FormField id="sal-fin" label="Date de fin du CDD" error={err('dateFinContrat')}>
              {(c) => (
                <Input
                  {...c}
                  type="date"
                  value={form.dateFinContrat}
                  onChange={set('dateFinContrat')}
                />
              )}
            </FormField>
          )}
        </fieldset>

        {!edit && (
          <fieldset disabled={loading} className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-semibold text-foreground">
              Temps de travail et rémunération
            </legend>
            <FormField id="sal-regime" label="Régime" error={err('regime')}>
              {(c) => (
                <NativeSelect {...c} value={form.regime} onChange={set('regime')}>
                  <NativeSelectOption value="TEMPS_PLEIN">Temps plein</NativeSelectOption>
                  <NativeSelectOption value="TEMPS_PARTIEL">Temps partiel</NativeSelectOption>
                </NativeSelect>
              )}
            </FormField>
            <FormField
              id="sal-salaire"
              label={
                form.statut === 'EMPLOYE' ? 'Salaire mensuel brut (€)' : 'Salaire horaire brut (€)'
              }
              error={salaireErr}
              hint={form.statut === 'EMPLOYE' ? 'Par exemple 2850,00' : 'Par exemple 17,25'}
            >
              {(c) => (
                <Input
                  {...c}
                  value={form.salaire}
                  onChange={set('salaire')}
                  inputMode="decimal"
                  autoComplete="off"
                />
              )}
            </FormField>
            {partiel && (
              <>
                <FormField
                  id="sal-heures"
                  label="Heures par semaine du salarié"
                  error={err('heuresSemaineMinutes')}
                  hint="Par exemple 30,4 ou 30:24."
                >
                  {(c) => (
                    <Input
                      {...c}
                      value={form.heuresSemaine}
                      onChange={set('heuresSemaine')}
                      inputMode="decimal"
                      autoComplete="off"
                    />
                  )}
                </FormField>
                <FormField
                  id="sal-heures-ref"
                  label="Heures par semaine de la personne de référence"
                  error={err('heuresReferenceMinutes')}
                  hint="Par exemple 38."
                >
                  {(c) => (
                    <Input
                      {...c}
                      value={form.heuresReference}
                      onChange={set('heuresReference')}
                      inputMode="decimal"
                      autoComplete="off"
                    />
                  )}
                </FormField>
              </>
            )}
          </fieldset>
        )}

        <fieldset disabled={loading} className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-semibold text-foreground">Situation fiscale</legend>
          <FormField
            id="sal-situation"
            label="Situation familiale"
            error={err('situationFamiliale')}
            hint="Un cohabitant de fait (sans déclaration légale) se saisit comme isolé."
          >
            {(c) => (
              <NativeSelect
                {...c}
                value={form.situationFamiliale}
                onChange={set('situationFamiliale')}
              >
                <NativeSelectOption value="ISOLE">Isolé</NativeSelectOption>
                <NativeSelectOption value="MARIE_OU_COHABITANT_LEGAL">
                  Marié ou cohabitant légal
                </NativeSelectOption>
              </NativeSelect>
            )}
          </FormField>
          {marie && (
            <FormField
              id="sal-conjoint"
              label="Revenus professionnels du conjoint ou cohabitant"
              error={err('conjointRevenus')}
            >
              {(c) => (
                <NativeSelect {...c} value={form.conjointRevenus} onChange={set('conjointRevenus')}>
                  <NativeSelectOption value="">Choisir…</NativeSelectOption>
                  {REVENUS_CONJOINT.map((valeur) => (
                    <NativeSelectOption key={valeur} value={valeur}>
                      {REVENUS_CONJOINT_LIBELLES[valeur]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
            </FormField>
          )}
          <CheckField
            id="sal-handicape"
            label="Le salarié est handicapé"
            checked={form.beneficiaireHandicape}
            onCheckedChange={toggle('beneficiaireHandicape')}
            error={err('beneficiaireHandicape')}
            disabled={loading}
          />
          {conjointSansRevenusPropres(vue) && (
            <CheckField
              id="sal-conjoint-handicape"
              label="Le conjoint ou cohabitant est handicapé"
              checked={form.conjointHandicape}
              onCheckedChange={toggle('conjointHandicape')}
              error={err('conjointHandicape')}
              disabled={loading}
            />
          )}
          {compteur(
            'enfantsCharge',
            'sal-enfants',
            'Enfants à charge',
            'Laissez 0 s’il n’y en a pas.',
          )}
          {vue.enfantsCharge > 0 &&
            compteur('enfantsHandicapes', 'sal-enfants-handicapes', 'dont enfants handicapés')}
          {parentIsolePossible(vue) && (
            <CheckField
              id="sal-parent-isole"
              label="Parent isolé : veuf, père ou mère célibataire, divorcé ou séparé"
              checked={form.parentIsole}
              onCheckedChange={toggle('parentIsole')}
              error={err('parentIsole')}
              disabled={loading}
            />
          )}
          <CheckField
            id="sal-autres-personnes"
            label="Le salarié a d’autres personnes à charge (hors enfants)"
            checked={form.autresPersonnes}
            onCheckedChange={toggle('autresPersonnes')}
            disabled={loading}
          />
          {form.autresPersonnes && (
            <>
              {compteur(
                'autresChargeDependantes66',
                'sal-autres-dependantes',
                'Personnes dépendantes de 66 ans ou plus',
              )}
              {compteur(
                'autresChargeHandicapees',
                'sal-autres-handicapees',
                'Autres personnes handicapées',
              )}
              {compteur('autresCharge', 'sal-autres-charge', 'Autres personnes à charge')}
            </>
          )}
          {attributionDesCharges(vue) && (
            <FormField
              id="sal-attribution"
              label="Qui reçoit les réductions pour charges de famille ?"
              error={err('chargesFamilleAttribuees')}
              hint="Quand les deux conjoints ont des revenus, le couple en choisit un seul (attestation du SPF Finances). Sans réponse, la paie ne pourra pas être calculée."
            >
              {(c) => (
                <NativeSelect
                  {...c}
                  value={form.chargesFamilleAttribuees}
                  onChange={set('chargesFamilleAttribuees')}
                >
                  <NativeSelectOption value="">À préciser</NativeSelectOption>
                  <NativeSelectOption value="oui">Ce salarié</NativeSelectOption>
                  <NativeSelectOption value="non">Son conjoint ou cohabitant</NativeSelectOption>
                </NativeSelect>
              )}
            </FormField>
          )}
        </fieldset>

        {error && (
          <p role="alert" className="text-sm text-destructive-text">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button type="submit" disabled={loading}>
            {loading && <Spinner />}
            {edit ? 'Enregistrer' : 'Créer le dossier'}
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}
