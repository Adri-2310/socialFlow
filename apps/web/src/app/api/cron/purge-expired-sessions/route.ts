import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { prisma } from '@/lib/prisma';

// Purge des sessions expirees : better-auth ne les supprime jamais de
// lui-meme (une session expiree devient simplement inutilisable, la ligne
// reste en base). Appele quotidiennement par Vercel Cron (voir vercel.json) ;
// verifie via CRON_SECRET comme documente par Vercel pour securiser un
// endpoint de cron public.
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { count } = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });

  return NextResponse.json({ purged: count });
}
