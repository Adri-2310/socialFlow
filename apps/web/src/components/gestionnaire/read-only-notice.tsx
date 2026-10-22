import { PauseCircle } from 'lucide-react';

// Message du gestionnaire quand son cabinet est en lecture seule (D29, D71) :
// impayé, résiliation ou suspension. Aucune raison commerciale n'est donnée, le
// gestionnaire est renvoyé vers son cabinet. Présentation pure.
export function ReadOnlyNotice({ readOnly }: { readOnly: boolean }) {
  if (!readOnly) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-destructive-text"
    >
      <span className="mt-0.5 shrink-0">
        <PauseCircle className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">Espace en lecture seule</p>
        <p className="text-sm text-foreground/80">
          Vous pouvez consulter les informations, mais plus rien ne peut être modifié pour le
          moment. Contactez votre cabinet pour en savoir plus.
        </p>
      </div>
    </div>
  );
}
