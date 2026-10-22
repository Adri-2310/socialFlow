import { NextResponse } from 'next/server';
import type { PeriodeError } from '@/lib/periode/periode-write';

// Réponses d'erreur communes aux routes des périodes de paie.
export function periodeErrorResponse(result: PeriodeError) {
  switch (result.error) {
    case 'ENTREPRISE_NOT_FOUND':
    case 'PERIODE_NOT_FOUND':
      return NextResponse.json({ error: result.error }, { status: 404 });
    case 'PERIODE_OUT_OF_RANGE':
      return NextResponse.json(
        { error: result.error, fields: { mois: result.error } },
        { status: 409 },
      );
    case 'PERIODE_ALREADY_EXISTS':
    case 'PERIODE_LOCKED':
    case 'PERIODE_ALREADY_LOCKED':
    case 'PERIODE_NOT_LOCKED':
      return NextResponse.json({ error: result.error }, { status: 409 });
  }
}
