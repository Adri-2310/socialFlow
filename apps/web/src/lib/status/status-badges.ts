import { BILLING_STATUS_LABELS, type BillingStatus } from '@/lib/billing/billing';

// Registre unique des statuts affichés en pastille : chaque statut y reçoit un libellé et un
// ton. Module pur (sans React), partagé par le composant StatusBadge et par ses tests. Avant,
// ces tables étaient recopiées dans chaque tableau (cabinets, utilisateurs, facturation…).

export type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

export type StatusDomain =
  | 'compte'
  | 'abonnement'
  | 'stripe'
  | 'periode'
  | 'modele'
  | 'invitation'
  | 'condition'
  | 'situation'
  | 'echeance'
  | 'plan';

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

// Modèles d'email du cabinet (D30, D68) : personnalisé ou repli sur le modèle par défaut.
const MODELE: Record<string, StatusEntry> = {
  personnalise: { label: 'Personnalisé', tone: 'info' },
  defaut: { label: 'Modèle par défaut', tone: 'neutral' },
};

// Invitations d'un cabinet (D52) : en attente, acceptée, ou finie sans suite.
const INVITATION: Record<string, StatusEntry> = {
  pending: { label: 'En attente', tone: 'info' },
  accepted: { label: 'Acceptée', tone: 'success' },
  expired: { label: 'Expirée', tone: 'neutral' },
  revoked: { label: 'Révoquée', tone: 'neutral' },
};

// Lignes de l'historique des conditions de travail d'un salarié (roles/03 § 4.2).
const CONDITION: Record<string, StatusEntry> = {
  EN_VIGUEUR: { label: 'En vigueur', tone: 'info' },
  A_VENIR: { label: 'À venir', tone: 'neutral' },
  PASSEE: { label: 'Passée', tone: 'neutral' },
};

// Situation d'un salarié par rapport à ses dates d'entrée et de sortie : le libellé porte la
// date (« Sort le 31/10/2026 »), l'appelant le fournit ; « en poste » reste du texte simple.
const SITUATION: Record<string, StatusEntry> = {
  PAS_ENCORE_ENTRE: { label: 'Entre bientôt', tone: 'info' },
  SORT_BIENTOT: { label: 'Sort bientôt', tone: 'warning' },
  SORTI: { label: 'Sorti', tone: 'neutral' },
};

// État de la période du mois courant d'une entreprise, dans le tableau de bord du gestionnaire
// (D93). Le libellé précis (avec la date limite) est fourni par l'appelant.
const ECHEANCE: Record<string, StatusEntry> = {
  NON_OUVERTE: { label: 'Période non ouverte', tone: 'neutral' },
  EN_ATTENTE: { label: 'Prestations attendues', tone: 'info' },
  EN_RETARD: { label: 'Date limite dépassée', tone: 'danger' },
  VERROUILLEE: { label: 'Prestations verrouillées', tone: 'neutral' },
};

// Repère sur la liste des plans d'un cabinet.
const PLAN: Record<string, StatusEntry> = {
  actuel: { label: 'Plan actuel', tone: 'info' },
};

export const STATUS_REGISTRY: Record<StatusDomain, Record<string, StatusEntry>> = {
  compte: COMPTE,
  abonnement: ABONNEMENT,
  stripe: STRIPE,
  periode: PERIODE,
  modele: MODELE,
  invitation: INVITATION,
  condition: CONDITION,
  situation: SITUATION,
  echeance: ECHEANCE,
  plan: PLAN,
};

// Un statut inconnu (ajouté plus tard en base) s'affiche tel quel en ton neutre, comme avant
// (`STATUS_LABEL[status] ?? status`), plutôt que de planter ou de disparaître.
export function statusEntry(domain: StatusDomain, status: string): StatusEntry {
  return STATUS_REGISTRY[domain][status] ?? { label: status, tone: 'neutral' };
}
