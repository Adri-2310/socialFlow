import { ShieldCheck, Sparkles, Lock } from 'lucide-react';
import { FadeIn } from '@/components/motion/fade-in';

const values = [
  {
    icon: ShieldCheck,
    title: 'Conformité d\'abord',
    description:
      'ONSS, DIMONA, C4 : chaque fonctionnalité est pensée pour rester alignée avec la réglementation sociale belge, sans effort de votre part.',
  },
  {
    icon: Sparkles,
    title: 'Simplicité radicale',
    description:
      "La paie est complexe, l'outil ne doit pas l'être. Chaque écran est conçu pour que cabinets, entreprises et salariés s'y retrouvent immédiatement.",
  },
  {
    icon: Lock,
    title: 'Confiance & sécurité',
    description:
      'Les données de paie sont sensibles. Elles sont chiffrées, cloisonnées par rôle et hébergées dans l\'Union européenne.',
  },
];

export function About() {
  return (
    <section className="mx-auto max-w-5xl px-4 pb-24 sm:px-6 lg:px-8">
      <FadeIn>
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-base leading-relaxed text-muted-foreground">
            La gestion de la paie en Belgique implique de jongler entre secrétariats sociaux,
            gestionnaires, entreprises clientes et salariés, chacun avec ses propres outils et
            échéances. SocialFlow réunit tous ces acteurs sur une seule plateforme, pour que la
            paie cesse d&apos;être une source de friction et redevienne un sujet simple.
          </p>
        </div>
      </FadeIn>

      <div className="mt-16 grid gap-6 sm:grid-cols-3">
        {values.map((value, i) => {
          const Icon = value.icon;
          return (
            <FadeIn key={value.title} delay={i * 0.1}>
              <div className="h-full rounded-2xl border border-border/60 bg-gradient-to-br from-card/80 to-card/40 p-6 shadow-sm backdrop-blur-sm">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-foreground">{value.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {value.description}
                </p>
              </div>
            </FadeIn>
          );
        })}
      </div>
    </section>
  );
}
