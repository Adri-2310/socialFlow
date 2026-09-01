import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CABINET_DELETION_RETENTION_DAYS } from '@/lib/cabinet-retention';

// Purge reelle et definitive des cabinets archives depuis plus de
// CABINET_DELETION_RETENTION_DAYS (voir DELETE dans
// api/admin/cabinets/[id]/route.ts, qui archive au lieu de supprimer
// immediatement). Appele quotidiennement par Vercel Cron (voir vercel.json) ;
// verifie via CRON_SECRET comme documente par Vercel pour securiser un
// endpoint de cron public.
//
// Suppression directe via Prisma : User.cabinetId a onDelete: Cascade dans
// schema.prisma, donc supprime aussi tous les utilisateurs du cabinet (et
// leurs Session/Account/TwoFactor en cascade sur User).
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const cutoff = new Date(Date.now() - CABINET_DELETION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const toPurge = await prisma.cabinet.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true },
  });

  if (toPurge.length > 0) {
    await prisma.cabinet.deleteMany({ where: { id: { in: toPurge.map((c) => c.id) } } });
  }

  return NextResponse.json({ purged: toPurge.length });
}
