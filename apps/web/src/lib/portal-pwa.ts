import { DEFAULT_PRIMARY } from '@/lib/branding-rules';
import { portalPath } from '@/lib/portal-slug';

// Application installable du portail d'un cabinet (D77) : regles pures du manifeste,
// sans acces donnees. Le nom, la couleur et l'icone sont ceux du cabinet : SocialFlow
// n'apparait pas sur l'ecran d'accueil de ses clients (D76).

export const PWA_ICON_SIZES = [192, 512] as const;
export type PwaIconSize = (typeof PWA_ICON_SIZES)[number];

export function parseIconSize(value: string): PwaIconSize | null {
  const size = Number(value);
  return (PWA_ICON_SIZES as readonly number[]).includes(size) ? (size as PwaIconSize) : null;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

// Les couleurs sont validees a l'enregistrement ; on revalide ici car la valeur
// finit dans un fichier lu par le navigateur.
export function safeColor(color: string | null | undefined): string {
  return color && HEX_COLOR.test(color) ? color : DEFAULT_PRIMARY;
}

// Premiere lettre ou chiffre du nom, en majuscule : repli quand il n'y a pas de logo.
export function brandInitial(name: string): string {
  const match = name.normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[A-Za-z0-9]/);
  return (match ? match[0] : 'C').toUpperCase();
}

export const iconPath = (slug: string, size: PwaIconSize) => `${portalPath(slug)}/icone/${size}`;
export const manifestPath = (slug: string) => `${portalPath(slug)}/manifest.webmanifest`;

const SHORT_NAME_MAX = 12;

export function buildPortalManifest(
  cabinet: { brandName: string; primaryColor: string | null },
  slug: string,
) {
  const short = cabinet.brandName.trim();
  return {
    id: portalPath(slug),
    name: cabinet.brandName,
    short_name:
      short.length > SHORT_NAME_MAX ? `${short.slice(0, SHORT_NAME_MAX - 1).trimEnd()}…` : short,
    start_url: portalPath(slug),
    // Tout le site : une fois connectee, la personne navigue dans son espace (/dashboard)
    // sans sortir de l'application installee.
    scope: '/',
    display: 'standalone',
    theme_color: safeColor(cabinet.primaryColor),
    background_color: '#ffffff',
    icons: PWA_ICON_SIZES.map((size) => ({
      src: iconPath(slug, size),
      sizes: `${size}x${size}`,
      type: 'image/png',
      purpose: 'maskable',
    })),
  };
}
