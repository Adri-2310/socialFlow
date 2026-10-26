'use client';

import { AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Spinner } from '@/components/ui/spinner';

// Modale de confirmation générique, à réutiliser pour toute action destructive. Les appelants
// la montent seulement quand la confirmation est demandée (`{open && <ConfirmDialog … />}`) :
// elle est donc toujours ouverte, et c'est `onCancel` qui la ferme (bouton Annuler ou Échap).
// Pendant `loading`, Échap est ignoré et les deux boutons sont désactivés : l'action en cours
// ne peut pas être abandonnée à mi-chemin.
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  loading,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !loading) onCancel();
      }}
    >
      <AlertDialogContent className="p-5 data-[size=default]:sm:max-w-md sm:p-6">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <AlertTriangle aria-hidden="true" />
          </AlertDialogMedia>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Annuler</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading && <Spinner />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
