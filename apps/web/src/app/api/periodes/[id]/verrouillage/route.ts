import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authz/authz';
import { findPeriodeInScope } from '@/lib/periode/periode-data';
import { periodeErrorResponse } from '@/lib/periode/periode-http';
import { lockPeriode, unlockPeriode } from '@/lib/periode/periode-write';

// D90 : verrouillage (PUT) et déverrouillage (DELETE) des prestations d'une période. Le
// périmètre vient de la session ; l'identifiant de l'URL est revérifié contre lui.
//
// G2 : le déverrouillage sera refusé quand une fiche utilise la période.

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Context) {
  const authz = await authorize(request, 'prestation.verrouiller');
  if (authz.response) return authz.response;
  const { session, scope } = authz;
  const { id } = await params;

  if (!(await findPeriodeInScope(scope, id))) {
    return NextResponse.json({ error: 'PERIODE_NOT_FOUND' }, { status: 404 });
  }

  const result = await lockPeriode(scope, session.user.id, id);
  if (!result.ok) return periodeErrorResponse(result);

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: Context) {
  const authz = await authorize(request, 'prestation.verrouiller');
  if (authz.response) return authz.response;
  const { session, scope } = authz;
  const { id } = await params;

  if (!(await findPeriodeInScope(scope, id))) {
    return NextResponse.json({ error: 'PERIODE_NOT_FOUND' }, { status: 404 });
  }

  const result = await unlockPeriode(scope, session.user.id, id);
  if (!result.ok) return periodeErrorResponse(result);

  return NextResponse.json({ success: true });
}
