'use client';

import { CheckField, FormField } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { PlanConfigRow } from '@/lib/admin/admin-data';

export type FormState = {
  name: string;
  description: string;
  monthlyPrice: string;
  yearlyPrice: string;
  badge: string;
  highlighted: boolean;
  sortOrder: string;
  features: string;
  // Quotas (D15) : champ vide = illimite. Stockage saisi en Go.
  maxEntreprises: string;
  maxUtilisateurs: string;
  maxStorageGb: string;
};

export const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  monthlyPrice: '',
  yearlyPrice: '',
  badge: '',
  highlighted: false,
  sortOrder: '0',
  features: '',
  maxEntreprises: '',
  maxUtilisateurs: '',
  maxStorageGb: '',
};

export function toFormState(plan: PlanConfigRow): FormState {
  return {
    name: plan.name,
    description: plan.description,
    monthlyPrice: plan.monthlyPrice === null ? '' : String(plan.monthlyPrice),
    yearlyPrice: plan.yearlyPrice === null ? '' : String(plan.yearlyPrice),
    badge: plan.badge ?? '',
    highlighted: plan.highlighted,
    sortOrder: String(plan.sortOrder),
    features: plan.features.join('\n'),
    maxEntreprises: plan.maxEntreprises === null ? '' : String(plan.maxEntreprises),
    maxUtilisateurs: plan.maxUtilisateurs === null ? '' : String(plan.maxUtilisateurs),
    maxStorageGb: plan.maxStorageMb === null ? '' : String(plan.maxStorageMb / 1024),
  };
}

export function formToBody(form: FormState) {
  return {
    name: form.name,
    description: form.description,
    monthlyPrice: form.monthlyPrice === '' ? null : Number(form.monthlyPrice),
    yearlyPrice: form.yearlyPrice === '' ? null : Number(form.yearlyPrice),
    badge: form.badge === '' ? null : form.badge,
    highlighted: form.highlighted,
    sortOrder: Number(form.sortOrder),
    features: form.features.split('\n'),
    maxEntreprises: form.maxEntreprises === '' ? null : Number(form.maxEntreprises),
    maxUtilisateurs: form.maxUtilisateurs === '' ? null : Number(form.maxUtilisateurs),
    maxStorageMb: form.maxStorageGb === '' ? null : Math.round(Number(form.maxStorageGb) * 1024),
  };
}

// Champs partages entre le formulaire de creation et celui d'edition d'un
// plan existant - seule la creation affiche le champ planId (immuable une
// fois le plan cree, sert de metadata Stripe).
export function PlanFormFields({
  form,
  onChange,
  newPlanId,
  onPlanIdChange,
}: {
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
  newPlanId?: string;
  onPlanIdChange?: (value: string) => void;
}) {
  return (
    <>
      {onPlanIdChange !== undefined && (
        <FormField label="Identifiant (planId)">
          {(control) => (
            <Input
              {...control}
              value={newPlanId}
              onChange={(e) => onPlanIdChange(e.target.value)}
              placeholder="ex : premium"
            />
          )}
        </FormField>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Nom">
          {(control) => (
            <Input {...control} value={form.name} onChange={(e) => onChange({ name: e.target.value })} />
          )}
        </FormField>
        <FormField label="Badge">
          {(control) => (
            <Input
              {...control}
              value={form.badge}
              onChange={(e) => onChange({ badge: e.target.value })}
              placeholder="Ex : Le plus choisi"
            />
          )}
        </FormField>
      </div>

      <FormField label="Description">
        {(control) => (
          <Input
            {...control}
            value={form.description}
            onChange={(e) => onChange({ description: e.target.value })}
          />
        )}
      </FormField>

      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="Prix mensuel (EUR)">
          {(control) => (
            <Input
              {...control}
              type="number"
              min={0}
              step={1}
              value={form.monthlyPrice}
              onChange={(e) => onChange({ monthlyPrice: e.target.value })}
              placeholder="Sur devis"
            />
          )}
        </FormField>
        <FormField label="Prix mensuel en facturation annuelle (EUR)">
          {(control) => (
            <Input
              {...control}
              type="number"
              min={0}
              step={1}
              value={form.yearlyPrice}
              onChange={(e) => onChange({ yearlyPrice: e.target.value })}
              placeholder="Sur devis"
            />
          )}
        </FormField>
        <FormField label="Ordre d'affichage">
          {(control) => (
            <Input
              {...control}
              type="number"
              value={form.sortOrder}
              onChange={(e) => onChange({ sortOrder: e.target.value })}
            />
          )}
        </FormField>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="Entreprises clientes (max)">
          {(control) => (
            <Input
              {...control}
              type="number"
              min={0}
              step={1}
              value={form.maxEntreprises}
              onChange={(e) => onChange({ maxEntreprises: e.target.value })}
              placeholder="Illimité"
            />
          )}
        </FormField>
        <FormField label="Gestionnaires RH (max)">
          {(control) => (
            <Input
              {...control}
              type="number"
              min={0}
              step={1}
              value={form.maxUtilisateurs}
              onChange={(e) => onChange({ maxUtilisateurs: e.target.value })}
              placeholder="Illimité"
            />
          )}
        </FormField>
        <FormField label="Stockage (Go)">
          {(control) => (
            <Input
              {...control}
              type="number"
              min={0}
              step={1}
              value={form.maxStorageGb}
              onChange={(e) => onChange({ maxStorageGb: e.target.value })}
              placeholder="Illimité"
            />
          )}
        </FormField>
      </div>

      <FormField label="Fonctionnalités (une par ligne)">
        {(control) => (
          <Textarea
            {...control}
            value={form.features}
            onChange={(e) => onChange({ features: e.target.value })}
            rows={5}
          />
        )}
      </FormField>

      <CheckField
        label="Plan mis en avant sur la page tarifs"
        checked={form.highlighted}
        onCheckedChange={(highlighted) => onChange({ highlighted })}
      />
    </>
  );
}
