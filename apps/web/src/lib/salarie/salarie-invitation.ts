import { entrepriseWhere, type Scope } from '@/lib/authz/authz';
import { getCabinetEmailBrand } from '@/lib/email/cabinet-email-brand';
import { getCustomTemplate } from '@/lib/email/cabinet-email-templates';
import { sendCollaborateurInvitationEmail } from '@/lib/email/email';
import {
  createInvitationToken,
  invitationExpiry,
  invitationUrl,
} from '@/lib/invitations/invitations';
import { ensureCabinetSlug, portalUrl } from '@/lib/portal/cabinet-portal';
import { prisma } from '@/lib/prisma';

// Invitation d'un salarié à son espace (portail Collaborateur, roles/03 § 4.3, D6) : facultative,
// faite par le gestionnaire assigné, à l'email du dossier ; l'acceptation lie le compte au dossier
// (lib/invitations/invitation-accept.ts). Un salarié sans compte reçoit tout de même ses fiches
// par lien sécurisé (D12) : l'invitation n'est jamais nécessaire.
//
// D26 : le Cabinet RH ne voit jamais un dossier, donc jamais l'email d'un salarié. L'audit de ces
// invitations a ses propres actions (SALARIE_PORTAL_*, absentes du journal du cabinet) et ne
// contient que des identifiants ; l'export du cabinet les exclut.

export const COLLABORATEUR_ROLE = 'COLLABORATEUR';

export type InvitationSalarieError =
  | { error: 'SALARIE_NOT_FOUND' }
  | { error: 'SALARIE_HAS_NO_EMAIL' }
  | { error: 'SALARIE_ALREADY_HAS_ACCOUNT' }
  // D7 : un email = un seul rattachement.
  | { error: 'EMAIL_ALREADY_USED' }
  | { error: 'INVITATION_ALREADY_PENDING' }
  | { error: 'INVITATION_NOT_FOUND' };

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Verrouille la ligne du dossier le temps de la transaction : deux invitations simultanées pour
// le même salarié ne peuvent pas coexister.
async function lockSalarie(tx: Tx, salarieId: string) {
  await tx.$queryRaw`SELECT id FROM salarie WHERE id = ${salarieId} FOR UPDATE`;
}

// Le dossier actif d'une entreprise du périmètre, relu dans la transaction : une assignation
// retirée entre-temps coupe aussi l'écriture.
function findSalarie(tx: Tx, scope: Extract<Scope, { kind: 'entreprises' }>, salarieId: string) {
  return tx.salarie.findFirst({
    where: {
      id: salarieId,
      cabinetId: scope.cabinetId,
      deletedAt: null,
      entreprise: { AND: [entrepriseWhere(scope), { deletedAt: null }] },
    },
    select: {
      id: true,
      entrepriseId: true,
      prenom: true,
      email: true,
      userId: true,
      entreprise: { select: { name: true } },
    },
  });
}

// Invite le salarié, ou renvoie l'invitation : une invitation en attente pour ce dossier est
// remplacée par une nouvelle (nouveau lien, l'ancien meurt), à l'adresse ACTUELLE du dossier. Si
// l'email du dossier a changé depuis le premier envoi, c'est la nouvelle adresse qui compte.
export async function inviteSalarie(
  scope: Scope,
  actorId: string,
  salarieId: string,
): Promise<
  | {
      ok: true;
      invitationId: string;
      cabinetId: string;
      token: string;
      resent: boolean;
      email: string;
      prenom: string;
      entrepriseName: string;
    }
  | ({ ok: false } & InvitationSalarieError)
> {
  if (scope.kind !== 'entreprises') return { ok: false, error: 'SALARIE_NOT_FOUND' };

  const { token, tokenHash } = createInvitationToken();

  const result = await prisma.$transaction(async (tx) => {
    const trouve = await findSalarie(tx, scope, salarieId);
    if (!trouve) return { ok: false as const, error: 'SALARIE_NOT_FOUND' as const };
    await lockSalarie(tx, trouve.id);

    // Relu après le verrou : une acceptation simultanée a pu lier un compte.
    const salarie = await findSalarie(tx, scope, salarieId);
    if (!salarie) return { ok: false as const, error: 'SALARIE_NOT_FOUND' as const };
    if (salarie.userId)
      return { ok: false as const, error: 'SALARIE_ALREADY_HAS_ACCOUNT' as const };

    const email = salarie.email?.trim().toLowerCase();
    if (!email) return { ok: false as const, error: 'SALARIE_HAS_NO_EMAIL' as const };
    if (await tx.user.findUnique({ where: { email }, select: { id: true } })) {
      return { ok: false as const, error: 'EMAIL_ALREADY_USED' as const };
    }

    const now = new Date();
    // Une autre invitation (gestionnaire, administrateur) en attente pour cette adresse bloque.
    const autre = await tx.invitation.findFirst({
      where: {
        cabinetId: scope.cabinetId,
        email,
        status: 'pending',
        expiresAt: { gt: now },
        // Pas NOT { salarieId } : en SQL, NOT (NULL = x) n'est pas vrai, et les invitations de
        // gestionnaire ou d'administrateur ont un salarieId nul.
        OR: [{ salarieId: null }, { salarieId: { not: salarie.id } }],
      },
      select: { id: true },
    });
    if (autre) return { ok: false as const, error: 'INVITATION_ALREADY_PENDING' as const };

    // L'invitation en attente de ce dossier (expirée ou non) est remplacée.
    const { count } = await tx.invitation.updateMany({
      where: { salarieId: salarie.id, status: 'pending' },
      data: { status: 'revoked' },
    });

    const invitation = await tx.invitation.create({
      data: {
        email,
        role: COLLABORATEUR_ROLE,
        tokenHash,
        cabinetId: scope.cabinetId,
        salarieId: salarie.id,
        invitedById: actorId,
        expiresAt: invitationExpiry(),
      },
      select: { id: true },
    });
    // D8, D26 : des identifiants seulement, jamais l'adresse du salarié.
    await tx.auditLog.create({
      data: {
        action: count > 0 ? 'SALARIE_PORTAL_INVITATION_RESENT' : 'SALARIE_PORTAL_INVITED',
        cabinetId: scope.cabinetId,
        actorId,
        metadata: {
          salarieId: salarie.id,
          entrepriseId: salarie.entrepriseId,
          invitationId: invitation.id,
        },
      },
    });

    return {
      ok: true as const,
      invitationId: invitation.id,
      cabinetId: scope.cabinetId,
      resent: count > 0,
      email,
      prenom: salarie.prenom,
      entrepriseName: salarie.entreprise.name,
    };
  });

  return result.ok ? { ...result, token } : result;
}

// Révoque l'invitation en attente du dossier : son lien ne fonctionne plus.
export async function revokeSalarieInvitation(
  scope: Scope,
  actorId: string,
  salarieId: string,
): Promise<{ ok: true } | ({ ok: false } & InvitationSalarieError)> {
  if (scope.kind !== 'entreprises') return { ok: false, error: 'SALARIE_NOT_FOUND' };

  return prisma.$transaction(async (tx) => {
    const salarie = await findSalarie(tx, scope, salarieId);
    if (!salarie) return { ok: false as const, error: 'SALARIE_NOT_FOUND' as const };
    await lockSalarie(tx, salarie.id);

    const pending = await tx.invitation.findFirst({
      where: { salarieId: salarie.id, status: 'pending' },
      select: { id: true },
    });
    if (!pending) return { ok: false as const, error: 'INVITATION_NOT_FOUND' as const };

    await tx.invitation.update({ where: { id: pending.id }, data: { status: 'revoked' } });
    await tx.auditLog.create({
      data: {
        action: 'SALARIE_PORTAL_INVITATION_REVOKED',
        cabinetId: scope.cabinetId,
        actorId,
        metadata: {
          salarieId: salarie.id,
          entrepriseId: salarie.entrepriseId,
          invitationId: pending.id,
        },
      },
    });

    return { ok: true as const };
  });
}

// Envoie l'email d'invitation au nom du cabinet, avec son modèle (D68). Lève en cas d'échec :
// l'appelant décide s'il faut le signaler. L'invitation existe déjà : un échec d'envoi ne la fait
// pas échouer, le gestionnaire peut la renvoyer.
export async function sendSalarieInvitation(input: {
  cabinetId: string;
  email: string;
  prenom: string;
  entrepriseName: string;
  token: string;
}) {
  const brand = await getCabinetEmailBrand(input.cabinetId);
  const template = await getCustomTemplate(input.cabinetId, 'INVITATION_COLLABORATEUR');
  await sendCollaborateurInvitationEmail(
    input.email,
    brand,
    input.prenom,
    input.entrepriseName,
    invitationUrl(input.token),
    template,
    // D76 : le portail par lequel le salarié se reconnectera.
    { portalUrl: portalUrl(await ensureCabinetSlug(input.cabinetId)) },
  );
}
