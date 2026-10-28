import { Building2 } from 'lucide-react';
import { Notice } from '@/components/shared/notice';

// Accueil du portail Entreprise (roles/04-entreprise-cliente.md), sans accès aux données :
// la page lui passe ce qu'elle a lu, ce qui le rend testable.
// D29, D71 : `readOnly` = cabinet en lecture seule ; le message ne donne aucune raison commerciale.
export function EntrepriseAccueil({
  userName,
  entrepriseName,
  cabinetName,
  readOnly,
  archivee,
}: {
  userName: string;
  // Absent : le compte n'est rattaché à aucune entreprise.
  entrepriseName: string | null;
  cabinetName?: string;
  readOnly: boolean;
  archivee: boolean;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Building2 className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {entrepriseName ?? `Bienvenue, ${userName}`}
          </h2>
          {entrepriseName ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                Votre paie est gérée par {cabinetName}.
              </p>
              {readOnly && !archivee && (
                <Notice tone="warning" className="mt-3">
                  Votre espace est en lecture seule : vous pouvez consulter vos informations, mais plus
                  rien ne peut être modifié pour le moment.
                </Notice>
              )}
              {archivee && (
                <Notice tone="danger" className="mt-3">
                  Cette entreprise a été archivée par votre cabinet : l’espace est en lecture seule.
                </Notice>
              )}
              <p className="mt-4 text-sm text-muted-foreground">
                Votre espace est en cours de construction. Vous y retrouverez bientôt vos salariés,
                vos prestations du mois et les fiches de paie à valider.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Votre compte n’est rattaché à aucune entreprise. Contactez votre cabinet.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
