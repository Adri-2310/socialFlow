import { Building2, Landmark, Briefcase, Users, Calculator, Scale } from 'lucide-react';

export function TrustBadges() {
  const badges = [
    { icon: Building2, label: 'Payroll BXL' },
    { icon: Landmark, label: 'SocSecr Wallonie' },
    { icon: Briefcase, label: 'RH Gent' },
    { icon: Users, label: 'Antwerp HR' },
    { icon: Calculator, label: 'Fisc & Paie' },
    { icon: Scale, label: 'Liège Social' },
  ];

  return (
    <section className="border-y border-border bg-muted">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Utilisé par les secrétariats sociaux et cabinets RH partout en Belgique
        </p>
        <div className="mt-6 grid grid-cols-2 items-center gap-6 opacity-70 sm:grid-cols-3 md:grid-cols-6">
          {badges.map((badge) => {
            const Icon = badge.icon;
            return (
              <div
                key={badge.label}
                className="flex items-center justify-center gap-2 text-muted-foreground"
              >
                <Icon className="h-5 w-5" />
                <span className="text-sm font-semibold">{badge.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
