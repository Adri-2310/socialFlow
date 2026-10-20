import { describe, it, expect } from 'vitest';
import {
  PORTAL_COOKIE,
  PORTAL_HEADER,
  isPortalRole,
  isValidSlug,
  portalPath,
  portalSlugFromRequest,
  slugify,
} from '@/lib/portal/portal-slug';

describe('slugify (D76)', () => {
  it('met en minuscules, retire les accents et relie par des tirets', () => {
    expect(slugify('Cabinet Dupont & Fils')).toBe('cabinet-dupont-fils');
    expect(slugify('  Société Générale  de Paie ')).toBe('societe-generale-de-paie');
    expect(slugify('Fiduciaire—Liège_2026')).toBe('fiduciaire-liege-2026');
  });

  it('borne la longueur sans finir par un tiret', () => {
    const slug = slugify('a'.repeat(30) + ' ' + 'b'.repeat(30));
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('donne une chaine vide quand rien n est exploitable', () => {
    expect(slugify('***')).toBe('');
  });
});

describe('isValidSlug', () => {
  it('accepte lettres minuscules, chiffres et tirets internes', () => {
    expect(isValidSlug('cabinet-dupont')).toBe(true);
    expect(isValidSlug('abc')).toBe(true);
    expect(isValidSlug('cabinet-2026')).toBe(true);
  });

  it('refuse trop court, trop long, majuscules, tirets en bord ou doubles, caracteres speciaux', () => {
    expect(isValidSlug('ab')).toBe(false);
    expect(isValidSlug('a'.repeat(41))).toBe(false);
    expect(isValidSlug('Cabinet')).toBe(false);
    expect(isValidSlug('-cabinet')).toBe(false);
    expect(isValidSlug('cabinet-')).toBe(false);
    expect(isValidSlug('ca--binet')).toBe(false);
    expect(isValidSlug('cabinet/../x')).toBe(false);
    expect(isValidSlug('cabinet dupont')).toBe(false);
    expect(isValidSlug('')).toBe(false);
  });

  it('refuse les identifiants qui se feraient passer pour SocialFlow', () => {
    for (const reserved of ['socialflow', 'social-flow', 'admin', 'support', 'api', 'www']) {
      expect(isValidSlug(reserved)).toBe(false);
    }
  });
});

describe('portalPath et isPortalRole', () => {
  it('construit le chemin du portail', () => {
    expect(portalPath('cabinet-dupont')).toBe('/connexion/cabinet-dupont');
  });

  it('ne vise que les gestionnaires, entreprises et collaborateurs', () => {
    expect(isPortalRole('GESTIONNAIRE_RH')).toBe(true);
    expect(isPortalRole('ENTREPRISE_CLIENTE')).toBe(true);
    expect(isPortalRole('COLLABORATEUR')).toBe(true);
    expect(isPortalRole('CABINET_RH')).toBe(false);
    expect(isPortalRole('SUPER_ADMIN')).toBe(false);
    expect(isPortalRole(null)).toBe(false);
    expect(isPortalRole(undefined)).toBe(false);
  });
});

describe('portalSlugFromRequest', () => {
  it('lit l en-tete, le cookie puis l adresse de retour', () => {
    expect(portalSlugFromRequest({ headers: new Headers({ [PORTAL_HEADER]: 'mon-cabinet' }) })).toBe('mon-cabinet');
    expect(
      portalSlugFromRequest({ headers: new Headers({ cookie: `autre=1; ${PORTAL_COOKIE}=mon-cabinet; x=2` }) }),
    ).toBe('mon-cabinet');
    expect(portalSlugFromRequest({ callbackURL: '/connexion/mon-cabinet/continuer' })).toBe('mon-cabinet');
    expect(portalSlugFromRequest({ callbackURL: '/connexion/mon-cabinet' })).toBe('mon-cabinet');
  });

  it('prefere l en-tete au cookie, et le cookie a l adresse de retour', () => {
    const headers = new Headers({ [PORTAL_HEADER]: 'en-tete', cookie: `${PORTAL_COOKIE}=cookie` });
    expect(portalSlugFromRequest({ headers, callbackURL: '/connexion/retour' })).toBe('en-tete');
    expect(
      portalSlugFromRequest({ headers: new Headers({ cookie: `${PORTAL_COOKIE}=cookie` }), callbackURL: '/connexion/retour' }),
    ).toBe('cookie');
  });

  it('normalise la casse et ignore les valeurs invalides', () => {
    expect(portalSlugFromRequest({ headers: new Headers({ [PORTAL_HEADER]: 'Mon-Cabinet' }) })).toBe('mon-cabinet');
    expect(portalSlugFromRequest({ headers: new Headers({ [PORTAL_HEADER]: '../etc' }) })).toBeNull();
    expect(portalSlugFromRequest({ headers: new Headers({ [PORTAL_HEADER]: 'ab' }) })).toBeNull();
    expect(portalSlugFromRequest({ callbackURL: '/bienvenue' })).toBeNull();
    expect(portalSlugFromRequest({ callbackURL: 'https://evil.test/connexion/x' })).toBeNull();
    expect(portalSlugFromRequest({ callbackURL: 42 })).toBeNull();
    expect(portalSlugFromRequest({})).toBeNull();
  });

  it('retombe sur la valeur suivante quand la premiere est invalide', () => {
    const headers = new Headers({ [PORTAL_HEADER]: '!!', cookie: `${PORTAL_COOKIE}=bon-cabinet` });
    expect(portalSlugFromRequest({ headers })).toBe('bon-cabinet');
  });
});
