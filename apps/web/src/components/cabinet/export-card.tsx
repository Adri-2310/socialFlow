import { Download } from 'lucide-react';

// Export des donnees du cabinet (D28, D74). Un simple lien de telechargement :
// la route renvoie le fichier avec la session du titulaire. Reste disponible en
// lecture seule : c'est precisement pour cela qu'on l'affiche meme sans droit
// d'ecriture.
export function ExportCard({ readOnly }: { readOnly: boolean }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h3 className="text-sm font-bold text-foreground">Exporter les données du cabinet</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Un fichier JSON avec l’identité du cabinet, son abonnement, votre équipe, vos entreprises
        clientes et leurs assignations, les invitations et le journal d’audit. Il ne contient ni
        salaire ni fiche de paie.
      </p>
      {readOnly && (
        <p className="mt-2 text-sm text-muted-foreground">
          Votre cabinet est en lecture seule : l’export reste disponible.
        </p>
      )}
      <a
        href="/api/cabinet/export"
        download
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
      >
        <Download className="h-4 w-4" />
        Télécharger l’export
      </a>
      <p className="mt-3 text-xs text-muted-foreground">
        Chaque export est inscrit dans le journal d’audit de votre cabinet.
      </p>
    </section>
  );
}
