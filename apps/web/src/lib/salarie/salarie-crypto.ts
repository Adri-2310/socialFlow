import { decryptField, encryptField } from '@/lib/crypto/field-encryption';

// Chiffrement du NISS et de l'IBAN d'un dossier (D81, D97). Chaque valeur est liée à
// l'identifiant du salarié et au nom du champ : recopiée dans un autre dossier, ou dans l'autre
// champ, elle ne se déchiffre plus. Un seul endroit construit ce contexte, pour qu'aucun
// appelant ne l'écrive à la main.

export const CHAMPS_CHIFFRES = ['niss', 'iban'] as const;
export type ChampChiffre = (typeof CHAMPS_CHIFFRES)[number];

// L'identifiant ne change jamais pour un dossier : il ancre le chiffré à son dossier.
export const aadSalarie = (salarieId: string, champ: ChampChiffre) =>
  `salarie:${salarieId}:${champ}`;

export const chiffrerSalarie = (salarieId: string, champ: ChampChiffre, valeur: string) =>
  encryptField(valeur, aadSalarie(salarieId, champ));

export const dechiffrerSalarie = (salarieId: string, champ: ChampChiffre, stocke: string) =>
  decryptField(stocke, aadSalarie(salarieId, champ));
