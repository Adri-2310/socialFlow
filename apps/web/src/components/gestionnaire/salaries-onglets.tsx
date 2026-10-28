import Link from 'next/link';
import { cn } from '@/lib/utils';

// Le texte de l'onglet actif prend la couleur du cabinet (`--primary`) et se souligne, sur le fond
// de la page : c'est le seul fond sur lequel D62 garantit 4,5:1 (une teinte de `--primary` posée
// derrière le texte ne le garantit pas).
const ONGLET = '-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition';
const ONGLET_ACTIF = 'border-primary text-primary';
const ONGLET_INACTIF =
  'border-transparent text-muted-foreground hover:border-border hover:text-foreground';

// Navigation entre les dossiers actifs et archivés d'une entreprise. Ce sont deux pages (le
// paramètre `?archives=1`), donc des liens et non des onglets avec panneaux : l'onglet courant
// l'annonce par `aria-current`.
export function SalariesOnglets({
  base,
  archives,
  nbArchives,
}: {
  base: string;
  archives: boolean;
  nbArchives: number;
}) {
  return (
    <nav aria-label="Dossiers" className="flex gap-1 border-b border-border">
      <Link
        href={base}
        aria-current={archives ? undefined : 'page'}
        className={cn(ONGLET, archives ? ONGLET_INACTIF : ONGLET_ACTIF)}
      >
        Actifs
      </Link>
      <Link
        href={`${base}?archives=1`}
        aria-current={archives ? 'page' : undefined}
        className={cn(ONGLET, archives ? ONGLET_ACTIF : ONGLET_INACTIF)}
      >
        Archivés ({nbArchives})
      </Link>
    </nav>
  );
}
