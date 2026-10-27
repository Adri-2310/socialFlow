'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { PlanCard } from '@/components/admin/plan-card';
import {
  EMPTY_FORM,
  formToBody,
  PlanFormFields,
  toFormState,
  type FormState,
} from '@/components/admin/plan-form';
import { Notice } from '@/components/shared/notice';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Spinner } from '@/components/ui/spinner';
import type { PlanConfigRow } from '@/lib/admin/admin-data';

const ERROR_MESSAGE = 'Une erreur est survenue. Réessayez.';

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
      setError(ERROR_MESSAGE);
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
      setActionError(ERROR_MESSAGE);
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
      setActionError(ERROR_MESSAGE);
    } finally {
      setActionLoadingId(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-foreground">Plans tarifaires</h2>
        {!creating && (
          <Button type="button" size="sm" onClick={startCreate}>
            <Plus aria-hidden="true" /> Nouveau plan
          </Button>
        )}
      </div>

      {actionError && (
        <Notice tone="danger" role="alert">
          {actionError}
        </Notice>
      )}

      {creating && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createPlan();
          }}
          className="space-y-3 rounded-2xl border border-dashed border-border bg-card p-5"
        >
          <h3 className="font-semibold text-foreground">Nouveau plan</h3>
          {createError && (
            <Notice tone="danger" role="alert">
              {createError}
            </Notice>
          )}

          <PlanFormFields
            form={createForm}
            onChange={(patch) => setCreateForm({ ...createForm, ...patch })}
            newPlanId={createPlanId}
            onPlanIdChange={setCreatePlanId}
          />

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={cancelCreate} disabled={createSaving}>
              Annuler
            </Button>
            <Button type="submit" disabled={createSaving}>
              {createSaving && <Spinner />}
              Créer le plan
            </Button>
          </div>
        </form>
      )}

      {plans.map((plan) => {
        const isEditing = editingId === plan.id;

        return (
          <PlanCard
            key={plan.id}
            plan={plan}
            editing={isEditing}
            loading={actionLoadingId === plan.id}
            onEdit={() => startEdit(plan)}
            onArchive={() => setPendingArchive(plan)}
            onRestore={() => restorePlan(plan)}
          >
            {isEditing && form && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save(plan);
                }}
                className="mt-4 space-y-3"
              >
                {error && (
                  <Notice tone="danger" role="alert">
                    {error}
                  </Notice>
                )}

                <PlanFormFields form={form} onChange={(patch) => setForm({ ...form, ...patch })} />

                <p className="text-xs text-muted-foreground">
                  Changer un prix crée un nouveau Price Stripe et désactive l&apos;ancien ; les abonnements déjà en
                  cours ne sont pas modifiés.
                </p>

                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" onClick={cancelEdit} disabled={saving}>
                    Annuler
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving && <Spinner />}
                    Enregistrer
                  </Button>
                </div>
              </form>
            )}
          </PlanCard>
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
