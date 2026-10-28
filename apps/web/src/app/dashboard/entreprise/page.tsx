import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { requireAuthorized } from '@/lib/authz/authz-page';
import { isCabinetReadOnly } from '@/lib/cabinet/cabinet-suspension';
import { EntrepriseAccueil } from '@/components/entreprise/entreprise-accueil';

export const metadata: Metadata = {
  title: 'Accueil',
  description: 'Espace de votre entreprise.',
};

// Accueil minimal du portail Entreprise (roles/04-entreprise-cliente.md) : le
// compte est operationnel, les fonctionnalites (salaries, prestations,
// validation des fiches) arrivent avec le portail.
export default async function EntrepriseHomePage() {
  const { user } = await requireAuthorized('entreprise.lister');

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
    <EntrepriseAccueil
      userName={user.name}
      entrepriseName={entreprise?.name ?? null}
      cabinetName={cabinetName}
      readOnly={readOnly}
      archivee={!!entreprise?.deletedAt}
    />
  );
}
