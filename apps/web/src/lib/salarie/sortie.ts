// Situation d'un salarié par rapport à ses dates d'entrée et de sortie (roles/03 § 4.2).
// Fonctions pures : la date du jour arrive en paramètre. Les dates de dossier n'ont pas
// d'heure : on compare les jours (AAAA-MM-JJ, en UTC comme le reste du dossier).

export type SituationSortie = 'EN_POSTE' | 'SORT_BIENTOT' | 'SORTI';
export type SituationSalarie = SituationSortie | 'PAS_ENCORE_ENTRE';

const jour = (date: Date) => date.toISOString().slice(0, 10);

// Le jour même de la sortie, le salarié travaille encore : il est « Sorti » dès le lendemain.
export function situationSortie(dateSortie: Date | null, at: Date): SituationSortie {
  if (!dateSortie) return 'EN_POSTE';
  return jour(dateSortie) < jour(at) ? 'SORTI' : 'SORT_BIENTOT';
}

// Idem, en tenant compte de l'entrée : un salarié dont l'entrée est dans le futur (le dossier
// se crée avant l'arrivée, la DIMONA partant avant le premier jour) n'est pas « en poste ».
// Le jour même de l'entrée, il l'est.
export function situationSalarie(
  dateEntree: Date,
  dateSortie: Date | null,
  at: Date,
): SituationSalarie {
  if (jour(dateEntree) > jour(at)) return 'PAS_ENCORE_ENTRE';
  return situationSortie(dateSortie, at);
}
