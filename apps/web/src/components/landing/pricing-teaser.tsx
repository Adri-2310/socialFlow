import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { FadeIn } from '@/components/motion/fade-in';

export function PricingTeaser() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <FadeIn>
        <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card p-10 shadow-2xl sm:p-14">
          <div className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-secondary/20 blur-3xl" />

          <div className="relative mx-auto max-w-2xl text-center">
            <span className="text-sm font-semibold uppercase tracking-wider text-primary">
              Tarifs
            </span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Un prix simple, par cabinet
            </h2>
            <p className="mt-4 text-muted-foreground">
              À partir de 49€/mois. Sans engagement, essai 30 jours sans carte bancaire.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-secondary/30 bg-secondary/10 px-3 py-1 text-xs font-semibold text-secondary">
                <Check className="h-3.5 w-3.5" /> Sans engagement
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-secondary/30 bg-secondary/10 px-3 py-1 text-xs font-semibold text-secondary">
                <Check className="h-3.5 w-3.5" /> Essai 30 jours
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-secondary/30 bg-secondary/10 px-3 py-1 text-xs font-semibold text-secondary">
                <Check className="h-3.5 w-3.5" /> Support FR &amp; NL
              </span>
            </div>
            <Link
              href="/tarifs"
              className="mt-9 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition hover:opacity-90"
            >
              Voir les tarifs <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </FadeIn>
    </section>
  );
}
