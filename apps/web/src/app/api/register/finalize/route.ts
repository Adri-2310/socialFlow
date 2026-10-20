import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma';
import { defaultCabinetName, resolvePlanChoice } from '@/lib/cabinet/cabinet-provision';

// Finalisation de l'inscription d'un titulaire (D25, D32, D55) : s'assure que son
// cabinet existe et y pose le plan choisi. Appelee apres l'inscription par email
// (le cabinet existe deja : seul le plan est pose) et apres une inscription
// Google/Microsoft (le compte n'a encore ni cabinet ni plan : on les cree).
//
// Le plan se pose UNE SEULE FOIS : un cabinet qui en a deja un ne le change pas
// par ce chemin, sinon n'importe quel titulaire pourrait s'attribuer des quotas
// plus eleves sans payer (le changement de plan passe par l'abonnement, D60).
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  // Seul un titulaire (auto-inscription) a un cabinet a creer ; les autres roles
  // sont rattaches par une invitation.
  if (session.user.role !== 'CABINET_RH') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const plan = await resolvePlanChoice(body?.plan, body?.billingPeriod);

  const owner = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, cabinetName: true, cabinetId: true, deletedAt: true },
  });
  if (!owner || owner.deletedAt) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  let created = false;
  let cabinetId = owner.cabinetId;

  if (!cabinetId) {
    // Cree puis rattache en une transaction : deux finalisations simultanees (par
    // exemple un double rendu cote client) ne creent qu'un seul cabinet.
    const result = await prisma.$transaction(async (tx) => {
      const fresh = await tx.user.findUnique({ where: { id: owner.id }, select: { cabinetId: true } });
      if (fresh?.cabinetId) return { cabinetId: fresh.cabinetId, created: false };

      const cabinet = await tx.cabinet.create({
        data: {
          name: defaultCabinetName(owner),
          ...(plan ? { planId: plan.planId, billingPeriod: plan.billingPeriod } : {}),
        },
        select: { id: true },
      });
      await tx.user.update({ where: { id: owner.id }, data: { cabinetId: cabinet.id } });
      await tx.auditLog.create({
        data: { action: 'CABINET_CREATED', actorId: owner.id, cabinetId: cabinet.id },
      });
      return { cabinetId: cabinet.id, created: true };
    });
    cabinetId = result.cabinetId;
    created = result.created;
  }

  // Plan pose une seule fois : seulement si le cabinet n'en a pas encore.
  if (plan && !created) {
    await prisma.cabinet.updateMany({
      where: { id: cabinetId, planId: null },
      data: { planId: plan.planId, billingPeriod: plan.billingPeriod },
    });
  }

  return NextResponse.json({ success: true, created }, { status: created ? 201 : 200 });
}
