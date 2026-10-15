import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { suspendOverdueCabinets } from '@/lib/billing-grace';

// Fin du delai de grace des impayes (D57) : appelee quotidiennement par
// Vercel Cron (voir vercel.json), protegee par CRON_SECRET. Idempotente.
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { suspended } = await suspendOverdueCabinets();
  return NextResponse.json({ suspended: suspended.length });
}
