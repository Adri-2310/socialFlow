import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '../generated/prisma/client.ts';

// Semis du barème réel (étape 9.3, D115) : insère les versions de `prisma/bareme/*.json` dans la table
// globale `bareme_version`. Règles de sécurité :
//   - une version est TOUJOURS semée avec le statut A_VERIFIER, jamais ACTIF : l'activation est faite
//     par le SuperAdmin après les cas de référence (D22) ;
//   - le semis est idempotent : une version déjà présente (même `code`) est laissée telle quelle,
//     jamais modifiée ni remplacée ;
//   - les fichiers sont validés par le schéma Zod dans les tests (tests/payroll/bareme-reels.test.ts).
// Lancer avec `npm run db:seed:bareme`, seulement quand on veut écrire dans la base visée par
// DATABASE_URL.

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const dossier = join(dirname(fileURLToPath(import.meta.url)), 'bareme');
const fichiers = readdirSync(dossier)
  .filter((nom) => nom.endsWith('.json'))
  .sort();

let crees = 0;
let presents = 0;
for (const nom of fichiers) {
  const version = JSON.parse(readFileSync(join(dossier, nom), 'utf-8'));
  if (version.statut !== 'A_VERIFIER') {
    throw new Error(`${nom} : un barème est toujours semé en A_VERIFIER.`);
  }
  const existant = await prisma.baremeVersion.findUnique({
    where: { code: version.code },
    select: { id: true },
  });
  if (existant) {
    presents += 1;
    console.log(`${version.code} : déjà présent, laissé tel quel.`);
    continue;
  }
  await prisma.baremeVersion.create({
    data: {
      code: version.code,
      valideDepuis: new Date(version.valideDepuis),
      valideJusqua: version.valideJusqua ? new Date(version.valideJusqua) : null,
      statut: 'A_VERIFIER',
      categorieEmployeur: version.categorieEmployeur,
      parametres: version.parametres,
      source: version.source,
    },
  });
  crees += 1;
  console.log(`${version.code} : créé (A_VERIFIER).`);
}

console.log(`Seed du barème terminé : ${crees} créée(s), ${presents} déjà présente(s).`);
await prisma.$disconnect();
