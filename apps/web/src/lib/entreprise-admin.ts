import { prisma } from '@/lib/prisma';
import { getCabinetEmailBrand } from '@/lib/cabinet-email-brand';
import { getCustomTemplate } from '@/lib/cabinet-email-templates';
import { sendEntrepriseInvitationEmail } from '@/lib/email';
import { createInvitationToken, invitationExpiry, invitationUrl } from '@/lib/invitations';
import { ensureCabinetSlug, portalUrl } from '@/lib/cabinet-portal';

// Administrateur d'une entreprise cliente (D4, D5, roles/04-entreprise-cliente.md
// § 2) : un seul compte par entreprise, invite par le Cabinet RH uniquement. Le
// cabinet vient de la session, jamais de la requete.

export const ENTREPRISE_ADMIN_ROLE = 'ENTREPRISE_CLIENTE';

export type EntrepriseAdminError =
  | { error: 'ENTREPRISE_NOT_FOUND' }
  // D5 : l'entreprise a deja son administrateur.
  | { error: 'ENTREPRISE_ALREADY_HAS_ADMIN' }
  // D7 : un email = un seul rattachement.
  | { error: 'EMAIL_ALREADY_USED' }
  | { error: 'INVITATION_ALREADY_PENDING' };

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Verrouille la ligne de l'entreprise le temps de la transaction : deux
// invitations simultanees ne peuvent pas coexister (D5).
async function lockEntreprise(tx: Tx, entrepriseId: string) {
  await tx.$queryRaw`SELECT id FROM entreprise WHERE id = ${entrepriseId} FOR UPDATE`;
}

export async function inviteEntrepriseAdmin(
  cabinetId: string,
  actor: { id: string; name: string },
  entrepriseId: string,
  email: string,
): Promise<
  | { ok: true; invitationId: string; entrepriseName: string; token: string }
  | ({ ok: false } & EntrepriseAdminError)
> {
  const { token, tokenHash } = createInvitationToken();

  const result = await prisma.$transaction(async (tx) => {
    // Entreprise d'un autre cabinet ou archivee : introuvable.
    const entreprise = await tx.entreprise.findFirst({
      where: { id: entrepriseId, cabinetId, deletedAt: null },
      select: { id: true, name: true, adminUserId: true },
    });
    if (!entreprise) return { ok: false as const, error: 'ENTREPRISE_NOT_FOUND' as const };
    await lockEntreprise(tx, entreprise.id);

    // Relu apres le verrou : un acceptation simultanee a pu poser l'admin.
    const fresh = await tx.entreprise.findUniqueOrThrow({
      where: { id: entreprise.id },
      select: { adminUserId: true, adminUser: { select: { deletedAt: true } } },
    });
    if (fresh.adminUserId) {
      // Un administrateur dont le compte est archive (par le SuperAdmin ou par
      // lui-meme) ne bloque plus : on libere la place pour le suivant.
      if (!fresh.adminUser?.deletedAt) {
        return { ok: false as const, error: 'ENTREPRISE_ALREADY_HAS_ADMIN' as const };
      }
      await tx.entreprise.update({ where: { id: entreprise.id }, data: { adminUserId: null } });
    }

    if (await tx.user.findUnique({ where: { email }, select: { id: true } })) {
      return { ok: false as const, error: 'EMAIL_ALREADY_USED' as const };
    }

    const now = new Date();
    const pending = await tx.invitation.findFirst({
      where: {
        cabinetId,
        status: 'pending',
        expiresAt: { gt: now },
        OR: [{ email }, { entrepriseId: entreprise.id }],
      },
      select: { id: true },
    });
    if (pending) return { ok: false as const, error: 'INVITATION_ALREADY_PENDING' as const };

    const invitation = await tx.invitation.create({
      data: {
        email,
        role: ENTREPRISE_ADMIN_ROLE,
        tokenHash,
        cabinetId,
        entrepriseId: entreprise.id,
        invitedById: actor.id,
        expiresAt: invitationExpiry(),
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        action: 'INVITATION_SENT',
        actorId: actor.id,
        cabinetId,
        metadata: {
          invitationId: invitation.id,
          email,
          role: ENTREPRISE_ADMIN_ROLE,
          entrepriseId: entreprise.id,
          entreprise: entreprise.name,
        },
      },
    });
    return { ok: true as const, invitationId: invitation.id, entrepriseName: entreprise.name };
  });

  return result.ok ? { ...result, token } : result;
}

// Remplacement de l'administrateur (roles/04 § 2) : le Cabinet RH retire l'ancien
// compte, puis invite le nouveau. Meme mecanisme que le retrait d'un gestionnaire
// (D52) : sessions coupees, compte archive (User.deletedAt, purge reelle plus
// tard) ; son email reste reserve jusqu'a la purge (D7). La place est liberee
// dans la meme transaction.
export async function removeEntrepriseAdmin(
  cabinetId: string,
  actorId: string,
  entrepriseId: string,
): Promise<{ ok: true } | ({ ok: false } & (EntrepriseAdminError | { error: 'ENTREPRISE_HAS_NO_ADMIN' }))> {
  return prisma.$transaction(async (tx) => {
    const entreprise = await tx.entreprise.findFirst({
      where: { id: entrepriseId, cabinetId, deletedAt: null },
      select: { id: true, name: true, adminUserId: true },
    });
    if (!entreprise) return { ok: false as const, error: 'ENTREPRISE_NOT_FOUND' as const };
    await lockEntreprise(tx, entreprise.id);

    // Relu apres le verrou : un retrait concurrent a pu deja avoir lieu.
    const fresh = await tx.entreprise.findUniqueOrThrow({
      where: { id: entreprise.id },
      select: { adminUserId: true },
    });
    if (!fresh.adminUserId) return { ok: false as const, error: 'ENTREPRISE_HAS_NO_ADMIN' as const };

    const adminId = fresh.adminUserId;
    await tx.session.deleteMany({ where: { userId: adminId } });
    await tx.user.update({
      where: { id: adminId },
      data: { deletedAt: new Date(), deletedBy: 'CABINET_RH' },
    });
    await tx.entreprise.update({ where: { id: entreprise.id }, data: { adminUserId: null } });
    await tx.auditLog.create({
      data: {
        action: 'USER_ARCHIVED',
        actorId,
        cabinetId,
        targetUserId: adminId,
        metadata: {
          role: ENTREPRISE_ADMIN_ROLE,
          entrepriseId: entreprise.id,
          entreprise: entreprise.name,
        },
      },
    });
    return { ok: true as const };
  });
}

// Envoie l'email d'invitation au nom du cabinet, avec son modele (D68).
// Leve en cas d'echec : l'appelant decide s'il faut le signaler.
export async function sendEntrepriseAdminInvitation(input: {
  cabinetId: string;
  inviterName: string;
  entrepriseName: string;
  email: string;
  token: string;
}) {
  const brand = await getCabinetEmailBrand(input.cabinetId);
  const template = await getCustomTemplate(input.cabinetId, 'INVITATION_ENTREPRISE');
  await sendEntrepriseInvitationEmail(
    input.email,
    brand,
    input.inviterName,
    input.entrepriseName,
    invitationUrl(input.token),
    template,
    // D76 : le portail par lequel l'administrateur se reconnectera.
    { portalUrl: portalUrl(await ensureCabinetSlug(input.cabinetId)) },
  );
}
