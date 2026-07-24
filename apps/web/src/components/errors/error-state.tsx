'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';

type ErrorAction = {
  label: string;
  icon: ReactNode;
} & ({ href: string; onClick?: never } | { onClick: () => void; href?: never });

export function ErrorState({
  icon,
  code,
  eyebrow,
  title,
  description,
  actions,
  digest,
  footer,
  tone = 'primary',
}: {
  icon: ReactNode;
  code?: string;
  eyebrow: string;
  title: string;
  description: string;
  actions: ErrorAction[];
  digest?: string;
  footer?: ReactNode;
  tone?: 'primary' | 'destructive' | 'warning';
}) {
  const isDestructive = tone === 'destructive';
  const isWarning = tone === 'warning';

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div
          className={`absolute -top-24 left-1/3 h-72 w-72 rounded-full blur-3xl ${
            isDestructive ? 'bg-destructive/15' : isWarning ? 'bg-amber-500/15' : 'bg-primary/20'
          }`}
        />
        <div
          className={`absolute top-10 right-1/4 h-64 w-64 rounded-full blur-3xl ${
            isWarning ? 'bg-amber-300/15' : 'bg-secondary/20'
          }`}
        />
      </div>

      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-6 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo-simple.png" alt="SocialFlow" width={36} height={36} className="rounded-xl" />
          <span className="text-lg font-bold tracking-tight text-foreground">
            Social<span className="text-primary dark:text-indigo-400">Flow</span>
          </span>
        </Link>
        <ThemeToggle />
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 pb-16 text-center sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center"
        >
          <span
            className={`grid h-16 w-16 place-items-center rounded-2xl ${
              isDestructive
                ? 'bg-destructive/10 text-destructive'
                : isWarning
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : 'bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-lg shadow-primary/20'
            }`}
          >
            {icon}
          </span>

          {code && (
            <p className="mt-6 bg-gradient-to-r from-primary to-secondary bg-clip-text text-7xl font-extrabold tracking-tight text-transparent sm:text-8xl">
              {code}
            </p>
          )}

          <p
            className={`${code ? 'mt-3' : 'mt-6'} text-sm font-semibold uppercase tracking-wider ${
              isDestructive ? 'text-destructive' : isWarning ? 'text-amber-600 dark:text-amber-400' : 'text-primary'
            }`}
          >
            {eyebrow}
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
          <p className="mt-4 max-w-md text-muted-foreground">{description}</p>

          {digest && <p className="mt-2 text-xs text-muted-foreground/60">Référence : {digest}</p>}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {actions.map((action, index) => {
              const className =
                index === 0
                  ? 'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-primary to-secondary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:opacity-90'
                  : 'inline-flex items-center justify-center gap-2 rounded-xl border border-input px-6 py-3 text-sm font-semibold text-foreground transition hover:bg-muted';

              if (action.href) {
                return (
                  <Link key={action.label} href={action.href} className={className}>
                    {action.icon}
                    {action.label}
                  </Link>
                );
              }

              return (
                <button key={action.label} type="button" onClick={action.onClick} className={className}>
                  {action.icon}
                  {action.label}
                </button>
              );
            })}
          </div>

          {footer && (
            <div className="mt-8 w-full max-w-xs border-t border-border/60 pt-6 text-sm text-muted-foreground">
              {footer}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
