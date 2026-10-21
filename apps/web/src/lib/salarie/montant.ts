// Saisie d'un montant en euros → centimes entiers, sans passer par un flottant
// (CLAUDE.md : aucun flottant pour un montant). 0,1 + 0,2 n'est pas 0,3 en
// JavaScript ; ici on lit les chiffres tels qu'écrits.

// Accepte « 2850 », « 2850,5 », « 2 850,50 », « 2850.50 » et « 2850 € ». Refuse les
// séparateurs de milliers (« 2.850,50 »), plus de deux décimales et tout autre texte.
export function parseEurosToCents(input: string): number | null {
  const compact = input.replace(/[\s€]/g, '');
  if (!/^\d+([.,]\d{1,2})?$/.test(compact)) return null;
  const [euros, decimales = ''] = compact.replace(',', '.').split('.');
  return Number(euros) * 100 + Number(decimales.padEnd(2, '0'));
}

// Centimes → « 2 850,00 € ». Calculé sur les entiers : on sépare euros et centimes avec
// des divisions entières, sans jamais fabriquer un flottant (amount / 100).
const MILLIERS = new Intl.NumberFormat('fr-BE');

export function formatCents(cents: number): string {
  const negatif = cents < 0;
  const absolu = Math.abs(cents);
  const euros = MILLIERS.format(Math.trunc(absolu / 100));
  const centimes = String(absolu % 100).padStart(2, '0');
  return `${negatif ? '-' : ''}${euros},${centimes} €`;
}
