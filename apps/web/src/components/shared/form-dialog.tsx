'use client';

import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const SIZES = {
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-2xl',
} as const;

// Boîte de dialogue d'un formulaire : icône, titre, description, puis le corps (`children`, le
// <form> avec ses boutons). Les appelants la montent seulement quand elle doit s'afficher
// (`{open && <FormDialog …>}`), elle est donc toujours ouverte, comme ConfirmDialog.
//
// Ni Échap ni un clic à l'extérieur ne la ferment : une saisie en cours ne doit pas se perdre
// par accident, et ces dialogues ne se fermaient que par « Annuler » avant shadcn. Le formulaire
// décide seul de sa fermeture (annulation, enregistrement réussi).
export function FormDialog({
  title,
  description,
  icon,
  size = 'md',
  children,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  size?: keyof typeof SIZES;
  children: ReactNode;
}) {
  return (
    <Dialog open disablePointerDismissal onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        className={cn('max-h-[90vh] gap-5 overflow-y-auto p-5 sm:p-6', SIZES[size])}
      >
        <DialogHeader className="flex-row items-start gap-4">
          {icon && (
            <span
              aria-hidden="true"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary [&_svg]:size-5"
            >
              {icon}
            </span>
          )}
          <div className="space-y-1">
            <DialogTitle className="text-lg font-semibold text-foreground">{title}</DialogTitle>
            {description && (
              <DialogDescription className="text-sm text-muted-foreground">
                {description}
              </DialogDescription>
            )}
          </div>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
