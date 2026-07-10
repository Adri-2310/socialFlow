import {
  Shield,
  Building2,
  UserCog,
  BriefcaseIcon,
  User,
} from 'lucide-react';

export function Roles() {
  const roles = [
    {
      icon: Shield,
      title: 'Super Admin',
      description: 'Pilotage global de la plateforme et des cabinets.',
      colorClass: 'bg-primary/10 text-primary',
    },
    {
      icon: Building2,
      title: 'Cabinet RH',
      description: 'Gestion des clients, gestionnaires et facturation.',
      colorClass: 'bg-secondary/10 text-secondary',
    },
    {
      icon: UserCog,
      title: 'Gestionnaire',
      description: 'Production des paies et suivi des échéances.',
      colorClass: 'bg-primary/10 text-primary',
    },
    {
      icon: BriefcaseIcon,
      title: 'Entreprise cliente',
      description: 'Consultation des employés et des fiches.',
      colorClass: 'bg-secondary/10 text-secondary',
    },
    {
      icon: User,
      title: 'Salarié',
      description: 'Accès à sa fiche de paie et à son contrat.',
      colorClass: 'bg-primary/10 text-primary',
    },
  ];

  return (
    <section id="roles" className="border-y border-border bg-muted py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-wider text-primary">
            Pour qui ?
          </span>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Une plateforme, cinq expériences
          </h2>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          {roles.map((role) => {
            const Icon = role.icon;
            return (
              <div
                key={role.title}
                className="rounded-2xl border border-border bg-card p-5 text-center"
              >
                <span className={`mx-auto grid h-12 w-12 place-items-center rounded-full ${role.colorClass}`}>
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="mt-3 font-semibold text-foreground">{role.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {role.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
