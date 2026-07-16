import { Mail, LifeBuoy, Clock } from 'lucide-react';
import { FadeIn } from '@/components/motion/fade-in';

const channels = [
  {
    icon: Mail,
    title: 'Ventes & démo',
    description: "Une question sur SocialFlow ou envie d'une démo personnalisée ?",
    email: 'contact@socialflow.com',
  },
  {
    icon: LifeBuoy,
    title: 'Support client',
    description: 'Déjà client ? Notre équipe vous aide sur toute question technique.',
    email: 'support@socialflow.com',
  },
];

export function Contact() {
  return (
    <section className="mx-auto max-w-4xl px-4 pb-24 sm:px-6 lg:px-8">
      <div className="grid gap-6 sm:grid-cols-2">
        {channels.map((channel, i) => {
          const Icon = channel.icon;
          return (
            <FadeIn key={channel.title} delay={i * 0.1}>
              <div className="flex h-full flex-col rounded-2xl border border-border/60 bg-gradient-to-br from-card/80 to-card/40 p-6 shadow-sm backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-lg">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-foreground">{channel.title}</h3>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">{channel.description}</p>
                <a
                  href={`mailto:${channel.email}`}
                  className="mt-4 text-sm font-semibold text-primary hover:underline"
                >
                  {channel.email}
                </a>
              </div>
            </FadeIn>
          );
        })}
      </div>
      <FadeIn delay={0.2}>
        <p className="mt-8 flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
          <Clock className="h-4 w-4 text-secondary" />
          Réponse sous 24h ouvrées
        </p>
      </FadeIn>
    </section>
  );
}
