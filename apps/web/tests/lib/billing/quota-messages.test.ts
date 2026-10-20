import { describe, it, expect } from 'vitest';
import { pendingPlanQuotaMessage, quotaAwareMessage } from '@/lib/billing/quota-messages';

const MESSAGES = { QUOTA_EXCEEDED: 'Quota atteint : passez à un plan supérieur.', FORBIDDEN: 'Interdit.' };

describe('quotaAwareMessage (D75)', () => {
  it('explique la limite d un downgrade programme au lieu de proposer un upgrade', () => {
    const message = quotaAwareMessage(
      { error: 'QUOTA_EXCEEDED', pendingPlan: 'Starter' },
      MESSAGES,
      'gestionnaires',
      'Erreur',
    );

    expect(message).toBe(pendingPlanQuotaMessage('Starter', 'gestionnaires'));
    expect(message).toContain('plan Starter');
    expect(message).toContain('annulez le changement');
    expect(message).not.toContain('plan supérieur');
  });

  it('garde le message habituel sans plan en attente, pour les autres erreurs et en repli', () => {
    expect(quotaAwareMessage({ error: 'QUOTA_EXCEEDED' }, MESSAGES, 'entreprises', 'Erreur')).toBe(
      MESSAGES.QUOTA_EXCEEDED,
    );
    expect(quotaAwareMessage({ error: 'FORBIDDEN' }, MESSAGES, 'entreprises', 'Erreur')).toBe('Interdit.');
    expect(quotaAwareMessage({ error: 'INCONNUE' }, MESSAGES, 'entreprises', 'Erreur')).toBe('Erreur');
    expect(quotaAwareMessage(null, MESSAGES, 'entreprises', 'Erreur')).toBe('Erreur');
  });
});
