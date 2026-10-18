// Affichage du prix d'un plan (D58). En facturation annuelle, le client PAIE
// le total de l'annee : c'est ce montant qui est mis en avant, le cout mensuel
// equivalent n'etant donne qu'a titre d'information. En mensuel, on affiche le
// montant facture chaque mois.
//
// Le prix "annuel" saisi pour un plan est un montant mensuel equivalent
// (voir lib/billing.ts) ; le total facture en est 12 fois.

export type PlanPriceInput = {
  monthlyPrice: number | null;
  yearlyPrice: number | null;
};

export type PlanPriceDisplay = {
  amount: number | null;
  unit: '€/mois' | '€/an';
  // Information complementaire, jamais le montant facture.
  note: string | null;
};

export function planPriceDisplay(
  plan: PlanPriceInput,
  billing: 'monthly' | 'yearly',
): PlanPriceDisplay {
  if (billing === 'yearly' && plan.yearlyPrice != null) {
    return {
      amount: plan.yearlyPrice * 12,
      unit: '€/an',
      note: `soit ${plan.yearlyPrice} € par mois, facturé une fois par an`,
    };
  }

  return { amount: plan.monthlyPrice, unit: '€/mois', note: null };
}
