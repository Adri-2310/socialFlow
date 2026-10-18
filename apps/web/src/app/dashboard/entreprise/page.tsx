import type { Metadata } from 'next';
import { Building2 } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/require-session';
import { isCabinetReadOnly } from '@/lib/cabinet-suspension';

export const metadata: Metadata = {
  title: 'Accueil',
  description: 'Espace de votre entreprise.',
};

// Accueil minimal du portail Entreprise (roles/04-entreprise-cliente.md) : le
// compte est operationnel, les fonctionnalites (salaries, prestations,
// validation des fiches) arrivent avec le portail.
export default async function EntrepriseHomePage() {
  const { user } = await requireSession({ role: 'ENTREPRISE_CLIENTE' });

  // Perimetre : l'entreprise dont CE compte est l'administrateur, dans SON
  // cabinet (D5, D7). Rien ne vient de l'URL.
  const entreprise = user.cabinetId
    ? await prisma.entreprise.findFirst({
        where: { adminUserId: user.id, cabinetId: user.cabinetId },
        select: {
          name: true,
          deletedAt: true,
          cabinet: {
            select: { name: true, displayName: true, billingStatus: true, status: true, suspensionType: true },
          },
        },
      })
    : null;

  const cabinetName = entreprise?.cabinet.displayName?.trim() || entreprise?.cabinet.name;
  // D29, D71 : cabinet en lecture seule (impaye, resiliation ou suspension). Le
  // message ne donne aucune raison commerciale.
  const readOnly = !!entreprise && isCabinetReadOnly(entreprise.cabinet);

  return (
    <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Building2 className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {entreprise ? entreprise.name : `Bienvenue, ${user.name}`}
          </h2>
          {entreprise ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                Votre paie est gérée par {cabinetName}.
              </p>
              {readOnly && !entreprise.deletedAt && (
                <p className="mt-3 text-sm font-semibold text-amber-700 dark:text-amber-400">
                  Votre espace est en lecture seule : vous pouvez consulter vos informations, mais plus
                  rien ne peut être modifié pour le moment.
                </p>
              )}
              {entreprise.deletedAt && (
                <p className="mt-3 text-sm font-semibold text-destructive-text">
                  Cette entreprise a été archivée par votre cabinet : l’espace est en lecture seule.
                </p>
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
