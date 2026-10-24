import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/authz/cron-auth';
import { prisma } from '@/lib/prisma';
import { calculerFinDeConservation, supprimerCabinetsEtDonnees } from '@/lib/cabinet/cabinet-purge';

// D94 : seconde etape de la purge d'un cabinet. Un cabinet dont les comptes ont deja ete purges
// (donneesPurgeesLe) garde sa paie jusqu'a la fin de la conservation legale de 5 ans (D28) ;
// cette tache supprime alors tout, coquille comprise. Appelee quotidiennement par Vercel Cron
// (voir vercel.json), protegee par CRON_SECRET. Rejouable sans effet double.
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const purges = await prisma.cabinet.findMany({
    where: { donneesPurgeesLe: { not: null } },
    select: { id: true },
  });

  const now = new Date();
  const echus: string[] = [];
  for (const { id } of purges) {
    if ((await calculerFinDeConservation(id)) < now) echus.push(id);
  }
  await supprimerCabinetsEtDonnees(echus);

  return NextResponse.json({ purged: echus.length });
}
