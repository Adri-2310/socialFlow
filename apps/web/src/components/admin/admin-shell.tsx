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

// Reprend la nav de la maquette (voir doc/analysis + maquette 03-dashboard-
// superadmin.html). Cabinets, Utilisateurs et Journal d'audit ont maintenant
// leur propre page ; le reste n'en a pas encore - pas de lien mort, juste une
// puce "Bientot".
const NAV_ITEMS: { label: string; icon: typeof LayoutDashboard; href?: string }[] = [
  { label: "Vue d'ensemble", icon: LayoutDashboard, href: '/dashboard/admin' },
  { label: 'Cabinets', icon: Building2, href: '/dashboard/admin/cabinets' },
  { label: 'Utilisateurs', icon: Users, href: '/dashboard/admin/utilisateurs' },
  { label: 'Monitoring', icon: Activity },
  { label: "Journal d'audit", icon: ScrollText, href: '/dashboard/admin/audit' },
  { label: 'Facturation', icon: CreditCard },
  { label: 'Configuration', icon: Settings },
];

export function AdminShell({ userName, children }: { userName: string; children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const activeItem = NAV_ITEMS.find((item) => item.href === pathname) ?? NAV_ITEMS[0];

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-sidebar-border bg-sidebar transition-transform lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
          <Image src="/logo-simple.png" alt="SocialFlow" width={36} height={36} className="rounded-xl" />
          <div>
            <p className="text-sm font-bold leading-none text-sidebar-foreground">
              Social<span className="text-primary dark:text-indigo-400">Flow</span>
            </p>
            <p className="text-[11px] font-medium text-muted-foreground">Console SuperAdmin</p>
          </div>
        </div>
        <nav className="space-y-1 p-3 text-sm">
          {NAV_ITEMS.map((item) =>
            item.href ? (
              <Link
                key={item.label}
                href={item.href}
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
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">Bientôt</span>
              </span>
            ),
          )}
        </nav>
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
          <h1 className="text-base font-bold text-foreground">{activeItem.label}</h1>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <UserMenu userName={userName} roleLabel="SuperAdmin" />
          </div>
        </header>
        <main className="space-y-6 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
