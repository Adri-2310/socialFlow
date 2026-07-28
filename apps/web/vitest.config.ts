import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Les tests d'integration de l'auth (tests/lib/auth.test.ts) tournent contre
// la vraie base Neon de dev via auth.api.* (pas de mock DB) : ils ont besoin
// des memes variables que `next dev` (DATABASE_URL, BETTER_AUTH_SECRET...),
// normalement injectees par Next mais absentes d'un run Vitest autonome.
Object.assign(process.env, loadEnv('', process.cwd(), ''));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost:3000',
      },
    },
    // Node 22+ expose un localStorage/sessionStorage natif qui entre en conflit
    // avec celui de jsdom et casse Storage.getItem/setItem sans cette option.
    execArgv: ['--no-experimental-webstorage'],
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    // Les fichiers de tests d'auth partagent une seule base Neon et nettoient
    // leurs comptes par prefixe (`vitest-auth-`) en fin de fichier. Executes en
    // parallele, le `afterAll` du premier fichier termine supprimerait les
    // comptes encore utilises par les autres : on serialise donc les fichiers.
    fileParallelism: false,
    // Les tests d'integration de l'auth font plusieurs aller-retours reels
    // vers Neon par test ; le timeout par defaut (5s) est trop court.
    testTimeout: 15000,
    globals: true,
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/app/**/*.tsx'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
