'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CheckCircle2, AlertTriangle, Pencil, Plus, Archive, ArchiveRestore } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { PlanConfigRow } from '@/lib/admin-data';

const AMOUNT_FORMATTER = new Intl.NumberFormat('fr-BE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

type FormState = {
  name: string;
  description: string;
  monthlyPrice: string;
  yearlyPrice: string;
  badge: string;
  highlighted: boolean;
  sortOrder: string;
  features: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  monthlyPrice: '',
  yearlyPrice: '',
  badge: '',
  highlighted: false,
  sortOrder: '0',
  features: '',
};

function toFormState(plan: PlanConfigRow): FormState {
  return {
    name: plan.name,
    description: plan.description,
    monthlyPrice: plan.monthlyPrice === null ? '' : String(plan.monthlyPrice),
    yearlyPrice: plan.yearlyPrice === null ? '' : String(plan.yearlyPrice),
    badge: plan.badge ?? '',
    highlighted: plan.highlighted,
    sortOrder: String(plan.sortOrder),
    features: plan.features.join('\n'),
  };
}

function formToBody(form: FormState) {
  return {
    name: form.name,
    description: form.description,
    monthlyPrice: form.monthlyPrice === '' ? null : Number(form.monthlyPrice),
    yearlyPrice: form.yearlyPrice === '' ? null : Number(form.yearlyPrice),
    badge: form.badge === '' ? null : form.badge,
    highlighted: form.highlighted,
    sortOrder: Number(form.sortOrder),
    features: form.features.split('\n'),
  };
}

// Champs partages entre le formulaire de creation et celui d'edition d'un
// plan existant - seule la creation affiche le champ planId (immuable une
// fois le plan cree, sert de metadata Stripe).
function PlanFormFields({
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
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-foreground">Identifiant (planId)</span>
          <input
            value={newPlanId}
            onChange={(e) => onPlanIdChange(e.target.value)}
            placeholder="ex : premium"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </label>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-foreground">Nom</span>
          <input
            value={form.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-foreground">Badge</span>
          <input
            value={form.badge}
            onChange={(e) => onChange({ badge: e.target.value })}
            placeholder="Ex : Le plus choisi"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-foreground">Description</span>
        <input
          value={form.description}
          onChange={(e) => onChange({ description: e.target.value })}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-foreground">Prix mensuel (EUR)</span>
          <input
            type="number"
            min={0}
            step={1}
            value={form.monthlyPrice}
            onChange={(e) => onChange({ monthlyPrice: e.target.value })}
            placeholder="Sur devis"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-foreground">Prix annuel (EUR)</span>
          <input
            type="number"
            min={0}
            step={1}
            value={form.yearlyPrice}
            onChange={(e) => onChange({ yearlyPrice: e.target.value })}
            placeholder="Sur devis"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-foreground">Ordre d&apos;affichage</span>
          <input
            type="number"
            value={form.sortOrder}
            onChange={(e) => onChange({ sortOrder: e.target.value })}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-foreground">Fonctionnalités (une par ligne)</span>
        <textarea
          value={form.features}
          onChange={(e) => onChange({ features: e.target.value })}
          rows={5}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={form.highlighted}
          onChange={(e) => onChange({ highlighted: e.target.checked })}
          className="h-4 w-4 rounded border-input"
        />
        Plan mis en avant sur la page tarifs
      </label>
    </>
  );
}

export function PlansConfig({ plans }: { plans: PlanConfigRow[] }) {
  const router = useRouter();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [createPlanId, setCreatePlanId] = useState('');
  const [createForm, setCreateForm] = useState<FormState>(EMPTY_FORM);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [pendingArchive, setPendingArchive] = useState<PlanConfigRow | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function startEdit(plan: PlanConfigRow) {
    setEditingId(plan.id);
    setForm(toFormState(plan));
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(null);
    setError(null);
  }

  async function save(plan: PlanConfigRow) {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/plans/${plan.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formToBody(form)),
      });
      if (!res.ok) throw new Error('request_failed');
      router.refresh();
      cancelEdit();
    } catch {
      setError('Une erreur est survenue. Réessayez.');
    } finally {
      setSaving(false);
    }
  }

  function startCreate() {
    setCreating(true);
    setCreatePlanId('');
    setCreateForm(EMPTY_FORM);
    setCreateError(null);
  }

  function cancelCreate() {
    setCreating(false);
    setCreateError(null);
  }

  async function createPlan() {
    setCreateSaving(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/admin/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: createPlanId, ...formToBody(createForm) }),
      });
      if (!res.ok) throw new Error('request_failed');
      router.refresh();
      cancelCreate();
    } catch {
      setCreateError('Une erreur est survenue. Vérifiez que l’identifiant est unique (minuscules, chiffres, tirets).');
    } finally {
      setCreateSaving(false);
    }
  }

  async function archivePlan(plan: PlanConfigRow) {
    setActionLoadingId(plan.id);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/plans/${plan.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('request_failed');
      router.refresh();
    } catch {
      setActionError('Une erreur est survenue. Réessayez.');
    } finally {
      setActionLoadingId(null);
      setPendingArchive(null);
    }
  }

  async function restorePlan(plan: PlanConfigRow) {
    setActionLoadingId(plan.id);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/plans/${plan.id}`, { method: 'PUT' });
      if (!res.ok) throw new Error('request_failed');
      router.refresh();
    } catch {
      setActionError('Une erreur est survenue. Réessayez.');
    } finally {
      setActionLoadingId(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-foreground">Plans tarifaires</h2>
        {!creating && (
          <button
            type="button"
            onClick={startCreate}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" /> Nouveau plan
          </button>
        )}
      </div>

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {creating && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createPlan();
          }}
          className="space-y-3 rounded-2xl border border-dashed border-border bg-card p-5"
        >
          <h3 className="font-semibold text-foreground">Nouveau plan</h3>
          {createError && <p className="text-sm text-destructive">{createError}</p>}

          <PlanFormFields
            form={createForm}
            onChange={(patch) => setCreateForm({ ...createForm, ...patch })}
            newPlanId={createPlanId}
            onPlanIdChange={setCreatePlanId}
          />

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={cancelCreate}
              disabled={createSaving}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-muted-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={createSaving}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {createSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Créer le plan
            </button>
          </div>
        </form>
      )}

      {plans.map((plan) => {
        const isEditing = editingId === plan.id;
        const isArchived = plan.archivedAt !== null;

        return (
          <div
            key={plan.id}
            className={`rounded-2xl border bg-card p-5 ${isArchived ? 'border-border/60 opacity-70' : 'border-border'}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground">{plan.name}</h3>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {plan.planId}
                  </span>
                  {isArchived && (
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      Archivé
                    </span>
                  )}
                  {plan.badge && !isArchived && (
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {plan.badge}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
              </div>
              {!isEditing && (
                <div className="flex shrink-0 gap-2">
                  {isArchived ? (
                    <button
                      type="button"
                      onClick={() => restorePlan(plan)}
                      disabled={actionLoadingId === plan.id}
                      className="flex items-center gap-1.5 rounded-lg border border-secondary/40 px-3 py-1.5 text-xs font-semibold text-secondary transition hover:bg-secondary/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionLoadingId === plan.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ArchiveRestore className="h-3.5 w-3.5" />
                      )}
                      Restaurer
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(plan)}
                        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingArchive(plan)}
                        disabled={actionLoadingId === plan.id}
                        title="Archiver"
                        aria-label={`Archiver ${plan.name}`}
                        className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {!isEditing && (
              <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
                <span className="text-foreground">
                  {plan.monthlyPrice !== null ? `${AMOUNT_FORMATTER.format(plan.monthlyPrice)} / mois` : 'Sur devis'}
                </span>
                <span className="text-muted-foreground">
                  {plan.yearlyPrice !== null ? `${AMOUNT_FORMATTER.format(plan.yearlyPrice)} / an` : '—'}
                </span>
                {isArchived ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Archive className="h-3.5 w-3.5" /> Retiré de Stripe et de /tarifs
                  </span>
                ) : plan.inSync ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-secondary">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Synchronisé avec Stripe
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" /> Désynchronisé de Stripe
                  </span>
                )}
              </div>
            )}

            {isEditing && form && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save(plan);
                }}
                className="mt-4 space-y-3"
              >
                {error && <p className="text-sm text-destructive">{error}</p>}

                <PlanFormFields form={form} onChange={(patch) => setForm({ ...form, ...patch })} />

                <p className="text-xs text-muted-foreground">
                  Changer un prix crée un nouveau Price Stripe et désactive l&apos;ancien ; les abonnements déjà en
                  cours ne sont pas modifiés.
                </p>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={saving}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-muted-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Enregistrer
                  </button>
                </div>
              </form>
            )}
          </div>
        );
      })}

      {pendingArchive && (
        <ConfirmDialog
          title="Archiver ce plan ?"
          description={`Le plan « ${pendingArchive.name} » sera retiré de la page tarifs et son Product/Price Stripe désactivés. Cette action est réversible (bouton Restaurer).`}
          confirmLabel="Archiver"
          loading={actionLoadingId === pendingArchive.id}
          onCancel={() => setPendingArchive(null)}
          onConfirm={() => archivePlan(pendingArchive)}
        />
      )}
    </section>
  );
}
