import { DecryptionError, isLegacyFormat } from '@/lib/crypto/field-encryption';
import { prisma } from '@/lib/prisma';
import {
  CHAMPS_CHIFFRES,
  chiffrerSalarie,
  dechiffrerSalarie,
  type ChampChiffre,
} from '@/lib/salarie/salarie-crypto';

// Conversion des NISS et IBAN restés au format v1 (sans contexte) vers le format v2, lié à
// l'identifiant du dossier et au champ (D97). Les valeurs écrites ou modifiées depuis D97 sont
// déjà en v2 ; ce passage ne sert qu'aux dossiers antérieurs. Lancé à la main par
// `npm run db:reencrypt` (scripts/reencrypt-salaries.ts), jamais depuis une page : une lecture
// n'écrit pas, et un cabinet en lecture seule ne doit rien voir changer.
//
// Garanties : rejouable sans effet double (une valeur v2 n'est pas touchée) ; chaque conversion
// est relue avant d'être écrite ; l'écriture n'a lieu que si la valeur n'a pas changé entre-temps ;
// le rapport ne contient que des compteurs, jamais une valeur.

const COLONNE: Record<ChampChiffre, 'nissEncrypted' | 'ibanEncrypted'> = {
  niss: 'nissEncrypted',
  iban: 'ibanEncrypted',
};

export type RapportReencryption = {
  dossiers: number;
  dejaV2: number;
  valeursV1: number;
  // Valeurs v1 qui se laissent convertir et relire (en simulation, le total « à convertir »).
  convertibles: number;
  converties: number;
  // Valeur modifiée par quelqu'un d'autre entre la lecture et l'écriture : laissée telle quelle.
  conflits: number;
  // Valeur v1 illisible, ou format inconnu : laissée telle quelle, à examiner.
  illisibles: number;
};

export async function reencryptSalaries(
  options: {
    dryRun?: boolean;
    tailleLot?: number;
    // Limite le passage à ces cabinets (les tests ne touchent que leurs propres données) ;
    // absent : tous les dossiers, comme le script.
    cabinetIds?: string[];
  } = {},
): Promise<RapportReencryption> {
  const { dryRun = false, tailleLot = 200, cabinetIds } = options;
  const perimetre = cabinetIds ? { cabinetId: { in: cabinetIds } } : {};
  const rapport: RapportReencryption = {
    dossiers: 0,
    dejaV2: 0,
    valeursV1: 0,
    convertibles: 0,
    converties: 0,
    conflits: 0,
    illisibles: 0,
  };

  let curseur: string | undefined;
  for (;;) {
    const lot = await prisma.salarie.findMany({
      where: perimetre,
      take: tailleLot,
      ...(curseur ? { cursor: { id: curseur }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, nissEncrypted: true, ibanEncrypted: true },
    });
    if (lot.length === 0) break;
    curseur = lot[lot.length - 1].id;

    for (const dossier of lot) {
      rapport.dossiers += 1;
      for (const champ of CHAMPS_CHIFFRES) {
        const colonne = COLONNE[champ];
        const stocke = dossier[colonne];

        if (stocke.startsWith('v2:')) {
          rapport.dejaV2 += 1;
          continue;
        }
        if (!isLegacyFormat(stocke)) {
          rapport.illisibles += 1;
          continue;
        }
        rapport.valeursV1 += 1;

        let nouveau: string;
        try {
          const clair = dechiffrerSalarie(dossier.id, champ, stocke);
          nouveau = chiffrerSalarie(dossier.id, champ, clair);
          // Relecture : on n'écrit jamais une valeur qu'on ne sait pas relire.
          if (dechiffrerSalarie(dossier.id, champ, nouveau) !== clair) throw new DecryptionError();
        } catch (error) {
          // Une erreur de configuration (clé absente) arrête tout ; une valeur illisible est comptée.
          if (!(error instanceof DecryptionError)) throw error;
          rapport.illisibles += 1;
          continue;
        }
        rapport.convertibles += 1;
        if (dryRun) continue;

        // Compare-and-swap : si la valeur a changé depuis la lecture, rien n'est écrit.
        const { count } = await prisma.salarie.updateMany({
          where: { id: dossier.id, [colonne]: stocke },
          data: { [colonne]: nouveau },
        });
        if (count === 1) rapport.converties += 1;
        else rapport.conflits += 1;
      }
    }
  }
  return rapport;
}
