// État d'accès d'un salarié au portail Collaborateur (roles/03 § 4.3, roles/05 § 2). Fonction
// pure : ni base ni horloge, la date du jour arrive en paramètre.

export type EtatPortail =
  // Le dossier a un compte (le salarié a accepté son invitation).
  | { etat: 'COMPTE_ACTIF' }
  | { etat: 'EN_ATTENTE'; expiresAt: Date }
  | { etat: 'EXPIREE'; expiresAt: Date }
  | { etat: 'AUCUNE' };

// D'après le compte lié et la dernière invitation en attente du dossier. Une invitation « en
// attente » dont le lien a expiré est « expirée » : il faut la renvoyer.
export function etatPortail(
  salarie: { userId: string | null; invitations: { expiresAt: Date }[] },
  at: Date,
): EtatPortail {
  if (salarie.userId) return { etat: 'COMPTE_ACTIF' };
  const derniere = salarie.invitations[0];
  if (!derniere) return { etat: 'AUCUNE' };
  return derniere.expiresAt > at
    ? { etat: 'EN_ATTENTE', expiresAt: derniere.expiresAt }
    : { etat: 'EXPIREE', expiresAt: derniere.expiresAt };
}
