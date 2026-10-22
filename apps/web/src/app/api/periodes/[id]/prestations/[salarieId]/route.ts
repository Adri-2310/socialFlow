import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authz/authz';
import {
  findPeriodeAccessible,
  findSalarieDeLaPeriode,
  isPrestationScope,
} from '@/lib/periode/prestation-data';
import { prestationErrorResponse } from '@/lib/periode/prestation-http';
import { clearPrestation, savePrestation } from '@/lib/periode/prestation-write';
import { prestationSchema } from '@/lib/schemas/prestation';
import { invalidFieldCode, invalidFields } from '@/lib/schemas/salarie';

// D92 : encodage (PUT) et effacement (DELETE) des prestations d'un salarié pour une période.
// Le gestionnaire encode tant que la période est ouverte, l'entreprise jusqu'à la date limite
// (D91). Le périmètre vient de la session ; les identifiants de l'URL sont revérifiés contre lui.

type Context = { params: Promise<{ id: string; salarieId: string }> };

// La période puis le salarié, dans le périmètre : sinon 404, quel que soit le corps.
async function cible(
  scope: Parameters<typeof findPeriodeAccessible>[0],
  id: string,
  salarieId: string,
) {
  const periode = await findPeriodeAccessible(scope, id);
  if (!periode) {
    return { response: NextResponse.json({ error: 'PERIODE_NOT_FOUND' }, { status: 404 }) };
  }
  if (
    !isPrestationScope(scope) ||
    !(await findSalarieDeLaPeriode(scope, periode.entrepriseId, salarieId))
  ) {
    return { response: NextResponse.json({ error: 'SALARIE_NOT_FOUND' }, { status: 404 }) };
  }
  return { periode };
}

export async function PUT(request: Request, { params }: Context) {
  const authz = await authorize(request, 'prestation.encoder');
  if (authz.response) return authz.response;
  const { session, scope } = authz;
  const { id, salarieId } = await params;

  const found = await cible(scope, id, salarieId);
  if (found.response) return found.response;

  const parsed = prestationSchema(found.periode.annee, found.periode.mois).safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: invalidFieldCode(parsed.error), fields: invalidFields(parsed.error) },
      { status: 400 },
    );
  }

  const result = await savePrestation(scope, session.user.id, id, salarieId, parsed.data);
  if (!result.ok) return prestationErrorResponse(result);

  return NextResponse.json({ success: true, changed: result.changed });
}

export async function DELETE(request: Request, { params }: Context) {
  const authz = await authorize(request, 'prestation.encoder');
  if (authz.response) return authz.response;
  const { session, scope } = authz;
  const { id, salarieId } = await params;

  const found = await cible(scope, id, salarieId);
  if (found.response) return found.response;

  const result = await clearPrestation(scope, session.user.id, id, salarieId);
  if (!result.ok) return prestationErrorResponse(result);

  return NextResponse.json({ success: true, changed: result.changed });
}
