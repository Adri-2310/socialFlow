// IBAN belge uniquement pour l'instant (choix d'Adrien, 20/10/2026) : BE + 14
// chiffres. Le reste de la liste des pays pourra s'ajouter ici plus tard.

export function normalizeIban(input: string): string {
  return input.replace(/\s/g, '').toUpperCase();
}

// Reste de la division par 97 d'un grand nombre écrit en chiffres, calculé par
// tranches pour ne jamais dépasser la précision d'un entier JavaScript.
function mod97(digits: string): number {
  let rest = 0;
  for (const char of digits) rest = (rest * 10 + Number(char)) % 97;
  return rest;
}

export function isValidIban(input: string): boolean {
  const iban = normalizeIban(input);
  if (!/^BE\d{14}$/.test(iban)) return false;

  // Contrôle ISO 13616 : on déplace les 4 premiers caractères à la fin, on
  // remplace chaque lettre par son rang + 9 (B=11, E=14), le reste doit être 1.
  const rearranged = iban.slice(4) + '1114' + iban.slice(2, 4);
  if (mod97(rearranged) !== 1) return false;

  // Contrôle propre aux comptes belges : les 2 derniers chiffres valent les 10
  // premiers du compte mod 97 (97 si le reste est 0).
  const account = iban.slice(4);
  const expected = mod97(account.slice(0, 10)) || 97;
  return expected === Number(account.slice(10));
}

export function formatIban(input: string): string {
  return (normalizeIban(input).match(/.{1,4}/g) ?? []).join(' ');
}
