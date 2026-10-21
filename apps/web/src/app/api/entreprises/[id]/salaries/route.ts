import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authz/authz';
import { fieldCode, invalidFieldCode, invalidFields, salarieSchema } from '@/lib/schemas/salarie';
import { findEntrepriseInScope } from '@/lib/salarie/salarie-data';
import { createSalarie } from '@/lib/salarie/salarie-write';

// Création d'un dossier salarié par le gestionnaire assigné (D6, roles/03 § 4.1).
// Le périmètre vient de la session ; l'identifiant de l'URL est revérifié contre lui.

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const authz = await authorize(request, 'salarie.gerer');
  if (authz.response) return authz.response;
  const { session, scope } = authz;
  const { id } = await params;

  // Périmètre avant validation : une entreprise hors périmètre répond 404 quel que soit
  // le corps envoyé (CONVENTIONS § 3).
  if (!(await findEntrepriseInScope(scope, id))) {
    return NextResponse.json({ error: 'ENTREPRISE_NOT_FOUND' }, { status: 404 });
  }

  const parsed = salarieSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: invalidFieldCode(parsed.error), fields: invalidFields(parsed.error) },
      { status: 400 },
    );
  }
  // La date de sortie déclenche la DIMONA OUT (D40) : elle se saisit à la sortie, pas à la création.
  if (parsed.data.dateSortie) {
    const error = fieldCode('dateSortie');
    return NextResponse.json({ error, fields: { dateSortie: error } }, { status: 400 });
  }

  const result = await createSalarie(scope, session.user.id, id, parsed.data);
  if (!result.ok) {
    if (result.error === 'NISS_ALREADY_USED') {
      return NextResponse.json(
        { error: result.error, fields: { niss: result.error } },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ success: true, id: result.id }, { status: 201 });
}
