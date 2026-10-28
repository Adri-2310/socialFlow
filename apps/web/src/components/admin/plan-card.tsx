'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, Archive, ArchiveRestore, CheckCircle2, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { PlanConfigRow } from '@/lib/admin/admin-data';

// D15, D34 : une limite vide (null) signifie "illimite", pas "non renseignee".
function quotaLabel(value: number | null, noun: string): string {
  if (value === null) return `${noun.charAt(0).toUpperCase()}${noun.slice(1)}s illimité${noun === 'entreprise' ? 'e' : ''}s`;
  return `${value} ${noun}${value > 1 ? 's' : ''}`;
}

const AMOUNT_FORMATTER = new Intl.NumberFormat('fr-BE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

// Carte d'un plan : nom, identifiant, badges, actions, puis soit le résumé (tarifs, quotas,
// synchronisation Stripe), soit le formulaire d'édition passé en `children`.
export function PlanCard({
  plan,
  editing,
  loading,
  onEdit,
  onArchive,
  onRestore,
  children,
}: {
  plan: PlanConfigRow;
  editing: boolean;
  loading: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  children?: ReactNode;
}) {
  const isArchived = plan.archivedAt !== null;

  return (
    <div
      className={`rounded-2xl border bg-card p-5 ${isArchived ? 'border-border/60 opacity-70' : 'border-border'}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground">{plan.name}</h3>
            <Badge variant="secondary" className="h-auto rounded-md px-2 py-0.5 text-muted-foreground">
              {plan.planId}
            </Badge>
            {isArchived && (
              <Badge variant="secondary" className="h-auto rounded-md px-2 py-0.5 text-muted-foreground">
                Archivé
              </Badge>
            )}
            {plan.badge && !isArchived && (
              // Teinte du cabinet, texte `--foreground` : le texte `--primary` sur sa propre teinte
              // n'atteint pas 4,5:1 en sombre (D62).
              <Badge variant="secondary" className="h-auto rounded-md bg-primary/15 px-2 py-0.5">
                {plan.badge}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
        </div>
        {!editing && (
          <div className="flex shrink-0 gap-2">
            {isArchived ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRestore}
                disabled={loading}
                className="border-emerald-500/40 text-emerald-800 hover:bg-emerald-500/10 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-300"
              >
                {loading ? <Spinner /> : <ArchiveRestore aria-hidden="true" />}
                Restaurer
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" size="sm" onClick={onEdit}>
                  <Pencil aria-hidden="true" /> Modifier
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={onArchive}
                  disabled={loading}
                  title="Archiver"
                  aria-label={`Archiver ${plan.name}`}
                  className="size-8 text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive-text"
                >
                  <Archive aria-hidden="true" />
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {!editing && (
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
          <span className="text-foreground">
            {plan.monthlyPrice !== null ? `${AMOUNT_FORMATTER.format(plan.monthlyPrice)} / mois` : 'Prix non défini'}
          </span>
          <span className="text-muted-foreground">
            {plan.yearlyPrice !== null
              ? `${AMOUNT_FORMATTER.format(plan.yearlyPrice * 12)} / an (soit ${AMOUNT_FORMATTER.format(plan.yearlyPrice)} / mois)`
              : '—'}
          </span>
          <span className="basis-full text-muted-foreground">
            {quotaLabel(plan.maxEntreprises, 'entreprise')} ·{' '}
            {quotaLabel(plan.maxUtilisateurs, 'gestionnaire')} ·{' '}
            {plan.maxStorageMb === null
              ? 'Stockage illimité'
              : `${plan.maxStorageMb / 1024} Go de stockage`}
          </span>
          {isArchived ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Archive aria-hidden="true" className="h-3.5 w-3.5" /> Retiré de Stripe et de /tarifs
            </span>
          ) : plan.inSync ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" /> Synchronisé avec Stripe
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive-text">
              <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" /> Désynchronisé de Stripe
            </span>
          )}
        </div>
      )}

      {editing && children}
    </div>
  );
}
