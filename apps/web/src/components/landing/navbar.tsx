'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Menu, X, ChevronDown } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const links = [
  { href: '/', label: 'Accueil' },
  { href: '/fonctionnalites', label: 'Fonctionnalités' },
  { href: '/pour-qui', label: 'Pour qui ?' },
  { href: '/tarifs', label: 'Tarifs' },
  { href: '/faq', label: 'FAQ' },
];

const companyLinks = [
  { href: '/a-propos', label: 'À propos' },
  { href: '/contact', label: 'Contact' },
];

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const isCompanyActive = companyLinks.some((link) => link.href === pathname);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-card/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/logo-simple.png"
            alt="SocialFlow"
            width={36}
            height={36}
            className="rounded-xl"
            priority
          />
          <span className="text-lg font-bold tracking-tight">
            Social<span className="text-primary dark:text-indigo-400">Flow</span>
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-8 md:flex">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition ${
                  active ? 'text-primary dark:text-indigo-300' : 'text-muted-foreground hover:text-primary'
                }`}
              >
                {link.label}
              </Link>
            );
          })}

          {/* Menu « Entreprise » : s'ouvre au survol, au clic et au clavier (flèches, Échap). */}
          <DropdownMenu>
            <DropdownMenuTrigger
              openOnHover
              render={
                <Button
                  type="button"
                  variant="ghost"
                  className={`h-auto gap-1 rounded-none p-0 text-sm font-medium hover:bg-transparent ${
                    isCompanyActive
                      ? 'text-primary hover:text-primary dark:text-indigo-300 dark:hover:text-indigo-300'
                      : 'text-muted-foreground hover:text-primary'
                  }`}
                />
              }
            >
              Entreprise
              <ChevronDown aria-hidden="true" className="size-3.5 transition group-aria-expanded/button:rotate-180" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-44 rounded-xl p-1.5">
              {companyLinks.map((link) => {
                const active = pathname === link.href;
                return (
                  <DropdownMenuItem
                    key={link.href}
                    render={<Link href={link.href} aria-current={active ? 'page' : undefined} />}
                    className={`px-3 py-2 text-sm font-medium ${
                      active ? 'bg-primary/10 text-primary dark:text-indigo-300' : 'text-muted-foreground hover:text-primary'
                    }`}
                  >
                    {link.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/login"
            className={buttonVariants({ variant: 'ghost', className: 'hidden h-9 sm:inline-flex' })}
          >
            Se connecter
          </Link>
          <Link href="/register" className={buttonVariants({ className: 'h-9 shadow-md hover:opacity-90' })}>
            Essai gratuit
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={mobileMenuOpen}
            aria-controls="navbar-mobile-menu"
            className="md:hidden"
          >
            {mobileMenuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
          </Button>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div id="navbar-mobile-menu" className="border-t border-border px-4 py-3 md:hidden">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                  active ? 'bg-muted text-primary dark:text-indigo-300' : 'hover:bg-muted'
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            );
          })}
          <div className="mt-2 border-t border-border pt-2">
            {companyLinks.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                    active ? 'bg-muted text-primary dark:text-indigo-300' : 'hover:bg-muted'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
          <div className="mt-2 border-t border-border pt-2">
            <Link
              href="/login"
              className="block rounded-lg px-3 py-2 text-sm font-semibold hover:bg-muted"
              onClick={() => setMobileMenuOpen(false)}
            >
              Se connecter
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
