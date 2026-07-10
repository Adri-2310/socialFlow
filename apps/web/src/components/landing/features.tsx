import {
  FileText,
  CalendarClock,
  Send,
  LayoutDashboard,
  Lock,
  MessagesSquare,
} from 'lucide-react';

export function Features() {
  const features = [
    {
      icon: FileText,
      title: 'Fiches de paie automatisées',
      description:
        'Calcul en temps réel du brut, des cotisations ONSS et du précompte professionnel. Export PDF en un clic.',
      bgColor: 'bg-primary/10',
      textColor: 'text-primary',
    },
    {
      icon: CalendarClock,
      title: 'Calendrier ONSS intelligent',
      description:
        'Alertes automatiques J-7, J-3 et J-1 avant chaque échéance trimestrielle. Ne ratez plus jamais une déclaration.',
      bgColor: 'bg-secondary/10',
      textColor: 'text-secondary',
    },
    {
      icon: Send,
      title: 'Déclarations DIMONA & C4',
      description:
        'Entrées et sorties de travailleurs transmises directement, avec suivi du statut et accusés de réception.',
      bgColor: 'bg-primary/10',
      textColor: 'text-primary',
    },
    {
      icon: LayoutDashboard,
      title: 'Portails dédiés',
      description:
        'Un espace sur mesure pour chaque acteur : cabinet, gestionnaire, entreprise cliente et salarié.',
      bgColor: 'bg-secondary/10',
      textColor: 'text-secondary',
    },
    {
      icon: Lock,
      title: 'Sécurité & RGPD',
      description:
        'Hébergement en Europe, chiffrement, 2FA et journal d\'audit complet pour une traçabilité totale.',
      bgColor: 'bg-primary/10',
      textColor: 'text-primary',
    },
    {
      icon: MessagesSquare,
      title: 'Messagerie intégrée',
      description:
        'Échangez documents et questions avec vos clients et salariés sans quitter la plateforme.',
      bgColor: 'bg-secondary/10',
      textColor: 'text-secondary',
    },
  ];

  return (
    <section id="features" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <span className="text-sm font-semibold uppercase tracking-wider text-primary">
          Fonctionnalités
        </span>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Tout le cycle de paie, sans friction
        </h2>
        <p className="mt-4 text-muted-foreground">
          De la fiche de paie à la déclaration DIMONA, chaque étape est automatisée et conforme à la
          législation sociale belge.
        </p>
      </div>
      <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <div
              key={feature.title}
              className="group rounded-2xl border border-border bg-card p-6 transition hover:-translate-y-1 hover:shadow-md"
            >
              <span className={`grid h-11 w-11 place-items-center rounded-xl ${feature.bgColor} ${feature.textColor}`}>
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-semibold text-foreground">{feature.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {feature.description}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
