import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hashInvitationToken } from '@/lib/invitations';
import { isReadOnlyBillingStatus } from '@/lib/billing';

// Acceptation d'une invitation (C4, C6) : cree le compte avec le role et le
// cabinet imposes par l'invitation, sans passer par l'auto-inscription. Plus de
// cabinet « fantome » a creer puis supprimer (le hook d'inscription n'est pas
// execute), et l'application de l'invitation est atomique.
//
// Deux entrees :
//  - acceptInvitationWithPassword : la personne choisit un mot de passe ;
//  - acceptInvitationWithOAuth : la personne s'est connectee avec Google ou
//    Microsoft, dont l'email verifie doit etre celui de l'invitation.

export type AcceptError =
  | 'INVALID_REQUEST'
  | 'INVALID_TOKEN'
  | 'CABINET_READ_ONLY'
  | 'EMAIL_ALREADY_USED'
  | 'EMAIL_MISMATCH'
  | 'ACCOUNT_NOT_ELIGIBLE'
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
  EMAIL_MISMATCH: 403,
  ACCOUNT_NOT_ELIGIBLE: 409,
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
      cabinet: { select: { name: true, billingStatus: true, deletedAt: true } },
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
    if (!entreprise || entreprise.deletedAt || entreprise.adminUserId) {
      return { ok: false, error: 'INVALID_TOKEN' };
    }
  }
  // D29 : un cabinet en lecture seule ne peut pas accueillir de nouveau compte.
  if (isReadOnlyBillingStatus(invitation.cabinet.billingStatus)) {
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
  // D5 : seulement si l'entreprise n'a pas deja un administrateur (course avec
  // une autre acceptation).
  if (invitation.entrepriseId) {
    const { count } = await tx.entreprise.updateMany({
      where: { id: invitation.entrepriseId, adminUserId: null, deletedAt: null },
      data: { adminUserId: userId },
    });
    if (count === 0) throw new EntrepriseAdminTaken();
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
  | { ok: true; userId: string; email: string; cabinetName: string }
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

  return { ok: true, userId: created.id, email: invitation.email, cabinetName: invitation.cabinetName };
}

// Acceptation par un compte cree via Google ou Microsoft (C4). `user` est celui
// de la session. Garde-fous : l'email verifie du fournisseur doit etre celui de
// l'invitation, et le compte doit etre tout neuf (aucun cabinet, role par
// defaut) : un compte deja rattache ne peut pas etre detourne vers un autre
// cabinet (D7).
export async function acceptInvitationWithOAuth(input: {
  token: string;
  user: { id: string; email: string; emailVerified: boolean; cabinetId: string | null; role: string | null };
}): Promise<AcceptResult> {
  if (!input.token) return { ok: false, error: 'INVALID_REQUEST' };

  const loaded = await loadAcceptableInvitation(input.token);
  if (!loaded.ok) return loaded;
  const { invitation } = loaded;
  const { user } = input;

  if (!user.emailVerified || user.email.toLowerCase() !== invitation.email) {
    return { ok: false, error: 'EMAIL_MISMATCH' };
  }
  if (user.cabinetId || (user.role && user.role !== 'CABINET_RH')) {
    return { ok: false, error: 'ACCOUNT_NOT_ELIGIBLE' };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Relu dans la transaction : le compte n'a pas ete rattache entre-temps.
      const fresh = await tx.user.findUnique({ where: { id: user.id }, select: { cabinetId: true } });
      if (!fresh || fresh.cabinetId) throw new InvitationConsumed();
      await applyInvitation(tx, invitation, user.id);
    });
  } catch (error) {
    const mapped = mapRaceError(error);
    if (mapped) return { ok: false, error: mapped };
    throw error;
  }

  return { ok: true, userId: user.id, email: invitation.email, cabinetName: invitation.cabinetName };
}
