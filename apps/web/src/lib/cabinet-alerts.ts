import type {
  ArchivedGestionnaireRow,
  GestionnaireRow,
  InvitationRow,
} from '@/lib/cabinet-data';
import {
  formatStorageMb,
  isQuotaReached,
  quotaPercent,
  type CabinetQuotaUsage,
} from '@/lib/cabinet-quotas';

// Alertes du tableau de bord Cabinet RH (roles/02-cabinet-rh.md § 4.1).
// Module pur : construit la liste a partir de donnees deja lues, donc
// testable sans base. Les alertes qui dependent de chantiers a venir
// (entreprise sans gestionnaire, echeances ONSS, paiement en echec) s'y
// ajouteront quand leurs donnees existeront.

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
  now?: Date;
};

const GESTIONNAIRES_HREF = '/dashboard/cabinet/gestionnaires';
// Seuil a partir duquel un quota est signale avant d'etre atteint.
const QUOTA_WARNING_PERCENT = 80;
// Une restauration qui expire dans ce delai merite d'etre signalee.
const RESTORE_WARNING_DAYS = 7;

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
      label: "d'utilisateurs",
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
      href: undefined,
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

export function buildCabinetAlerts(input: CabinetAlertsInput): CabinetAlert[] {
  const now = input.now ?? new Date();
  const alerts: CabinetAlert[] = [...quotaAlerts(input.quotas)];

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
