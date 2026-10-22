import { situationSalarie } from '@/lib/salarie/sortie';

// Les dates de dossier n'ont pas d'heure : on les lit en UTC pour ne pas les décaler d'un jour.
const formatDate = (date: Date) => date.toLocaleDateString('fr-BE', { timeZone: 'UTC' });

// Situation d'un salarié : « Entre le … », « En poste », « Sort le … » ou « Sorti le … ».
// Présentation pure, calculée côté serveur avec la date du jour. Sans `dateEntree` (ligne
// « Sortie » de la fiche, où l'entrée a sa propre ligne), seule la sortie est considérée.
export function SortieBadge({
  dateEntree,
  dateSortie,
  at,
}: {
  dateEntree?: Date;
  dateSortie: Date | null;
  at: Date;
}) {
  // Sans date d'entrée, on la place avant tout pour que seule la sortie compte.
  const situation = situationSalarie(dateEntree ?? new Date(0), dateSortie, at);

  if (situation === 'PAS_ENCORE_ENTRE' && dateEntree) {
    return (
      <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
        Entre le {formatDate(dateEntree)}
      </span>
    );
  }

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
