'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Check, ShieldCheck, FileCheck, TrendingUp } from 'lucide-react';

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Gradient mesh background */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute top-10 right-0 h-80 w-80 rounded-full bg-secondary/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="mx-auto grid max-w-7xl items-center gap-16 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-secondary/30 bg-secondary/10 px-3 py-1 text-xs font-semibold text-secondary backdrop-blur-sm">
            <ShieldCheck className="h-3.5 w-3.5" />
            Conforme ONSS &amp; DIMONA — Belgique
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            La paie belge,<br />
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              enfin fluide.
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            SocialFlow réunit vos secrétariats sociaux, gestionnaires, entreprises clientes et
            salariés sur une seule plateforme. Générez des fiches de paie conformes, suivez vos
            échéances ONSS et automatisez vos déclarations DIMONA.
          </p>
          <div className="mt-8">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:opacity-90"
            >
              Démarrer l&apos;essai 30 jours <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-6 flex items-center gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-4 w-4 text-secondary" /> Sans carte bancaire
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-4 w-4 text-secondary" /> Support en FR &amp; NL
            </span>
          </div>
        </motion.div>

        {/* Cluster de cartes flottantes en verre */}
        <div className="relative hidden h-[460px] lg:block">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="absolute left-1/2 top-1/2 w-80 -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-border/60 bg-card/60 p-7 shadow-2xl backdrop-blur-xl"
          >
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-md">
              <FileCheck className="h-6 w-6" />
            </span>
            <p className="mt-4 text-sm text-muted-foreground">Fiches générées ce mois</p>
            <p className="text-3xl font-bold text-foreground">1 284</p>
            <p className="mt-1 text-xs font-semibold text-secondary">+12,4% vs mois dernier</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="absolute -top-4 -right-4 w-56"
          >
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-xl backdrop-blur-xl"
            >
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-secondary/15 text-secondary">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <p className="mt-3 text-xs font-semibold text-foreground">DIMONA envoyée</p>
              <p className="text-[11px] text-muted-foreground">il y a 2 min</p>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.45 }}
            className="absolute -bottom-4 -left-4 w-60"
          >
            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}
              className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-xl backdrop-blur-xl"
            >
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary">
                <TrendingUp className="h-4 w-4" />
              </span>
              <p className="mt-3 text-xs font-semibold text-foreground">Clients actifs</p>
              <p className="text-lg font-bold text-foreground">
                47 <span className="text-xs font-medium text-secondary">+3</span>
              </p>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
