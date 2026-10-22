import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize } from '@/lib/authz/authz';
import { findEntrepriseInScope } from '@/lib/salarie/salarie-data';
import { lancerImport, verifierImport, type ImportFailure } from '@/lib/salarie/salarie-import';

// Import CSV des dossiers salariés d'une entreprise (roles/03 § 4.1), en deux temps :
// `confirmer: false` vérifie sans rien écrire, `confirmer: true` crée les lignes valides. Le
// fichier n'est jamais conservé. Le périmètre vient de la session ; l'identifiant de l'URL est
// revérifié contre lui.

type Context = { params: Promise<{ id: string }> };

const bodySchema = z.object({ csv: z.string(), confirmer: z.boolean().default(false) });

// Le rapport peut contenir des numéros de ligne propres à un dossier : pas de mise en cache.
const NO_STORE = { 'cache-control': 'no-store' };

function echec(result: ImportFailure) {
  switch (result.error) {
    case 'ENTREPRISE_NOT_FOUND':
      return NextResponse.json({ error: result.error }, { status: 404, headers: NO_STORE });
    case 'IMPORT_TOO_LARGE':
      return NextResponse.json({ error: result.error }, { status: 413, headers: NO_STORE });
    case 'MISSING_COLUMNS':
    case 'UNKNOWN_COLUMNS':
    case 'DUPLICATE_COLUMNS':
      return NextResponse.json(
        { error: result.error, colonnes: result.colonnes },
        { status: 400, headers: NO_STORE },
      );
    default:
      return NextResponse.json({ error: result.error }, { status: 400, headers: NO_STORE });
  }
}

export async function POST(request: Request, { params }: Context) {
  const authz = await authorize(request, 'salarie.gerer');
  if (authz.response) return authz.response;
  const { session, scope } = authz;
  const { id } = await params;

  // Périmètre avant validation : une entreprise hors périmètre répond 404 quel que soit le corps.
  if (!(await findEntrepriseInScope(scope, id))) {
    return NextResponse.json({ error: 'ENTREPRISE_NOT_FOUND' }, { status: 404, headers: NO_STORE });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400, headers: NO_STORE });
  }

  const { csv, confirmer } = parsed.data;
  const result = confirmer
    ? await lancerImport(scope, session.user.id, id, csv)
    : await verifierImport(scope, id, csv);
  if (!result.ok) return echec(result);

  return NextResponse.json(
    { mode: confirmer ? 'import' : 'verification', rapport: result.rapport },
    { headers: NO_STORE },
  );
}
