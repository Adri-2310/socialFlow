import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authz/authz';
import { findPeriodeInScope } from '@/lib/periode/periode-data';
import { periodeErrorResponse } from '@/lib/periode/periode-http';
import { changeDateLimite } from '@/lib/periode/periode-write';
import { dateLimiteSchema } from '@/lib/schemas/periode';
import { invalidFieldCode, invalidFields } from '@/lib/schemas/salarie';

// D91 : décalage de la date limite d'une période. Le périmètre vient de la session ;
// l'identifiant de l'URL est revérifié contre lui.

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const authz = await authorize(request, 'periode.ouvrir');
  if (authz.response) return authz.response;
  const { session, scope } = authz;
  const { id } = await params;

  // Périmètre avant validation : une période hors périmètre répond 404 quel que soit le corps.
  if (!(await findPeriodeInScope(scope, id))) {
    return NextResponse.json({ error: 'PERIODE_NOT_FOUND' }, { status: 404 });
  }

  const parsed = dateLimiteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: invalidFieldCode(parsed.error), fields: invalidFields(parsed.error) },
      { status: 400 },
    );
  }

  const result = await changeDateLimite(scope, session.user.id, id, parsed.data.dateLimite);
  if (!result.ok) return periodeErrorResponse(result);

  return NextResponse.json({ success: true, changed: result.changed });
}
