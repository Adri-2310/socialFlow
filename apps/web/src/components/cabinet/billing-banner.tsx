import { AlertOctagon, AlertTriangle, Lock } from 'lucide-react';
import type { BillingStatus } from '@/lib/billing';

type Props = {
  status: BillingStatus;
  // Fin du delai de grace (D57), connue seulement en DELAI_GRACE.
  graceEndsAt?: Date | null;
};

const formatDate = (date: Date) => date.toLocaleDateString('fr-BE', { timeZone: 'Europe/Brussels' });

// Bandeau permanent de l'espace Cabinet RH (PERMISSIONS.md "Etats bloquants",
// D29, D57) : visible sur toutes les pages tant que l'abonnement n'est pas en
// regle. Presentation pure ; rien ne s'affiche en essai ou en actif.
export function BillingBanner({ status, graceEndsAt }: Props) {
  if (status === 'DELAI_GRACE') {
    return (
      <Banner
        tone="warning"
        icon={<AlertTriangle className="h-5 w-5" />}
        title="Paiement en échec"
        description={
          graceEndsAt
            ? `Régularisez votre abonnement avant le ${formatDate(graceEndsAt)} pour éviter le passage de votre cabinet en lecture seule.`
            : 'Régularisez votre abonnement pour éviter le passage de votre cabinet en lecture seule.'
        }
      />
    );
  }

  if (status === 'IMPAYE') {
    return (
      <Banner
        tone="danger"
        icon={<AlertOctagon className="h-5 w-5" />}
        title="Cabinet en lecture seule pour impayé"
        description="Vous pouvez consulter vos données, mais plus rien ne peut être modifié. Vos clients gardent l'accès à leurs fiches. Régularisez votre abonnement pour reprendre l'activité."
      />
    );
  }

  if (status === 'RESILIE') {
    return (
      <Banner
        tone="warning"
        icon={<Lock className="h-5 w-5" />}
        title="Abonnement résilié : cabinet en lecture seule"
        description="Vous pouvez consulter et exporter vos données, mais plus rien ne peut être modifié."
      />
    );
  }

  return null;
}

function Banner({
  tone,
  icon,
  title,
  description,
}: {
  tone: 'warning' | 'danger';
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  const styles =
    tone === 'danger'
      ? 'border-destructive/30 bg-destructive/10 text-destructive-text'
      : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400';

  return (
    <div role="status" className={`flex items-start gap-3 rounded-2xl border p-4 ${styles}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-sm text-foreground/80">{description}</p>
      </div>
    </div>
  );
}
