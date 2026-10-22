// Masquage à l'affichage des données sensibles (roles/03 § 4.1). Le clair ne
// quitte le serveur que par la route de dévoilement, journalisée.

// NISS : 85073003328 → 85.07.**-***.** (seuls la date de naissance reste visible).
export function maskNiss(niss: string): string {
  const digits = niss.replace(/\D/g, '');
  if (digits.length !== 11) return '**.**.**-***.**';
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.**-***.**`;
}

// IBAN : BE68539007547034 → BE68 **** **** 7034 (pays, clé de contrôle et 4 derniers caractères).
export function maskIban(iban: string): string {
  const compact = iban.replace(/\s/g, '').toUpperCase();
  if (compact.length < 8) return '**** ****';
  const hidden = compact.slice(4, -4).replace(/./g, '*');
  const groups = (hidden.match(/.{1,4}/g) ?? []).join(' ');
  return `${compact.slice(0, 4)} ${groups} ${compact.slice(-4)}`;
}
