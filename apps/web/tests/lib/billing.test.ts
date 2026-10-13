import { describe, it, expect } from 'vitest';
import {
  BILLING_STATUSES,
  BILLING_STATUS_LABELS,
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
