import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { removeEntrepriseAdmin } from '@/lib/entreprise-admin';

// Retrait du compte administrateur d'une entreprise (D5, roles/04 § 2) : etape
// du remplacement, avant d'inviter le nouveau. Reserve au Cabinet RH ; une
// entreprise d'un autre cabinet ou archivee est "introuvable" (404).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authz = await authorize(request, 'entreprise.retirer-admin');
  if (authz.response) return authz.response;
  const { cabinetId, id: actorId } = authz.session.user as { cabinetId: string; id: string };
  const { id } = await params;

  const result = await removeEntrepriseAdmin(cabinetId, actorId, id);
  if (!result.ok) {
    const status = result.error === 'ENTREPRISE_NOT_FOUND' ? 404 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ success: true });
}
