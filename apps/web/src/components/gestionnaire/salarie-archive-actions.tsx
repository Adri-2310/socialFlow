'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, Loader2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ERROR_MESSAGES, FALLBACK } from '@/lib/salarie/form-messages';

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

  const bouton = compact
    ? 'inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60'
    : 'flex shrink-0 items-center justify-center gap-2 rounded-xl border border-input px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60';
  const icone = compact ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <>
      <button
        type="button"
        onClick={archive ? envoyer : () => setConfirming(true)}
        disabled={readOnly || loading}
        title={readOnly ? 'Votre cabinet est en lecture seule.' : undefined}
        aria-label={archive ? `Restaurer le dossier de ${nom}` : `Archiver le dossier de ${nom}`}
        className={bouton}
      >
        {loading ? (
          <Loader2 className={`${icone} animate-spin`} />
        ) : archive ? (
          <ArchiveRestore className={icone} />
        ) : (
          <Archive className={icone} />
        )}
        {archive ? 'Restaurer' : 'Archiver'}
      </button>
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
