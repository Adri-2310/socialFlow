import { ErreurMoteur } from '../erreurs';
import type { ParametresBareme } from './schema';

// Les blocs de paramètres légaux d'un barème (tout sauf `version` et `categorieEmployeur`).
export type NomBloc = Exclude<keyof ParametresBareme, 'version' | 'categorieEmployeur'>;

// Renvoie un bloc de paramètres, ou s'arrête s'il est absent.
//
// Pourquoi : un barème peut être valide sans contenir tous les blocs (il se remplit étape par
// étape). Mais calculer avec un taux ABSENT en le remplaçant par 0 ou par une valeur « habituelle »
// produirait une fiche fausse sans que personne ne le voie. Le moteur refuse donc (D99) :
// le gestionnaire apprend qu'il manque un paramètre et le SuperAdmin peut compléter le barème.
export function exigerBloc<K extends NomBloc>(
  parametres: ParametresBareme,
  nom: K,
): NonNullable<ParametresBareme[K]> {
  const bloc = parametres[nom];
  if (bloc === undefined) {
    throw new ErreurMoteur(
      'PARAMETRE_MANQUANT',
      `Le barème ne contient pas le bloc « ${nom} » : le calcul est impossible.`,
    );
  }
  return bloc as NonNullable<ParametresBareme[K]>;
}
