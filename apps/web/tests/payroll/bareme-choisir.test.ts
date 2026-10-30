// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  choisirBareme,
  choisirBaremeParDate,
  choisirBaremesPourFiche,
  verifierPasDeChevauchement,
} from '@/lib/payroll/bareme/choisir';
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

// D112 : le précompte dépend du jour de paiement, les autres blocs du mois de la fiche.
describe('choisirBaremeParDate', () => {
  // Version « avant » jusqu'au 31/10/2026, version « après » dès le 01/11/2026 (arrêté royal du 27/09/2026).
  const avant = v('AVANT', '2026-09-01', '2026-10-31');
  const apres = v('APRES', '2026-11-01', null);

  it('choisit la version du jour exact : le 31/10 l\u2019ancienne, le 01/11 la nouvelle', () => {
    expect(choisirBaremeParDate([avant, apres], '2026-10-31', 'PRIVE_MARCHAND').code).toBe('AVANT');
    expect(choisirBaremeParDate([avant, apres], '2026-11-01', 'PRIVE_MARCHAND').code).toBe('APRES');
    expect(choisirBaremeParDate([avant, apres], '2026-11-05', 'PRIVE_MARCHAND').code).toBe('APRES');
  });

  it('couvre le premier et le dernier jour d\u2019une version, avec ou sans fin', () => {
    expect(choisirBaremeParDate([avant, apres], '2026-09-01', 'PRIVE_MARCHAND').code).toBe('AVANT');
    expect(choisirBaremeParDate([avant, apres], '2040-01-01', 'PRIVE_MARCHAND').code).toBe('APRES');
  });

  it('ignore les versions A_VERIFIER et RETIRE et les autres catégories', () => {
    const versions = [
      v('A', '2026-01-01', null, { statut: 'A_VERIFIER' }),
      v('R', '2026-01-01', null, { statut: 'RETIRE' }),
      v('X', '2026-01-01', null, { categorieEmployeur: 'AUTRE' }),
    ];
    expect(codeErreur(() => choisirBaremeParDate(versions, '2026-03-03', 'PRIVE_MARCHAND'))).toBe(
      'BAREME_INTROUVABLE',
    );
  });

  it('refuse quand aucune version ne couvre le jour ou que deux versions le couvrent', () => {
    expect(
      codeErreur(() => choisirBaremeParDate([avant, apres], '2026-08-31', 'PRIVE_MARCHAND')),
    ).toBe('BAREME_INTROUVABLE');
    const chevauche = [v('A', '2026-01-01', null), v('B', '2026-06-01', null)];
    expect(codeErreur(() => choisirBaremeParDate(chevauche, '2026-07-01', 'PRIVE_MARCHAND'))).toBe(
      'BAREME_AMBIGU',
    );
  });

  it('refuse une date impossible ou mal formée', () => {
    for (const d of ['2026-02-30', '05/11/2026', '2026-1-1', '']) {
      expect(codeErreur(() => choisirBaremeParDate([avant, apres], d, 'PRIVE_MARCHAND'))).toBe(
        'ENTREE_INVALIDE',
      );
    }
  });
});

describe('choisirBaremesPourFiche', () => {
  // Trois versions : septembre, octobre (changement du fonds amiante au 4e trimestre) et dès novembre.
  const sept = v('BE-2026-09', '2026-09-01', '2026-09-30');
  const oct = v('BE-2026-10', '2026-10-01', '2026-10-31');
  const nov = v('BE-2026-11', '2026-11-01', null);
  const versions = [sept, oct, nov];

  it('une fiche d\u2019octobre payée le 05/11 prend le barème d\u2019octobre pour la période et celui de novembre pour le précompte', () => {
    const r = choisirBaremesPourFiche(versions, 2026, 10, '2026-11-05', 'PRIVE_MARCHAND');
    expect(r.periode.code).toBe('BE-2026-10');
    expect(r.paiement.code).toBe('BE-2026-11');
  });

  it('la même fiche payée le 28/10 garde le barème d\u2019octobre pour les deux', () => {
    const r = choisirBaremesPourFiche(versions, 2026, 10, '2026-10-28', 'PRIVE_MARCHAND');
    expect(r.periode.code).toBe('BE-2026-10');
    expect(r.paiement.code).toBe('BE-2026-10');
  });

  it('une fiche de novembre payée dans le mois prend le barème de novembre pour les deux', () => {
    const r = choisirBaremesPourFiche(versions, 2026, 11, '2026-11-30', 'PRIVE_MARCHAND');
    expect(r.periode.code).toBe('BE-2026-11');
    expect(r.paiement.code).toBe('BE-2026-11');
  });

  it('refuse une date de paiement qui précède le mois de la fiche', () => {
    expect(
      codeErreur(() => choisirBaremesPourFiche(versions, 2026, 10, '2026-09-30', 'PRIVE_MARCHAND')),
    ).toBe('DATE_PAIEMENT_INCOHERENTE');
  });

  it('refuse une date impossible, avant même de comparer', () => {
    expect(
      codeErreur(() => choisirBaremesPourFiche(versions, 2026, 10, '2026-10-32', 'PRIVE_MARCHAND')),
    ).toBe('ENTREE_INVALIDE');
  });

  it('garde les règles de la période : un mois mal couvert ou un mois invalide est refusé', () => {
    const partiel = [v('A', '2026-10-15', null)];
    expect(
      codeErreur(() => choisirBaremesPourFiche(partiel, 2026, 10, '2026-11-05', 'PRIVE_MARCHAND')),
    ).toBe('BAREME_PARTIEL');
    expect(
      codeErreur(() => choisirBaremesPourFiche(versions, 2026, 13, '2026-11-05', 'PRIVE_MARCHAND')),
    ).toBe('ENTREE_INVALIDE');
  });

  it('refuse quand aucune version n\u2019est active le jour du paiement', () => {
    expect(
      codeErreur(() =>
        choisirBaremesPourFiche([sept, oct], 2026, 10, '2026-11-05', 'PRIVE_MARCHAND'),
      ),
    ).toBe('BAREME_INTROUVABLE');
  });
});
