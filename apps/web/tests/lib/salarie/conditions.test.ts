import { describe, expect, it } from 'vitest';
import { conditionEnVigueur } from '@/lib/salarie/conditions';

const c = (dateEffet: string, fonction: string) => ({ dateEffet: new Date(dateEffet), fonction });

describe('condition de travail en vigueur', () => {
  const historique = [
    c('2027-04-01', 'Responsable'),
    c('2026-11-01', 'Comptable'),
    c('2028-01-01', 'Directeur'),
  ];

  it('prend la plus récente dont la date d’effet ne dépasse pas la date demandée', () => {
    expect(conditionEnVigueur(historique, new Date('2027-03-31'))?.fonction).toBe('Comptable');
    expect(conditionEnVigueur(historique, new Date('2027-12-31'))?.fonction).toBe('Responsable');
  });

  it('la date d’effet elle-même compte comme entrée en vigueur', () => {
    expect(conditionEnVigueur(historique, new Date('2027-04-01'))?.fonction).toBe('Responsable');
  });

  it('avant toute condition, renvoie la première prévue', () => {
    expect(conditionEnVigueur(historique, new Date('2026-01-01'))?.fonction).toBe('Comptable');
  });

  it('renvoie null sans historique, et ne modifie pas la liste reçue', () => {
    expect(conditionEnVigueur([], new Date())).toBeNull();
    const avant = historique.map((h) => h.fonction);
    conditionEnVigueur(historique, new Date('2027-06-01'));
    expect(historique.map((h) => h.fonction)).toEqual(avant);
  });
});
