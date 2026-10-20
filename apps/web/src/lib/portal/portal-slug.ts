// Regles pures du portail de connexion du cabinet (D76) : roles concernes,
// identifiant (slug) et adresses. Sans acces donnees, donc utilisable par les
// composants client et les tests (voir cabinet-portal.ts pour la base).

// Roles qui se connectent par le portail de leur cabinet. Le Cabinet RH et le
// SuperAdmin passent par la page de connexion de SocialFlow.
export const PORTAL_ROLES = ['GESTIONNAIRE_RH', 'ENTREPRISE_CLIENTE', 'COLLABORATEUR'] as const;

export function isPortalRole(role: string | null | undefined): boolean {
  return (PORTAL_ROLES as readonly string[]).includes(role ?? '');
}

export const SLUG_MIN = 3;
export const SLUG_MAX = 40;

// Identifiants qui preteraient a confusion avec SocialFlow lui-meme.
export const RESERVED_SLUGS = new Set(['socialflow', 'social-flow', 'admin', 'support', 'api', 'www']);

// "Cabinet Dupont & Fils" -> "cabinet-dupont-fils" : minuscules, sans accents,
// chiffres et lettres separes par des tirets.
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '');
}

export function isValidSlug(slug: string): boolean {
  return (
    slug.length >= SLUG_MIN &&
    slug.length <= SLUG_MAX &&
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) &&
    !RESERVED_SLUGS.has(slug)
  );
}

export const portalPath = (slug: string) => `/connexion/${slug}`;

// Adresse complete du portail, telle qu'on la donne aux invites.
export const portalUrl = (slug: string) => `${process.env.NEXT_PUBLIC_APP_URL ?? ''}${portalPath(slug)}`;

// --- Portail d'une requete de connexion -------------------------------------
//
// Une connexion par le portail annonce son cabinet de trois facons, selon le
// moyen de connexion : un en-tete (mot de passe, code), un cookie (Google et
// Microsoft, qui passent par une redirection) ou l'adresse de retour du lien
// envoye par email (lien magique). C'est une regle de MARQUE et d'isolation, pas
// une barriere de securite : seuls les identifiants protegent le compte.
export const PORTAL_HEADER = 'x-sf-portal';
export const PORTAL_COOKIE = 'sf-portal';

const PORTAL_CALLBACK = /^\/connexion\/([a-z0-9-]+)(?:[/?#]|$)/;

function cookieValue(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

// Identifiant de portail annonce par une requete, ou null. Non verifie en base.
export function portalSlugFromRequest(input: {
  headers?: Headers | null;
  callbackURL?: unknown;
}): string | null {
  const candidates: (string | null)[] = [
    input.headers?.get(PORTAL_HEADER) ?? null,
    cookieValue(input.headers?.get('cookie'), PORTAL_COOKIE),
    typeof input.callbackURL === 'string' ? (PORTAL_CALLBACK.exec(input.callbackURL)?.[1] ?? null) : null,
  ];
  const found = candidates.find((value) => !!value && isValidSlug(value.toLowerCase()));
  return found ? found.toLowerCase() : null;
}
