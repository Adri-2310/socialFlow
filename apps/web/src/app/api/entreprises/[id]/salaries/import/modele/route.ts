import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authz/authz';
import { modeleCsv } from '@/lib/salarie/import-columns';
import { findEntrepriseInScope } from '@/lib/salarie/salarie-data';

// Modèle téléchargeable de l'import CSV (roles/03 § 4.1). C'est une lecture : elle reste
// possible quand le cabinet est en lecture seule (D29), et elle ne contient aucune donnée réelle.

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const authz = await authorize(request, 'salarie.gerer', { write: false });
  if (authz.response) return authz.response;
  const { scope } = authz;
  const { id } = await params;

  if (!(await findEntrepriseInScope(scope, id))) {
    return NextResponse.json({ error: 'ENTREPRISE_NOT_FOUND' }, { status: 404 });
  }

  return new NextResponse(modeleCsv(), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="modele-import-salaries.csv"',
      'cache-control': 'no-store',
    },
  });
}
