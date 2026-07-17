import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '../../generated/prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Connexion "pooled" (pgbouncer) : utilisee par l'app au runtime.
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
