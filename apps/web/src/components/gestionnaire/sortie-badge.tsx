import { situationSortie } from '@/lib/salarie/sortie';

// Les dates de dossier n'ont pas d'heure : on les lit en UTC pour ne pas les décaler d'un jour.
const formatDate = (date: Date) => date.toLocaleDateString('fr-BE', { timeZone: 'UTC' });

// Situation d'un salarié par rapport à sa sortie : « En poste », « Sort le … » ou « Sorti le … ».
// Présentation pure, calculée côté serveur avec la date du jour.
export function SortieBadge({ dateSortie, at }: { dateSortie: Date | null; at: Date }) {
  const situation = situationSortie(dateSortie, at);

  if (situation === 'EN_POSTE' || !dateSortie) {
    return <span className="text-foreground/80">En poste</span>;
  }

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
        situation === 'SORTI'
          ? 'bg-muted text-muted-foreground'
          : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
      }`}
    >
      {situation === 'SORTI' ? 'Sorti le' : 'Sort le'} {formatDate(dateSortie)}
    </span>
  );
}
