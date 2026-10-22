import { NextResponse } from 'next/server';
import type { PrestationError } from '@/lib/periode/prestation-write';

// Réponses d'erreur communes aux routes d'encodage des prestations.
export function prestationErrorResponse(result: PrestationError) {
  switch (result.error) {
    case 'PERIODE_NOT_FOUND':
    case 'SALARIE_NOT_FOUND':
      return NextResponse.json({ error: result.error }, { status: 404 });
    case 'PERIODE_LOCKED':
    case 'DEADLINE_PASSED':
    case 'SALARIE_NOT_ACTIVE_IN_PERIOD':
      return NextResponse.json({ error: result.error }, { status: 409 });
  }
}
