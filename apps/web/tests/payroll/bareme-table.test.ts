// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';

// D99 : la table bareme_version existe, est globale (aucun cabinetId) et refuse un code en double.
const CODE = `vitest-bareme-${Date.now()}`;

afterAll(async () => {
  await prisma.baremeVersion.deleteMany({ where: { code: { startsWith: 'vitest-bareme-' } } });
});

describe('table bareme_version', () => {
  it('enregistre une version avec ses paramètres et sa source', async () => {
    const cree = await prisma.baremeVersion.create({
      data: {
        code: CODE,
        valideDepuis: new Date('2026-01-01'),
        statut: 'A_VERIFIER',
        categorieEmployeur: 'PRIVE_MARCHAND',
        parametres: { version: 1, categorieEmployeur: 'PRIVE_MARCHAND' },
        source: {},
      },
    });
    expect(cree.valideJusqua).toBeNull();
    expect(cree.parametres).toEqual({ version: 1, categorieEmployeur: 'PRIVE_MARCHAND' });
    // Barème global : la ligne n'a aucune colonne cabinetId.
    expect('cabinetId' in cree).toBe(false);
  });

  it('refuse deux versions de même code', async () => {
    await expect(
      prisma.baremeVersion.create({
        data: {
          code: CODE,
          valideDepuis: new Date('2027-01-01'),
          statut: 'A_VERIFIER',
          categorieEmployeur: 'PRIVE_MARCHAND',
          parametres: {},
          source: {},
        },
      }),
    ).rejects.toThrow();
  });
});
