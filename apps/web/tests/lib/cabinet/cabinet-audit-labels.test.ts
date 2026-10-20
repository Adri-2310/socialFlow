import { describe, it, expect } from 'vitest';
import {
  CABINET_AUDIT_ACTION_LIST,
  describeAuditEntry,
  isCabinetAuditAction,
  parseBrusselsDayStart,
} from '@/lib/cabinet/cabinet-audit-labels';

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
    // Cycle de vie du cabinet exclu ; seuls ses parametres (D30) y figurent.
    expect(CABINET_AUDIT_ACTION_LIST.filter((a) => a.startsWith('CABINET_'))).toEqual([
      'CABINET_SETTINGS_UPDATED',
    ]);
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

describe('export des donnees du cabinet (D74)', () => {
  it('est liste dans le journal du cabinet avec sa phrase', () => {
    expect(isCabinetAuditAction('DATA_EXPORTED')).toBe(true);
    expect(
      describeAuditEntry({ targetName: null, email: null, previousEmail: null, newEmail: null, action: 'DATA_EXPORTED' }),
    ).toBe('Les données du cabinet ont été exportées');
  });
});

describe('actions sur les entreprises clientes', () => {
  const base = { targetName: null, email: null, previousEmail: null, newEmail: null };

  it('sont listees dans le journal du cabinet', () => {
    for (const action of ['ENTREPRISE_CREATED', 'ENTREPRISE_UPDATED', 'ENTREPRISE_ARCHIVED', 'ENTREPRISE_RESTORED']) {
      expect(isCabinetAuditAction(action)).toBe(true);
    }
  });

  it('nomment l entreprise concernee', () => {
    expect(describeAuditEntry({ ...base, action: 'ENTREPRISE_CREATED', entreprise: 'Garage Pirard' })).toBe(
      "L'entreprise Garage Pirard a été créée",
    );
    expect(describeAuditEntry({ ...base, action: 'ENTREPRISE_ARCHIVED', entreprise: null })).toBe(
      "L'entreprise cliente a été archivée",
    );
  });
});

describe('invitations et retrait d un administrateur d entreprise (D70)', () => {
  const base = { targetName: null, email: 'admin@client.be', previousEmail: null, newEmail: null };

  it('nomment l entreprise concernee', () => {
    const entreprise = 'Garage Pirard';
    expect(describeAuditEntry({ ...base, action: 'INVITATION_SENT', entreprise })).toBe(
      "Invitation de l'administrateur de Garage Pirard envoyée à admin@client.be",
    );
    expect(describeAuditEntry({ ...base, action: 'INVITATION_RESENT', entreprise })).toContain('renvoyée');
    expect(describeAuditEntry({ ...base, action: 'INVITATION_REVOKED', entreprise })).toContain('révoquée');
    expect(describeAuditEntry({ ...base, action: 'INVITATION_ACCEPTED', entreprise })).toBe(
      'admin@client.be a accepté son invitation et administre Garage Pirard',
    );
    expect(
      describeAuditEntry({ ...base, action: 'USER_ARCHIVED', targetName: 'Jean Admin', entreprise }),
    ).toBe("L'administrateur de Garage Pirard (Jean Admin) a été retiré");
  });

  it('gardent les phrases d origine sans entreprise', () => {
    expect(describeAuditEntry({ ...base, action: 'INVITATION_SENT' })).toBe('Invitation envoyée à admin@client.be');
    expect(describeAuditEntry({ ...base, action: 'USER_ARCHIVED', targetName: 'Alice' })).toBe(
      'Alice a été retiré du cabinet',
    );
  });
});
