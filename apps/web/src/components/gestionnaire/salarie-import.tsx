'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, FileUp } from 'lucide-react';
import { DataTable } from '@/components/shared/data-table';
import { FormDialog } from '@/components/shared/form-dialog';
import { FormField } from '@/components/shared/form-field';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { TableCell, TableRow } from '@/components/ui/table';
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
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={readOnly}
        title={readOnly ? 'Votre cabinet est en lecture seule.' : undefined}
        className="shrink-0"
      >
        <FileUp />
        Importer un CSV
      </Button>

      {open && (
        <FormDialog
          size="xl"
          icon={<FileUp />}
          title="Importer des salariés"
          description="Le fichier est vérifié d’abord, sans rien enregistrer. Il n’est jamais conservé : 1 Mo et 200 lignes au maximum."
        >
          {!rapport && (
            <div className="space-y-4">
              <a
                href={`${url}/modele`}
                download
                className={buttonVariants({ variant: 'link', size: 'sm' })}
              >
                <Download /> Télécharger le modèle (CSV)
              </a>
              <FormField id="import-fichier" label="Fichier CSV">
                {(c) => (
                  <Input
                    {...c}
                    type="file"
                    accept=".csv,text/csv"
                    disabled={loading}
                    onChange={(e) => {
                      setFichier(e.target.files?.[0] ?? null);
                      setErreur(null);
                    }}
                  />
                )}
              </FormField>
            </div>
          )}

          {rapport && (
            <div className="space-y-4">
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
                <DataTable
                  caption="Lignes ignorées ou en erreur"
                  className="max-h-64 overflow-y-auto rounded-xl bg-transparent"
                  columns={[
                    { key: 'ligne', header: 'Ligne' },
                    { key: 'colonne', header: 'Colonne' },
                    { key: 'probleme', header: 'Problème' },
                  ]}
                >
                  {rapport.lignes.flatMap((l) =>
                    l.resultat === 'ERREUR'
                      ? l.details.map((d) => (
                          <TableRow key={`${l.ligne}-${d.colonne}`}>
                            <TableCell className="px-4 py-2 text-foreground">{l.ligne}</TableCell>
                            <TableCell className="px-4 py-2 font-mono text-xs text-muted-foreground">
                              {d.colonne}
                            </TableCell>
                            <TableCell className="px-4 py-2 whitespace-normal text-destructive-text">
                              {messageErreurLigne(d.code)}
                            </TableCell>
                          </TableRow>
                        ))
                      : [
                          <TableRow key={`${l.ligne}-ignoree`}>
                            <TableCell className="px-4 py-2 text-foreground">{l.ligne}</TableCell>
                            <TableCell className="px-4 py-2 font-mono text-xs text-muted-foreground">
                              niss
                            </TableCell>
                            <TableCell className="px-4 py-2 whitespace-normal text-muted-foreground">
                              {messageIgnoree(l.raison)}
                            </TableCell>
                          </TableRow>,
                        ],
                  )}
                </DataTable>
              )}
            </div>
          )}

          {erreur && (
            <p role="alert" className="text-sm text-destructive-text">
              {erreur}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <Button type="button" variant="outline" onClick={fermer} disabled={loading}>
              {termine ? 'Terminer' : 'Annuler'}
            </Button>
            {!rapport && (
              <Button type="button" onClick={verifier} disabled={!fichier || loading}>
                {loading && <Spinner />}
                Vérifier le fichier
              </Button>
            )}
            {etat.etape === 'verifie' && etat.rapport.creees > 0 && (
              <Button type="button" onClick={importer} disabled={loading}>
                {loading && <Spinner />}
                Importer {etat.rapport.creees} salarié{etat.rapport.creees > 1 ? 's' : ''}
              </Button>
            )}
          </div>
        </FormDialog>
      )}
    </>
  );
}
