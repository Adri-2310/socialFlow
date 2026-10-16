import type {
  ArchivedGestionnaireRow,
  GestionnaireRow,
  InvitationRow,
} from '@/lib/cabinet-data';
import type { EntrepriseRow } from '@/lib/cabinet-entreprises';
import { trialDaysLeft, type BillingStatus } from '@/lib/billing';
import {
  formatStorageMb,
  isQuotaReached,
  quotaPercent,
  type CabinetQuotaUsage,
} from '@/lib/cabinet-quotas';

// Alertes du tableau de bord Cabinet RH (roles/02-cabinet-rh.md § 4.1).
// Module pur : construit la liste a partir de donnees deja lues, donc
// testable sans base. Les alertes qui dependent de chantiers a venir
// (echeances ONSS) s'y ajouteront quand leurs donnees existeront.

export type AlertLevel = 'danger' | 'warning' | 'info';

export type CabinetAlert = {
  id: string;
  level: AlertLevel;
  title: string;
  description: string;
  href?: string;
};

export type CabinetAlertsInput = {
  quotas: CabinetQuotaUsage;
  invitations: InvitationRow[];
  gestionnaires: GestionnaireRow[];
  archived: ArchivedGestionnaireRow[];
  // Entreprises clientes non archivees ; absent = pas d'alerte de couverture.
  entreprises?: Pick<EntrepriseRow, 'id' | 'name' | 'covered'>[];
  // Etat d'abonnement du cabinet (D55) ; absent = pas d'alerte de facturation.
  subscription?: { status: BillingStatus; trialEndsAt: Date | null };
  now?: Date;
};

const GESTIONNAIRES_HREF = '/dashboard/cabinet/gestionnaires';
const ENTREPRISES_HREF = '/dashboard/cabinet/entreprises';
// Seuil a partir duquel un quota est signale avant d'etre atteint.
const QUOTA_WARNING_PERCENT = 80;
// Une restauration qui expire dans ce delai merite d'etre signalee.
const RESTORE_WARNING_DAYS = 7;
// Fin d'essai signalee a partir de ce nombre de jours restants.
const TRIAL_WARNING_DAYS = 7;

const LEVEL_ORDER: Record<AlertLevel, number> = { danger: 0, warning: 1, info: 2 };

const plural = (n: number, singular: string, pluralForm = `${singular}s`) =>
  `${n} ${n > 1 ? pluralForm : singular}`;

const formatDate = (date: Date) => date.toLocaleDateString('fr-BE', { timeZone: 'Europe/Brussels' });

function quotaAlerts(quotas: CabinetQuotaUsage): CabinetAlert[] {
  const { limits } = quotas;
  if (!limits) return [];

  const rows = [
    {
      key: 'utilisateurs',
      label: 'de gestionnaires',
      used: quotas.utilisateurs.used,
      limit: limits.maxUtilisateurs,
      format: String,
      href: GESTIONNAIRES_HREF,
    },
    {
      key: 'entreprises',
      label: "d'entreprises clientes",
      used: quotas.entreprises.used,
      limit: limits.maxEntreprises,
      format: String,
      href: ENTREPRISES_HREF,
    },
    {
      key: 'stockage',
      label: 'de stockage',
      used: quotas.storageMb.used,
      limit: limits.maxStorageMb,
      format: formatStorageMb,
      href: undefined,
    },
  ];

  return rows.flatMap((row): CabinetAlert[] => {
    if (row.limit === null) return [];
    const usage = `${row.format(row.used)} sur ${row.format(row.limit)}`;

    if (isQuotaReached(row.used, row.limit)) {
      return [
        {
          id: `quota-${row.key}-atteint`,
          level: 'danger',
          title: `Quota ${row.label} atteint`,
          description: `Vous utilisez ${usage}. Passez à un plan supérieur pour en ajouter.`,
          href: row.href,
        },
      ];
    }
    if (quotaPercent(row.used, row.limit) >= QUOTA_WARNING_PERCENT) {
      return [
        {
          id: `quota-${row.key}-proche`,
          level: 'warning',
          title: `Quota ${row.label} presque atteint`,
          description: `Vous utilisez ${usage}.`,
          href: row.href,
        },
      ];
    }
    return [];
  });
}

function subscriptionAlerts(
  subscription: NonNullable<CabinetAlertsInput['subscription']>,
  now: Date,
): CabinetAlert[] {
  switch (subscription.status) {
    case 'ESSAI': {
      const days = trialDaysLeft(subscription.trialEndsAt, now);
      if (days === null || days > TRIAL_WARNING_DAYS) return [];
      return [
        {
          id: 'essai-bientot-termine',
          level: 'warning',
          title:
            days === 0
              ? 'Votre période d’essai se termine aujourd’hui'
              : `Votre période d’essai se termine dans ${plural(days, 'jour')}`,
          description: subscription.trialEndsAt
            ? `Fin de l'essai le ${formatDate(subscription.trialEndsAt)}.`
            : 'Votre abonnement démarre à la fin de l’essai.',
        },
      ];
    }
    case 'DELAI_GRACE':
      return [
        {
          id: 'paiement-echec',
          level: 'danger',
          title: 'Paiement en échec',
          description:
            'Régularisez votre abonnement avant la fin du délai de grâce pour éviter la suspension de votre cabinet.',
        },
      ];
    case 'IMPAYE':
      return [
        {
          id: 'suspendu-impaye',
          level: 'danger',
          title: 'Cabinet suspendu pour impayé',
          description:
            'Vos clients conservent un accès en lecture seule. Régularisez votre abonnement pour reprendre la production.',
        },
      ];
    case 'RESILIE':
      return [
        {
          id: 'abonnement-resilie',
          level: 'warning',
          title: 'Abonnement résilié',
          description: 'Votre cabinet est en lecture seule ; pensez à exporter vos données.',
        },
      ];
    case 'EN_ATTENTE_PAIEMENT':
      return [
        {
          id: 'attente-paiement',
          level: 'info',
          title: 'Abonnement en attente de paiement',
          description: 'Finalisez votre abonnement pour activer votre cabinet.',
        },
      ];
    default:
      return [];
  }
}

export function buildCabinetAlerts(input: CabinetAlertsInput): CabinetAlert[] {
  const now = input.now ?? new Date();
  const alerts: CabinetAlert[] = [
    ...(input.subscription ? subscriptionAlerts(input.subscription, now) : []),
    ...quotaAlerts(input.quotas),
  ];

  // D27 : une entreprise sans gestionnaire actif n'a personne pour produire
  // ses fiches.
  const uncovered = (input.entreprises ?? []).filter((e) => !e.covered);
  if (uncovered.length > 0) {
    alerts.push({
      id: 'entreprises-sans-gestionnaire',
      level: 'danger',
      title: `${plural(uncovered.length, 'entreprise sans gestionnaire actif', 'entreprises sans gestionnaire actif')}`,
      description: `Assignez un gestionnaire actif à : ${uncovered.map((e) => e.name).join(', ')}.`,
      href: ENTREPRISES_HREF,
    });
  }

  const expired = input.invitations.filter((i) => i.status === 'expired');
  if (expired.length > 0) {
    alerts.push({
      id: 'invitations-expirees',
      level: 'warning',
      title: `${plural(expired.length, 'invitation expirée', 'invitations expirées')}`,
      description: 'Renvoyez-les pour que ces personnes puissent rejoindre votre cabinet.',
      href: GESTIONNAIRES_HREF,
    });
  }

  const suspendedByAdmin = input.gestionnaires.filter(
    (g) => g.status === 'suspendu' && !g.reactivatableByCabinet,
  );
  if (suspendedByAdmin.length > 0) {
    alerts.push({
      id: 'suspendus-administration',
      level: 'warning',
      title: `${plural(suspendedByAdmin.length, 'gestionnaire suspendu', 'gestionnaires suspendus')} par l'administration`,
      description: 'Seule l\'administration SocialFlow peut lever cette suspension.',
      href: GESTIONNAIRES_HREF,
    });
  }

  const suspendedByCabinet = input.gestionnaires.filter(
    (g) => g.status === 'suspendu' && g.reactivatableByCabinet,
  );
  if (suspendedByCabinet.length > 0) {
    alerts.push({
      id: 'suspendus-cabinet',
      level: 'info',
      title: plural(suspendedByCabinet.length, 'gestionnaire suspendu', 'gestionnaires suspendus'),
      description: 'Vous pouvez les réactiver à tout moment.',
      href: GESTIONNAIRES_HREF,
    });
  }

  const limitMs = RESTORE_WARNING_DAYS * 24 * 60 * 60 * 1000;
  for (const entry of input.archived) {
    const remaining = entry.restorableUntil.getTime() - now.getTime();
    if (remaining > 0 && remaining <= limitMs) {
      alerts.push({
        id: `restauration-${entry.id}`,
        level: 'warning',
        title: `${entry.name} : restauration bientôt impossible`,
        description: `Vous pouvez le restaurer jusqu'au ${formatDate(entry.restorableUntil)}.`,
        href: GESTIONNAIRES_HREF,
      });
    }
  }

  const hasPendingInvitation = input.invitations.some((i) => i.status === 'pending');
  if (input.gestionnaires.length === 0 && !hasPendingInvitation) {
    alerts.push({
      id: 'aucun-gestionnaire',
      level: 'info',
      title: 'Invitez votre premier gestionnaire',
      description: 'Seul un gestionnaire peut préparer les fiches de paie de vos clients.',
      href: GESTIONNAIRES_HREF,
    });
  }

  // Stable : les plus urgentes d'abord, ordre de construction ensuite.
  return alerts
    .map((alert, index) => ({ alert, index }))
    .sort((a, b) => LEVEL_ORDER[a.alert.level] - LEVEL_ORDER[b.alert.level] || a.index - b.index)
    .map(({ alert }) => alert);
}
