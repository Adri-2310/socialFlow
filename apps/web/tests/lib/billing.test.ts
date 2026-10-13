import { describe, it, expect } from 'vitest';
import {
  BILLING_STATUSES,
  BILLING_STATUS_LABELS,
  GRACE_PERIOD_DAYS,
  graceEndsAt,
  mapStripeSubscriptionStatus,
  normalizeBillingPeriod,
  normalizeBillingStatus,
  trialDaysLeft,
} from '@/lib/billing';

const now = new Date('2026-10-14T12:00:00Z');
const day = 24 * 60 * 60 * 1000;

describe('trialDaysLeft', () => {
  it('arrondit au jour superieur : le dernier jour compte encore', () => {
    expect(trialDaysLeft(new Date(now.getTime() + 5 * day), now)).toBe(5);
    expect(trialDaysLeft(new Date(now.getTime() + 4.2 * day), now)).toBe(5);
    expect(trialDaysLeft(new Date(now.getTime() + 3_600_000), now)).toBe(1);
  });

  it('renvoie 0 une fois la date passee et null sans date', () => {
    expect(trialDaysLeft(new Date(now.getTime() - 1), now)).toBe(0);
    expect(trialDaysLeft(now, now)).toBe(0);
    expect(trialDaysLeft(null, now)).toBeNull();
  });
});

describe('normalisation', () => {
  it('garde un etat connu et replie une valeur inconnue sur "en attente"', () => {
    expect(normalizeBillingStatus('ACTIF')).toBe('ACTIF');
    expect(normalizeBillingStatus('NOUVEL_ETAT')).toBe('EN_ATTENTE_PAIEMENT');
    expect(normalizeBillingStatus(null)).toBe('EN_ATTENTE_PAIEMENT');
  });

  it('ne retient que mensuel ou annuel', () => {
    expect(normalizeBillingPeriod('monthly')).toBe('monthly');
    expect(normalizeBillingPeriod('yearly')).toBe('yearly');
    expect(normalizeBillingPeriod('hebdomadaire')).toBeNull();
    expect(normalizeBillingPeriod(undefined)).toBeNull();
  });

  it('fournit un libelle pour chaque etat', () => {
    for (const status of BILLING_STATUSES) {
      expect(BILLING_STATUS_LABELS[status]).toBeTruthy();
    }
  });
});

describe('delai de grace (D57)', () => {
  it('dure 7 jours', () => {
    expect(GRACE_PERIOD_DAYS).toBe(7);
    const since = new Date('2026-10-14T08:00:00Z');
    expect(graceEndsAt(since).toISOString()).toBe('2026-10-21T08:00:00.000Z');
  });
});

describe('mapStripeSubscriptionStatus', () => {
  it('traduit les statuts Stripe en etats locaux', () => {
    expect(mapStripeSubscriptionStatus('trialing')).toBe('ESSAI');
    expect(mapStripeSubscriptionStatus('active')).toBe('ACTIF');
    expect(mapStripeSubscriptionStatus('past_due')).toBe('DELAI_GRACE');
    expect(mapStripeSubscriptionStatus('unpaid')).toBe('IMPAYE');
    expect(mapStripeSubscriptionStatus('canceled')).toBe('RESILIE');
    expect(mapStripeSubscriptionStatus('incomplete')).toBe('EN_ATTENTE_PAIEMENT');
  });

  it('renvoie null pour un statut inconnu ou sans effet', () => {
    expect(mapStripeSubscriptionStatus('paused')).toBeNull();
    expect(mapStripeSubscriptionStatus('autre')).toBeNull();
  });
});
