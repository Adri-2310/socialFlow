import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { statusEntry, type StatusDomain, type StatusTone } from '@/lib/status/status-badges';

// Classes de chaque ton. Les couleurs fixes (vert, ambre) sont choisies pour atteindre 4,5:1 sur
// leur propre teinte, en clair et en sombre (D62) ; le teal de la marque (`--secondary`) ne le
// permettait pas pour « actif ». `info` teinte le fond avec la couleur du cabinet (`--primary`)
// mais garde le texte `--foreground` : le texte `--primary` sur sa propre teinte tombe à 3,4:1
// en sombre, et D62 ne garantit 4,5:1 que sur le fond de page.
export const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
  info: 'bg-primary/15 text-foreground',
  warning: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  danger: 'bg-destructive/10 text-destructive-text',
  neutral: 'bg-muted text-muted-foreground',
};

// Pastille de statut : le seul endroit qui associe un statut à un libellé et à un ton. `label`
// remplace le libellé du registre quand l'état est plus précis (ex. « Suspendu · lecture seule »,
// D71) ; `dot` ajoute le point de la facturation ; `icon` précède le libellé (période verrouillée).
export function StatusBadge({
  domain,
  status,
  label,
  dot = false,
  icon,
  className,
}: {
  domain: StatusDomain;
  status: string;
  label?: string;
  dot?: boolean;
  icon?: ReactNode;
  className?: string;
}) {
  const entry = statusEntry(domain, status);
  return (
    <Badge
      variant="secondary"
      data-tone={entry.tone}
      className={cn('h-auto px-2 py-0.5 font-semibold', TONE_CLASSES[entry.tone], className)}
    >
      {dot && (
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      )}
      {icon}
      {label ?? entry.label}
    </Badge>
  );
}
