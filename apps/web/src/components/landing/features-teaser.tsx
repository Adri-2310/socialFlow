import Link from 'next/link';
import { FileText, CalendarClock, Send, ArrowRight } from 'lucide-react';
import { FadeIn } from '@/components/motion/fade-in';

const items = [
  {
    icon: FileText,
    title: 'Fiches de paie automatisées',
    description:
      'Calcul en temps réel du brut, des cotisations ONSS et du précompte professionnel.',
  },
  {
    icon: CalendarClock,
    title: 'Calendrier ONSS intelligent',
    description: 'Alertes automatiques avant chaque échéance trimestrielle.',
  },
  {
    icon: Send,
    title: 'DIMONA & C4 en un clic',
    description: 'Déclarations transmises directement, avec suivi du statut en temps réel.',
  },
];

export function FeaturesTeaser() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <FadeIn>
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-wider text-primary">
            Fonctionnalités
          </span>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Tout le cycle de paie, sans friction
          </h2>
        </div>
      </FadeIn>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {items.map((item, i) => {
          const Icon = item.icon;
          return (
            <FadeIn key={item.title} delay={i * 0.1}>
              <div className="group h-full rounded-2xl border border-border/60 bg-gradient-to-br from-card/80 to-card/40 p-6 shadow-sm backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-lg">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-semibold text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
              </div>
            </FadeIn>
          );
        })}
      </div>
      <FadeIn delay={0.3}>
        <div className="mt-10 text-center">
          <Link
            href="/fonctionnalites"
            className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:opacity-80"
          >
            Voir toutes les fonctionnalités <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </FadeIn>
    </section>
  );
}
