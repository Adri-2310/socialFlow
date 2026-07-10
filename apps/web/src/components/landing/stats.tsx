import { FileCheck, Users, ShieldCheck, Clock } from 'lucide-react';
import { Counter } from '@/components/motion/counter';
import { FadeIn } from '@/components/motion/fade-in';

const stats = [
  { icon: FileCheck, value: 12000, suffix: '+', label: 'Fiches de paie générées / mois' },
  { icon: Users, value: 120, suffix: '+', label: 'Cabinets et entreprises actifs' },
  { icon: ShieldCheck, value: 100, suffix: '%', label: 'Conformité ONSS & DIMONA' },
  { icon: Clock, value: 70, suffix: '%', label: 'de temps administratif économisé' },
];

export function Stats() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <FadeIn key={stat.label} delay={i * 0.1}>
              <div className="h-full rounded-2xl border border-border/60 bg-card/60 p-6 shadow-sm backdrop-blur-sm">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <p className="mt-4 text-3xl font-bold text-foreground">
                  <Counter value={stat.value} suffix={stat.suffix} />
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </FadeIn>
          );
        })}
      </div>
    </section>
  );
}
