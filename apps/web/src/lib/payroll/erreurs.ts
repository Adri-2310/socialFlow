// Erreur propre au moteur de paie.
//
// Principe de la mission G2a : une entrée incohérente ou un paramètre manquant ne produit
// JAMAIS un calcul silencieux (par exemple un brut calculé avec 0 € faute de donnée). Le moteur
// s'arrête et dit pourquoi, pour que le gestionnaire corrige la donnée au lieu d'envoyer une
// fiche fausse à un salarié.
//
// - `code` : identifiant stable en MAJUSCULES (ex. `ENTREE_INVALIDE`, `BAREME_INTROUVABLE`).
//   Les tests et, plus tard, l'écran du gestionnaire s'appuient sur lui, jamais sur le texte.
// - `message` : phrase lisible en français, destinée à l'utilisateur.
export class ErreurMoteur extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ErreurMoteur';
    this.code = code;
  }
}
