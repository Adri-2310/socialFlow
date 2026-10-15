// Autorisation d'un appel de tache planifiee (Vercel Cron envoie
// "Authorization: Bearer <CRON_SECRET>"). Contrairement a une simple
// comparaison avec `Bearer ${process.env.CRON_SECRET}`, un secret absent ou
// vide refuse tout appel : sinon "Bearer undefined" serait accepte.
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}
