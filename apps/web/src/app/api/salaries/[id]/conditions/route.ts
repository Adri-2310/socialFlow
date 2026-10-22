import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authz/authz';
import { conditionTravailSchema, invalidFieldCode, invalidFields } from '@/lib/schemas/salarie';
import { conditionErrorResponse } from '@/lib/salarie/condition-http';
import { addCondition } from '@/lib/salarie/condition-write';
import { findSalarieInScope } from '@/lib/salarie/salarie-data';

// Ajout d'une ligne à l'historique daté des conditions de travail (roles/03 § 4.2). Le
// périmètre vient de la session ; l'identifiant de l'URL est revérifié contre lui.

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const authz = await authorize(request, 'salarie.gerer');
  if (authz.response) return authz.response;
  const { session, scope } = authz;
  const { id } = await params;

  // Périmètre avant validation : un dossier hors périmètre répond 404 quel que soit le corps.
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

  const result = await addCondition(scope, session.user.id, id, parsed.data);
  if (!result.ok) return conditionErrorResponse(result);

  return NextResponse.json({ success: true, id: result.id }, { status: 201 });
}
