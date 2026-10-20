import Link from 'next/link';
import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { AlertLevel, CabinetAlert } from '@/lib/cabinet/cabinet-alerts';

const STYLES: Record<AlertLevel, { icon: typeof Info; tone: string; ring: string }> = {
  danger: {
    icon: AlertOctagon,
    tone: 'bg-destructive/10 text-destructive-text',
    ring: 'border-destructive/30',
  },
  warning: {
    icon: AlertTriangle,
    tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    ring: 'border-amber-500/30',
  },
  info: {
    icon: Info,
    tone: 'bg-primary/10 text-primary',
    ring: 'border-border',
  },
};

// Presentation pure des alertes du tableau de bord (§ 4.1) : recoit la liste
// deja construite par buildCabinetAlerts.
export function CabinetAlerts({ alerts }: { alerts: CabinetAlert[] }) {
  if (alerts.length === 0) {
    return (
      <section
        aria-label="Alertes"
        className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 sm:p-5"
      >
        <CheckCircle2 className="h-5 w-5 shrink-0 text-secondary" />
        <p className="text-sm text-muted-foreground">Aucune alerte : tout est en ordre.</p>
      </section>
    );
  }

  return (
    <section aria-label="Alertes" className="space-y-3">
      <h2 className="text-sm font-bold text-foreground">
        Alertes <span className="font-normal text-muted-foreground">({alerts.length})</span>
      </h2>
      <ul className="space-y-3">
        {alerts.map((alert) => {
          const { icon: Icon, tone, ring } = STYLES[alert.level];
          return (
            <li
              key={alert.id}
              className={`flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5 ${ring}`}
            >
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone}`}>
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{alert.title}</p>
                <p className="text-sm text-muted-foreground">{alert.description}</p>
              </div>
              {alert.href && (
                <Link
                  href={alert.href}
                  className="shrink-0 rounded-lg border border-input px-3 py-2.5 text-center text-xs font-semibold text-foreground transition hover:bg-muted sm:py-1.5"
                >
                  Voir
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
