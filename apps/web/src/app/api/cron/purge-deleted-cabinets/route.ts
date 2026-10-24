import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/authz/cron-auth';
import { prisma } from '@/lib/prisma';
import { CABINET_DELETION_RETENTION_DAYS } from '@/lib/cabinet/cabinet-retention';
import {
  aDesDonneesAConserver,
  purgerCabinetPartiellement,
  supprimerCabinetsEtDonnees,
} from '@/lib/cabinet/cabinet-purge';

// Purge des cabinets archives depuis plus de CABINET_DELETION_RETENTION_DAYS (voir DELETE
// dans api/admin/cabinets/[id]/route.ts, qui archive au lieu de supprimer immediatement).
// Appele quotidiennement par Vercel Cron (voir vercel.json) ; verifie via CRON_SECRET comme
// documente par Vercel pour securiser un endpoint de cron public.
//
// D94 : un cabinet qui a des donnees de paie n'est pas supprime (conservation legale de
// 5 ans, D28) : on purge ses comptes et son identite visuelle, la paie reste jusqu'a
// api/cron/purge-expired-retention. Sans donnees de paie, suppression complete : User.cabinetId
// a onDelete: Cascade, donc les utilisateurs partent avec le cabinet (et leurs
// Session/Account/TwoFactor en cascade sur User).
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const cutoff = new Date(Date.now() - CABINET_DELETION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  // Un cabinet deja purge partiellement attend la fin de sa conservation : on ne le retraite pas.
  const toPurge = await prisma.cabinet.findMany({
    where: { deletedAt: { lt: cutoff }, donneesPurgeesLe: null },
    select: { id: true },
  });

  const aSupprimer: string[] = [];
  let partiellement = 0;
  for (const { id } of toPurge) {
    if (await aDesDonneesAConserver(id)) {
      if (await purgerCabinetPartiellement(id)) partiellement += 1;
    } else {
      aSupprimer.push(id);
    }
  }
  await supprimerCabinetsEtDonnees(aSupprimer);

  return NextResponse.json({ purged: aSupprimer.length, partiallyPurged: partiellement });
}
