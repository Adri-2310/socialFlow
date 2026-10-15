import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '../generated/prisma/client';

// Les tests creent puis suppriment leurs cabinets : l'entree d'audit d'un
// cabinet supprime perd son cabinetId (onDelete: SetNull) et reste dans la
// base de dev, ou elle pollue le journal du SuperAdmin ("un cabinet supprime
// a cree son compte"). On retire en fin de suite les entrees orphelines
// creees pendant ce run : sans cabinet, sans acteur et sans utilisateur cible.
let startedAt: Date;

export function setup() {
  startedAt = new Date();
}

export async function teardown() {
  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
  });
  try {
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
