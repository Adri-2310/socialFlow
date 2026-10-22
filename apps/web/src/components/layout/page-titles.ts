// Titre de la barre du haut et élément actif du menu, d'après l'adresse (module pur, sans React).
//
// Avant : le titre venait de l'entrée du menu dont l'adresse était EXACTEMENT celle de la page,
// sinon de la première. Sur la liste des salariés ou sur une fiche, la barre affichait donc
// « Mes entreprises ». Les pages qui ne sont pas dans le menu déclarent ici leur titre ; les
// autres espaces gardent le comportement d'avant.

type TitreDePage = { motif: RegExp; titre: string };

// Pages de l'espace du gestionnaire qui ne figurent pas dans son menu.
const TITRES_GESTIONNAIRE: TitreDePage[] = [
  { motif: /^\/dashboard\/gestionnaire\/entreprises\/[^/]+\/salaries\/?$/, titre: 'Salariés' },
  { motif: /^\/dashboard\/gestionnaire\/salaries\/[^/]+\/?$/, titre: 'Dossier salarié' },
  {
    motif: /^\/dashboard\/gestionnaire\/entreprises\/[^/]+\/periodes\/?$/,
    titre: 'Périodes de paie',
  },
  { motif: /^\/dashboard\/gestionnaire\/periodes\/[^/]+\/?$/, titre: 'Prestations' },
];

const RACINE_GESTIONNAIRE = '/dashboard/gestionnaire';

// Le titre propre à la page, ou null : le shell prend alors le libellé de l'entrée du menu.
export function pageTitle(role: string, pathname: string): string | null {
  if (role !== 'GESTIONNAIRE_RH') return null;
  return TITRES_GESTIONNAIRE.find((t) => t.motif.test(pathname))?.titre ?? null;
}

// Une entrée du menu est active sur sa propre page ; pour le gestionnaire, « Mes entreprises »
// l'est aussi sur les pages qui en découlent (liste des salariés, fiche d'un salarié).
export function isNavActive(role: string, href: string | undefined, pathname: string): boolean {
  if (!href) return false;
  if (href === pathname) return true;
  return (
    role === 'GESTIONNAIRE_RH' &&
    href === RACINE_GESTIONNAIRE &&
    pathname.startsWith(`${RACINE_GESTIONNAIRE}/`)
  );
}
