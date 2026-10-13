import { describe, it, expect } from 'vitest';
import {
  CABINET_AUDIT_ACTION_LIST,
  describeAuditEntry,
  isCabinetAuditAction,
  parseBrusselsDayStart,
} from '@/lib/cabinet-audit-labels';

const empty = { targetName: null, email: null, previousEmail: null, newEmail: null };

describe('describeAuditEntry', () => {
  it('decrit une invitation avec l adresse concernee', () => {
    expect(
      describeAuditEntry({ ...empty, action: 'INVITATION_SENT', email: 'a@cabinet.be' }),
    ).toBe('Invitation envoyée à a@cabinet.be');
    expect(
      describeAuditEntry({ ...empty, action: 'INVITATION_REVOKED', email: 'a@cabinet.be' }),
    ).toBe('Invitation de a@cabinet.be révoquée');
  });

  it('decrit une action sur un gestionnaire avec son nom', () => {
    expect(
      describeAuditEntry({ ...empty, action: 'USER_SUSPENDED', targetName: 'Alice Martin' }),
    ).toBe('Alice Martin a été suspendu');
    expect(describeAuditEntry({ ...empty, action: 'USER_ARCHIVED', targetName: null })).toBe(
      'Un utilisateur supprimé a été retiré du cabinet',
    );
  });

  it('montre l ancienne et la nouvelle adresse lors d un changement d email', () => {
    expect(
      describeAuditEntry({
        ...empty,
        action: 'USER_EMAIL_CHANGED',
        targetName: 'Alice',
        previousEmail: 'old@x.be',
        newEmail: 'new@x.be',
      }),
    ).toBe("L'email de Alice a été modifié (old@x.be → new@x.be)");
  });

  it('retombe sur le code pour une action inconnue', () => {
    expect(describeAuditEntry({ ...empty, action: 'AUTRE_ACTION' })).toBe('AUTRE_ACTION');
  });
});

describe('isCabinetAuditAction', () => {
  it('accepte les actions du cabinet et refuse les autres', () => {
    expect(isCabinetAuditAction('INVITATION_SENT')).toBe(true);
    expect(isCabinetAuditAction('PRICING_PLAN_CREATED')).toBe(false);
    expect(isCabinetAuditAction(undefined)).toBe(false);
    expect(CABINET_AUDIT_ACTION_LIST).not.toContain('PRICING_PLAN_UPDATED');
    expect(isCabinetAuditAction('CABINET_CREATED')).toBe(false);
    expect(CABINET_AUDIT_ACTION_LIST.filter((a) => a.startsWith('CABINET_'))).toEqual([]);
  });
});

describe('parseBrusselsDayStart', () => {
  it('donne minuit a Bruxelles : UTC+2 en ete, UTC+1 en hiver', () => {
    expect(parseBrusselsDayStart('2026-07-15')?.toISOString()).toBe('2026-07-14T22:00:00.000Z');
    expect(parseBrusselsDayStart('2026-12-15')?.toISOString()).toBe('2026-12-14T23:00:00.000Z');
  });

  it('refuse un format invalide ou une date inexistante', () => {
    expect(parseBrusselsDayStart('15/07/2026')).toBeNull();
    expect(parseBrusselsDayStart('2026-02-31')).toBeNull();
    expect(parseBrusselsDayStart('')).toBeNull();
    expect(parseBrusselsDayStart(undefined)).toBeNull();
  });
});
