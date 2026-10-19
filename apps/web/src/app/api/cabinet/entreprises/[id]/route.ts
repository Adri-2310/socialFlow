import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import {
  archiveEntreprise,
  entrepriseSchema,
  restoreEntreprise,
  updateEntreprise,
} from '@/lib/cabinet-entreprises';
import { entrepriseErrorResponse, invalidRequestResponse } from '@/lib/entreprise-http';

// Gestion d'une entreprise cliente par le Cabinet RH (D4, § 4.3). Le perimetre
// est pose dans la requete elle-meme (id + cabinetId de la session) : une
// entreprise d'un autre cabinet est "introuvable" (404). Memes conventions que
// api/gestionnaires/[id] : PATCH = modifier, DELETE = archiver, PUT = restaurer.

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const authz = await authorize(request, 'entreprise.gerer');
  if (authz.response) return authz.response;
  const { cabinetId, id: actorId } = authz.session.user as { cabinetId: string; id: string };
  const { id } = await params;

  const parsed = entrepriseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidRequestResponse(parsed.error);

  const result = await updateEntreprise(cabinetId, actorId, id, parsed.data);
  if (!result.ok) return entrepriseErrorResponse(result);

  return NextResponse.json({ success: true, changed: result.changed });
}

export async function DELETE(request: Request, { params }: Context) {
  const authz = await authorize(request, 'entreprise.gerer');
  if (authz.response) return authz.response;
  const { cabinetId, id: actorId } = authz.session.user as { cabinetId: string; id: string };
  const { id } = await params;

  const result = await archiveEntreprise(cabinetId, actorId, id);
  if (!result.ok) return entrepriseErrorResponse(result);

  return NextResponse.json({ success: true });
}

export async function PUT(request: Request, { params }: Context) {
  const authz = await authorize(request, 'entreprise.gerer');
  if (authz.response) return authz.response;
  const { cabinetId, id: actorId } = authz.session.user as { cabinetId: string; id: string };
  const { id } = await params;

  const result = await restoreEntreprise(cabinetId, actorId, id);
  if (!result.ok) return entrepriseErrorResponse(result);

  return NextResponse.json({ success: true });
}
