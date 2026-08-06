import Link from 'next/link';
import { Waves } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/layout/user-menu';

// Header partage par les pages sans sidebar admin (/dashboard generique,
// /profil). AdminShell garde sa propre topbar (avec sa sidebar) mais
// reutilise UserMenu pour le meme comportement de deconnexion/profil.
export function AppHeader({ userName, roleLabel }: { userName: string; roleLabel: string }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur-md sm:px-6">
      <Link href="/dashboard" className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Waves className="h-5 w-5" />
        </span>
        <span className="text-sm font-bold text-foreground">SocialFlow</span>
      </Link>
      <div className="ml-auto flex items-center gap-3">
        <ThemeToggle />
        <UserMenu userName={userName} roleLabel={roleLabel} />
      </div>
    </header>
  );
}
