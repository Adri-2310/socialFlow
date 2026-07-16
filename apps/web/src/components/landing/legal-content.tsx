import { AlertTriangle } from 'lucide-react';
import { FadeIn } from '@/components/motion/fade-in';

export function LegalContent({
  updatedAt,
  sections,
}: {
  updatedAt: string;
  sections: { title: string; body: string[] }[];
}) {
  return (
    <section className="mx-auto max-w-3xl px-4 pb-24 sm:px-6 lg:px-8">
      <FadeIn>
        <div className="flex items-start gap-3 rounded-2xl border border-secondary/30 bg-secondary/10 p-4 text-sm text-secondary">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Ce document est un modèle fourni à titre indicatif et doit être validé par un
            professionnel du droit avant toute mise en production.
          </p>
        </div>
        <p className="mt-6 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Dernière mise à jour : {updatedAt}
        </p>
      </FadeIn>
      <div className="mt-6 space-y-8">
        {sections.map((section, i) => (
          <FadeIn key={section.title} delay={i * 0.05}>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{section.title}</h2>
              <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted-foreground">
                {section.body.map((paragraph, j) => (
                  <p key={j}>{paragraph}</p>
                ))}
              </div>
            </div>
          </FadeIn>
        ))}
      </div>
    </section>
  );
}
