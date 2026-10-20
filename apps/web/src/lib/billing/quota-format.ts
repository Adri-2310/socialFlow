// Formatage pur des quotas : sans acces donnees, donc importable depuis un
// composant client (cabinet-quotas.ts charge Prisma et reste cote serveur).

// Affichage d'un volume : Mo sous 1 Go, sinon Go.
export function formatStorageMb(mb: number): string {
  if (mb >= 1024) {
    const go = mb / 1024;
    return `${Number.isInteger(go) ? go : go.toFixed(1)} Go`;
  }
  return `${mb} Mo`;
}
