'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, FileUp, Loader2 } from 'lucide-react';
import { messageEchec, messageErreurLigne, messageIgnoree } from '@/lib/salarie/import-messages';
import type { RapportImport } from '@/lib/salarie/salarie-import';

// Lit le fichier choisi. Excel enregistre souvent en Windows-1252 (« CSV, séparateur
// point-virgule ») au lieu d'UTF-8 : on essaie l'UTF-8 strict, puis on se rabat sur
// Windows-1252 pour ne pas abîmer les accents.
async function lireFichier(fichier: File): Promise<string> {
  const octets = await fichier.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(octets);
  } catch {
    return new TextDecoder('windows-1252').decode(octets);
  }
}

type Etat =
  | { etape: 'choix' }
  | { etape: 'verifie'; csv: string; rapport: RapportImport }
  | { etape: 'importe'; rapport: RapportImport };

// Import CSV des dossiers d'une entreprise, en deux temps : vérifier (rien n'est écrit), puis
// importer. Le fichier n'est jamais conservé côté serveur et le rapport ne répète aucune valeur
// du fichier : seulement des numéros de ligne et des noms de colonnes. `readOnly` évite un
// aller-retour inutile : le serveur reste seul juge (423).
export function SalarieImport({
  entrepriseId,
  readOnly,
}: {
  entrepriseId: string;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fichier, setFichier] = useState<File | null>(null);
  const [etat, setEtat] = useState<Etat>({ etape: 'choix' });
  const [erreur, setErreur] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const url = `/api/entreprises/${entrepriseId}/salaries/import`;

  function fermer() {
    // L'import a créé des dossiers : la liste doit se rafraîchir à la fermeture.
    if (etat.etape === 'importe' && etat.rapport.creees > 0) router.refresh();
    setOpen(false);
    setFichier(null);
    setEtat({ etape: 'choix' });
    setErreur(null);
  }

  async function envoyer(csv: string, confirmer: boolean): Promise<RapportImport | null> {
    setErreur(null);
    setLoading(true);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ csv, confirmer }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setErreur(messageEchec(body?.error ?? '', body?.colonnes));
        return null;
      }
      return body.rapport as RapportImport;
    } catch {
      setErreur(messageEchec(''));
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function verifier() {
    if (!fichier) return;
    const csv = await lireFichier(fichier);
    const rapport = await envoyer(csv, false);
    if (rapport) setEtat({ etape: 'verifie', csv, rapport });
  }

  async function importer() {
    if (etat.etape !== 'verifie') return;
    const rapport = await envoyer(etat.csv, true);
    if (rapport) setEtat({ etape: 'importe', rapport });
  }

  const rapport = etat.etape === 'choix' ? null : etat.rapport;
  const termine = etat.etape === 'importe';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={readOnly}
        title={readOnly ? 'Votre cabinet est en lecture seule.' : undefined}
        className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-input px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
      >
        <FileUp className="h-4 w-4" />
        Importer un CSV
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-6"
          >
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <FileUp className="h-5 w-5" />
              </span>
              <div>
                <h3 id="import-title" className="text-lg font-semibold text-foreground">
                  Importer des salariés
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Le fichier est vérifié d’abord, sans rien enregistrer. Il n’est jamais conservé :
                  1 Mo et 200 lignes au maximum.
                </p>
              </div>
            </div>

            {!rapport && (
              <div className="mt-5 space-y-4">
                <a
                  href={`${url}/modele`}
                  download
                  className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
                >
                  <Download className="h-4 w-4" /> Télécharger le modèle (CSV)
                </a>
                <div>
                  <label htmlFor="import-fichier" className="text-sm font-medium text-foreground">
                    Fichier CSV
                  </label>
                  <input
                    id="import-fichier"
                    type="file"
                    accept=".csv,text/csv"
                    disabled={loading}
                    onChange={(e) => {
                      setFichier(e.target.files?.[0] ?? null);
                      setErreur(null);
                    }}
                    className="mt-1 block w-full text-sm text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary"
                  />
                </div>
              </div>
            )}

            {rapport && (
              <div className="mt-5 space-y-4">
                <dl className="grid grid-cols-3 gap-3 text-center">
                  {[
                    { label: termine ? 'Créés' : 'À créer', valeur: rapport.creees },
                    { label: 'Ignorés', valeur: rapport.ignorees },
                    { label: 'En erreur', valeur: rapport.erreurs },
                  ].map((c) => (
                    <div key={c.label} className="rounded-xl bg-muted/50 px-3 py-2.5">
                      <dd className="text-xl font-bold text-foreground">{c.valeur}</dd>
                      <dt className="text-xs text-muted-foreground">{c.label}</dt>
                    </div>
                  ))}
                </dl>
                <p className="text-sm text-muted-foreground">
                  {rapport.total} ligne{rapport.total > 1 ? 's' : ''} lue
                  {rapport.total > 1 ? 's' : ''}.
                  {!termine &&
                    (rapport.erreurs > 0
                      ? ' Les lignes en erreur ne seront pas importées : corrigez le fichier et recommencez, ou importez les autres.'
                      : '')}
                </p>

                {rapport.lignes.length > 0 && (
                  <div className="max-h-64 overflow-auto rounded-xl border border-border">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 border-b border-border bg-card text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Ligne</th>
                          <th className="px-3 py-2 font-semibold">Colonne</th>
                          <th className="px-3 py-2 font-semibold">Problème</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {rapport.lignes.flatMap((l) =>
                          l.resultat === 'ERREUR'
                            ? l.details.map((d) => (
                                <tr key={`${l.ligne}-${d.colonne}`}>
                                  <td className="px-3 py-2 text-foreground">{l.ligne}</td>
                                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                                    {d.colonne}
                                  </td>
                                  <td className="px-3 py-2 text-destructive-text">
                                    {messageErreurLigne(d.code)}
                                  </td>
                                </tr>
                              ))
                            : [
                                <tr key={`${l.ligne}-ignoree`}>
                                  <td className="px-3 py-2 text-foreground">{l.ligne}</td>
                                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                                    niss
                                  </td>
                                  <td className="px-3 py-2 text-muted-foreground">
                                    {messageIgnoree(l.raison)}
                                  </td>
                                </tr>,
                              ],
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {erreur && (
              <p role="alert" className="mt-4 text-sm text-destructive-text">
                {erreur}
              </p>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={fermer}
                disabled={loading}
                className="rounded-lg border border-input px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                {termine ? 'Terminer' : 'Annuler'}
              </button>
              {!rapport && (
                <button
                  type="button"
                  onClick={verifier}
                  disabled={!fichier || loading}
                  className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Vérifier le fichier
                </button>
              )}
              {etat.etape === 'verifie' && etat.rapport.creees > 0 && (
                <button
                  type="button"
                  onClick={importer}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Importer {etat.rapport.creees} salarié{etat.rapport.creees > 1 ? 's' : ''}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
