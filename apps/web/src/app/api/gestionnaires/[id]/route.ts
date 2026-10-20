import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authz/authz';
import { prisma } from '@/lib/prisma';
import { getCabinetEmailBrand } from '@/lib/email/cabinet-email-brand';
import { sendGestionnaireAccessChangedEmail, type GestionnaireAccessChange } from '@/lib/email/email';
import { gestionnaireRestoreDeadline } from '@/lib/cabinet/gestionnaire-retention';
import { getUncoveredEntreprises } from '@/lib/entreprise/cabinet-entreprises';
import { getCabinetQuotaUsage, isQuotaReached, quotaExceededBody } from '@/lib/billing/cabinet-quotas';

const VALID_STATUSES = ['actif', 'suspendu'] as const;
type GestionnaireStatus = (typeof VALID_STATUSES)[number];

// Gestion d'un gestionnaire par le Cabinet RH de son cabinet (D52,
// roles/02-cabinet-rh.md § 4.2). Le perimetre est pose dans la requete
// elle-meme (cabinetId de la session + role) : un gestionnaire d'un autre
// cabinet, ou n'importe quel autre utilisateur, est "introuvable" (404).
//
// D27 : suspendre ou retirer un gestionnaire est refuse (409) tant qu'une
// entreprise n'est couverte que par lui ; la reponse liste ces entreprises.
async function findGestionnaire(id: string, cabinetId: string) {
  return prisma.user.findFirst({
    where: { id, cabinetId, role: 'GESTIONNAIRE_RH', deletedAt: null },
    select: { id: true, name: true, email: true, status: true, suspendedBy: true },
  });
}

// L'email ne doit jamais faire echouer l'action : l'acces est deja coupe ou
// retabli, et un echec Resend ne justifie pas d'annuler une suspension.
async function notify(
  target: { name: string; email: string },
  cabinetId: string,
  change: GestionnaireAccessChange,
) {
  try {
    const brand = await getCabinetEmailBrand(cabinetId);
    await sendGestionnaireAccessChangedEmail(target.email, target.name, brand, change);
  } catch (error) {
    console.error("Echec de l'envoi de l'email de changement d'acces", error);
  }
}

async function uncoveredResponse(cabinetId: string, userId: string) {
  const uncovered = await getUncoveredEntreprises(cabinetId, userId);
  if (uncovered.length === 0) return null;
  return NextResponse.json(
    { error: 'GESTIONNAIRE_HAS_UNCOVERED_ENTREPRISES', entreprises: uncovered },
    { status: 409 },
  );
}

// Suspend ou reactive un gestionnaire (reversible).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authz = await authorize(request, 'gestionnaire.desactiver');
  if (authz.response) return authz.response;
  const { session } = authz;
  const cabinetId = session.user.cabinetId as string;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const status = body?.status as string | undefined;
  if (!status || !VALID_STATUSES.includes(status as GestionnaireStatus)) {
    return NextResponse.json({ error: 'INVALID_STATUS' }, { status: 400 });
  }

  const target = await findGestionnaire(id, cabinetId);
  if (!target) {
    return NextResponse.json({ error: 'GESTIONNAIRE_NOT_FOUND' }, { status: 404 });
  }

  if (status === 'suspendu') {
    if (target.status === 'suspendu') {
      return NextResponse.json({ error: 'GESTIONNAIRE_ALREADY_SUSPENDED' }, { status: 409 });
    }
    const uncovered = await uncoveredResponse(cabinetId, target.id);
    if (uncovered) return uncovered;

    const done = await prisma.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id: target.id, cabinetId, status: 'actif' },
        data: { status: 'suspendu', suspendedBy: 'CABINET_RH' },
      });
      if (count === 0) return false;

      // Coupe l'acces immediatement, pas seulement a la prochaine connexion
      // (meme mecanisme que api/admin/users/[id]).
      await tx.session.deleteMany({ where: { userId: target.id } });
      await tx.auditLog.create({
        data: {
          action: 'USER_SUSPENDED',
          actorId: session.user.id,
          cabinetId,
          targetUserId: target.id,
        },
      });
      return true;
    });
    if (!done) {
      return NextResponse.json({ error: 'GESTIONNAIRE_ALREADY_SUSPENDED' }, { status: 409 });
    }

    await notify(target, cabinetId, 'suspended');
    return NextResponse.json({ success: true });
  }

  // Reactivation.
  if (target.status === 'actif') {
    return NextResponse.json({ error: 'GESTIONNAIRE_ALREADY_ACTIVE' }, { status: 409 });
  }
  // D52 : une suspension du SuperAdmin (ou anterieure au champ suspendedBy)
  // ne se leve que depuis la console SuperAdmin.
  if (target.suspendedBy !== 'CABINET_RH') {
    return NextResponse.json({ error: 'SUSPENDED_BY_ADMIN' }, { status: 403 });
  }

  const done = await prisma.$transaction(async (tx) => {
    const { count } = await tx.user.updateMany({
      where: { id: target.id, cabinetId, status: 'suspendu', suspendedBy: 'CABINET_RH' },
      data: { status: 'actif', suspendedBy: null },
    });
    if (count === 0) return false;

    await tx.auditLog.create({
      data: {
        action: 'USER_REACTIVATED',
        actorId: session.user.id,
        cabinetId,
        targetUserId: target.id,
      },
    });
    return true;
  });
  if (!done) {
    return NextResponse.json({ error: 'GESTIONNAIRE_ALREADY_ACTIVE' }, { status: 409 });
  }

  await notify(target, cabinetId, 'reactivated');
  return NextResponse.json({ success: true });
}

// Archive un gestionnaire : meme mecanisme que l'archivage d'un compte par le
// SuperAdmin (User.deletedAt, purge reelle apres ACCOUNT_DELETION_RETENTION_DAYS
// par api/cron/purge-deleted-accounts). L'email reste reserve jusqu'a la purge (D7).
// Restaurable par le cabinet pendant GESTIONNAIRE_RESTORE_WINDOW_DAYS (PUT).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authz = await authorize(request, 'gestionnaire.desactiver');
  if (authz.response) return authz.response;
  const { session } = authz;
  const cabinetId = session.user.cabinetId as string;
  const { id } = await params;

  const target = await findGestionnaire(id, cabinetId);
  if (!target) {
    return NextResponse.json({ error: 'GESTIONNAIRE_NOT_FOUND' }, { status: 404 });
  }
  const uncovered = await uncoveredResponse(cabinetId, target.id);
  if (uncovered) return uncovered;

  await prisma.$transaction(async (tx) => {
    await tx.session.deleteMany({ where: { userId: target.id } });
    await tx.user.update({
      where: { id: target.id },
      data: { deletedAt: new Date(), deletedBy: 'CABINET_RH' },
    });
    await tx.auditLog.create({
      data: {
        action: 'USER_ARCHIVED',
        actorId: session.user.id,
        cabinetId,
        targetUserId: target.id,
      },
    });
  });

  await notify(target, cabinetId, 'archived');
  return NextResponse.json({ success: true });
}

// Restaure un gestionnaire retire par le cabinet, dans les
// GESTIONNAIRE_RESTORE_WINDOW_DAYS jours (D52). Meme convention que
// api/admin/users/[id] : PUT = restauration.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authz = await authorize(request, 'gestionnaire.desactiver');
  if (authz.response) return authz.response;
  const { session } = authz;
  const cabinetId = session.user.cabinetId as string;
  const { id } = await params;

  const target = await prisma.user.findFirst({
    where: { id, cabinetId, role: 'GESTIONNAIRE_RH', deletedAt: { not: null } },
    select: { id: true, name: true, email: true, deletedAt: true, deletedBy: true },
  });
  if (!target || !target.deletedAt) {
    return NextResponse.json({ error: 'GESTIONNAIRE_NOT_FOUND' }, { status: 404 });
  }
  // Un compte que la personne a elle-meme supprime (RGPD), ou que le
  // SuperAdmin a archive, n'est pas restaurable par le cabinet.
  if (target.deletedBy !== 'CABINET_RH') {
    return NextResponse.json({ error: 'RESTORE_NOT_ALLOWED' }, { status: 403 });
  }
  if (gestionnaireRestoreDeadline(target.deletedAt).getTime() < Date.now()) {
    return NextResponse.json({ error: 'RESTORE_WINDOW_EXPIRED' }, { status: 409 });
  }

  // D15 : restaurer un gestionnaire reprend une place du quota. Entre son
  // retrait et sa restauration, le cabinet a pu inviter quelqu'un d'autre.
  const { limits, utilisateurs } = await getCabinetQuotaUsage(cabinetId);
  if (limits && isQuotaReached(utilisateurs.used, limits.maxUtilisateurs)) {
    return NextResponse.json(
      quotaExceededBody(
        'maxUtilisateurs',
        limits.maxUtilisateurs as number,
        utilisateurs.used,
        limits.pendingPlanName,
      ),
      { status: 403 },
    );
  }

  const done = await prisma.$transaction(async (tx) => {
    // Filtre sur deletedAt dans l'ecriture : couvre une double restauration
    // ou une purge concurrente.
    const { count } = await tx.user.updateMany({
      where: { id: target.id, cabinetId, deletedAt: { not: null }, deletedBy: 'CABINET_RH' },
      data: { deletedAt: null, deletedBy: null },
    });
    if (count === 0) return false;

    await tx.auditLog.create({
      data: {
        action: 'USER_RESTORED',
        actorId: session.user.id,
        cabinetId,
        targetUserId: target.id,
      },
    });
    return true;
  });
  if (!done) {
    return NextResponse.json({ error: 'GESTIONNAIRE_NOT_FOUND' }, { status: 404 });
  }

  await notify(target, cabinetId, 'restored');
  return NextResponse.json({ success: true });
}
