// Situation d'un salarié par rapport à sa date de sortie (roles/03 § 4.2). Fonction pure : la
// date du jour arrive en paramètre. Les dates de dossier n'ont pas d'heure : on compare les
// jours (AAAA-MM-JJ, en UTC comme le reste du dossier).

export type SituationSortie = 'EN_POSTE' | 'SORT_BIENTOT' | 'SORTI';

const jour = (date: Date) => date.toISOString().slice(0, 10);

// Le jour même de la sortie, le salarié travaille encore : il est « Sorti » dès le lendemain.
export function situationSortie(dateSortie: Date | null, at: Date): SituationSortie {
  if (!dateSortie) return 'EN_POSTE';
  return jour(dateSortie) < jour(at) ? 'SORTI' : 'SORT_BIENTOT';
}
