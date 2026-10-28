// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { choisirBareme, verifierPasDeChevauchement } from '@/lib/payroll/bareme/choisir';
import { ErreurMoteur } from '@/lib/payroll/erreurs';
import type { VersionBareme } from '@/lib/payroll/types';

const v = (
  code: string,
  depuis: string,
  jusqua: string | null,
  extra: Partial<VersionBareme> = {},
) =>
  ({
    code,
    valideDepuis: depuis,
    valideJusqua: jusqua,
    statut: 'ACTIF',
    categorieEmployeur: 'PRIVE_MARCHAND',
    ...extra,
  }) as VersionBareme;

const codeErreur = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ErreurMoteur);
    return (e as ErreurMoteur).code;
  }
  throw new Error('Aucune erreur levée');
};

describe('choisirBareme', () => {
  it('retourne la seule version active qui couvre le mois', () => {
    const a = v('A', '2026-01-01', null);
    expect(choisirBareme([a], 2026, 3, 'PRIVE_MARCHAND')).toBe(a);
  });

  it('choisit la bonne version entre deux fenêtres contiguës', () => {
    const a = v('A', '2026-01-01', '2026-06-30');
    const b = v('B', '2026-07-01', null);
    expect(choisirBareme([a, b], 2026, 6, 'PRIVE_MARCHAND').code).toBe('A');
    expect(choisirBareme([a, b], 2026, 7, 'PRIVE_MARCHAND').code).toBe('B');
  });

  it('accepte une fin de validité au dernier jour du mois, y compris février bissextile', () => {
    const a = v('A', '2028-01-01', '2028-02-29');
    expect(choisirBareme([a], 2028, 2, 'PRIVE_MARCHAND').code).toBe('A');
    const b = v('B', '2027-01-01', '2027-02-27');
    expect(codeErreur(() => choisirBareme([b], 2027, 2, 'PRIVE_MARCHAND'))).toBe('BAREME_PARTIEL');
  });

  it('ignore les versions A_VERIFIER et RETIRE', () => {
    const versions = [
      v('A', '2026-01-01', null, { statut: 'A_VERIFIER' }),
      v('R', '2026-01-01', null, { statut: 'RETIRE' }),
    ];
    expect(codeErreur(() => choisirBareme(versions, 2026, 3, 'PRIVE_MARCHAND'))).toBe(
      'BAREME_INTROUVABLE',
    );
  });

  it("ignore une autre catégorie d'employeur", () => {
    const a = v('A', '2026-01-01', null, { categorieEmployeur: 'NON_MARCHAND' });
    expect(codeErreur(() => choisirBareme([a], 2026, 3, 'PRIVE_MARCHAND'))).toBe(
      'BAREME_INTROUVABLE',
    );
  });

  it('refuse quand aucune version ne couvre le mois', () => {
    const a = v('A', '2026-04-01', null);
    expect(codeErreur(() => choisirBareme([a], 2026, 3, 'PRIVE_MARCHAND'))).toBe(
      'BAREME_INTROUVABLE',
    );
    expect(codeErreur(() => choisirBareme([], 2026, 3, 'PRIVE_MARCHAND'))).toBe(
      'BAREME_INTROUVABLE',
    );
  });

  it("refuse une version qui ne couvre qu'une partie du mois", () => {
    const debutTardif = v('A', '2026-03-15', null);
    expect(codeErreur(() => choisirBareme([debutTardif], 2026, 3, 'PRIVE_MARCHAND'))).toBe(
      'BAREME_PARTIEL',
    );
    const finPrecoce = v('B', '2026-01-01', '2026-03-14');
    expect(codeErreur(() => choisirBareme([finPrecoce], 2026, 3, 'PRIVE_MARCHAND'))).toBe(
      'BAREME_PARTIEL',
    );
  });

  it('refuse deux versions actives sur le même mois', () => {
    const a = v('A', '2026-01-01', null);
    const b = v('B', '2026-01-01', null);
    expect(codeErreur(() => choisirBareme([a, b], 2026, 3, 'PRIVE_MARCHAND'))).toBe(
      'BAREME_AMBIGU',
    );
  });

  it('refuse une année ou un mois hors bornes', () => {
    expect(codeErreur(() => choisirBareme([], 2026, 13, 'PRIVE_MARCHAND'))).toBe('ENTREE_INVALIDE');
    expect(codeErreur(() => choisirBareme([], 2026, 0, 'PRIVE_MARCHAND'))).toBe('ENTREE_INVALIDE');
    expect(codeErreur(() => choisirBareme([], 1999, 1, 'PRIVE_MARCHAND'))).toBe('ENTREE_INVALIDE');
    expect(codeErreur(() => choisirBareme([], 2026.5, 1, 'PRIVE_MARCHAND'))).toBe(
      'ENTREE_INVALIDE',
    );
  });
});

describe('verifierPasDeChevauchement', () => {
  it('accepte des fenêtres contiguës et des versions sans fin après une fin', () => {
    expect(() =>
      verifierPasDeChevauchement([v('A', '2026-01-01', '2026-06-30'), v('B', '2026-07-01', null)]),
    ).not.toThrow();
  });

  it("refuse un chevauchement d'un jour", () => {
    expect(
      codeErreur(() =>
        verifierPasDeChevauchement([
          v('A', '2026-01-01', '2026-07-01'),
          v('B', '2026-07-01', null),
        ]),
      ),
    ).toBe('BAREME_CHEVAUCHEMENT');
  });

  it('refuse deux versions sans fin', () => {
    expect(
      codeErreur(() =>
        verifierPasDeChevauchement([v('A', '2026-01-01', null), v('B', '2027-01-01', null)]),
      ),
    ).toBe('BAREME_CHEVAUCHEMENT');
  });

  it('ne compte ni les versions à vérifier ni les autres catégories', () => {
    expect(() =>
      verifierPasDeChevauchement([
        v('A', '2026-01-01', null),
        v('B', '2026-01-01', null, { statut: 'A_VERIFIER' }),
        v('C', '2026-01-01', null, { categorieEmployeur: 'NON_MARCHAND' }),
      ]),
    ).not.toThrow();
  });
});
