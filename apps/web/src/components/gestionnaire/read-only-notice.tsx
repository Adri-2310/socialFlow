import { PauseCircle } from 'lucide-react';
import { Notice } from '@/components/shared/notice';

// Message du gestionnaire quand son cabinet est en lecture seule (D29, D71) :
// impayé, résiliation ou suspension. Aucune raison commerciale n'est donnée, le
// gestionnaire est renvoyé vers son cabinet. Présentation pure.
export function ReadOnlyNotice({ readOnly }: { readOnly: boolean }) {
  if (!readOnly) return null;

  return (
    <Notice
      tone="danger"
      icon={<PauseCircle aria-hidden="true" className="size-5" />}
      title="Espace en lecture seule"
    >
      Vous pouvez consulter les informations, mais plus rien ne peut être modifié pour le moment.
      Contactez votre cabinet pour en savoir plus.
    </Notice>
  );
}
