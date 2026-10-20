import { NextResponse } from 'next/server';
import { getPortalCabinet } from '@/lib/portal/cabinet-portal';
import { buildPortalManifest } from '@/lib/portal/portal-pwa';

// Manifeste de l'application installable du cabinet (D77). Public, comme le portail :
// il ne contient que l'identite visuelle. Identifiant inconnu ou cabinet archive : 404.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cabinet = await getPortalCabinet(slug);
  if (!cabinet) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  return NextResponse.json(buildPortalManifest(cabinet, slug), {
    headers: {
      'content-type': 'application/manifest+json',
      'cache-control': 'public, max-age=300',
    },
  });
}
