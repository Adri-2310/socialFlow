import { AlertOctagon, AlertTriangle, Lock } from 'lucide-react';
import type { BillingStatus } from '@/lib/billing/billing';
import Link from 'next/link';
import { Notice } from '@/components/shared/notice';
import { buttonVariants } from '@/components/ui/button';

type Props = {
  status: BillingStatus;
  // Fin du delai de grace (D57), connue seulement en DELAI_GRACE.
  graceEndsAt?: Date | null;
};

const formatDate = (date: Date) =>
  date.toLocaleDateString('fr-BE', { timeZone: 'Europe/Brussels' });

// Bandeau permanent de l'espace Cabinet RH (PERMISSIONS.md "Etats bloquants",
// D29, D57) : visible sur toutes les pages tant que l'abonnement n'est pas en
// regle. Presentation pure ; rien ne s'affiche en essai ou en actif.
export function BillingBanner({ status, graceEndsAt }: Props) {
  if (status === 'DELAI_GRACE') {
    return (
      <Banner
        tone="warning"
        icon={<AlertTriangle aria-hidden="true" className="size-5" />}
        title="Paiement en échec"
        action
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
        icon={<AlertOctagon aria-hidden="true" className="size-5" />}
        title="Cabinet en lecture seule pour impayé"
        action
        description="Vous pouvez consulter vos données, mais plus rien ne peut être modifié. Vos clients gardent l'accès à leurs fiches. Régularisez votre abonnement pour reprendre l'activité."
      />
    );
  }

  if (status === 'RESILIE') {
    return (
      <Banner
        tone="warning"
        icon={<Lock aria-hidden="true" className="size-5" />}
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
  action,
}: {
  tone: 'warning' | 'danger';
  icon: React.ReactNode;
  title: string;
  description: string;
  // Lien vers la page Mon abonnement, pour regulariser.
  action?: boolean;
}) {
  return (
    <Notice
      tone={tone}
      icon={icon}
      title={title}
      action={
        action && (
          <Link href="/dashboard/cabinet/facturation" className={buttonVariants({ size: 'sm' })}>
            Mettre à jour ma carte
          </Link>
        )
      }
    >
      {description}
    </Notice>
  );
}
