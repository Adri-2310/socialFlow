import type { ReactNode } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

export type NoticeTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

// Teinte et couleur du titre de chaque ton. Les couleurs fixes (vert, ambre) sont choisies pour
// atteindre 4,5:1 sur leur propre teinte, en clair et en sombre (D62) : le teal de la marque
// (`--secondary`) ne le permettait pas pour les messages de succès. Le ton `info` garde le texte
// `--foreground` : le texte `--primary` sur sa propre teinte tombe à 3,4:1 en sombre.
export const NOTICE_TONE_CLASSES: Record<NoticeTone, string> = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
  info: 'border-border bg-primary/10 text-foreground',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  danger: 'border-destructive/30 bg-destructive/10 text-destructive-text',
  neutral: 'border-border bg-muted/60 text-foreground',
};

const ICONS = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  danger: AlertOctagon,
  neutral: Info,
} satisfies Record<NoticeTone, typeof Info>;

// Bandeau ou message d'état : icône, titre facultatif, texte et action facultative. Remplace les
// bandeaux et les messages colorés écrits à la main. `role` vaut « status » pour une information
// annoncée poliment (enregistrement réussi, état du compte) et « alert » pour une erreur qui
// doit interrompre le lecteur d'écran.
export function Notice({
  tone,
  title,
  icon,
  role = 'status',
  action,
  className,
  children,
}: {
  tone: NoticeTone;
  title?: string;
  // Une icône lucide (un <svg> direct) qui remplace celle du ton.
  icon?: ReactNode;
  role?: 'status' | 'alert';
  // Lien ou bouton sous le texte (« Mettre à jour ma carte »).
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const DefaultIcon = ICONS[tone];
  return (
    <Alert
      role={role}
      data-tone={tone}
      className={cn('gap-y-1 rounded-2xl p-4', NOTICE_TONE_CLASSES[tone], className)}
    >
      {icon ?? <DefaultIcon aria-hidden="true" className="size-5" />}
      {title && <AlertTitle className="text-sm font-semibold">{title}</AlertTitle>}
      {(children || action) && (
        <AlertDescription className="text-sm text-foreground/80">
          {children}
          {action && <div className="mt-2">{action}</div>}
        </AlertDescription>
      )}
    </Alert>
  );
}
