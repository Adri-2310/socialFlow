import { NextResponse } from 'next/server';
import type { LifecycleError } from '@/lib/salarie/lifecycle-write';

// Réponses d'erreur communes aux routes de sortie et d'archivage d'un dossier.
export function lifecycleErrorResponse(result: LifecycleError) {
  switch (result.error) {
    case 'SALARIE_NOT_FOUND':
      return NextResponse.json({ error: result.error }, { status: 404 });
    case 'DATE_SORTIE_OUT_OF_RANGE':
    case 'CONDITION_AFTER_SORTIE':
      return NextResponse.json(
        { error: result.error, fields: { dateSortie: result.error } },
        { status: 409 },
      );
    case 'SALARIE_ALREADY_ARCHIVED':
    case 'SALARIE_NOT_ARCHIVED':
      return NextResponse.json({ error: result.error }, { status: 409 });
  }
}
