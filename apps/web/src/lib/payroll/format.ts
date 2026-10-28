import type { Fraction } from './types';

// Libellés lisibles des lignes de calcul (affichés sur la fiche). Rien ici n'entre dans un
// calcul : ce sont uniquement des textes, construits en entiers (pas de flottant, pas de Intl,
// donc le même résultat quelle que soit la machine ou la langue du navigateur).

// 1 824 minutes -> « 30 h 24 » (même affichage que les prestations, D96).
// Les minutes sont toujours sur deux chiffres : 65 minutes -> « 1 h 05 ».
export function formaterDuree(minutes: number): string {
  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  return `${heures} h ${String(reste).padStart(2, '0')}`;
}

// Des demi-journées en jours (D92 compte par pas de 0,5) : 1 -> « 0,5 jour », 2 -> « 1 jour »,
// 3 -> « 1,5 jours », 4 -> « 2 jours ». Virgule décimale, comme sur une fiche belge.
export function formaterJours(demiJours: number): string {
  const entiers = Math.floor(demiJours / 2);
  const texte = demiJours % 2 === 0 ? String(entiers) : `${entiers},5`;
  // Singulier jusqu'à un jour inclus (0,5 jour, 1 jour), pluriel au-delà.
  return `${texte} ${demiJours <= 2 ? 'jour' : 'jours'}`;
}

// { 4, 5 } -> « 4/5 ».
export function formaterFraction(f: Fraction): string {
  return `${f.numerateur}/${f.denominateur}`;
}
