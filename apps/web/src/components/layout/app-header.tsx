import Link from 'next/link';
import Image from 'next/image';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/layout/user-menu';

// Header partage par les pages sans sidebar admin (/dashboard generique,
// /profil). AdminShell garde sa propre topbar (avec sa sidebar) mais
// reutilise UserMenu pour le meme comportement de deconnexion/profil. Meme
// logo que navbar.tsx/auth-brand-panel.tsx (Image /logo-simple.png), pas une
// icone generique, pour rester coherent avec le reste de l'app.
export function AppHeader({ userName, roleLabel }: { userName: string; roleLabel: string }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur-md sm:px-6">
      <Link href="/dashboard" className="flex items-center gap-2">
        <Image src="/logo-simple.png" alt="SocialFlow" width={36} height={36} className="rounded-xl" />
        <span className="text-sm font-bold text-foreground">
          Social<span className="text-primary dark:text-indigo-400">Flow</span>
        </span>
      </Link>
      <div className="ml-auto flex items-center gap-3">
        <ThemeToggle />
        <UserMenu userName={userName} roleLabel={roleLabel} />
      </div>
    </header>
  );
}
