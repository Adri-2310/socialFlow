import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authz/authz';
import { getPrestationsPeriode } from '@/lib/periode/prestation-data';

// D92 : les salariés actifs pendant le mois d'une période, avec leurs prestations. Le périmètre
// vient de la session ; l'identifiant de l'URL est revérifié contre lui.

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const authz = await authorize(request, 'periode.voir');
  if (authz.response) return authz.response;
  const { id } = await params;

  const result = await getPrestationsPeriode(authz.scope, id);
  if (!result) return NextResponse.json({ error: 'PERIODE_NOT_FOUND' }, { status: 404 });

  return NextResponse.json(result);
}
