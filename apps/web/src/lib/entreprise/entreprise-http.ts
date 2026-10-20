import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';
import type { EntrepriseError } from '@/lib/entreprise/cabinet-entreprises';
import { quotaExceededBody } from '@/lib/billing/cabinet-quotas';

// Reponses d'erreur communes aux routes /api/cabinet/entreprises.

// Un code par champ, pour que le formulaire affiche l'erreur au bon endroit.
export function invalidRequestResponse(error: ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form');
    if (!(field in fields)) fields[field] = issue.message;
  }
  return NextResponse.json({ error: 'INVALID_REQUEST', fields }, { status: 400 });
}

export function entrepriseErrorResponse(result: EntrepriseError) {
  switch (result.error) {
    case 'ENTREPRISE_NOT_FOUND':
      return NextResponse.json({ error: result.error }, { status: 404 });
    case 'QUOTA_EXCEEDED':
      return NextResponse.json(
        quotaExceededBody('maxEntreprises', result.limit, result.used, result.pendingPlan),
        { status: 403 },
      );
    case 'GESTIONNAIRE_INVALID':
    case 'NO_ACTIVE_GESTIONNAIRE':
      return NextResponse.json(
        { error: 'INVALID_REQUEST', fields: { gestionnaireIds: result.error } },
        { status: 400 },
      );
    case 'VAT_ALREADY_USED':
      return NextResponse.json(
        { error: 'INVALID_REQUEST', fields: { vatNumber: result.error } },
        { status: 409 },
      );
    case 'ALREADY_ARCHIVED':
    case 'NOT_ARCHIVED':
      return NextResponse.json({ error: result.error }, { status: 409 });
  }
}
