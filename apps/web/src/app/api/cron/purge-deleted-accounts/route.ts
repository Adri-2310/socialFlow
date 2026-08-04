import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ACCOUNT_DELETION_RETENTION_DAYS } from '@/lib/account-retention';

// Purge reelle et definitive des comptes archives depuis plus de
// ACCOUNT_DELETION_RETENTION_DAYS (voir hooks.before dans auth.ts, qui
// archive au lieu de supprimer immediatement). Appele quotidiennement par
// Vercel Cron (voir vercel.json) ; verifie via CRON_SECRET comme documente
// par Vercel pour securiser un endpoint de cron public.
//
// Suppression directe via Prisma (pas auth.api.deleteUser, qui exige une
// session utilisateur authentifiee) : les relations Session/Account/TwoFactor
// ont onDelete: Cascade dans schema.prisma, donc equivalent a une vraie
// suppression de compte.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const cutoff = new Date(Date.now() - ACCOUNT_DELETION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const toPurge = await prisma.user.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true },
  });

  if (toPurge.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: toPurge.map((u) => u.id) } } });
  }

  return NextResponse.json({ purged: toPurge.length });
}
