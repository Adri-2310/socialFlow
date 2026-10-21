import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authz/authz';
import { conditionTravailSchema, invalidFieldCode, invalidFields } from '@/lib/schemas/salarie';
import { conditionErrorResponse } from '@/lib/salarie/condition-http';
import { removeCondition, updateCondition } from '@/lib/salarie/condition-write';
import { findSalarieInScope } from '@/lib/salarie/salarie-data';

// Correction (PUT) ou annulation (DELETE) d'une ligne de l'historique daté (roles/03 § 4.2).
// Le périmètre vient de la session ; les identifiants de l'URL sont revérifiés contre lui.

type Context = { params: Promise<{ id: string; conditionId: string }> };

export async function PUT(request: Request, { params }: Context) {
  const authz = await authorize(request, 'salarie.gerer');
  if (authz.response) return authz.response;
  const { session, scope } = authz;
  const { id, conditionId } = await params;

  if (!(await findSalarieInScope(scope, id))) {
    return NextResponse.json({ error: 'SALARIE_NOT_FOUND' }, { status: 404 });
  }

  const parsed = conditionTravailSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: invalidFieldCode(parsed.error), fields: invalidFields(parsed.error) },
      { status: 400 },
    );
  }

  const result = await updateCondition(scope, session.user.id, id, conditionId, parsed.data);
  if (!result.ok) return conditionErrorResponse(result);

  return NextResponse.json({ success: true, changed: result.changed });
}

export async function DELETE(request: Request, { params }: Context) {
  const authz = await authorize(request, 'salarie.gerer');
  if (authz.response) return authz.response;
  const { session, scope } = authz;
  const { id, conditionId } = await params;

  if (!(await findSalarieInScope(scope, id))) {
    return NextResponse.json({ error: 'SALARIE_NOT_FOUND' }, { status: 404 });
  }

  const result = await removeCondition(scope, session.user.id, id, conditionId);
  if (!result.ok) return conditionErrorResponse(result);

  return NextResponse.json({ success: true });
}
