import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authz/authz';
import { invalidFieldCode, invalidFields, sortieSchema } from '@/lib/schemas/salarie';
import { lifecycleErrorResponse } from '@/lib/salarie/lifecycle-http';
import { recordSortie } from '@/lib/salarie/lifecycle-write';
import { findSalarieInScope } from '@/lib/salarie/salarie-data';

// Enregistrement, correction ou effacement de la date de sortie d'un salarié (roles/03 § 4.2).
// Le périmètre vient de la session ; l'identifiant de l'URL est revérifié contre lui.
//
// G2 : cette action déclenchera la DIMONA OUT et la dernière fiche (D40).

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Context) {
  const authz = await authorize(request, 'salarie.gerer');
  if (authz.response) return authz.response;
  const { session, scope } = authz;
  const { id } = await params;

  // Périmètre avant validation : un dossier hors périmètre répond 404 quel que soit le corps.
  if (!(await findSalarieInScope(scope, id))) {
    return NextResponse.json({ error: 'SALARIE_NOT_FOUND' }, { status: 404 });
  }

  const parsed = sortieSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: invalidFieldCode(parsed.error), fields: invalidFields(parsed.error) },
      { status: 400 },
    );
  }

  const result = await recordSortie(scope, session.user.id, id, parsed.data.dateSortie);
  if (!result.ok) return lifecycleErrorResponse(result);

  return NextResponse.json({ success: true, changed: result.changed });
}
