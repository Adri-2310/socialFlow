// Liste ou restaure un compte archive (voir hooks.before dans src/lib/auth.ts
// et doc/analysis/AUDIT_SECURITE_AUTH.md pour le contexte de l'archivage).
//
// Usage :
//   npm run restore-account                    liste les comptes archives
//   npm run restore-account -- <email>          restaure ce compte
import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const { prisma } = await import('../src/lib/prisma');
  const email = process.argv[2];

  if (!email) {
    const archived = await prisma.user.findMany({
      where: { deletedAt: { not: null } },
      select: { email: true, name: true, deletedAt: true },
      orderBy: { deletedAt: 'desc' },
    });

    if (archived.length === 0) {
      console.log('Aucun compte archive.');
      return;
    }

    console.log(`${archived.length} compte(s) archive(s) :\n`);
    for (const user of archived) {
      console.log(`  ${user.email}  (${user.name})  supprime le ${user.deletedAt?.toLocaleString('fr-BE')}`);
    }
    console.log('\nPour restaurer : npm run restore-account -- <email>');
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`Aucun compte trouve pour ${email}.`);
    process.exitCode = 1;
    return;
  }
  if (!user.deletedAt) {
    console.log(`Le compte ${email} n'est pas archive.`);
    return;
  }

  await prisma.user.update({ where: { email }, data: { deletedAt: null } });
  console.log(`Compte ${email} restaure.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
