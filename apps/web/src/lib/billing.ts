// Etats d'abonnement d'un cabinet (D55, FONCTIONNEMENT.md § 5). Module pur :
// partage entre le serveur, les composants et les tests.

export const BILLING_STATUSES = [
  'EN_ATTENTE_PAIEMENT',
  'ESSAI',
  'ACTIF',
  'DELAI_GRACE',
  'IMPAYE',
  'RESILIE',
] as const;

export type BillingStatus = (typeof BILLING_STATUSES)[number];

export const BILLING_STATUS_LABELS: Record<BillingStatus, string> = {
  EN_ATTENTE_PAIEMENT: 'En attente de paiement',
  ESSAI: 'Période d’essai',
  ACTIF: 'Actif',
  DELAI_GRACE: 'Paiement en échec',
  IMPAYE: 'Suspendu pour impayé',
  RESILIE: 'Résilié',
};

// Valeur inconnue en base (ex. etat ajoute plus tard) : on la traite comme
// "en attente" plutot que d'afficher un code brut ou de planter.
export function normalizeBillingStatus(value: string | null | undefined): BillingStatus {
  return (BILLING_STATUSES as readonly string[]).includes(value ?? '')
    ? (value as BillingStatus)
    : 'EN_ATTENTE_PAIEMENT';
}

export function normalizeBillingPeriod(
  value: string | null | undefined,
): 'monthly' | 'yearly' | null {
  return value === 'monthly' || value === 'yearly' ? value : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Jours restants avant la fin de l'essai, arrondis au jour superieur (le
// dernier jour compte encore) ; 0 des que la date est passee ; null sans date.
export function trialDaysLeft(trialEndsAt: Date | null, now: Date = new Date()): number | null {
  if (!trialEndsAt) return null;
  const remaining = trialEndsAt.getTime() - now.getTime();
  return remaining <= 0 ? 0 : Math.ceil(remaining / DAY_MS);
}

// D57 : delai de grace apres un paiement echoue, avant le passage a IMPAYE
// (lecture seule). Une seule reference pour le webhook, la tache quotidienne
// et les textes affiches.
export const GRACE_PERIOD_DAYS = 7;

export function graceEndsAt(pastDueSince: Date): Date {
  return new Date(pastDueSince.getTime() + GRACE_PERIOD_DAYS * DAY_MS);
}

// Statut d'abonnement Stripe -> etat local (D55). null = pas de changement
// d'etat (statut inconnu ou sans effet : on n'invente rien).
export function mapStripeSubscriptionStatus(status: string): BillingStatus | null {
  switch (status) {
    case 'trialing':
      return 'ESSAI';
    case 'active':
      return 'ACTIF';
    case 'past_due':
      return 'DELAI_GRACE';
    case 'unpaid':
      return 'IMPAYE';
    case 'canceled':
      return 'RESILIE';
    case 'incomplete':
    case 'incomplete_expired':
      return 'EN_ATTENTE_PAIEMENT';
    default:
      return null;
  }
}

// D29, PERMISSIONS.md "Etats bloquants" : un cabinet en impaye ou resilie est
// en lecture seule (toute ecriture -> 423 CABINET_READ_ONLY). Le delai de
// grace, lui, laisse tout fonctionner avec une alerte.
export function isReadOnlyBillingStatus(status: string | null | undefined): boolean {
  const normalized = normalizeBillingStatus(status);
  return normalized === 'IMPAYE' || normalized === 'RESILIE';
}

// D58 : un prix de plan est saisi et affiche EN EUR PAR MOIS, quelle que soit
// la periodicite. En facturation annuelle il s'agit du montant mensuel
// equivalent (avec la remise annuelle) : Stripe facture une fois par an
// 12 fois ce montant. Une seule paire de fonctions pour que la creation des
// prix, leur comparaison et l'affichage ne divergent plus.
export const MONTHS_PER_YEAR = 12;

// Montant, en centimes, du Price Stripe pour un prix mensuel saisi.
export function stripeUnitAmountCents(monthlyEquivalent: number, period: 'monthly' | 'yearly') {
  return Math.round(monthlyEquivalent * 100 * (period === 'yearly' ? MONTHS_PER_YEAR : 1));
}

// Inverse : prix mensuel equivalent d'un Price Stripe (centimes).
export function monthlyEquivalentFromStripe(unitAmountCents: number, period: 'monthly' | 'yearly') {
  return unitAmountCents / 100 / (period === 'yearly' ? MONTHS_PER_YEAR : 1);
}
