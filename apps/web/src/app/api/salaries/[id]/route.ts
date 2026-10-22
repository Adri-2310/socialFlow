import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authz/authz';
import {
  fieldCode,
  invalidFieldCode,
  invalidFields,
  salarieModificationSchema,
} from '@/lib/schemas/salarie';
import { lifecycleErrorResponse } from '@/lib/salarie/lifecycle-http';
import { archiveSalarie, restoreSalarie } from '@/lib/salarie/lifecycle-write';
import { findSalarieInScope } from '@/lib/salarie/salarie-data';
import { updateSalarie } from '@/lib/salarie/salarie-write';

// Modification d'un dossier salarié par le gestionnaire assigné (roles/03 § 4.2). Le
// périmètre vient de la session ; l'identifiant de l'URL est revérifié contre lui.

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const authz = await authorize(request, 'salarie.gerer');
  if (authz.response) return authz.response;
  const { session, scope } = authz;
  const { id } = await params;

  // Périmètre avant validation : un dossier hors périmètre répond 404 quel que soit le
  // corps envoyé (CONVENTIONS § 3).
  if (!(await findSalarieInScope(scope, id))) {
    return NextResponse.json({ error: 'SALARIE_NOT_FOUND' }, { status: 404 });
  }

  const parsed = salarieModificationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: invalidFieldCode(parsed.error), fields: invalidFields(parsed.error) },
      { status: 400 },
    );
  }
  // La sortie déclenche la DIMONA OUT (D40) : elle a sa propre action, pas ce formulaire.
  if (parsed.data.dateSortie) {
    const error = fieldCode('dateSortie');
    return NextResponse.json({ error, fields: { dateSortie: error } }, { status: 400 });
  }

  const result = await updateSalarie(scope, session.user.id, id, parsed.data);
  if (!result.ok) {
    switch (result.error) {
      case 'NISS_ALREADY_USED':
        return NextResponse.json(
          { error: result.error, fields: { niss: result.error } },
          { status: 409 },
        );
      case 'DATE_ENTREE_CONFLICT':
        return NextResponse.json(
          { error: result.error, fields: { dateEntree: result.error } },
          { status: 409 },
        );
      case 'SALARIE_NOT_FOUND':
        return NextResponse.json({ error: result.error }, { status: 404 });
    }
  }

  return NextResponse.json({ success: true, changed: result.changed });
}

// Archive le dossier (soft-delete, roles/03 § 4.2) : il disparaît des listes mais n'est jamais
// supprimé, et son NISS reste réservé. DELETE = archiver, PUT = restaurer, comme pour les
// entreprises du cabinet.
export async function DELETE(request: Request, { params }: Context) {
  const authz = await authorize(request, 'salarie.gerer');
  if (authz.response) return authz.response;
  const { session, scope } = authz;
  const { id } = await params;

  if (!(await findSalarieInScope(scope, id, { includeArchived: true }))) {
    return NextResponse.json({ error: 'SALARIE_NOT_FOUND' }, { status: 404 });
  }

  const result = await archiveSalarie(scope, session.user.id, id);
  if (!result.ok) return lifecycleErrorResponse(result);

  return NextResponse.json({ success: true });
}

export async function PUT(request: Request, { params }: Context) {
  const authz = await authorize(request, 'salarie.gerer');
  if (authz.response) return authz.response;
  const { session, scope } = authz;
  const { id } = await params;

  if (!(await findSalarieInScope(scope, id, { includeArchived: true }))) {
    return NextResponse.json({ error: 'SALARIE_NOT_FOUND' }, { status: 404 });
  }

  const result = await restoreSalarie(scope, session.user.id, id);
  if (!result.ok) return lifecycleErrorResponse(result);

  return NextResponse.json({ success: true });
}
