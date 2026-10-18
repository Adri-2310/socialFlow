import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';
import { getPortalCabinet } from '@/lib/cabinet-portal';
import { brandInitial, parseIconSize, safeColor } from '@/lib/portal-pwa';

// Icone de l'application installable du cabinet (D77) : son logo sur un fond a sa
// couleur, ou, sans logo, l'initiale de son nom. Zone sure « maskable » : le contenu
// occupe le centre, Android peut rogner les bords en cercle sans rien couper.
const LOGO_MAX_BYTES = 1024 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'];

// Logo lu cote serveur et inline : un echec de lecture donne l'initiale, jamais une
// icone cassee. Le logo vient de notre propre stockage (D62), pas d'une saisie libre.
async function logoDataUri(logoUrl: string | null, origin: string): Promise<string | null> {
  if (!logoUrl) return null;
  try {
    const url = new URL(logoUrl, origin);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!res.ok || !LOGO_TYPES.includes(type)) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > LOGO_MAX_BYTES) return null;
    return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
  } catch {
    return null;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; taille: string }> },
) {
  const { slug, taille } = await params;
  const size = parseIconSize(taille);
  const cabinet = size ? await getPortalCabinet(slug) : null;
  if (!size || !cabinet) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const logo = await logoDataUri(cabinet.logoUrl, new URL(request.url).origin);
  const inner = Math.round(size * 0.6);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: safeColor(cabinet.primaryColor),
        }}
      >
        {logo ? (
          <div
            style={{
              width: inner,
              height: inner,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#ffffff',
              borderRadius: Math.round(inner * 0.2),
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logo}
              alt=""
              width={Math.round(inner * 0.8)}
              height={Math.round(inner * 0.8)}
              style={{ objectFit: 'contain' }}
            />
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              color: '#ffffff',
              fontSize: Math.round(size * 0.5),
              fontWeight: 700,
            }}
          >
            {brandInitial(cabinet.brandName)}
          </div>
        )}
      </div>
    ),
    { width: size, height: size, headers: { 'cache-control': 'public, max-age=300' } },
  );
}
