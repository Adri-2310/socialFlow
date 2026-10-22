import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authz/authz';
import { getPeriodesEntreprise } from '@/lib/periode/periode-data';
import { periodeErrorResponse } from '@/lib/periode/periode-http';
import { openPeriode } from '@/lib/periode/periode-write';
import { ouvrirPeriodeSchema } from '@/lib/schemas/periode';
import { invalidFieldCode, invalidFields } from '@/lib/schemas/salarie';
import { findEntrepriseInScope } from '@/lib/salarie/salarie-data';

// Périodes de paie d'une entreprise (D90, roles/03 § 5). Le périmètre vient de la session ;
// l'identifiant de l'URL est revérifié contre lui.

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const authz = await authorize(request, 'periode.voir');
  if (authz.response) return authz.response;
  const { id } = await params;

  const result = await getPeriodesEntreprise(authz.scope, id);
  if (!result) return NextResponse.json({ error: 'ENTREPRISE_NOT_FOUND' }, { status: 404 });

  return NextResponse.json(result);
}

export async function POST(request: Request, { params }: Context) {
  const authz = await authorize(request, 'periode.ouvrir');
  if (authz.response) return authz.response;
  const { session, scope } = authz;
  const { id } = await params;

  // Périmètre avant validation : une entreprise hors périmètre répond 404 quel que soit le corps.
  if (!(await findEntrepriseInScope(scope, id))) {
    return NextResponse.json({ error: 'ENTREPRISE_NOT_FOUND' }, { status: 404 });
  }

  const parsed = ouvrirPeriodeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: invalidFieldCode(parsed.error), fields: invalidFields(parsed.error) },
      { status: 400 },
    );
  }

  const result = await openPeriode(scope, session.user.id, id, parsed.data.annee, parsed.data.mois);
  if (!result.ok) return periodeErrorResponse(result);

  return NextResponse.json(
    { success: true, id: result.id, dateLimite: result.dateLimite },
    { status: 201 },
  );
}
