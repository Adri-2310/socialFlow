import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hashInvitationToken } from '@/lib/invitations';
import { isCabinetReadOnly } from '@/lib/cabinet-suspension';

// Acceptation d'une invitation (C4, C6) : cree le compte avec le role et le
// cabinet imposes par l'invitation, sans passer par l'auto-inscription. Plus de
// cabinet « fantome » a creer puis supprimer (le hook d'inscription n'est pas
// execute), et l'application de l'invitation est atomique.
//
// Deux entrees :
// Une seule voie (D76) : acceptInvitationWithPassword, la personne choisit un mot
// de passe. Google et Microsoft ne servent jamais a creer un compte invite : ils
// ne s'utilisent qu'apres liaison du compte, sur le portail du cabinet.

export type AcceptError =
  | 'INVALID_REQUEST'
  | 'INVALID_TOKEN'
  | 'CABINET_READ_ONLY'
  | 'EMAIL_ALREADY_USED'
  | 'PASSWORD_TOO_SHORT'
  | 'PASSWORD_TOO_LONG';

// Statut HTTP par code d'erreur (CONVENTIONS.md § 3). Un lien inconnu, expire,
// deja utilise ou dont l'entreprise a change d'etat est toujours « invalide »
// (404), sans rien reveler de plus.
export const ACCEPT_ERROR_STATUS: Record<AcceptError, number> = {
  INVALID_REQUEST: 400,
  PASSWORD_TOO_SHORT: 400,
  PASSWORD_TOO_LONG: 400,
  INVALID_TOKEN: 404,
  EMAIL_ALREADY_USED: 409,
  CABINET_READ_ONLY: 423,
};

type LoadedInvitation = {
  id: string;
  email: string;
  role: string;
  cabinetId: string;
  cabinetName: string;
  entrepriseId: string | null;
  entrepriseName: string | null;
  // D78 : administrateur que cette invitation remplace (archive a l'acceptation).
  replacesAdminId: string | null;
};

// Format de l'identifiant de fournisseur d'un compte « mot de passe » dans
// better-auth 1.7 (voir le commentaire de Account.issuer dans le schema). Un test
// verifie qu'on peut ensuite se connecter avec ce compte.
const CREDENTIAL_ISSUER = 'local:credential';

const NAME_MAX = 200;

// Leve dans la transaction quand l'entreprise a trouve son administrateur entre
// la verification et l'ecriture (D5).
class EntrepriseAdminTaken extends Error {}
// Leve quand l'invitation a ete consommee ou revoquee entre-temps.
class InvitationConsumed extends Error {}

// Invitation utilisable : en attente, non expiree, cabinet existant et non en
// lecture seule (D29), et - pour un administrateur - entreprise non archivee et
// sans administrateur (D5). Sinon le lien est « invalide », sans rien reveler.
export async function loadAcceptableInvitation(
  token: string,
): Promise<{ ok: true; invitation: LoadedInvitation } | { ok: false; error: AcceptError }> {
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      cabinetId: true,
      entrepriseId: true,
      replacesAdminId: true,
      cabinet: {
        select: { name: true, billingStatus: true, status: true, suspensionType: true, deletedAt: true },
      },
      entreprise: { select: { name: true, deletedAt: true, adminUserId: true } },
    },
  });
  if (
    !invitation ||
    invitation.status !== 'pending' ||
    invitation.expiresAt < new Date() ||
    invitation.cabinet.deletedAt
  ) {
    return { ok: false, error: 'INVALID_TOKEN' };
  }
  if (invitation.entrepriseId) {
    const entreprise = invitation.entreprise;
    // D5 : la place doit etre libre - ou tenue par l'administrateur que cette invitation
    // remplace (D78). Un autre administrateur arrive entre-temps rend le lien invalide.
    const placeFree =
      !entreprise?.adminUserId || entreprise.adminUserId === invitation.replacesAdminId;
    if (!entreprise || entreprise.deletedAt || !placeFree) {
      return { ok: false, error: 'INVALID_TOKEN' };
    }
  }
  // D29, D71 : un cabinet en lecture seule ne peut pas accueillir de nouveau compte.
  if (isCabinetReadOnly(invitation.cabinet)) {
    return { ok: false, error: 'CABINET_READ_ONLY' };
  }

  return {
    ok: true,
    invitation: {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      cabinetId: invitation.cabinetId,
      cabinetName: invitation.cabinet.name,
      entrepriseId: invitation.entrepriseId,
      entrepriseName: invitation.entreprise?.name ?? null,
      replacesAdminId: invitation.replacesAdminId,
    },
  };
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Rattache le compte a l'invitation : role, cabinet, adresse verifiee (prouvee
// par le lien), administrateur de l'entreprise (D5), invitation consommee et
// audit. Dans la transaction de l'appelant.
async function applyInvitation(tx: Tx, invitation: LoadedInvitation, userId: string) {
  await tx.user.update({
    where: { id: userId },
    data: { role: invitation.role, cabinetId: invitation.cabinetId, emailVerified: true },
  });
  // D5 : seulement si la place est libre, ou tenue par l'administrateur remplace (D78) :
  // la condition est dans l'ecriture, donc une course avec une autre acceptation ou un
  // retrait echoue proprement.
  let replacedAdminId: string | null = null;
  if (invitation.entrepriseId) {
    const current = await tx.entreprise.findUnique({
      where: { id: invitation.entrepriseId },
      select: { adminUserId: true },
    });
    const holder = current?.adminUserId ?? null;
    if (holder && holder !== invitation.replacesAdminId) throw new EntrepriseAdminTaken();
    const { count } = await tx.entreprise.updateMany({
      where: { id: invitation.entrepriseId, adminUserId: holder, deletedAt: null },
      data: { adminUserId: userId },
    });
    if (count === 0) throw new EntrepriseAdminTaken();
    replacedAdminId = holder;
  }
  // D78 : l'ancien administrateur est archive avec ses sessions coupees, dans la meme
  // transaction (meme traitement que son retrait, lib/entreprise-admin.ts).
  if (replacedAdminId) {
    await tx.session.deleteMany({ where: { userId: replacedAdminId } });
    await tx.user.update({
      where: { id: replacedAdminId },
      data: { deletedAt: new Date(), deletedBy: 'CABINET_RH' },
    });
    await tx.auditLog.create({
      data: {
        action: 'USER_ARCHIVED',
        actorId: userId,
        cabinetId: invitation.cabinetId,
        targetUserId: replacedAdminId,
        metadata: {
          role: 'ENTREPRISE_CLIENTE',
          entrepriseId: invitation.entrepriseId,
          entreprise: invitation.entrepriseName,
          replacedBy: userId,
        },
      },
    });
  }
  // Filtre sur le statut dans l'ecriture : couvre une double acceptation ou une
  // revocation simultanee.
  const { count } = await tx.invitation.updateMany({
    where: { id: invitation.id, status: 'pending' },
    data: { status: 'accepted', acceptedAt: new Date() },
  });
  if (count === 0) throw new InvitationConsumed();
  await tx.auditLog.create({
    data: {
      action: 'INVITATION_ACCEPTED',
      actorId: userId,
      cabinetId: invitation.cabinetId,
      metadata: {
        invitationId: invitation.id,
        email: invitation.email,
        ...(invitation.entrepriseId
          ? { entrepriseId: invitation.entrepriseId, entreprise: invitation.entrepriseName }
          : {}),
      },
    },
  });
}

function mapRaceError(error: unknown): AcceptError | null {
  if (error instanceof EntrepriseAdminTaken || error instanceof InvitationConsumed) {
    return 'INVALID_TOKEN';
  }
  return null;
}

export type AcceptResult =
  | {
      ok: true;
      userId: string;
      name: string;
      email: string;
      cabinetId: string;
      cabinetName: string;
      entrepriseName: string | null;
    }
  | { ok: false; error: AcceptError };

export async function acceptInvitationWithPassword(input: {
  token: string;
  name: string;
  password: string;
}): Promise<AcceptResult> {
  const name = input.name.trim();
  if (!input.token || !name || name.length > NAME_MAX || !input.password) {
    return { ok: false, error: 'INVALID_REQUEST' };
  }

  const authContext = await auth.$context;
  const { minPasswordLength, maxPasswordLength } = authContext.password.config;
  if (input.password.length < minPasswordLength) return { ok: false, error: 'PASSWORD_TOO_SHORT' };
  if (input.password.length > maxPasswordLength) return { ok: false, error: 'PASSWORD_TOO_LONG' };

  const loaded = await loadAcceptableInvitation(input.token);
  if (!loaded.ok) return loaded;
  const { invitation } = loaded;

  // D7 : un email = un seul rattachement.
  if (await prisma.user.findUnique({ where: { email: invitation.email }, select: { id: true } })) {
    return { ok: false, error: 'EMAIL_ALREADY_USED' };
  }

  // Compte cree par better-auth (schema, hachage et identifiant du compte
  // « mot de passe » ne sont pas dupliques ici), puis rattache a l'invitation en
  // une transaction. Si celle-ci echoue, le compte est supprime : aucune
  // personne sans rattachement ne subsiste.
  const hash = await authContext.password.hash(input.password);
  const created = await authContext.internalAdapter.createUser(
    {
      name,
      email: invitation.email,
      emailVerified: true,
      role: invitation.role,
      cabinetId: invitation.cabinetId,
    },
    { method: 'email-password' },
  );
  try {
    await authContext.internalAdapter.linkAccount({
      userId: created.id,
      providerId: 'credential',
      issuer: CREDENTIAL_ISSUER,
      accountId: created.id,
      password: hash,
    });
    await prisma.$transaction((tx) => applyInvitation(tx, invitation, created.id));
  } catch (error) {
    await prisma.user.delete({ where: { id: created.id } }).catch(() => undefined);
    const mapped = mapRaceError(error);
    if (mapped) return { ok: false, error: mapped };
    throw error;
  }

  return {
    ok: true,
    userId: created.id,
    name,
    email: invitation.email,
    cabinetId: invitation.cabinetId,
    cabinetName: invitation.cabinetName,
    entrepriseName: invitation.entrepriseName,
  };
}
