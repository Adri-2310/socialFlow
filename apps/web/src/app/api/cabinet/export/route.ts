import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authz/authz';
import { buildCabinetExport, exportFilename } from '@/lib/cabinet/cabinet-export';
import { prisma } from '@/lib/prisma';

// Export des donnees du cabinet (D28, D74), reserve au Cabinet RH. Route de
// LECTURE : volontairement sans `writable`, car l'export doit rester possible
// quand le cabinet est en lecture seule (resiliation, impaye, suspension).
// Chaque export est journalise (action sensible). Le cabinet vient de la
// session, jamais de la requete.
export async function GET(request: Request) {
  const authz = await authorize(request, 'cabinet.exporter');
  if (authz.response) return authz.response;
  const { cabinetId, id: actorId } = authz.session.user as { cabinetId: string; id: string };

  const now = new Date();
  const data = await buildCabinetExport(cabinetId, now);
  await prisma.auditLog.create({
    data: { action: 'DATA_EXPORTED', actorId, cabinetId },
  });

  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${exportFilename(now)}"`,
      // Donnees personnelles : jamais mises en cache.
      'cache-control': 'no-store',
    },
  });
}
