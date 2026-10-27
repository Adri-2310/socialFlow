'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ERROR_MESSAGES, FALLBACK } from '@/lib/salarie/form-messages';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

// Archiver ou restaurer le dossier d'un salarié (roles/03 § 4.2). Archiver demande une
// confirmation (le dossier disparaît des listes, il n'est jamais supprimé) ; restaurer est
// immédiat. `readOnly` évite un aller-retour inutile : le serveur reste seul juge (423).
export function SalarieArchiveActions({
  salarieId,
  nom,
  archive,
  readOnly,
  compact = false,
}: {
  salarieId: string;
  nom: string;
  archive: boolean;
  readOnly: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function envoyer() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/salaries/${salarieId}`, { method: archive ? 'PUT' : 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(ERROR_MESSAGES[body?.error] ?? FALLBACK);
        return;
      }
      router.refresh();
    } catch {
      setError(FALLBACK);
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={compact ? 'sm' : 'default'}
        onClick={archive ? envoyer : () => setConfirming(true)}
        disabled={readOnly || loading}
        title={readOnly ? 'Votre cabinet est en lecture seule.' : undefined}
        aria-label={archive ? `Restaurer le dossier de ${nom}` : `Archiver le dossier de ${nom}`}
        className={compact ? 'text-xs' : 'shrink-0'}
      >
        {loading ? (
          <Spinner />
        ) : archive ? (
          <ArchiveRestore aria-hidden="true" />
        ) : (
          <Archive aria-hidden="true" />
        )}
        {archive ? 'Restaurer' : 'Archiver'}
      </Button>
      {error && (
        <p role="alert" className="basis-full text-xs text-destructive-text">
          {error}
        </p>
      )}
      {confirming && (
        <ConfirmDialog
          title={`Archiver le dossier de ${nom} ?`}
          description="Le dossier disparaît des listes, mais n'est jamais supprimé : il reste conservé et peut être restauré depuis l'onglet « Archivés ». Son NISS reste réservé dans l'entreprise. L'action est inscrite à l'audit."
          confirmLabel="Archiver le dossier"
          loading={loading}
          onCancel={() => setConfirming(false)}
          onConfirm={envoyer}
        />
      )}
    </>
  );
}
