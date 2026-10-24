import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '../generated/prisma/client';

// Les tests tournent sur la base de dev (la meme que celle de l'application,
// tant qu'une base de test dediee n'existe pas) : en fin de suite on y retire
// toute trace, meme celle d'un test interrompu ou d'un run precedent.
//
// Perimetre strict : comptes de test (email "vitest-auth-…"), leurs cabinets, et
// uniquement si AUCUN compte reel n'y est rattache ; plans "vitest-…" ; entrees
// d'audit orphelines. Les donnees reelles ne sont jamais touchees.
const TEST_EMAIL_MARK = 'vitest-auth-';

let startedAt: Date;

export function setup() {
  startedAt = new Date();
}

export async function teardown() {
  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    const testUsers = await prisma.user.findMany({
      where: { email: { contains: TEST_EMAIL_MARK } },
      select: { cabinetId: true },
    });
    const candidateIds = [
      ...new Set(testUsers.map((u) => u.cabinetId).filter((id): id is string => !!id)),
    ];
    // Un cabinet qui contient un compte reel est laisse tel quel.
    const withRealUsers = await prisma.user.findMany({
      where: { cabinetId: { in: candidateIds }, NOT: { email: { contains: TEST_EMAIL_MARK } } },
      select: { cabinetId: true },
    });
    const kept = new Set(withRealUsers.map((u) => u.cabinetId));
    const cabinetIds = candidateIds.filter((id) => !kept.has(id));

    await prisma.auditLog.deleteMany({ where: { cabinetId: { in: cabinetIds } } });
    await prisma.invitation.deleteMany({
      where: { OR: [{ email: { contains: TEST_EMAIL_MARK } }, { cabinetId: { in: cabinetIds } }] },
    });
    // D94 : la paie et les entreprises sont en Restrict, on les retire dans l'ordre (meme
    // sequence que supprimerCabinetsEtDonnees) ; le cabinet emporte ensuite comptes et modeles.
    const parCabinet = { cabinetId: { in: cabinetIds } };
    await prisma.prestation.deleteMany({ where: parCabinet });
    await prisma.conditionTravail.deleteMany({ where: parCabinet });
    await prisma.periodePaie.deleteMany({ where: parCabinet });
    await prisma.salarie.deleteMany({ where: parCabinet });
    await prisma.entreprise.deleteMany({ where: parCabinet });
    await prisma.cabinet.deleteMany({ where: { id: { in: cabinetIds } } });
    await prisma.user.deleteMany({ where: { email: { contains: TEST_EMAIL_MARK } } });
    await prisma.verification.deleteMany({
      where: {
        OR: [
          { identifier: { contains: TEST_EMAIL_MARK } },
          { value: { contains: TEST_EMAIL_MARK } },
        ],
      },
    });
    await prisma.pricingPlan.deleteMany({ where: { planId: { startsWith: 'vitest-' } } });

    // Supprimer un cabinet fait perdre son cabinetId a ses entrees d'audit
    // (onDelete: SetNull) : sans cabinet, acteur ni cible elles ne servent plus
    // et polluent le journal du SuperAdmin ("un cabinet supprime a cree son
    // compte"). On retire celles creees pendant ce run.
    await prisma.auditLog.deleteMany({
      where: {
        createdAt: { gte: startedAt },
        cabinetId: null,
        actorId: null,
        targetUserId: null,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}
