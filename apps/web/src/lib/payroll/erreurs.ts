// Erreur explicite du moteur de paie : une entrée incohérente ou un paramètre manquant ne
// donne jamais un calcul silencieux (règle de la mission G2a). Le `code` sert aux tests et à
// l'affichage ; le message est lisible par le gestionnaire.
export class ErreurMoteur extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ErreurMoteur';
    this.code = code;
  }
}
