import { KeyRound, Webhook } from 'lucide-react';
import type { StripeStatus } from '@/lib/admin-data';

const MODE_LABEL: Record<StripeStatus['mode'], string> = {
  test: 'Mode test (sandbox)',
  live: 'Mode production',
  inconnu: 'Cle API absente',
};

const MODE_TONE: Record<StripeStatus['mode'], string> = {
  test: 'bg-primary/10 text-primary',
  live: 'bg-secondary/10 text-secondary',
  inconnu: 'bg-destructive/10 text-destructive',
};

// Lecture seule par choix : la cle secrete elle-meme n'est jamais affichee
// (seul son mode test/live transite), et creer un webhook necessite une URL
// publique que l'environnement de dev n'a pas - voir getStripeStatus dans
// lib/admin-data.ts.
export function StripeStatusPanel({ status }: { status: StripeStatus }) {
  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-2xl border border-border bg-card p-5">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-muted text-muted-foreground">
          <KeyRound className="h-4 w-4" />
        </span>
        <div className="mt-3 flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${MODE_TONE[status.mode]}`}>
            {MODE_LABEL[status.mode]}
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Cle API Stripe (jamais affichee ici, voir .env.local du serveur).
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Webhook className="h-4 w-4" />
        </span>
        {status.webhook ? (
          <>
            <p className="mt-3 truncate text-sm font-medium text-foreground" title={status.webhook.url}>
              {status.webhook.url}
            </p>
            <p className="text-sm text-muted-foreground">
              {status.webhook.enabledEventsCount} evenement{status.webhook.enabledEventsCount > 1 ? 's' : ''} ecoute
              {status.webhook.enabledEventsCount > 1 ? 's' : ''}
              {status.webhook.disabled && ' — desactive'}
            </p>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm font-medium text-foreground">Aucun webhook configure</p>
            <p className="text-sm text-muted-foreground">
              A creer depuis le dashboard Stripe une fois une URL publique disponible.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
