// Active une version de barème (D22, D119, D122). Voir doc/modules/paie.md § 5.
//
//   npm run bareme:activer -- BE-2026-10 --par prenom@exemple.be
//   npm run bareme:activer -- BE-2026-11 --par prenom@exemple.be --derogation "Motif écrit"
//   npm run bareme:activer -- BE-2026-10 --par prenom@exemple.be --dry-run
//
// --par : adresse d'un SuperAdmin existant (il est tracé dans l'audit).
// --derogation : active malgré l'absence de cas de référence ; le motif est obligatoire et conservé.
//   Elle ne lève JAMAIS l'échec d'un cas, un bloc manquant, une fiabilité à confirmer ou un chevauchement.
// --dry-run : fait toutes les vérifications sans rien écrire.
// Sans --dry-run, le script affiche la base visée et demande une confirmation au clavier : il refuse de
// tourner sans terminal interactif.
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { config } from 'dotenv';

// Les modules de l'application lisent l'environnement à l'import : il doit être chargé avant eux.
config({ path: '.env.local', quiet: true });

const USAGE =
  'Usage : npm run bareme:activer -- <code> --par <email> [--derogation "<motif>"] [--dry-run]';

async function confirmer(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const reponse = await rl.question(`${question} (o/n) `);
    return reponse.trim().toLowerCase() === 'o';
  } finally {
    rl.close();
  }
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      par: { type: 'string' },
      derogation: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  });

  const [code] = positionals;
  if (!code || positionals.length > 1 || !values.par) {
    console.error(USAGE);
    return 1;
  }
  const essai = values['dry-run'] === true;
  if (!essai && !(process.stdin.isTTY && process.stdout.isTTY)) {
    console.error('Confirmation impossible : lance ce script dans un terminal interactif (ou avec --dry-run).');
    return 1;
  }

  const { activerBareme, ErreurActivationBareme } = await import('../src/lib/bareme/bareme-activation');
  const { prisma } = await import('../src/lib/prisma');

  // Évite de viser la mauvaise base (développement ou production) sans le voir.
  console.log(`Base visée : ${new URL(process.env.DATABASE_URL ?? '').host}`);

  try {
    const demande = {
      code,
      parEmail: values.par,
      derogationMotif: values.derogation,
    };

    // Premier passage sans écrire : on montre le verdict avant de demander quoi que ce soit.
    const verdict = await activerBareme({ ...demande, essai: true });
    console.log(
      `${verdict.code} : activable${verdict.sansCasReference ? ' par dérogation (aucun cas de référence)' : ''}.`,
    );
    if (essai) {
      console.log('Essai à blanc : rien n’a été écrit.');
      return 0;
    }

    if (!(await confirmer(`Activer ${verdict.code} ?`))) {
      console.log('Abandon : rien n’a été écrit.');
      return 0;
    }
    await activerBareme(demande);
    console.log(`${verdict.code} est maintenant ACTIF.`);
    return 0;
  } catch (error) {
    if (error instanceof ErreurActivationBareme) {
      console.error(error.message);
      for (const raison of error.raisons) console.error(`  - ${raison}`);
      return 1;
    }
    console.error(error);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

// Même précaution que create-superadmin : pas de process.exit() immédiat sous Windows.
main().then((code) => {
  process.exitCode = code;
  setTimeout(() => process.exit(code), 5000).unref();
});
