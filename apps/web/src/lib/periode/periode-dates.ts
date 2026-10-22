// Calendrier des périodes de paie (D90, D91). Fonctions pures : la date « d'aujourd'hui » est
// passée en paramètre, pour que les tests restent justes quand la date réelle avance.

const indexMois = (annee: number, mois: number) => annee * 12 + (mois - 1);

// D90 : une période s'ouvre pour n'importe quel mois passé (rattrapage), pour le mois courant
// et pour le mois suivant, jamais au-delà.
export function moisOuvrable(annee: number, mois: number, aujourdhui: Date): boolean {
  const courant = indexMois(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth() + 1);
  return indexMois(annee, mois) <= courant + 1;
}

// D91 : à l'ouverture, la date limite est le jour réglé dans la fiche de l'entreprise, dans le
// mois de la période (les prestations de novembre se donnent avant le 20 novembre). Le jour va
// de 1 à 28, il existe donc dans tous les mois.
export function dateLimiteParDefaut(annee: number, mois: number, jour: number): string {
  return `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
}
