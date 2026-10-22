// Calendrier des périodes de paie (D90, D91). Fonctions pures : la date « d'aujourd'hui » est
// passée en paramètre, pour que les tests restent justes quand la date réelle avance.

const indexMois = (annee: number, mois: number) => annee * 12 + (mois - 1);

// D90 : une période s'ouvre pour n'importe quel mois passé (rattrapage), pour le mois courant
// et pour le mois suivant, jamais au-delà.
export function moisOuvrable(annee: number, mois: number, aujourdhui: Date): boolean {
  const courant = indexMois(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth() + 1);
  return indexMois(annee, mois) <= courant + 1;
}

// D90 : les mois qu'on peut encore ouvrir, du mois suivant en remontant `nombre` mois, sans ceux
// qui ont déjà une période (`existants` : « AAAA-M »). Le plus récent d'abord.
export function moisProposes(
  aujourdhui: Date,
  existants: { annee: number; mois: number }[],
  nombre = 24,
): { annee: number; mois: number }[] {
  const pris = new Set(existants.map((p) => `${p.annee}-${p.mois}`));
  const courant = indexMois(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth() + 1);
  const resultat: { annee: number; mois: number }[] = [];
  for (let i = courant + 1; i > courant + 1 - nombre; i--) {
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
