import { prisma } from '@/lib/prisma';
import { GRACE_PERIOD_DAYS } from '@/lib/billing';
import { sendPaymentSuspensionEmail } from '@/lib/email';

// Fin du delai de grace (D57) : un cabinet en DELAI_GRACE depuis plus de
// GRACE_PERIOD_DAYS passe a IMPAYE (lecture seule, D29). Ne touche jamais a
// Cabinet.status : la suspension manuelle du SuperAdmin reste a lui seul.
//
// Idempotent : la mise a jour est conditionnee a l'etat DELAI_GRACE, donc un
// second passage (ou un paiement recu entre-temps) ne change rien et
// n'envoie aucun second email.

export type GraceSweepResult = { suspended: string[] };

const DAY_MS = 24 * 60 * 60 * 1000;

async function notifySuspension(cabinetId: string): Promise<void> {
  const [cabinet, owner, admins] = await Promise.all([
    prisma.cabinet.findUnique({ where: { id: cabinetId }, select: { name: true } }),
    prisma.user.findFirst({
      where: { cabinetId, role: 'CABINET_RH', deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { email: true, name: true },
    }),
    prisma.user.findMany({
      where: { role: 'SUPER_ADMIN', deletedAt: null, status: 'actif' },
      select: { email: true, name: true },
    }),
  ]);
  if (!cabinet) return;

  // D23 : titulaire ET SuperAdmins. Un echec d'envoi est journalise sans
  // annuler la suspension, deja enregistree.
  const sends = [
    ...(owner
      ? [sendPaymentSuspensionEmail(owner.email, owner.name, cabinet.name, 'cabinet')]
      : []),
    ...admins.map((a) => sendPaymentSuspensionEmail(a.email, a.name, cabinet.name, 'admin')),
  ];
  for (const result of await Promise.allSettled(sends)) {
    if (result.status === 'rejected') {
      console.error("Echec de l'email de suspension pour impaye", result.reason);
    }
  }
}

export async function suspendOverdueCabinets(now: Date = new Date()): Promise<GraceSweepResult> {
  const cutoff = new Date(now.getTime() - GRACE_PERIOD_DAYS * DAY_MS);

  const overdue = await prisma.cabinet.findMany({
    where: {
      billingStatus: 'DELAI_GRACE',
      pastDueSince: { lte: cutoff },
      deletedAt: null,
    },
    select: { id: true },
  });

  const suspended: string[] = [];
  for (const { id } of overdue) {
    const done = await prisma.$transaction(async (tx) => {
      const { count } = await tx.cabinet.updateMany({
        where: { id, billingStatus: 'DELAI_GRACE' },
        data: { billingStatus: 'IMPAYE' },
      });
      if (count === 0) return false;

      await tx.auditLog.create({
        data: {
          action: 'BILLING_STATUS_CHANGED',
          cabinetId: id,
          metadata: { from: 'DELAI_GRACE', to: 'IMPAYE', eventType: 'grace_period_elapsed' },
        },
      });
      return true;
    });

    if (done) {
      suspended.push(id);
      await notifySuspension(id);
    }
  }

  return { suspended };
}
