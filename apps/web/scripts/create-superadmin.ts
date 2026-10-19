// Crée le premier SuperAdmin (D18) : le compte reçoit par email un lien pour
// définir lui-même son mot de passe. Voir doc/roles/01-superadmin.md (A2).
//
//   npm run superadmin:create -- prenom@exemple.be
//   npm run superadmin:create -- prenom@exemple.be --nom "Adrien Mertens"
//   npm run superadmin:create -- autre@exemple.be --force
//
// Refuse s'il existe déjà un SuperAdmin, sauf avec --force. Relancé pour un
// SuperAdmin qui n'a pas encore de mot de passe, il renvoie le lien.
import { parseArgs } from 'node:util';
import { config } from 'dotenv';

// Les modules de l'application lisent l'environnement à l'import : il doit être
// chargé avant eux (d'où les imports dynamiques dans main).
config({ path: '.env.local', quiet: true });

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { nom: { type: 'string' }, force: { type: 'boolean', default: false } },
  });

  const [email] = positionals;
  if (!email || positionals.length > 1) {
    console.error('Usage : npm run superadmin:create -- <email> [--nom "Prénom Nom"] [--force]');
    return 1;
  }

  const { createSuperAdmin, BootstrapError } = await import('../src/lib/superadmin-bootstrap');
  const { prisma } = await import('../src/lib/prisma');

  // Évite de viser la mauvaise base (développement ou production) sans le voir.
  console.log(`Base visée : ${new URL(process.env.DATABASE_URL ?? '').host}`);

  try {
    const { status } = await createSuperAdmin({ email, name: values.nom, force: values.force });
    console.log(
      {
        created: `SuperAdmin créé. Un lien pour définir son mot de passe (valable 1 h) a été envoyé à ${email}.`,
        resent: `Ce SuperAdmin n’a pas encore de mot de passe : le lien a été renvoyé à ${email} (valable 1 h).`,
        unchanged: `${email} est déjà un SuperAdmin prêt à se connecter. Rien n’a été modifié.`,
      }[status],
    );
    return 0;
  } catch (error) {
    console.error(error instanceof BootstrapError ? error.message : error);
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
