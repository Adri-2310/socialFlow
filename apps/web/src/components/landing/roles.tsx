import {
  Building2,
  UserCog,
  BriefcaseIcon,
  User,
} from 'lucide-react';
import { FadeIn } from '@/components/motion/fade-in';

const roles = [
  {
    icon: Building2,
    title: 'Cabinet RH',
    description: 'Gestion des clients, gestionnaires et facturation.',
    features: ['Multi-clients', 'Gestion des équipes', 'Facturation centralisée'],
  },
  {
    icon: UserCog,
    title: 'Gestionnaire',
    description: 'Production des paies et suivi des échéances.',
    features: ['Fiches de paie', 'Calendrier ONSS', 'Déclarations DIMONA & C4'],
  },
  {
    icon: BriefcaseIcon,
    title: 'Entreprise cliente',
    description: 'Consultation des employés et des fiches.',
    features: ['Portail dédié', 'Suivi des employés', 'Documents centralisés'],
  },
  {
    icon: User,
    title: 'Salarié',
    description: 'Accès à sa fiche de paie et à son contrat.',
    features: ['Fiches de paie en ligne', 'Contrat et documents', 'Notifications'],
  },
];

export function Roles() {
  return (
    <section className="mx-auto max-w-3xl px-4 pb-24 sm:px-6 lg:px-8">
      <div className="relative">
        {/* Ligne de flux verticale */}
        <div className="absolute left-6 top-6 bottom-6 w-px bg-gradient-to-b from-primary/50 via-border to-secondary/50 sm:left-7" />

        <div className="space-y-6">
          {roles.map((role, i) => {
            const Icon = role.icon;
            return (
              <FadeIn key={role.title} delay={i * 0.08}>
                <div className="relative flex items-start gap-5">
                  {/* Numéro */}
                  <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-4 border-background bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-lg sm:h-14 sm:w-14">
                    <span className="text-sm font-bold">{i + 1}</span>
                  </div>

                  <div className="flex-1 rounded-2xl border border-border/60 bg-gradient-to-br from-card/80 to-card/40 p-6 shadow-sm backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-lg">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </span>
                      <h3 className="text-lg font-semibold text-foreground">{role.title}</h3>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">{role.description}</p>
                    <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
                      {role.features.map((feature) => (
                        <li key={feature} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="h-1 w-1 shrink-0 rounded-full bg-secondary" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </FadeIn>
            );
          })}
        </div>
      </div>
    </section>
  );
}
