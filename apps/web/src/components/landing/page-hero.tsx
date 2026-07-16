'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export function PageHero({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: string;
}) {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 left-1/3 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute top-10 right-1/4 h-64 w-64 rounded-full bg-secondary/20 blur-3xl" />
      </div>
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-20">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <span className="text-sm font-semibold uppercase tracking-wider text-primary">
            {eyebrow}
          </span>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
            {title}
          </h1>
          {description && <p className="mt-4 text-lg text-muted-foreground">{description}</p>}
        </motion.div>
      </div>
    </section>
  );
}
