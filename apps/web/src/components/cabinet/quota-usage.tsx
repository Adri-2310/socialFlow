import { Building2, HardDrive, Users } from 'lucide-react';
import {
  formatStorageMb,
  quotaPercent,
  isQuotaReached,
  type CabinetQuotaUsage,
} from '@/lib/cabinet-quotas';

function QuotaRow({
  icon: Icon,
  label,
  used,
  limit,
  format = String,
  hint,
}: {
  icon: typeof Users;
  label: string;
  used: number;
  limit: number | null;
  format?: (value: number) => string;
  hint?: string;
}) {
  const percent = quotaPercent(used, limit);
  const reached = isQuotaReached(used, limit);
  const barTone = reached ? 'bg-destructive' : percent >= 80 ? 'bg-amber-500' : 'bg-primary';

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {label}
        </p>
        <p className="whitespace-nowrap text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{format(used)}</span>
          {' / '}
          {limit === null ? 'illimité' : format(limit)}
        </p>
      </div>
      {limit !== null && (
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={Math.min(used, limit)}
          className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
        >
          <div className={`h-full rounded-full ${barTone}`} style={{ width: `${percent}%` }} />
        </div>
      )}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {reached && (
        <p className="mt-1 text-xs font-medium text-destructive-text">
          Quota atteint : passez à un plan supérieur pour en ajouter.
        </p>
      )}
    </div>
  );
}

// Consommation des quotas du plan (roles/02-cabinet-rh.md § 4.1, D15) :
// presentation pure, sans acces donnees.
export function QuotaUsage({ data }: { data: CabinetQuotaUsage }) {
  const { limits, utilisateurs, entreprises, storageMb } = data;

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-bold text-foreground">Quotas de votre plan</h2>

      {limits === null ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Aucun plan n&apos;est associé à votre cabinet : aucun quota n&apos;est appliqué.
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          <QuotaRow
            icon={Users}
            label="Utilisateurs du cabinet"
            used={utilisateurs.used}
            limit={limits.maxUtilisateurs}
            hint={
              utilisateurs.pendingInvitations > 0
                ? `dont ${utilisateurs.pendingInvitations} invitation${
                    utilisateurs.pendingInvitations > 1 ? 's' : ''
                  } en attente`
                : undefined
            }
          />
          <QuotaRow
            icon={Building2}
            label="Entreprises clientes"
            used={entreprises.used}
            limit={limits.maxEntreprises}
          />
          <QuotaRow
            icon={HardDrive}
            label="Stockage"
            used={storageMb.used}
            limit={limits.maxStorageMb}
            format={formatStorageMb}
          />
        </div>
      )}
    </section>
  );
}
