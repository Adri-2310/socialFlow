import { BILLING_STATUS_LABELS, type BillingStatus } from '@/lib/billing/billing';

// Registre unique des statuts affichés en pastille : chaque statut y reçoit un libellé et un
// ton. Module pur (sans React), partagé par le composant StatusBadge et par ses tests. Avant,
// ces tables étaient recopiées dans chaque tableau (cabinets, utilisateurs, facturation…).

export type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

export type StatusDomain = 'compte' | 'abonnement' | 'stripe' | 'periode';

export type StatusEntry = { label: string; tone: StatusTone };

const COMPTE: Record<string, StatusEntry> = {
  actif: { label: 'Actif', tone: 'success' },
  suspendu: { label: 'Suspendu', tone: 'danger' },
  // L'archivage (deletedAt) est un état terminal qui prime sur actif/suspendu.
  archive: { label: 'Archivé', tone: 'neutral' },
};

// Abonnement d'un cabinet (D55) : les libellés viennent de billing.ts, une seule source.
const ABONNEMENT_TONES: Record<BillingStatus, StatusTone> = {
  EN_ATTENTE_PAIEMENT: 'neutral',
  ESSAI: 'info',
  ACTIF: 'success',
  DELAI_GRACE: 'warning',
  IMPAYE: 'danger',
  RESILIE: 'neutral',
};

const ABONNEMENT: Record<string, StatusEntry> = Object.fromEntries(
  (Object.keys(ABONNEMENT_TONES) as BillingStatus[]).map((status) => [
    status,
    { label: BILLING_STATUS_LABELS[status], tone: ABONNEMENT_TONES[status] },
  ]),
);

// Statuts d'abonnement côté Stripe, tels que la facturation SuperAdmin les affiche.
const STRIPE: Record<string, StatusEntry> = {
  active: { label: 'Actif', tone: 'success' },
  trialing: { label: 'Essai', tone: 'info' },
  past_due: { label: 'Paiement en retard', tone: 'danger' },
  unpaid: { label: 'Impayé', tone: 'danger' },
  canceled: { label: 'Annulé', tone: 'neutral' },
  incomplete: { label: 'Incomplet', tone: 'neutral' },
  incomplete_expired: { label: 'Expiré', tone: 'neutral' },
  paused: { label: 'En pause', tone: 'neutral' },
};

// Périodes de paie : les libellés sont au pluriel, comme dans la liste des périodes.
const PERIODE: Record<string, StatusEntry> = {
  OUVERTE: { label: 'Ouvertes', tone: 'info' },
  VERROUILLEE: { label: 'Verrouillées', tone: 'neutral' },
};

export const STATUS_REGISTRY: Record<StatusDomain, Record<string, StatusEntry>> = {
  compte: COMPTE,
  abonnement: ABONNEMENT,
  stripe: STRIPE,
  periode: PERIODE,
};

// Un statut inconnu (ajouté plus tard en base) s'affiche tel quel en ton neutre, comme avant
// (`STATUS_LABEL[status] ?? status`), plutôt que de planter ou de disparaître.
export function statusEntry(domain: StatusDomain, status: string): StatusEntry {
  return STATUS_REGISTRY[domain][status] ?? { label: status, tone: 'neutral' };
}
