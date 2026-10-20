// NISS (numéro national) : 11 chiffres AA.MM.JJ-SSS.CC (roles/03 § 4.1).

// Garde uniquement les chiffres : le NISS arrive saisi avec points et tiret.
export function normalizeNiss(input: string): string {
  return input.replace(/[\s.\-]/g, '');
}

// Clé de contrôle : les 2 derniers chiffres valent 97 − (les 9 premiers mod 97).
// Pour une personne née en 2000 ou après, on préfixe les 9 chiffres d'un « 2 »
// avant le calcul. On ne valide pas la date de naissance : un numéro bis peut
// avoir un mois ou un jour à 00 ou augmenté de 20/40.
export function isValidNiss(input: string): boolean {
  const niss = normalizeNiss(input);
  if (!/^\d{11}$/.test(niss)) return false;
  const base = Number(niss.slice(0, 9));
  const check = Number(niss.slice(9));
  return 97 - (base % 97) === check || 97 - ((2_000_000_000 + base) % 97) === check;
}

// Format d'affichage complet (à n'utiliser qu'après dévoilement journalisé).
export function formatNiss(input: string): string {
  const n = normalizeNiss(input);
  if (n.length !== 11) return input;
  return `${n.slice(0, 2)}.${n.slice(2, 4)}.${n.slice(4, 6)}-${n.slice(6, 9)}.${n.slice(9)}`;
}
