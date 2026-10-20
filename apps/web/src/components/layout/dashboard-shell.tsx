'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  Users,
  Activity,
  ScrollText,
  CreditCard,
  Settings,
  Menu,
} from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/layout/user-menu';

type NavItem = { label: string; icon: typeof LayoutDashboard; href?: string };

type ShellConfig = { consoleLabel: string; roleLabel: string; nav: NavItem[] };

// Navigation et libelles par role. Vit ici (composant client) plutot que
// d'etre passee en props depuis le layout serveur : les icones lucide sont
// des composants, non serialisables a travers la frontiere serveur/client.
// Une entree sans href s'affiche "Bientot" (page pas encore construite), a
// retirer au fil des passes - meme convention que celle qu'avait AdminShell.
const SHELL_CONFIG = {
  SUPER_ADMIN: {
    consoleLabel: 'Console SuperAdmin',
    roleLabel: 'SuperAdmin',
    nav: [
      { label: "Vue d'ensemble", icon: LayoutDashboard, href: '/dashboard/admin' },
      { label: 'Cabinets', icon: Building2, href: '/dashboard/admin/cabinets' },
      { label: 'Utilisateurs', icon: Users, href: '/dashboard/admin/utilisateurs' },
      { label: 'Monitoring', icon: Activity, href: '/dashboard/admin/monitoring' },
      { label: "Journal d'audit", icon: ScrollText, href: '/dashboard/admin/audit' },
      { label: 'Facturation', icon: CreditCard, href: '/dashboard/admin/facturation' },
      { label: 'Configuration', icon: Settings, href: '/dashboard/admin/configuration' },
    ],
  },
  CABINET_RH: {
    consoleLabel: 'Espace Cabinet RH',
    roleLabel: 'Cabinet RH',
    nav: [
      { label: "Vue d'ensemble", icon: LayoutDashboard, href: '/dashboard/cabinet' },
      { label: 'Gestionnaires', icon: Users, href: '/dashboard/cabinet/gestionnaires' },
      { label: 'Entreprises', icon: Building2, href: '/dashboard/cabinet/entreprises' },
      { label: 'Mon abonnement', icon: CreditCard, href: '/dashboard/cabinet/facturation' },
      { label: "Journal d'audit", icon: ScrollText, href: '/dashboard/cabinet/audit' },
      { label: 'Paramètres', icon: Settings, href: '/dashboard/cabinet/parametres' },
    ],
  },
  // Espace du Gestionnaire RH (roles/03) : ses entreprises assignées, puis leurs
  // salariés. Les prestations, fiches et déclarations s'ajouteront avec leurs chantiers.
  GESTIONNAIRE_RH: {
    consoleLabel: 'Espace Gestionnaire',
    roleLabel: 'Gestionnaire RH',
    nav: [{ label: 'Mes entreprises', icon: Building2, href: '/dashboard/gestionnaire' }],
  },
  // Portail de l'administrateur d'une entreprise cliente (roles/04). Une seule
  // page pour l'instant ; les autres entrees arrivent avec le portail.
  ENTREPRISE_CLIENTE: {
    consoleLabel: 'Espace Entreprise',
    roleLabel: 'Entreprise cliente',
    nav: [{ label: 'Accueil', icon: LayoutDashboard, href: '/dashboard/entreprise' }],
  },
} satisfies Record<string, ShellConfig>;

export type ShellRole = keyof typeof SHELL_CONFIG;

export function DashboardShell({
  role,
  userName,
  brandName,
  logoUrl,
  logoutHref,
  children,
}: {
  role: ShellRole;
  userName: string;
  // Nom affiche du cabinet (D33) : remplace "SocialFlow" dans la sidebar.
  // Absent = identite SocialFlow (console SuperAdmin, cabinet sans nom).
  brandName?: string | null;
  // Logo du cabinet (D33) : remplace le logo SocialFlow. URL publique (Blob).
  logoUrl?: string | null;
  // Destination apres deconnexion (D76) : le portail du cabinet pour ses clients.
  logoutHref?: string;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { consoleLabel, roleLabel, nav }: ShellConfig = SHELL_CONFIG[role];
  const activeItem = nav.find((item) => item.href === pathname) ?? nav[0];

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-sidebar-border bg-sidebar transition-transform lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL externe (Blob), taille fixe
            <img
              src={logoUrl}
              alt={brandName ?? 'Logo du cabinet'}
              width={36}
              height={36}
              className="h-9 w-9 rounded-xl object-contain"
            />
          ) : (
            <Image
              src="/logo-simple.png"
              alt="SocialFlow"
              width={36}
              height={36}
              className="rounded-xl"
            />
          )}
          <div>
            {brandName ? (
              <>
                <p className="max-w-[9.5rem] truncate text-sm font-bold leading-none text-sidebar-foreground">
                  {brandName}
                </p>
                <p className="text-[11px] font-medium text-muted-foreground">{consoleLabel}</p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold leading-none text-sidebar-foreground">
                  Social<span className="text-primary dark:text-indigo-400">Flow</span>
                </p>
                <p className="text-[11px] font-medium text-muted-foreground">{consoleLabel}</p>
              </>
            )}
          </div>
        </div>
        <nav className="space-y-1 p-3 text-sm">
          {nav.map((item) =>
            item.href ? (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 font-semibold transition ${
                  item.href === pathname
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/60'
                }`}
              >
                <item.icon className="h-4 w-4" /> {item.label}
              </Link>
            ) : (
              <span
                key={item.label}
                className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 font-medium text-muted-foreground"
              >
                <span className="flex items-center gap-3">
                  <item.icon className="h-4 w-4" /> {item.label}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">
                  Bientôt
                </span>
              </span>
            ),
          )}
        </nav>
        {brandName && (
          <p className="absolute inset-x-0 bottom-0 border-t border-sidebar-border px-5 py-3 text-[11px] text-muted-foreground">
            Propulsé par SocialFlow
          </p>
        )}
      </aside>

      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      )}

      <div className="flex-1 lg:ml-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur-md sm:px-6">
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="truncate text-base font-bold text-foreground">{activeItem.label}</h1>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <UserMenu userName={userName} roleLabel={roleLabel} logoutHref={logoutHref} />
          </div>
        </header>
        <main className="space-y-6 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
