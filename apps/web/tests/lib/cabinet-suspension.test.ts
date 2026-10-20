import { describe, it, expect } from 'vitest';
import { isCabinetReadOnly, isLoginBlocked, suspensionTypeOf } from '@/lib/cabinet/cabinet-suspension';

describe('suspensionTypeOf (D71)', () => {
  it('ne signale rien pour un cabinet actif, meme avec un type residuel', () => {
    expect(suspensionTypeOf({ status: 'actif' })).toBeNull();
    expect(suspensionTypeOf({ status: 'actif', suspensionType: 'BLOCKED' })).toBeNull();
  });

  it('distingue la lecture seule du blocage total', () => {
    expect(suspensionTypeOf({ status: 'suspendu', suspensionType: 'READ_ONLY' })).toBe('READ_ONLY');
    expect(suspensionTypeOf({ status: 'suspendu', suspensionType: 'BLOCKED' })).toBe('BLOCKED');
  });

  it('traite une suspension anterieure a D71 (sans type) comme un blocage total', () => {
    expect(suspensionTypeOf({ status: 'suspendu' })).toBe('BLOCKED');
    expect(suspensionTypeOf({ status: 'suspendu', suspensionType: null })).toBe('BLOCKED');
    expect(suspensionTypeOf({ status: 'suspendu', suspensionType: 'inconnu' })).toBe('BLOCKED');
  });
});

describe('isLoginBlocked', () => {
  it('laisse se connecter en lecture seule, refuse en blocage total et pour un cabinet archive', () => {
    expect(isLoginBlocked({ status: 'actif' })).toBe(false);
    expect(isLoginBlocked({ status: 'suspendu', suspensionType: 'READ_ONLY' })).toBe(false);
    expect(isLoginBlocked({ status: 'suspendu', suspensionType: 'BLOCKED' })).toBe(true);
    expect(isLoginBlocked({ status: 'suspendu' })).toBe(true);
    expect(isLoginBlocked({ status: 'actif', deletedAt: new Date() })).toBe(true);
  });
});

describe('isCabinetReadOnly', () => {
  it('est vrai pour une suspension, quel que soit son type', () => {
    expect(isCabinetReadOnly({ status: 'suspendu', suspensionType: 'READ_ONLY', billingStatus: 'ACTIF' })).toBe(true);
    expect(isCabinetReadOnly({ status: 'suspendu', suspensionType: 'BLOCKED', billingStatus: 'ACTIF' })).toBe(true);
  });

  it('reste vrai pour l impaye et la resiliation (D29), faux sinon', () => {
    expect(isCabinetReadOnly({ status: 'actif', billingStatus: 'IMPAYE' })).toBe(true);
    expect(isCabinetReadOnly({ status: 'actif', billingStatus: 'RESILIE' })).toBe(true);
    expect(isCabinetReadOnly({ status: 'actif', billingStatus: 'ACTIF' })).toBe(false);
    expect(isCabinetReadOnly({ status: 'actif', billingStatus: 'DELAI_GRACE' })).toBe(false);
    expect(isCabinetReadOnly({ status: 'actif' })).toBe(false);
  });
});
