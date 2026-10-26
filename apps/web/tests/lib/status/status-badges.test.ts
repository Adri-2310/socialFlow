import { describe, expect, it } from 'vitest';
import { BILLING_STATUSES, BILLING_STATUS_LABELS } from '@/lib/billing/billing';
import { STATUS_REGISTRY, statusEntry, type StatusTone } from '@/lib/status/status-badges';

const TONES: StatusTone[] = ['success', 'info', 'warning', 'danger', 'neutral'];

describe('registre des statuts', () => {
  it('donne un libellé non vide et un ton connu à chaque statut de chaque domaine', () => {
    for (const [domain, statuses] of Object.entries(STATUS_REGISTRY)) {
      for (const [status, entry] of Object.entries(statuses)) {
        expect(entry.label.trim(), `${domain}/${status}`).not.toBe('');
        expect(TONES, `${domain}/${status}`).toContain(entry.tone);
      }
    }
  });

  it('couvre tous les états d’abonnement (D55) avec les libellés de billing.ts', () => {
    for (const status of BILLING_STATUSES) {
      expect(statusEntry('abonnement', status).label).toBe(BILLING_STATUS_LABELS[status]);
    }
  });

  it('associe les comptes aux libellés de l’ancien affichage', () => {
    expect(statusEntry('compte', 'actif')).toEqual({ label: 'Actif', tone: 'success' });
    expect(statusEntry('compte', 'suspendu')).toEqual({ label: 'Suspendu', tone: 'danger' });
    expect(statusEntry('compte', 'archive')).toEqual({ label: 'Archivé', tone: 'neutral' });
  });

  it('associe les statuts Stripe de la facturation', () => {
    expect(statusEntry('stripe', 'past_due')).toEqual({
      label: 'Paiement en retard',
      tone: 'danger',
    });
    expect(statusEntry('stripe', 'trialing').label).toBe('Essai');
    expect(statusEntry('stripe', 'incomplete_expired').label).toBe('Expiré');
  });

  it('garde les libellés au pluriel des périodes de paie', () => {
    expect(statusEntry('periode', 'OUVERTE').label).toBe('Ouvertes');
    expect(statusEntry('periode', 'VERROUILLEE').label).toBe('Verrouillées');
  });

  it('affiche un statut inconnu tel quel, en ton neutre', () => {
    expect(statusEntry('compte', 'en_revue')).toEqual({ label: 'en_revue', tone: 'neutral' });
    expect(statusEntry('abonnement', 'NOUVEAU')).toEqual({ label: 'NOUVEAU', tone: 'neutral' });
  });

  it('ne partage aucun objet entre statuts (un changement local ne se propage pas)', () => {
    expect(statusEntry('compte', 'inconnu-1')).not.toBe(statusEntry('compte', 'inconnu-1'));
  });
});
