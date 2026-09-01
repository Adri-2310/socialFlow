import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Purge des sessions expirees : better-auth ne les supprime jamais de
// lui-meme (une session expiree devient simplement inutilisable, la ligne
// reste en base). Appele quotidiennement par Vercel Cron (voir vercel.json) ;
// verifie via CRON_SECRET comme documente par Vercel pour securiser un
// endpoint de cron public.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { count } = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });

  return NextResponse.json({ purged: count });
}
