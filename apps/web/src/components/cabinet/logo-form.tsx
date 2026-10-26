'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

const MAX_BYTES = 1024 * 1024;

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Session expirée. Reconnectez-vous.',
  FORBIDDEN: 'Seul le titulaire du cabinet peut modifier le logo.',
  CABINET_NOT_FOUND: 'Cabinet introuvable.',
  CABINET_READ_ONLY:
    'Votre cabinet est en lecture seule : régularisez votre abonnement pour reprendre les modifications.',
  LOGO_REQUIRED: 'Choisissez un fichier.',
  LOGO_TOO_LARGE: 'Le fichier dépasse 1 Mo.',
  LOGO_INVALID_TYPE: 'Format non pris en charge : utilisez un PNG ou un SVG.',
  LOGO_SVG_UNSAFE:
    'Ce SVG contient des éléments non autorisés (script, lien externe…). Exportez-le à nouveau sans.',
  LOGO_STORAGE_UNAVAILABLE: "L'envoi de logo n'est pas disponible pour le moment.",
  LOGO_STORAGE_FAILED: "L'enregistrement du logo a échoué. Réessayez dans un instant.",
};

const FALLBACK = 'Une erreur est survenue. Veuillez réessayer.';

// Logo du cabinet (D33, D62) : PNG ou SVG, 1 Mo maximum. Le serveur controle
// le contenu reel du fichier ; la verification ici evite seulement un envoi
// inutile.
export function LogoForm({
  logoUrl,
  cabinetName,
  readOnly,
}: {
  logoUrl: string | null;
  cabinetName: string;
  readOnly: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function send(request: () => Promise<Response>, success: string) {
    setError(null);
    setDone(null);
    setLoading(true);
    try {
      const res = await request();
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(ERROR_MESSAGES[body?.error] ?? FALLBACK);
        return;
      }
      setDone(success);
      router.refresh();
    } catch {
      setError(FALLBACK);
    } finally {
      setLoading(false);
      if (input.current) input.current.value = '';
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setDone(null);
      setError(ERROR_MESSAGES.LOGO_TOO_LARGE);
      e.target.value = '';
      return;
    }
    const data = new FormData();
    data.append('logo', file);
    void send(
      () => fetch('/api/cabinet/settings/logo', { method: 'POST', body: data }),
      'Logo enregistré.',
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 className="text-sm font-bold text-foreground">Logo</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        PNG ou SVG, 1 Mo maximum. Il remplace le logo SocialFlow dans votre espace.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-background">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL externe (Blob), taille fixe
            <img
              src={logoUrl}
              alt={`Logo de ${cabinetName}`}
              className="h-full w-full object-contain p-1"
            />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground" aria-hidden />
          )}
        </span>

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Le sélecteur de fichier natif reste masqué : le bouton visible l'ouvre, et
                reçoit le focus au clavier (l'ancien label déguisé en bouton ne l'avait pas). */}
            <Input
              ref={input}
              id="logo"
              type="file"
              accept="image/png,image/svg+xml,.png,.svg"
              onChange={onFile}
              disabled={loading}
              tabIndex={-1}
              aria-hidden="true"
              className="sr-only"
            />
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => input.current?.click()}
            >
              {loading && <Spinner />}
              {logoUrl ? 'Remplacer le logo' : 'Ajouter un logo'}
            </Button>
            {logoUrl && (
              <Button
                type="button"
                variant="ghost"
                disabled={loading}
                onClick={() =>
                  send(
                    () => fetch('/api/cabinet/settings/logo', { method: 'DELETE' }),
                    'Logo retiré.',
                  )
                }
                className="text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
              >
                Retirer le logo
              </Button>
            )}
          </div>
        )}
      </div>

      {readOnly && (
        <p className="mt-4 text-xs text-muted-foreground">
          Votre cabinet est en lecture seule : régularisez votre abonnement pour modifier le logo.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive-text">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="mt-3 text-sm text-secondary">
          {done}
        </p>
      )}
    </section>
  );
}
