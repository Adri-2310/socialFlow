'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User, LogOut } from 'lucide-react';
import { signOut } from '@/lib/auth/auth-client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';

// Point d'acces unique et commun a tous les roles pour "Mon profil" et la
// deconnexion (remplace l'ancien LogoutButton, supprime). Le declencheur est
// le bloc avatar + nom + role (comme l'ancienne topbar statique de
// DashboardShell), pas une icone hamburger separee - distinct du hamburger
// mobile de DashboardShell, qui lui ouvre/ferme la sidebar de nav.
// `logoutHref` : ou aller apres la deconnexion. Un compte de cabinet client revient sur
// le portail de son cabinet (D76) et non sur une page SocialFlow.
// Le menu est un DropdownMenu : fleches, Echap et clic exterieur sont geres par la bibliotheque.
export function UserMenu({
  userName,
  roleLabel,
  logoutHref,
}: {
  userName: string;
  roleLabel: string;
  logoutHref?: string;
}) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await signOut();
    router.push(logoutHref ?? '/au-revoir');
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            aria-label="Menu du compte"
            className="h-auto gap-2 py-1 pl-1 pr-2"
          />
        }
      >
        <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {userName.slice(0, 2).toUpperCase()}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-semibold leading-none text-foreground">{userName}</span>
          <span className="block text-xs text-muted-foreground">{roleLabel}</span>
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56 rounded-xl p-1.5">
        <div className="border-b border-border px-3 py-2">
          <p className="truncate text-sm font-semibold text-foreground">{userName}</p>
          <p className="text-xs text-muted-foreground">{roleLabel}</p>
        </div>
        <DropdownMenuItem render={<Link href="/profil" />} className="px-3 py-2">
          <User /> Mon profil
        </DropdownMenuItem>
        {/* Reste ouvert pendant la deconnexion : l'indicateur d'envoi doit rester visible. */}
        <DropdownMenuItem
          variant="destructive"
          closeOnClick={false}
          disabled={loggingOut}
          onClick={handleLogout}
          // D62 : `--destructive` est illisible en sombre, le texte prend `--destructive-text`.
          className="px-3 py-2 data-[variant=destructive]:text-destructive-text data-[variant=destructive]:focus:text-destructive-text data-[variant=destructive]:*:[svg]:text-destructive-text"
        >
          {loggingOut ? <Spinner /> : <LogOut />}
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
