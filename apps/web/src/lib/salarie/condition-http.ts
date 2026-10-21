import { NextResponse } from 'next/server';
import type { ConditionError } from '@/lib/salarie/condition-write';

// Réponses d'erreur communes aux routes des conditions de travail. Un code par champ
// quand l'erreur se corrige dans le formulaire, pour l'afficher au bon endroit.
export function conditionErrorResponse(result: ConditionError) {
  switch (result.error) {
    case 'SALARIE_NOT_FOUND':
    case 'CONDITION_NOT_FOUND':
      return NextResponse.json({ error: result.error }, { status: 404 });
    case 'DATE_EFFET_OUT_OF_RANGE':
    case 'CONDITION_DATE_ALREADY_USED':
      return NextResponse.json(
        { error: result.error, fields: { dateEffet: result.error } },
        { status: 409 },
      );
    case 'DATE_EFFET_IMMUABLE':
      return NextResponse.json(
        { error: 'INVALID_DATE_EFFET', fields: { dateEffet: 'INVALID_DATE_EFFET' } },
        { status: 400 },
      );
    case 'CONDITION_NOT_REMOVABLE':
      return NextResponse.json({ error: result.error }, { status: 409 });
  }
}
