'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User, LogOut, Loader2 } from 'lucide-react';
import { signOut } from '@/lib/auth-client';

// Point d'acces unique et commun a tous les roles pour "Mon profil" et la
// deconnexion (remplace l'ancien LogoutButton, supprime). Le declencheur est
// le bloc avatar + nom + role (comme l'ancienne topbar statique de
// AdminShell), pas une icone hamburger separee - distinct du hamburger
// mobile de AdminShell, qui lui ouvre/ferme la sidebar de nav.
export function UserMenu({ userName, roleLabel }: { userName: string; roleLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    await signOut();
    router.push('/au-revoir');
    router.refresh();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu du compte"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition hover:bg-muted"
      >
        <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {userName.slice(0, 2).toUpperCase()}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-semibold leading-none text-foreground">{userName}</span>
          <span className="block text-xs text-muted-foreground">{roleLabel}</span>
        </span>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-border bg-card p-1.5 shadow-lg">
          <div className="border-b border-border px-3 py-2">
            <p className="truncate text-sm font-semibold text-foreground">{userName}</p>
            <p className="text-xs text-muted-foreground">{roleLabel}</p>
          </div>
          <Link
            href="/profil"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground transition hover:bg-muted"
          >
            <User className="h-4 w-4" /> Mon profil
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}
