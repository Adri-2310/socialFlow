import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authz/authz';
import { findSalarieInScope } from '@/lib/salarie/salarie-data';
import {
  inviteSalarie,
  revokeSalarieInvitation,
  sendSalarieInvitation,
  type InvitationSalarieError,
} from '@/lib/salarie/salarie-invitation';

// Invitation d'un salarié à son espace (roles/03 § 4.3, D6). Le périmètre vient de la session ;
// l'identifiant de l'URL est revérifié contre lui. POST invite ou renvoie (le lien précédent
// meurt), DELETE révoque l'invitation en attente.
//
// Ces invitations n'ont pas leurs routes dans api/invitations : celles-ci sont réservées au
// Cabinet RH, qui ne voit jamais un dossier (D26).

type Context = { params: Promise<{ id: string }> };

function echec(error: InvitationSalarieError['error']) {
  const status = error === 'SALARIE_NOT_FOUND' || error === 'INVITATION_NOT_FOUND' ? 404 : 409;
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request, { params }: Context) {
  const authz = await authorize(request, 'salarie.inviter-portail');
  if (authz.response) return authz.response;
  const { session, scope } = authz;
  const { id } = await params;

  if (!(await findSalarieInScope(scope, id))) {
    return NextResponse.json({ error: 'SALARIE_NOT_FOUND' }, { status: 404 });
  }

  const result = await inviteSalarie(scope, session.user.id, id);
  if (!result.ok) return echec(result.error);

  // L'invitation existe déjà (lien valable 7 jours) : un échec d'envoi ne la fait pas échouer,
  // le gestionnaire peut la renvoyer. On ne journalise ni l'adresse ni le détail de l'erreur
  // (l'adresse d'un salarié ne doit apparaître dans aucun log).
  let emailSent = true;
  try {
    await sendSalarieInvitation({
      cabinetId: result.cabinetId,
      email: result.email,
      prenom: result.prenom,
      entrepriseName: result.entrepriseName,
      token: result.token,
    });
  } catch (error) {
    emailSent = false;
    console.error(
      "Echec de l'envoi de l'invitation d'un salarie",
      error instanceof Error ? error.name : 'erreur inconnue',
    );
  }

  return NextResponse.json(
    { success: true, invitationId: result.invitationId, resent: result.resent, emailSent },
    { status: 201 },
  );
}

export async function DELETE(request: Request, { params }: Context) {
  const authz = await authorize(request, 'salarie.inviter-portail');
  if (authz.response) return authz.response;
  const { session, scope } = authz;
  const { id } = await params;

  if (!(await findSalarieInScope(scope, id))) {
    return NextResponse.json({ error: 'SALARIE_NOT_FOUND' }, { status: 404 });
  }

  const result = await revokeSalarieInvitation(scope, session.user.id, id);
  if (!result.ok) return echec(result.error);

  return NextResponse.json({ success: true });
}
