// Calendrier des périodes de paie (D90, D91). Fonctions pures : la date « d'aujourd'hui » est
// passée en paramètre, pour que les tests restent justes quand la date réelle avance.

const indexMois = (annee: number, mois: number) => annee * 12 + (mois - 1);

// D90 : une période s'ouvre pour un mois passé (rattrapage, dans les bornes basses de D114), pour le
// mois courant et pour le mois suivant, jamais au-delà.
export function moisOuvrable(annee: number, mois: number, aujourdhui: Date): boolean {
  const courant = indexMois(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth() + 1);
  return indexMois(annee, mois) <= courant + 1;
}

// D90 : les mois qu'on peut encore ouvrir, du mois suivant en remontant `nombre` mois, sans ceux
// qui ont déjà une période (`existants` : « AAAA-M »). Le plus récent d'abord. D114 : on s'arrête au
// premier mois ouvrable de l'entreprise (`premierMois`), jamais plus ancien.
export function moisProposes(
  aujourdhui: Date,
  existants: { annee: number; mois: number }[],
  nombre = 24,
  premierMois?: { annee: number; mois: number },
): { annee: number; mois: number }[] {
  const pris = new Set(existants.map((p) => `${p.annee}-${p.mois}`));
  const courant = indexMois(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth() + 1);
  const resultat: { annee: number; mois: number }[] = [];
  const plancher = premierMois ? indexMois(premierMois.annee, premierMois.mois) : -Infinity;
  for (let i = courant + 1; i > courant + 1 - nombre; i--) {
    if (i < plancher) break; // les mois suivants sont plus anciens encore
    const annee = Math.floor(i / 12);
    const mois = (i % 12) + 1;
    if (!pris.has(`${annee}-${mois}`)) resultat.push({ annee, mois });
  }
  return resultat;
}

// Premier et dernier jour d'un mois (ISO), et son nombre de jours. D92 : un salarié figure dans
// la période s'il est entré au plus tard le dernier jour et n'est pas sorti avant le premier.
export function bornesDuMois(annee: number, mois: number) {
  const joursDansMois = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  const prefixe = `${annee}-${String(mois).padStart(2, '0')}`;
  return {
    premier: `${prefixe}-01`,
    dernier: `${prefixe}-${String(joursDansMois).padStart(2, '0')}`,
    joursDansMois,
  };
}

// D91 : à l'ouverture, la date limite est le jour réglé dans la fiche de l'entreprise, dans le
// mois de la période (les prestations de novembre se donnent avant le 20 novembre). Le jour va
// de 1 à 28, il existe donc dans tous les mois.
export function dateLimiteParDefaut(annee: number, mois: number, jour: number): string {
  return `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
}

// D114 : borne basse des périodes de paie. Premier mois de paie géré : celui de la première version
// de barème réelle (BE-2026-09, doc/reference/). Une période plus ancienne ne peut pas être calculée
// (aucun barème) : on refuse de l'ouvrir plutôt que de laisser le calcul échouer plus tard. Ne change
// que par une nouvelle décision.
export const PREMIER_MOIS_PAIE = { annee: 2026, mois: 9 } as const;

// Mois civil d'une date en heure de BRUXELLES (D114) : un enregistrement du 31 octobre à 23 h 30 UTC
// est déjà le 1er novembre à Bruxelles.
export function moisBruxelles(date: Date): { annee: number; mois: number } {
  const parties = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(date);
  const valeur = (type: string) => Number(parties.find((p) => p.type === type)?.value);
  return { annee: valeur('year'), mois: valeur('month') };
}

// D114 : premier mois qu'une entreprise peut ouvrir = le plus récent de deux dates : le début de la
// paie et le mois de son inscription dans l'application (celui-ci compris, `createdAt`).
export function premierMoisOuvrable(inscription: Date): { annee: number; mois: number } {
  const debut = indexMois(PREMIER_MOIS_PAIE.annee, PREMIER_MOIS_PAIE.mois);
  const entreprise = moisBruxelles(inscription);
  return indexMois(entreprise.annee, entreprise.mois) > debut
    ? entreprise
    : { annee: PREMIER_MOIS_PAIE.annee, mois: PREMIER_MOIS_PAIE.mois };
}

export type RefusBorneBasse = 'AVANT_DEBUT_PAIE' | 'AVANT_INSCRIPTION';

// D114 : pourquoi un mois est trop ancien pour être ouvert, ou null s'il ne l'est pas. Le début de la
// paie passe avant l'inscription : c'est la raison la plus générale.
export function refusBorneBasse(
  annee: number,
  mois: number,
  inscription: Date,
): RefusBorneBasse | null {
  const demande = indexMois(annee, mois);
  if (demande < indexMois(PREMIER_MOIS_PAIE.annee, PREMIER_MOIS_PAIE.mois))
    return 'AVANT_DEBUT_PAIE';
  const entreprise = moisBruxelles(inscription);
  if (demande < indexMois(entreprise.annee, entreprise.mois)) return 'AVANT_INSCRIPTION';
  return null;
}
