import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

config({ path: '.env.local', quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Connexion directe (sans pgbouncer) : requise par le CLI Prisma pour les migrations.
    url: process.env.DATABASE_URL_UNPOOLED,
  },
});
