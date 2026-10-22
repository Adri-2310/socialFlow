// Choix de la condition de travail en vigueur dans l'historique daté
// (roles/03 § 4.2). Fonction pure : ni base ni horloge, la date arrive en paramètre.

type Datée = { dateEffet: Date };

// La plus récente dont la date d'effet ne dépasse pas `at`. Si aucune n'est
// encore entrée en vigueur (salarié engagé dans le futur), on renvoie la
// première : l'écran montre ce qui est prévu plutôt que rien.
export function conditionEnVigueur<T extends Datée>(conditions: T[], at: Date): T | null {
  if (conditions.length === 0) return null;
  const triées = [...conditions].sort((a, b) => b.dateEffet.getTime() - a.dateEffet.getTime());
  return triées.find((c) => c.dateEffet.getTime() <= at.getTime()) ?? triées[triées.length - 1];
}
