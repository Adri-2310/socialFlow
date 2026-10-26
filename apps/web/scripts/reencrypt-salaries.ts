// Convertit les NISS et IBAN restés au format v1 vers le format v2 (D97). Voir
// src/lib/crypto/reencrypt-salaries.ts pour les garanties.
//
//   npm run db:reencrypt -- --dry-run     # compte seulement, n'écrit rien
//   npm run db:reencrypt                  # convertit
//
// À lancer d'abord avec --dry-run. Avant de le lancer sur la production, prendre un point de
// restauration Neon. Rejouable sans effet double. N'affiche que des compteurs.
import { parseArgs } from 'node:util';
import { config } from 'dotenv';

// Les modules de l'application lisent l'environnement à l'import : il doit être
// chargé avant eux (d'où les imports dynamiques dans main).
config({ path: '.env.local', quiet: true });

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { 'dry-run': { type: 'boolean', default: false } },
  });
  const dryRun = values['dry-run'] ?? false;

  const { reencryptSalaries } = await import('../src/lib/crypto/reencrypt-salaries');
  const { prisma } = await import('../src/lib/prisma');

  // Évite de viser la mauvaise base (développement ou production) sans le voir.
  console.log(`Base visée : ${new URL(process.env.DATABASE_URL ?? '').host}`);
  console.log(dryRun ? 'Simulation : rien ne sera écrit.' : 'Conversion réelle.');

  try {
    const r = await reencryptSalaries({ dryRun });
    console.log(`Dossiers examinés            : ${r.dossiers}`);
    console.log(`Valeurs déjà en v2           : ${r.dejaV2}`);
    console.log(`Valeurs encore en v1         : ${r.valeursV1}`);
    console.log(`  convertibles (relues)      : ${r.convertibles}`);
    console.log(`  converties                 : ${r.converties}`);
    console.log(`  conflits (laissées)        : ${r.conflits}`);
    console.log(`  illisibles (laissées)      : ${r.illisibles}`);
    if (r.illisibles > 0 || r.conflits > 0) {
      console.error('Des valeurs n’ont pas été converties : à examiner, puis relancer.');
      return 1;
    }
    return 0;
  } catch (error) {
    // Jamais de valeur dans le message : seulement la nature de l'erreur.
    console.error(error instanceof Error ? error.message : error);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

// Pas de process.exit() immédiat : sous Windows, quitter pendant que les sockets se
// ferment fait planter Node (assertion libuv) et npm signale un échec à tort. On
// laisse la boucle se vider ; la minuterie (non bloquante) n'est qu'un filet.
main().then((code) => {
  process.exitCode = code;
  setTimeout(() => process.exit(code), 5000).unref();
});
