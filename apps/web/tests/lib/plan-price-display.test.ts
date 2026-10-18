import { describe, it, expect } from 'vitest';
import { planPriceDisplay } from '@/lib/plan-price-display';

const starter = { monthlyPrice: 150, yearlyPrice: 120 };

describe('planPriceDisplay (D58)', () => {
  it('mensuel : le montant facture chaque mois, sans note', () => {
    expect(planPriceDisplay(starter, 'monthly')).toEqual({
      amount: 150,
      unit: '€/mois',
      note: null,
    });
  });

  it('annuel : le total de l annee en avant, le cout mensuel en information', () => {
    expect(planPriceDisplay(starter, 'yearly')).toEqual({
      amount: 1440,
      unit: '€/an',
      note: 'soit 120 € par mois, facturé une fois par an',
    });
  });

  it('retombe sur le prix mensuel quand aucun prix annuel n existe', () => {
    expect(planPriceDisplay({ monthlyPrice: 150, yearlyPrice: null }, 'yearly')).toEqual({
      amount: 150,
      unit: '€/mois',
      note: null,
    });
  });

  it('ne change jamais le prix mensuel : facture chaque mois, pas a l annee', () => {
    for (const monthlyPrice of [150, 300, 750]) {
      const shown = planPriceDisplay({ monthlyPrice, yearlyPrice: monthlyPrice * 0.8 }, 'monthly');
      expect(shown.amount).toBe(monthlyPrice);
      expect(shown.unit).toBe('€/mois');
    }
  });
});
