'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send } from 'lucide-react';
import { buildGestionnaireInvitation, inertLinks } from '@/lib/email-layout';
import type { CabinetEmailBrand } from '@/lib/email-brand';
import {
  BODY_MAX,
  SUBJECT_MAX,
  TEMPLATES,
  validateTemplate,
  type TemplateError,
  type TemplateType,
} from '@/lib/email-templates';

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Session expirée. Reconnectez-vous.',
  FORBIDDEN: 'Seul le titulaire du cabinet peut modifier les modèles.',
  CABINET_READ_ONLY:
    'Votre cabinet est en lecture seule : régularisez votre abonnement pour reprendre les modifications.',
  EMAIL_SEND_FAILED: "L'email de test n'a pas pu être envoyé. Réessayez dans un instant.",
};

const FALLBACK = 'Une erreur est survenue. Veuillez réessayer.';

function describe(error: TemplateError | null): string | null {
  if (!error) return null;
  switch (error.code) {
    case 'SUBJECT_REQUIRED':
      return 'Le sujet est obligatoire.';
    case 'SUBJECT_TOO_LONG':
      return `Le sujet est trop long (${SUBJECT_MAX} caractères maximum).`;
    case 'SUBJECT_MULTILINE':
      return 'Le sujet doit tenir sur une seule ligne.';
    case 'BODY_REQUIRED':
      return 'Le message est obligatoire.';
    case 'BODY_TOO_LONG':
      return `Le message est trop long (${BODY_MAX} caractères maximum).`;
    case 'UNKNOWN_VARIABLE':
      return `Variable inconnue : ${error.variables.map((v) => `{{${v}}}`).join(', ')}.`;
  }
}

const inputClass =
  'w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-foreground sm:text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60';

type Props = {
  type: TemplateType;
  initial: { subject: string; body: string; custom: boolean };
  // Identite du cabinet telle qu'elle apparait dans l'email reel.
  brand: CabinetEmailBrand;
  // Expediteur tel qu'affiche dans la boite mail du destinataire.
  fromLabel: string;
  readOnly: boolean;
};

// Modele d'email du cabinet (D30, D68) : sujet et corps avec variables, apercu
// en direct, envoi d'un test a soi-meme et retour au modele par defaut. Le
// serveur revalide tout ; l'apercu utilise le meme rendu que l'envoi reel.
export function EmailTemplateEditor({ type, initial, brand, fromLabel, readOnly }: Props) {
  const router = useRouter();
  const definition = TEMPLATES[type];
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [custom, setCustom] = useState(initial.custom);
  const [loading, setLoading] = useState<null | 'save' | 'test' | 'reset'>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const validation = validateTemplate(type, { subject, body });
  const errors = validation.ok ? { subject: null, body: null } : validation.errors;
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameHeight, setFrameHeight] = useState(560);

  // Le cadre prend la hauteur de l'email, sans defilement interne : sur
  // telephone l'email est plus haut (texte replie), et un defilement dans le
  // defilement de la page gene le pouce. Remesure a chaque chargement du cadre
  // et quand la largeur change (rotation, redimensionnement).
  //
  // L'ecouteur est pose a la main : le cadre est rendu par le serveur et son
  // evenement `load` part avant que React n'attache `onLoad`, qui ne se
  // declencherait alors jamais.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      const doc = frame.contentDocument;
      // body et non documentElement : ce dernier ne descend jamais sous la
      // hauteur du cadre, et l'apercu ne pourrait donc pas retrecir.
      if (doc?.body) setFrameHeight(Math.max(doc.body.scrollHeight, 360));
    };
    frame.addEventListener('load', measure);
    window.addEventListener('resize', measure);
    if (frame.contentDocument?.readyState === 'complete') measure();
    return () => {
      frame.removeEventListener('load', measure);
      window.removeEventListener('resize', measure);
    };
  }, []);

  // Meme constructeur que l'envoi reel : l'apercu est l'email recu.
  const preview = buildGestionnaireInvitation({
    brand,
    inviterName: definition.sample.invitant_nom,
    url: definition.sample.lien,
    template: { subject, body },
  });

  const touch = () => {
    setDone(null);
    setError(null);
  };

  function insertVariable(name: string) {
    touch();
    const el = bodyRef.current;
    const token = `{{${name}}}`;
    if (!el) {
      setBody((current) => `${current}${token}`);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    setBody(`${body.slice(0, start)}${token}${body.slice(end)}`);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function call(
    kind: 'save' | 'test' | 'reset',
    request: () => Promise<Response>,
    success: string,
    after?: () => void,
  ) {
    touch();
    setLoading(kind);
    try {
      const res = await request();
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(ERROR_MESSAGES[data?.error] ?? FALLBACK);
        return;
      }
      setDone(success);
      after?.();
    } catch {
      setError(FALLBACK);
    } finally {
      setLoading(null);
    }
  }

  const url = `/api/cabinet/settings/email-templates/${type}`;
  const json = { 'content-type': 'application/json' };
  const payload = JSON.stringify({ subject, body });

  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-foreground">{definition.label}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{definition.description}</p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            custom ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          }`}
        >
          {custom ? 'Personnalisé' : 'Modèle par défaut'}
        </span>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <fieldset disabled={readOnly || loading !== null} className="space-y-4">
          <div>
            <label htmlFor={`${type}-subject`} className="text-sm font-medium text-foreground">
              Sujet
            </label>
            <input
              id={`${type}-subject`}
              value={subject}
              onChange={(e) => {
                touch();
                setSubject(e.target.value);
              }}
              className={`${inputClass} mt-1`}
            />
            {errors.subject && (
              <p role="alert" className="mt-1 text-xs text-destructive-text">
                {describe(errors.subject)}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={`${type}-body`} className="text-sm font-medium text-foreground">
              Message
            </label>
            <textarea
              id={`${type}-body`}
              ref={bodyRef}
              value={body}
              rows={9}
              onChange={(e) => {
                touch();
                setBody(e.target.value);
              }}
              className={`${inputClass} mt-1 font-mono`}
            />
            {errors.body ? (
              <p role="alert" className="mt-1 text-xs text-destructive-text">
                {describe(errors.body)}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Une ligne vide sépare les paragraphes. <strong>**gras**</strong>, <em>*italique*</em>{' '}
                et [texte](https://…) sont pris en charge ; tout autre balisage est affiché tel quel.
              </p>
            )}
          </div>

          <div>
            <p className="text-xs font-medium text-foreground">Variables (cliquez pour insérer)</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {definition.variables.map((variable) => (
                <button
                  key={variable.name}
                  type="button"
                  title={variable.label}
                  onClick={() => insertVariable(variable.name)}
                  className="rounded-lg border border-border bg-background px-2.5 py-1 font-mono text-xs text-foreground transition hover:bg-muted"
                >
                  {`{{${variable.name}}}`}
                </button>
              ))}
            </div>
          </div>
        </fieldset>

        {/* Apercu = l'email reel : meme gabarit que l'envoi (lib/email-layout.ts),
            dans un cadre isole. Le cadre n'a aucun droit (pas de script, de
            formulaire ni de navigation), seul allow-same-origin permet de lire sa
            hauteur. Le HTML vient de renderBody : texte echappe, balisage limite. */}
        <div aria-label="Aperçu" className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="space-y-1 border-b border-border px-4 py-3 text-xs">
            <p className="font-medium text-muted-foreground">Aperçu de l’email reçu (données fictives)</p>
            <p className="text-foreground">
              <span className="text-muted-foreground">De : </span>
              {fromLabel}
            </p>
            {brand.replyTo && (
              <p className="text-foreground">
                <span className="text-muted-foreground">Répondre à : </span>
                {brand.replyTo}
              </p>
            )}
            <p className="text-foreground">
              <span className="text-muted-foreground">Objet : </span>
              <span className="font-semibold">{preview.subject || '—'}</span>
            </p>
            <p className="text-muted-foreground">Les liens sont désactivés dans l’aperçu.</p>
          </div>
          <iframe
            title="Aperçu de l’email"
            sandbox="allow-same-origin"
            srcDoc={inertLinks(preview.html)}
            ref={frameRef}
            style={{ height: frameHeight }}
            className="block w-full border-0 bg-white"
          />
        </div>
      </div>

      {readOnly && (
        <p className="mt-4 text-xs text-muted-foreground">
          Votre cabinet est en lecture seule : régularisez votre abonnement pour modifier les modèles.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive-text">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="mt-4 text-sm text-secondary">
          {done}
        </p>
      )}

      {!readOnly && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={loading !== null || !validation.ok}
            onClick={() =>
              call(
                'save',
                () => fetch(url, { method: 'PUT', headers: json, body: payload }),
                'Modèle enregistré.',
                () => {
                  setCustom(true);
                  router.refresh();
                },
              )
            }
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading === 'save' && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer
          </button>
          <button
            type="button"
            disabled={loading !== null || !validation.ok}
            onClick={() =>
              call(
                'test',
                () => fetch(`${url}/test`, { method: 'POST', headers: json, body: payload }),
                'Email de test envoyé à votre adresse.',
              )
            }
            className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Envoyer un test
          </button>
          {custom && (
            <button
              type="button"
              disabled={loading !== null}
              onClick={() =>
                call(
                  'reset',
                  () => fetch(url, { method: 'DELETE' }),
                  'Modèle par défaut rétabli.',
                  () => {
                    setSubject(definition.defaults.subject);
                    setBody(definition.defaults.body);
                    setCustom(false);
                    router.refresh();
                  },
                )
              }
              className="rounded-xl px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-muted disabled:opacity-60"
            >
              Rétablir le modèle par défaut
            </button>
          )}
        </div>
      )}
    </section>
  );
}
