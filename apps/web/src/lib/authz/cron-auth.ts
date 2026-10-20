import { timingSafeEqual } from 'node:crypto';

// Autorisation d'un appel de tache planifiee (Vercel Cron envoie
// "Authorization: Bearer <CRON_SECRET>"). Contrairement a une simple
// comparaison avec `Bearer ${process.env.CRON_SECRET}`, un secret absent ou
// vide refuse tout appel : sinon "Bearer undefined" serait accepte. La
// comparaison est faite en temps constant, pour qu'un attaquant ne puisse pas
// deviner le secret caractere par caractere d'apres le temps de reponse.
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
